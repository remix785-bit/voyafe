import json, sys, threading, tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import veille

RSS = """<rss><channel><item><title>Acme lève 10 M€</title><link>http://x/a?utm=1</link><pubDate>Mon, 01 Oct 2026 10:00</pubDate></item>
<item><title>Tribune sans société</title><link>http://x/b</link></item></channel></rss>"""
HTML = """<html><body><nav><a href='/rub'>Rubrique</a></nav><main>
<a href='/a1?trk=z#f'>Un long titre d'article numéro un</a><a href='/a2'>Un long titre d'article numéro deux</a>
<a href='/a3'>Un long titre d'article numéro trois</a><a href='/a1'>Un long titre d'article numéro un</a></main></body></html>"""

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = (RSS if self.path.startswith("/feed") else HTML).encode()
        self.send_response(200); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

def test_end_to_end():
    srv = HTTPServer(("127.0.0.1", 0), H); port = srv.server_port
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    d = Path(tempfile.mkdtemp())
    src = {"rss": [{"name": "R", "home": base + "/", "feed": base + "/feed"}],
           "dom": [{"name": "D", "urls": [base + "/page"]}], "linkedin": []}
    (d / "s.json").write_text(json.dumps(src))
    (d / "c.txt").write_text("Acme\n")
    li = [{"profil": "P", "onglet": "publications", "auteur": "A", "heure": "2 h", "texte": "t", "url": "https://l/feed/update/urn:li:activity:1/"},
          {"profil": "P", "onglet": "publications", "auteur": "A", "heure": "3 sem", "texte": "old", "url": "https://l/feed/update/urn:li:activity:2/"}]
    (d / "li.json").write_text(json.dumps(li))
    args = ["run", "--sources", str(d / "s.json"), "--history", str(d / "h.txt"), "--companies", str(d / "c.txt"),
            "--out-dir", str(d / "o"), "--linkedin", str(d / "li.json")]
    veille.main(args)
    rep = next((d / "o").glob("veille-*.md")).read_text()
    assert "Acme" in rep and "Non identifiée" in rep
    assert f"{base}/a1\n" in rep and "trk=" not in rep and "utm=" not in rep
    assert rep.count("numéro un") == 1          # dédup intra-source
    assert "activity:1" in rep                  # 1er run : instantané (3 premiers)
    veille.main(args)                           # 2e run : tout est doublon
    rep2 = next((d / "o").glob("veille-*.md")).read_text()
    assert "Acme" not in rep2 and "Aucune nouveauté" in rep2
    srv.shutdown()
