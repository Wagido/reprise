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

from common import CACHE, get_json, read_json, write_json

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


def grouped_close(day, key):
    """Cours de clôture de toutes les actions US à une date (ou le jour ouvré précédent), en cache."""
    for _ in range(5):
        if day.weekday() < 5:
            path = f"prices/massive_{day.isoformat()}.json.gz"
            d = None
            cache = os.path.join(CACHE, path)
            if os.path.exists(cache):
                with open(cache, "rb") as f:
                    import gzip
                    d = json.loads(gzip.decompress(f.read()))
            else:
                try:
                    d = http_json(MASSIVE.format(date=day.isoformat()), {"Authorization": f"Bearer {key}"})
                except urllib.error.HTTPError as e:   # date hors de l'historique de l'offre gratuite
                    log(f"  cours du {day} indisponible ({e.code})")
                    return {}
                finally:
                    time.sleep(13)   # 5 requêtes par minute
                if d and d.get("resultsCount"):
                    import gzip
                    os.makedirs(os.path.dirname(cache), exist_ok=True)
                    with open(cache, "wb") as f:
                        f.write(gzip.compress(json.dumps({"results": [{"T": r["T"], "c": r["c"]} for r in d["results"] if r.get("c")], "resultsCount": d["resultsCount"]}).encode()))
            if d and d.get("resultsCount"):
                return {r["T"]: r["c"] for r in d["results"]}
        day -= datetime.timedelta(days=1)
    return {}


def us_float_share(companies, shares, max_dates=20):
    """Part du flottant : capitalisation flottante déclarée (non-affiliés : hors dirigeants,
    administrateurs et actionnaires de plus de 10 %) / capitalisation totale à la même date."""
    key = os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY")
    if not key:
        return {}
    y = datetime.date.today().year
    latest = {}
    for year in (y - 2, y - 1, y):
        d = get_json(f"https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/CY{year}Q2I.json",
                     cache_name=f"sec/frames/dei_EntityPublicFloat_CY{year}Q2I.json.gz", max_age_days=7)
        for row in (d or {}).get("data", []):
            latest[row["cik"]] = (row["val"], row["end"])
    by_date = {}
    for cik, (_, end) in latest.items():
        by_date.setdefault(end, []).append(cik)
    dates = sorted(by_date, key=lambda dd: -len(by_date[dd]))[:max_dates]
    out = {}
    tick = {int(c["id"].split("-")[1]): c for c in companies if c.get("ticker")}
    for dd in dates:
        closes = grouped_close(datetime.date.fromisoformat(dd), key)
        for cik in by_date[dd]:
            c, sh = tick.get(cik), shares.get(cik)
            if not c or not sh:
                continue
            px = closes.get(c["ticker"]) or closes.get(c["ticker"].replace("-", "."))
            if px:
                pct = latest[cik][0] / (px * sh)
                if 0.02 <= pct <= 1.05:
                    out[c["id"]] = round(min(pct, 1.0), 3)
    log(f"USA : part du flottant pour {len(out)} sociétés")
    return out


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


AMF = "https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records?"
ALPHA = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={key}"
FR_STATE = os.path.join(CACHE, "prices", "fr.json")
FR_PER_RUN = 24   # offre gratuite Alpha Vantage : 25 requêtes par jour


def fr_tickers(leis):
    """Ticker Euronext le plus récent de chaque société, d'après la base de l'AMF (code LEI)."""
    out = {}
    leis = sorted(leis)
    for k in range(0, len(leis), 40):
        chunk = leis[k:k + 40]
        where = "identificationsociete_iso_cd_lei in (" + ",".join(f"'{l}'" for l in chunk) + ")"
        q = urllib.parse.urlencode({
            "where": where, "limit": 1000,
            "select": "identificationsociete_iso_cd_lei as lei, identificationsociete_iso_code_tkr_iso_cd_tkr as t, max(uin_dat_amf) as d",
            "group_by": "identificationsociete_iso_cd_lei, identificationsociete_iso_code_tkr_iso_cd_tkr",
        })
        for attempt in range(8):
            try:
                d = get_json(AMF + q, cache_name=f"prices/amf_tickers_{k}.json.gz", max_age_days=30)
                break
            except Exception:  # ce serveur coupe souvent les connexions
                time.sleep(5)
        else:
            continue
        for r in (d or {}).get("results", []):
            if r.get("t") and (r["lei"] not in out or r["d"] > out[r["lei"]][1]):
                out[r["lei"]] = (r["t"].strip().upper(), r["d"])
    log(f"France : ticker trouvé pour {len(out)} sociétés sur {len(leis)}")
    return {lei: t for lei, (t, _) in out.items()}


def fr_shares(c):
    """Nombre d'actions = résultat net part du groupe / bénéfice par action (dernier exercice cohérent)."""
    for y in sorted(c["years"], reverse=True):
        r = c["years"][y]
        ni, eps = r.get("net_income"), r.get("eps")
        if ni and eps and abs(eps) > 1e-6 and (ni > 0) == (eps > 0):
            return ni / eps
    return None


def fr_prices(companies):
    """Rotation : à chaque passage, met à jour les cours les plus anciens (Alpha Vantage)."""
    state = {}
    if os.path.exists(FR_STATE):
        with open(FR_STATE) as f:
            state = json.load(f)
    key = os.environ.get("ALPHAVANTAGE_API_KEY")
    tickers = fr_tickers([c["lei"] for c in companies if c.get("lei")])
    todo = [c for c in companies if c.get("lei") in tickers]
    # Jamais mis à jour d'abord, puis les plus anciens ; à égalité, les plus grandes sociétés (CA) en premier,
    # pour que les grandes capitalisations aient un cours dès les premiers passages.
    def size(c):
        ys = sorted(c.get("years", {}), reverse=True)
        return -((c["years"][ys[0]].get("revenue") or 0) if ys else 0)
    todo.sort(key=lambda c: ((state.get(c["id"]) or [None, ""])[1], size(c)))
    if key:
        done = 0
        for c in todo[:FR_PER_RUN]:
            symbol = tickers[c["lei"]] + ".PAR"
            try:
                d = http_json(ALPHA.format(symbol=urllib.parse.quote(symbol), key=key), {})
            except Exception as e:
                log(f"  {symbol} : {e}")
                continue
            if "Note" in d or "Information" in d:   # quota atteint
                log("France : quota Alpha Vantage atteint")
                break
            q = d.get("Global Quote") or {}
            px = q.get("05. price")
            if px:
                state[c["id"]] = [float(px), q.get("07. latest trading day") or datetime.date.today().isoformat(), symbol]
                done += 1
            else:
                state[c["id"]] = [None, datetime.date.today().isoformat(), symbol]
            time.sleep(13)   # 5 requêtes par minute au plus
        log(f"France : {done} cours mis à jour")
        os.makedirs(os.path.dirname(FR_STATE), exist_ok=True)
        with open(FR_STATE, "w") as f:
            json.dump(state, f)
    else:
        log("France : pas de clé ALPHAVANTAGE_API_KEY, cours déjà connus seulement")
    out, dates = {}, []
    for c in companies:
        st = state.get(c["id"])
        sh = fr_shares(c)
        if st and st[0] and sh and sh > 0:
            out[c["id"]] = [round(st[0], 4), round(sh)]
            dates.append(st[1])
    return out, (min(dates) if dates else None), (max(dates) if dates else None)


def main():
    companies = read_json("raw_us.json", {"companies": []})["companies"]
    prices, day = us_prices()
    shares = us_shares() if prices else {}
    prev = read_json("prices.json", {}) or {}
    if not prices:   # pas de clé : on garde les cours américains de la dernière collecte
        prices_prev = prev.get("us", {})
        day = prev.get("date_us")
    else:
        prices_prev = {}
    out = {"date_us": day, "us": dict(prices_prev)}
    for c in companies:
        if c["country"] != "US" or not c.get("ticker"):
            continue
        cik = int(c["id"].split("-")[1])
        px = prices.get(c["ticker"]) or prices.get(c["ticker"].replace("-", "."))
        sh = shares.get(cik)
        if px and sh:
            out["us"][c["id"]] = [round(px, 4), sh]
    log(f"USA : capitalisation pour {len(out['us'])} sociétés")
    out["us_float"] = us_float_share(companies, shares) if shares else (read_json("prices.json", {}) or {}).get("us_float", {})
    fr = read_json("raw_fr.json", {"companies": []})["companies"]
    out["fr"], oldest, newest = fr_prices(fr)
    out["date_fr"] = newest
    out["date_fr_oldest"] = oldest
    log(f"France : capitalisation pour {len(out['fr'])} sociétés")
    write_json("prices.json", out)


if __name__ == "__main__":
    main()
