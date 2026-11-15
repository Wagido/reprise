"""Composition des grands indices boursiers (CAC 40, Euro Stoxx 50, S&P 500), lue
dans les tableaux de Wikipédia (anglais), puis rattachée aux sociétés de data/companies.json :
par le ticker pour les sociétés américaines, par le nom pour les européennes (les comptes ESEF ne
portent pas de ticker). Chaque société reçoit la liste de ses indices (champ « ix ») et
meta.indices donne, pour chaque indice, le nombre de membres attendus et retrouvés.

À lancer après build.py :  python3 collect/indices.py
Sans dépendance (bibliothèque standard).
"""
import json
import re
import sys
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "companies.json"
UA = {"User-Agent": "reprise-collect/1.0 (outil d'analyse financiere)"}

# indice -> (page Wikipédia, colonne du nom, colonne du ticker)
PAGES = {
    "CAC 40": ("CAC_40", ["company"], ["ticker"]),
    "Euro Stoxx 50": ("EURO_STOXX_50", ["name", "company"], ["ticker"]),
    "S&P 500": ("List_of_S%26P_500_companies", ["security", "company"], ["symbol", "ticker"]),
}


class Tables(HTMLParser):
    """Toutes les tables « wikitable » de la page : liste de lignes, chaque ligne = textes des cellules."""

    def __init__(self):
        super().__init__()
        self.tables, self.depth, self.row, self.cell = [], 0, None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self.depth += 1
            if self.depth == 1 and "wikitable" in (a.get("class") or ""):
                self.tables.append([])
            elif self.depth == 1:
                self.tables.append(None)
        elif tag == "tr" and self.depth == 1 and self.tables and self.tables[-1] is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")

    def handle_endtag(self, tag):
        if tag == "table":
            self.depth -= 1
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row and self.tables and self.tables[-1] is not None:
                self.tables[-1].append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def fetch(page):
    req = urllib.request.Request("https://en.wikipedia.org/wiki/" + page, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def members(html, name_cols, ticker_cols):
    """La plus grande table dont l'en-tête a une colonne de nom : [(nom, ticker)]."""
    p = Tables()
    p.feed(html)
    best = []
    for t in p.tables:
        if not t:
            continue
        head = [h.lower() for h in t[0]]
        ni = next((i for i, h in enumerate(head) for k in name_cols if h.startswith(k)), None)
        ti = next((i for i, h in enumerate(head) for k in ticker_cols if h.startswith(k)), None)
        if ni is None:
            continue
        rows = [(r[ni], r[ti] if ti is not None and ti < len(r) else "") for r in t[1:] if len(r) > ni and r[ni]]
        if len(rows) > len(best):
            best = rows
    return best


STOP = {"sa", "se", "nv", "ag", "plc", "spa", "s", "p", "a", "the", "inc", "corp", "corporation", "company", "co",
        "group", "groupe", "holding", "holdings", "ltd", "limited", "class", "de", "la", "le", "et", "and", "n", "v",
        "oyj", "asa", "ab", "kgaa", "l", "d", "societe", "europeenne", "european", "international", "na", "sca", "cl"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("'", " ").replace("’", " ")
    return [w for w in re.split(r"[^a-z0-9]+", s) if w and w not in STOP]


# Filiales cotées qui portent le nom de leur maison mère (BNP Paribas Fortis, Siemens Gamesa) : jamais membres.
FILIALES = re.compile(r"fortis|gamesa", re.I)


def ticker_key(t):
    # « BRK.B » (Wikipédia) et « BRK-B » (SEC) ; « AC.PA » -> « AC »
    return re.sub(r"[.\-/ ]", "", (t or "").upper())


def main():
    data = json.loads(OUT.read_text(encoding="utf-8"))
    comps = data["companies"]
    by_ticker = {}
    for c in comps:
        if c.get("t") and c["c"] == "US":
            by_ticker.setdefault(ticker_key(c["t"]), c)
    europe = [c for c in comps if c["c"] != "US"]
    for c in comps:
        c.pop("ix", None)
    meta = {}
    for idx, (page, ncols, tcols) in PAGES.items():
        try:
            rows = members(fetch(page), ncols, tcols)
        except Exception as e:  # réseau : on garde l'indice vide plutôt que d'échouer
            print(f"{idx} : lecture impossible ({e})", file=sys.stderr)
            continue
        found, missing = 0, []
        for name, tick in rows:
            c = None
            if idx == "S&P 500":
                c = by_ticker.get(ticker_key(tick))
            if c is None:
                w = norm(name)
                if not w:
                    continue
                # Nom européen : tous les mots significatifs du nom Wikipédia présents dans celui de la société
                # (correspondance stricte, pour ne pas prendre une filiale) ; on préfère la plus grande société.
                cands = [x for x in (europe if idx in ("CAC 40", "Euro Stoxx 50") else comps)
                         if set(w) <= set(norm(x["n"])) and not FILIALES.search(x["n"])]
                if cands:
                    rev = lambda x: max([v for v in x["v"].get("revenue", []) if v] or [0])
                    c = max(cands, key=rev)
            if c is None:
                missing.append(name)
                continue
            if idx not in c.setdefault("ix", []):
                c["ix"].append(idx)
                found += 1
        meta[idx] = {"members": len(rows), "found": found, "missing": missing}
        print(f"{idx} : {found} / {len(rows)} retrouvées" + (f" ; absentes : {', '.join(missing[:12])}" if missing else ""))
    data["meta"]["indices"] = meta
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
