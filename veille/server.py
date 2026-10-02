#!/usr/bin/env python3
"""Site local de veille : bouton « Lancer » + recherche par Claude.

  export ANTHROPIC_API_KEY=sk-ant-...      # requis pour « Demander à Claude »
  python server.py                         # puis ouvrir http://127.0.0.1:8765
"""
import json
import os
import threading
import urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import veille

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ITEMS = DATA / "items.json"
MODEL = os.environ.get("VEILLE_MODEL", "claude-sonnet-5-5")
LOCK = threading.Lock()
STATUS = {"running": False, "message": "", "new": 0, "errors": []}


def load_items():
    return json.loads(ITEMS.read_text(encoding="utf-8")) if ITEMS.exists() else []


def save_items(items):
    DATA.mkdir(exist_ok=True)
    ITEMS.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")


def add_items(new):
    items = load_items()
    have = {i["key"] for i in items}
    fresh = [i for i in new if i["key"] not in have]
    save_items(fresh + items)
    return len(fresh)


def run_job(only=None):
    STATUS.update(running=True, message="Collecte en cours…", new=0, errors=[])
    try:
        today = date.today().isoformat()
        sources = json.loads(Path(os.environ.get("VEILLE_SOURCES", HERE / "sources.json")).read_text(encoding="utf-8"))
        hist = veille.History(DATA / "historique-liens-vus.txt")
        companies = veille.load_companies(HERE / "companies.txt")
        res = veille.collect_media(sources, hist, companies, only)
        rows = []
        for r in res:
            for it in r["items"]:
                rows.append({"source": r["name"], "kind": "media", "title": it["title"], "url": it["url"],
                             "date": it["date"], "companies": it["companies"], "text": it["desc"].strip(),
                             "seen": today, "key": it["key"]})
        STATUS["new"] = add_items(rows)
        STATUS["errors"] = [f"{r['name']} : {r['error']}" for r in res if r["error"]]
        out = HERE / "outputs"
        out.mkdir(exist_ok=True)
        (out / f"veille-{today}.md").write_text(veille.render_media(res, today), encoding="utf-8")
        hist.save([r["name"] for r in res if not r["error"]])
        STATUS["message"] = f"Terminé : {STATUS['new']} nouveaux items, {len(STATUS['errors'])} sources inaccessibles."
    except Exception as e:
        STATUS["message"] = f"Erreur : {e}"
    finally:
        STATUS["running"] = False


def ask_claude(question, ctx):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY n'est pas défini sur la machine qui lance server.py.")
    prompt = ("Tu es le moteur de recherche d'un outil de veille concurrentielle. Réponds en français, de façon "
              "concise, uniquement à partir des items ci-dessous. Cite les items par leur numéro entre crochets, "
              f"par exemple [3]. Si les données ne permettent pas de répondre, dis-le.\n\nQuestion : {question}\n\nItems :\n{ctx}")
    body = json.dumps({"model": MODEL, "max_tokens": 1200, "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    return "".join(b.get("text", "") for b in data.get("content", []))


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj, ctype="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, (HERE / "static" / "index.html").read_bytes(), "text/html")
        elif self.path == "/api/items":
            self._send(200, load_items())
        elif self.path == "/api/status":
            self._send(200, STATUS)
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            b = self._body()
            if self.path == "/api/run":
                with LOCK:
                    if STATUS["running"]:
                        return self._send(409, {"error": "déjà en cours"})
                    STATUS["running"] = True
                threading.Thread(target=run_job, args=(b.get("only"),), daemon=True).start()
                self._send(202, STATUS)
            elif self.path == "/api/ask":
                self._send(200, {"text": ask_claude(b["question"], b["context"])})
            elif self.path == "/api/linkedin":  # export JSON de linkedin_console.js
                today = date.today().isoformat()
                hist = veille.History(DATA / "historique-liens-vus.txt")
                li, done = veille.collect_linkedin(b["posts"], hist)
                rows = [{"source": p_, "kind": "linkedin", "title": (p.get("texte") or "Post").split("\n")[0][:160],
                         "url": p.get("url", ""), "date": p.get("heure", ""), "companies": [], "tab": tab,
                         "text": (p.get("texte") or "")[:600], "seen": today, "key": veille.li_key(p)}
                        for p_, tabs in li.items() for tab, ps in tabs.items() for p in ps]
                hist.save(done)
                self._send(200, {"new": add_items(rows)})
            else:
                self._send(404, {"error": "not found"})
        except Exception as e:
            self._send(500, {"error": str(e)})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    print(f"Veille : http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
