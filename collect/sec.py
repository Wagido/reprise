"""Collecte des comptes des sociétés cotées aux USA (SEC EDGAR, XBRL US GAAP).

On utilise l'API « frames » : une requête donne une ligne comptable (par
exemple le chiffre d'affaires 2024) pour toutes les sociétés à la fois.
Les secteurs (code SIC) viennent des fiches « submissions », une par société,
gardées en cache car elles changent rarement.
"""

import argparse
import datetime
import json
import os
import sys

from common import CACHE, get_json, write_json
from concepts import US_GAAP, all_tags, resolve

FRAMES = "https://data.sec.gov/api/xbrl/frames/us-gaap/{tag}/USD/{period}.json"
TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json"
SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

LISTED = {"NYSE", "Nasdaq", "CBOE"}

# Nouvel identifiant (CIK) -> ancien, quand une société cotée a été reprise par
# une nouvelle holding qui garde le même ticker.
SUCCESSORS = {
    2115436: 34088,  # ExxonMobil Holdings Corp <- Exxon Mobil Corp (2026)
}


SIC_PATH = os.path.join(CACHE, "sec", "sic.json")


def load_sic():
    if os.path.exists(SIC_PATH):
        with open(SIC_PATH) as f:
            return {int(k): v for k, v in json.load(f).items()}
    return {}


def save_sic(cache):
    os.makedirs(os.path.dirname(SIC_PATH), exist_ok=True)
    with open(SIC_PATH, "w") as f:
        json.dump(cache, f)


def default_years():
    # Les comptes de l'année N sont presque tous déposés en avril N+1.
    today = datetime.date.today()
    last = today.year - 1 if today.month >= 5 else today.year - 2
    return list(range(last - 5, last + 1))


def collect(years, max_sic=None, log=print):
    tags = all_tags(US_GAAP)
    per_cik = {}  # cik -> {year: {tag: val}}
    names = {}
    ends = {}  # cik -> {year: date de clôture}
    recent = set(years[-2:])

    n = len(tags) * len(years)
    i = 0
    for tag, kind in tags.items():
        for year in years:
            i += 1
            period = f"CY{year}" if kind == "D" else f"CY{year}Q4I"
            url = FRAMES.format(tag=tag, period=period)
            if tag.startswith("EarningsPerShare"):
                url = url.replace("/USD/", "/USD-per-shares/")
            frame = get_json(url, cache_name=f"sec/frames/{tag}_{period}.json.gz",
                             max_age_days=7 if year in recent else None, min_interval=0.12)
            count = len(frame["data"]) if frame else 0
            log(f"[{i}/{n}] {tag} {period} : {count} sociétés")
            if not frame:
                continue
            for row in frame["data"]:
                cik = row["cik"]
                names.setdefault(cik, row["entityName"])
                per_cik.setdefault(cik, {}).setdefault(year, {})[tag] = row["val"]
                if kind == "D":
                    ends.setdefault(cik, {}).setdefault(year, row["end"])

    # Sociétés qui ont changé d'identifiant SEC (nouvelle holding) : on recolle
    # l'historique de l'ancienne entité sous la nouvelle, années manquantes seulement.
    for new_cik, old_cik in SUCCESSORS.items():
        if old_cik in per_cik:
            dst = per_cik.setdefault(new_cik, {})
            for y, vals in per_cik[old_cik].items():
                merged = dict(vals)
                merged.update(dst.get(y, {}))
                dst[y] = merged
            for y, e in ends.get(old_cik, {}).items():
                ends.setdefault(new_cik, {}).setdefault(y, e)

    # Capitalisation : « public float » déclaré en couverture du 10-K (valeur des
    # actions hors initiés, à la fin du 2e trimestre). Approximation de la
    # capitalisation boursière, utilisée pour les multiples sectoriels.
    floats = {}
    for year in years:
        period = f"CY{year}Q2I"
        frame = get_json(f"https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/{period}.json",
                         cache_name=f"sec/frames/dei_EntityPublicFloat_{period}.json.gz",
                         max_age_days=7 if year in recent else None, min_interval=0.12)
        for row in (frame or {}).get("data", []):
            floats.setdefault(row["cik"], {})[year] = row["val"]
    for new_cik, old_cik in SUCCESSORS.items():
        for y, v in floats.get(old_cik, {}).items():
            floats.setdefault(new_cik, {}).setdefault(y, v)

    tickers = get_json(TICKERS, cache_name="sec/company_tickers_exchange.json.gz", max_age_days=7)
    listing = {}
    for cik, name, ticker, exchange in tickers["data"]:
        if exchange in LISTED and cik not in listing:
            listing[cik] = (ticker, exchange, name)

    sic_cache = load_sic()
    companies = []
    sic_done = 0
    for cik, by_year in per_cik.items():
        if cik not in listing:
            continue
        rows = {y: resolve(US_GAAP, vals) for y, vals in by_year.items()}
        for y, v in floats.get(cik, {}).items():
            if y in rows and v and v > 0:
                rows[y]["market_cap"] = v
        if not any("revenue" in r for r in rows.values()):
            continue
        ticker, exchange, short = listing[cik]

        if cik not in sic_cache and (max_sic is None or sic_done < max_sic):
            sub = get_json(SUBMISSIONS.format(cik=cik), min_interval=0.12)
            sic_done += 1
            sic_cache[cik] = [sub.get("sic") or None, sub.get("sicDescription") or None] if sub else [None, None]
            if sic_done % 200 == 0:
                log(f"  secteurs : {sic_done} fiches lues")
                save_sic(sic_cache)
        sic, sic_desc = sic_cache.get(cik, [None, None])

        companies.append({
            "id": f"US-{cik}",
            "name": names.get(cik, short),
            "country": "US",
            "ticker": ticker,
            "exchange": exchange,
            "sic": sic,
            "sector_desc": sic_desc,
            "currency": "USD",
            "fy_end": ends.get(cik, {}),
            "source": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K",
            "years": {str(y): r for y, r in sorted(rows.items()) if r},
        })

    save_sic(sic_cache)
    log(f"SEC : {len(companies)} sociétés cotées avec des comptes")
    return companies


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--max-sic", type=int, default=None,
                   help="limite le nombre de fiches secteur lues (pour un test rapide)")
    p.add_argument("--years", type=int, nargs="*", default=None)
    a = p.parse_args()
    years = a.years or default_years()
    companies = collect(years, max_sic=a.max_sic, log=lambda m: print(m, file=sys.stderr, flush=True))
    write_json("raw_us.json", {"years": years, "companies": companies})


if __name__ == "__main__":
    main()
