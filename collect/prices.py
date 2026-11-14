"""Cours de Bourse et nombre d'actions, pour la capitalisation et les multiples.

- USA : Massive (ex-Polygon), « grouped daily » : une seule requête donne le
  cours de clôture de toutes les actions américaines pour un jour. Nombre
  d'actions : déclaration « dei:EntityCommonStockSharesOutstanding » à la SEC.
- France : Twelve Data (si la clé est disponible), tickers Euronext retrouvés
  dans la base de l'AMF à partir du code LEI. Nombre d'actions déduit du
  résultat net et du bénéfice par action publiés.

Clés : variables MASSIVE_API_KEY et TWELVEDATA_API_KEY (secrets GitHub). Dans
une session où un proxy injecte la clé, une valeur factice suffit.
"""

import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from common import get_json, read_json, write_json

MASSIVE = "https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true"
SHARES = "https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/{period}.json"


def log(m):
    print(m, file=sys.stderr, flush=True)


def http_json(url, headers, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "reprise-screener", **headers})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(15 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
            time.sleep(5)


def us_prices():
    key = os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY")
    if not key:
        log("USA : pas de clé MASSIVE_API_KEY, cours ignorés")
        return {}, None
    day = datetime.date.today()
    for _ in range(10):
        day -= datetime.timedelta(days=1)
        if day.weekday() >= 5:
            continue
        d = http_json(MASSIVE.format(date=day.isoformat()), {"Authorization": f"Bearer {key}"})
        if d and d.get("resultsCount"):
            log(f"USA : {d['resultsCount']} cours au {day}")
            return {r["T"]: r["c"] for r in d["results"] if r.get("c")}, day.isoformat()
        time.sleep(13)  # offre gratuite : 5 requêtes par minute
    return {}, None


def us_shares():
    """Dernier nombre d'actions déclaré par société (sur les 6 derniers trimestres)."""
    today = datetime.date.today()
    out = {}
    q = (today.month - 1) // 3 + 1
    y = today.year
    periods = []
    for _ in range(6):
        periods.append(f"CY{y}Q{q}I")
        q -= 1
        if q == 0:
            q, y = 4, y - 1
    for period in reversed(periods):  # du plus ancien au plus récent : le plus récent l'emporte
        d = get_json(SHARES.format(period=period), cache_name=f"sec/frames/dei_shares_{period}.json.gz", max_age_days=7)
        for row in (d or {}).get("data", []):
            out[row["cik"]] = row["val"]
    log(f"USA : nombre d'actions pour {len(out)} sociétés")
    return out


def main():
    companies = read_json("raw_us.json", {"companies": []})["companies"]
    prices, day = us_prices()
    shares = us_shares() if prices else {}
    out = {"date_us": day, "us": {}}
    for c in companies:
        if c["country"] != "US" or not c.get("ticker"):
            continue
        cik = int(c["id"].split("-")[1])
        px = prices.get(c["ticker"]) or prices.get(c["ticker"].replace("-", "."))
        sh = shares.get(cik)
        if px and sh:
            out["us"][c["id"]] = [round(px, 4), sh]
    log(f"USA : capitalisation pour {len(out['us'])} sociétés")
    write_json("prices.json", out)


if __name__ == "__main__":
    main()
