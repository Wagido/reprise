"""Cours mensuels sur longue période (dividendes réinvestis) pour le banc d'essai historique.

Alpha Vantage, fonction TIME_SERIES_MONTHLY_ADJUSTED : une requête par société, gardée 30 jours en cache.
Lancé avant prices.py pour passer en priorité sur le quota gratuit (25 requêtes par jour) ;
une fois le cache rempli, il ne consomme plus rien jusqu'au mois suivant.
Sortie : data/histo.json = {"date": ..., "series": {id_societe: {"symbol": ..., "m": [[aaaa-mm, cours ajusté], ...]}}}
"""
import datetime
import json
import os
import time
import urllib.parse

from common import CACHE, read_json, write_json
from prices import http_json, log

URL = "https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol={symbol}&apikey={key}"
DIR = os.path.join(CACHE, "prices", "histo")
MAX_AGE = 30
PER_RUN = 20
US_PER_RUN = 24   # seconde clé gratuite : 25 requêtes par jour

# 20 sociétés du CAC 40 hors banques et assurances, avec au moins 4 exercices dans la base (code LEI, ticker Euronext).
CAC20 = [
    ("52990097YFPX9J0H5D87", "RI"),
    ("529900JI1GG6F7RKVI53", "OR"),
    ("549300B8P6MUJ1YWTS08", "CA"),
    ("969500KMUQ2B6CBAF162", "BN"),
    ("549300SOSI58J6VIW052", "ML"),
    ("969500F7JLTX36OUI695", "RNO"),
    ("969500QZC2Q0TK11NV07", "AC"),
    ("969500Y4IJGHJE2MTJ13", "RMS"),
    ("IOG4E947OATN0KJYSD45", "MC"),
    ("213800WFQ334R8UXUG83", "DG"),
    ("969500A1YF1XUYYXS284", "SU"),
    ("969500UIC89GT3UL7L24", "SAF"),
    ("969500XXRPGD7HCAFA90", "LR"),
    ("969500MMPQVHK671GT54", "AI"),
    ("NFONVGN05Z0FMN5PEC35", "SGO"),
    ("549300M3VH1A3ER1TB49", "EL"),
    ("96950065LBWY0APQIM86", "DSY"),
    ("96950077L0TN7BAROX36", "CAP"),
    ("2138004KW8BV57III342", "PUB"),
    ("LAXUQCHT4FH58LRZDY46", "ENGI"),
]


def fetch(symbol, key, max_age=MAX_AGE):
    path = os.path.join(DIR, symbol + ".json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age * 86400:
        with open(path) as f:
            return json.load(f), False
    if not key:
        return None, False
    d = http_json(URL.format(symbol=urllib.parse.quote(symbol), key=key), {})
    if "Note" in d or "Information" in d:
        raise RuntimeError((d.get("Note") or d.get("Information"))[:160])
    rows = d.get("Monthly Adjusted Time Series") or {}
    m = sorted([day[:7], float(v["5. adjusted close"])] for day, v in rows.items() if v.get("5. adjusted close"))
    if not m:
        log(f"  {symbol} : pas de série ({str(d)[:120]})")
        return None, True
    os.makedirs(DIR, exist_ok=True)
    with open(path, "w") as f:
        json.dump(m, f)
    return m, True


def us_main():
    """États-Unis : membres du S&P 500, par ordre de taille, 24 par jour avec la seconde clé
    (ALPHAVANTAGE_API_KEY_2), gardés un an en cache : la rotation fait le tour en trois semaines."""
    key = os.environ.get("ALPHAVANTAGE_API_KEY_2")
    d = read_json("companies.json", {"companies": []})
    ys = (d.get("meta") or {}).get("years") or []
    def size(c):
        r = [v for v in (c["v"].get("revenue") or []) if v is not None]
        return -(r[-1] if r else 0)
    members = sorted([c for c in d["companies"] if "S&P 500" in (c.get("ix") or []) and c.get("t")], key=size)
    out = (read_json("histo.json", {}) or {}).get("series", {})
    calls = done = 0
    for c in members:
        symbol = c["t"].replace("-", ".")
        try:
            m, called = fetch(symbol, key if calls < US_PER_RUN else None, max_age=365)
        except Exception as e:
            log(f"Historique USA : arrêt sur {symbol} ({e})")
            key = None
            continue
        if called:
            calls += 1
            time.sleep(13)
        if m:
            out[c["id"]] = {"symbol": symbol, "m": [x for x in m if x[0] >= "2019-01"]}
            done += 1
    log(f"Historique USA : {done} sociétés sur {len(members)} ({calls} requêtes)")
    write_json("histo.json", {"date": datetime.date.today().isoformat(), "series": out})


def main():
    key = os.environ.get("ALPHAVANTAGE_API_KEY")
    out, calls = {}, 0
    for lei, tk in CAC20:
        symbol = tk + ".PAR"
        if calls >= PER_RUN:
            break
        try:
            m, called = fetch(symbol, key)
        except Exception as e:
            log(f"Historique : arrêt sur {symbol} ({e})")
            break
        if called:
            calls += 1
            time.sleep(13)   # 5 requêtes par minute au plus
        if m:
            out["FR-" + lei] = {"symbol": symbol, "m": m}
    log(f"Historique des cours : {len(out)} sociétés sur {len(CAC20)} ({calls} requêtes)")
    prev = (read_json("histo.json", {}) or {}).get("series", {})
    prev.update(out)
    write_json("histo.json", {"date": datetime.date.today().isoformat(), "series": prev})


if __name__ == "__main__":
    import sys
    us_main() if "--us" in sys.argv else main()
