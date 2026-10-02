#!/usr/bin/env python3
"""Veille concurrentielle — extraction pure des NOUVEAUTÉS (médias RSS/DOM + LinkedIn).

Règles : aucun jugement de pertinence ; seuls motifs d'exclusion = doublon (historique)
ou, pour LinkedIn, post non daté d'aujourd'hui (hors premier passage sur un profil).
Chaque item porte son URL (ou « non capturée »). Zéro dépendance (stdlib).

Usage :
  python veille.py run                      # médias (RSS + DOM) -> outputs/veille-AAAA-MM-JJ.md
  python veille.py run --only "DAF Mag"     # filtre par nom de source
  python veille.py run --linkedin posts.json
  python veille.py run --dry-run            # ne met pas l'historique à jour
"""
import argparse
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

HERE = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
RSS_FIRST, DOM_FIRST, DOM_LIMIT, RSS_LIMIT, LI_FIRST = 10, 5, 10, 10, 3
NS_NONE = "non capturée"


# ───────────────────────── utilitaires ─────────────────────────

def clean_url(u):
    """URL absolue sans chaîne de requête ni fragment (clé de dédup stable)."""
    return u.split("#")[0].split("?")[0].strip()


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        charset = r.headers.get_content_charset() or "utf-8"
    try:
        return raw.decode(charset, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def load_companies(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def find_companies(text, companies):
    low = text.lower()
    return [c for c in companies if re.search(r"(?<!\w)" + re.escape(c.lower()) + r"(?!\w)", low)]


def dedup_key(url, title, media):
    return clean_url(url) if url else f"{media}|{title[:80]}"


# ───────────────────────── RSS / Atom ─────────────────────────

def _local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_feed(xml_text, limit):
    root = ET.fromstring(xml_text.lstrip("﻿").strip())
    items = []
    for el in root.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        d = {"title": "", "url": "", "date": "", "desc": ""}
        for ch in el:
            n = _local(ch.tag)
            if n == "title":
                d["title"] = (ch.text or "").strip()
            elif n == "link":
                d["url"] = (ch.text or "").strip() or ch.attrib.get("href", "")
            elif n in ("pubDate", "published", "updated", "date") and not d["date"]:
                d["date"] = (ch.text or "").strip()[:16]
            elif n in ("description", "summary") and not d["desc"]:
                d["desc"] = re.sub(r"<[^>]+>", " ", ch.text or "")[:300]
        d["url"] = clean_url(d["url"])
        items.append(d)
        if len(items) >= limit:
            break
    return items


def scrape_rss(src, limit):
    # Page d'accueil d'abord (équivalent du conseil « jamais l'URL brute du flux » en navigateur).
    try:
        fetch(src["home"], timeout=15)
    except Exception:
        pass
    return parse_feed(fetch(src["feed"]), limit)


# ───────────────────────── DOM (texte + lien) ─────────────────────────

class AnchorParser(HTMLParser):
    """Collecte les <a> (texte, href) en notant s'ils sont dans <main>/<article>."""

    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base, self.anchors = base, []
        self.depth_scope = 0
        self.skip = 0
        self.cur = None

    def handle_starttag(self, tag, attrs):
        if tag in ("main", "article"):
            self.depth_scope += 1
        elif tag in ("script", "style", "noscript"):
            self.skip += 1
        elif tag == "a" and self.cur is None:
            href = dict(attrs).get("href") or ""
            self.cur = {"href": href, "text": [], "scoped": self.depth_scope > 0}

    def handle_endtag(self, tag):
        if tag in ("main", "article"):
            self.depth_scope = max(0, self.depth_scope - 1)
        elif tag in ("script", "style", "noscript"):
            self.skip = max(0, self.skip - 1)
        elif tag == "a" and self.cur is not None:
            text = re.sub(r"\s+", " ", " ".join(self.cur["text"])).strip()
            try:
                href = clean_url(urljoin(self.base, self.cur["href"])) if self.cur["href"] else ""
            except ValueError:
                href = ""
            if href.startswith(("javascript:", "mailto:", "tel:")):
                href = ""
            self.anchors.append({"text": text, "href": href, "scoped": self.cur["scoped"]})
            self.cur = None

    def handle_data(self, data):
        if self.cur is not None and not self.skip:
            self.cur["text"].append(data)


def extract_anchors(html, base, limit, min_len=15, max_len=300):
    p = AnchorParser(base)
    p.feed(html)

    def pick(anchors, lo):
        seen, out = set(), []
        for a in anchors:
            if not (lo <= len(a["text"]) < max_len) or a["text"] in seen:
                continue
            seen.add(a["text"])
            out.append(a)
        return out

    res = pick([a for a in p.anchors if a["scoped"]], min_len)
    if len(res) < 3:  # repli : toute la page (ex. Le Point sans <main>/<article>)
        res = pick(p.anchors, max(min_len, 30))
    return [{"title": a["text"], "url": a["href"], "date": "", "desc": ""} for a in res[:limit]]


def scrape_dom(src, limit):
    items, seen = [], set()
    for url in src["urls"]:
        for it in extract_anchors(fetch(url), url, limit, src.get("min_len", 15)):
            if it["title"] not in seen:
                seen.add(it["title"])
                items.append(it)
    return items[: limit * len(src["urls"])]


# ───────────────────────── historique ─────────────────────────

class History:
    def __init__(self, path):
        self.path = path
        self.keys = set()
        if path.exists():
            self.keys = {l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()}
        self.state_path = path.with_name("etat-sources.json")
        self.seen_sources = set(json.loads(self.state_path.read_text()) if self.state_path.exists() else [])
        self.new_keys = []

    def known(self, key):
        return key in self.keys

    def add(self, key):
        if key not in self.keys:
            self.keys.add(key)
            self.new_keys.append(key)

    def save(self, sources_done):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            for k in self.new_keys:
                f.write(k + "\n")
        self.state_path.write_text(json.dumps(sorted(self.seen_sources | set(sources_done)), ensure_ascii=False))


# ───────────────────────── médias ─────────────────────────

def collect_media(sources, hist, companies, only=None, workers=8):
    jobs = []
    for s in sources["rss"]:
        jobs.append(("RSS", s))
    for s in sources["dom"]:
        jobs.append(("DOM", s))
    if only:
        jobs = [j for j in jobs if only.lower() in j[1]["name"].lower()]

    def work(job):
        kind, s = job
        first = s["name"] not in hist.seen_sources
        if kind == "RSS":
            limit = s.get("limit", RSS_LIMIT)
            limit = min(limit, RSS_FIRST) if first and "limit" not in s else limit
            return scrape_rss(s, limit)
        limit = s.get("limit", DOM_LIMIT)
        if first:
            limit = DOM_FIRST
        return scrape_dom(s, limit)

    results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [(j, ex.submit(work, j)) for j in jobs]
        for (kind, s), fut in futs:
            try:
                raw, err = fut.result(), None
            except Exception as e:  # source inaccessible : on continue
                raw, err = [], f"{type(e).__name__}: {e}"
            entries = []
            for it in raw:
                key = dedup_key(it["url"], it["title"], s["name"])
                if hist.known(key):
                    continue
                hist.add(key)
                it = dict(it, key=key)
                it["companies"] = find_companies(it["title"] + " " + it["desc"], companies)
                entries.append(it)
            results.append({"name": s["name"], "kind": kind, "items": entries, "error": err, "n_raw": len(raw)})
    return results


def render_media(results, today):
    out = [f"# Veille Médias — {today}", ""]
    for r in results:
        out += [f"## {r['name']}", ""]
        if r["error"]:
            out += [f"Inaccessible lors de ce run — {r['error']}", "", "---", ""]
            continue
        if not r["items"]:
            out += ["Aucune nouveauté depuis le dernier passage.", "", "---", ""]
            continue
        for it in r["items"]:
            comp = ", ".join(it["companies"]) if it["companies"] else "Non identifiée"
            out += [
                f"### {it['title']}",
                f"- **Entreprises citées :** {comp}",
                f"- **Date :** {it['date'] or 'non indiquée'}",
                f"- **URL :** {it['url'] or NS_NONE}",
                "",
            ]
        out += ["---", ""]
    return "\n".join(out)


# ───────────────────────── LinkedIn (import JSON) ─────────────────────────
# LinkedIn exige une session connectée : on importe l'export JSON produit par
# linkedin_console.js (exécuté dans votre navigateur connecté).
# Format : [{"profil","onglet","auteur","heure","texte","url"}, ...]

TABS = ["reactions", "partages", "commentaires", "publications"]
TODAY_RE = re.compile(r"^\s*(\d+\s*(min|mn|h|heure|heures|minutes?)\b|maintenant)", re.I)


def li_key(p):
    m = re.search(r"urn:li:activity:\d+", p.get("url", "") or "")
    if m:
        return m.group(0)
    return f"{p.get('auteur','')}|{p.get('heure','')}|{(p.get('texte') or '')[:50]}"


def collect_linkedin(posts, hist):
    by_profile = {}
    for p in posts:
        by_profile.setdefault(p["profil"], {}).setdefault(p.get("onglet", "publications"), []).append(p)
    result, done = {}, []
    for profil, tabs in by_profile.items():
        first = f"linkedin:{profil}" not in hist.seen_sources
        done.append(f"linkedin:{profil}")
        kept = {}
        for tab, items in tabs.items():
            sel = items[:LI_FIRST] if first else [i for i in items if TODAY_RE.match(i.get("heure", "") or "")]
            kept[tab] = []
            for p in sel:
                k = li_key(p)
                if hist.known(k):
                    continue
                hist.add(k)
                kept[tab].append(p)
        result[profil] = kept
    # dédup intra-run : Publications > Partages > Commentaires > Réactions
    prio = ["publications", "partages", "commentaires", "reactions"]
    for profil, kept in result.items():
        seen = set()
        for tab in prio:
            kept[tab] = [p for p in kept.get(tab, []) if not (li_key(p) in seen or seen.add(li_key(p)))]
    return result, done


def render_linkedin(result, today):
    labels = {"reactions": "Réactions (likes)", "partages": "Partages",
              "commentaires": "Commentaires", "publications": "Publications"}
    out = [f"# Veille LinkedIn — {today}", ""]
    for profil, kept in result.items():
        out += [f"## {profil}", ""]
        for tab in TABS:
            out += [f"### {labels[tab]} — NOUVEAUTÉS UNIQUEMENT"]
            items = kept.get(tab, [])
            if not items:
                out += ["Aucune nouveauté depuis le dernier passage.", ""]
                continue
            for n, p in enumerate(items, 1):
                out += [f"> **Post {n}**", f"> Auteur : {p.get('auteur','')}",
                        f"> Heure : {p.get('heure','')}", f"> URL : {p.get('url') or NS_NONE}",
                        f"> Texte : {p.get('texte','')}", "> ---", ""]
        out += ["---", ""]
    return "\n".join(out)


# ───────────────────────── main ─────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run"])
    ap.add_argument("--sources", default=str(HERE / "sources.json"))
    ap.add_argument("--history", default=str(HERE / "data" / "historique-liens-vus.txt"))
    ap.add_argument("--companies", default=str(HERE / "companies.txt"))
    ap.add_argument("--out-dir", default=str(HERE / "outputs"))
    ap.add_argument("--only", help="sous-chaîne du nom de source (médias)")
    ap.add_argument("--linkedin", help="export JSON LinkedIn à importer")
    ap.add_argument("--no-media", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas l'historique")
    a = ap.parse_args(argv)

    today = date.today().isoformat()
    sources = json.loads(Path(a.sources).read_text(encoding="utf-8"))
    hist = History(Path(a.history))
    companies = load_companies(Path(a.companies))
    parts, summary, done = [], [], []

    if a.linkedin:
        posts = json.loads(Path(a.linkedin).read_text(encoding="utf-8"))
        li, d = collect_linkedin(posts, hist)
        done += d
        parts.append(render_linkedin(li, today))
        summary.append(f"LinkedIn : {sum(len(v) for t in li.values() for v in t.values())} nouveaux posts "
                       f"({len(li)} profils/pages importés)")
    else:
        summary.append("LinkedIn : non traité (aucun --linkedin ; voir README, session connectée requise)")

    if not a.no_media:
        res = collect_media(sources, hist, companies, a.only)
        done += [r["name"] for r in res if not r["error"]]
        parts.append(render_media(res, today))
        n = lambda k: sum(len(r["items"]) for r in res if r["kind"] == k)
        allit = [i for r in res for i in r["items"]]
        summary += [
            f"Médias : {n('RSS')} nouveaux (RSS) + {n('DOM')} nouveaux (DOM)",
            f"Items « entreprise non identifiée » : {sum(1 for i in allit if not i['companies'])}",
            f"Items « URL non capturée » : {sum(1 for i in allit if not i['url'])}",
        ]
        bad = [f"{r['name']} ({r['error']})" for r in res if r["error"]]
        summary.append("Sources inaccessibles : " + ("; ".join(bad) if bad else "aucune"))

    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / f"veille-{today}.md"
    report.write_text("\n\n".join(parts), encoding="utf-8")

    if a.dry_run:
        summary.append("Historique : NON mis à jour (--dry-run)")
    else:
        try:
            hist.save(done)
            summary.append(f"Historique : +{len(hist.new_keys)} clés dans {hist.path}")
        except OSError as e:
            alt = out_dir / "historique-liens-vus.txt"
            alt.write_text("\n".join(sorted(hist.keys)) + "\n", encoding="utf-8")
            summary.insert(0, f"⚠️ HISTORIQUE EN LECTURE SEULE ({e}) — copie dans {alt} : "
                              "la déduplication inter-run n'est pas garantie.")
    print(f"Rapport : {report}\n" + "\n".join("- " + s for s in summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
