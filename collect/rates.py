"""Paramètres du coût du capital, mis à jour à partir de sources de référence publiques.

- Taux sans risque : rendement des emprunts d'État à 10 ans, par pays.
  Union européenne : taux longs mensuels de la BCE. USA : série quotidienne DGS10 (Réserve fédérale, via FRED). Autres pays de l'OCDE :
  taux longs mensuels (OCDE, via FRED, séries IRLTLT01xxM156N).
- Prime de risque du marché actions, par pays : tables d'Aswath Damodaran (NYU Stern),
  « Country Default Spreads and Risk Premiums », mises à jour deux fois par an.
- Bêtas d'actif par industrie (désendettés et corrigés de la trésorerie) : tables de
  Damodaran, regroupées dans les 12 secteurs de l'outil (moyenne pondérée par le nombre
  de sociétés).

Résultat : data/rates.json, repris par build.py dans les métadonnées du site.
En cas d'échec d'une source, la valeur précédente est conservée.
"""

import csv
import html
import io
import re
import sys
import urllib.request
from datetime import date

from common import USER_AGENT, read_json, write_json

FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
# Taux longs « critère de convergence » de la BCE : mensuels, publiés avant ceux de l'OCDE pour l'UE.
ECB = "https://data-api.ecb.europa.eu/service/data/IRS/M.{}.L.L40.CI.0000.{}.N.Z?lastNObservations=1&format=csvdata"
ECB_CUR = {"FR": "EUR", "DE": "EUR", "NL": "EUR", "BE": "EUR", "LU": "EUR", "IT": "EUR", "ES": "EUR", "PT": "EUR", "AT": "EUR",
           "FI": "EUR", "IE": "EUR", "SE": "SEK", "DK": "DKK", "PL": "PLN"}
CTRY = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html"
BETAS = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/Betas.html"

# Pays des sociétés suivies → (série FRED du taux à 10 ans, nom dans les tables de Damodaran).
COUNTRIES = {
    "US": ("DGS10", "United States"), "FR": ("IRLTLT01FRM156N", "France"), "GB": ("IRLTLT01GBM156N", "United Kingdom"),
    "DE": ("IRLTLT01DEM156N", "Germany"), "NL": ("IRLTLT01NLM156N", "Netherlands"), "BE": ("IRLTLT01BEM156N", "Belgium"),
    "LU": ("IRLTLT01LUM156N", "Luxembourg"), "IT": ("IRLTLT01ITM156N", "Italy"), "ES": ("IRLTLT01ESM156N", "Spain"),
    "PT": ("IRLTLT01PTM156N", "Portugal"), "AT": ("IRLTLT01ATM156N", "Austria"), "FI": ("IRLTLT01FIM156N", "Finland"),
    "SE": ("IRLTLT01SEM156N", "Sweden"), "DK": ("IRLTLT01DKM156N", "Denmark"), "NO": ("IRLTLT01NOM156N", "Norway"),
    "PL": ("IRLTLT01PLM156N", "Poland"), "IE": ("IRLTLT01IEM156N", "Ireland"), "CH": ("IRLTLT01CHM156N", "Switzerland"),
    "CA": ("IRLTLT01CAM156N", "Canada"), "JP": ("IRLTLT01JPM156N", "Japan"), "KR": ("IRLTLT01KRM156N", "Korea"),
    "AU": ("IRLTLT01AUM156N", "Australia"), "MX": ("IRLTLT01MXM156N", "Mexico"), "ZA": ("IRLTLT01ZAM156N", "South Africa"),
    "IL": ("IRLTLT01ILM156N", "Israel"), "IN": ("INDIRLTLT01STM", "India"),
    # Sans série de taux long : prime de risque seulement (taux sans risque américain par défaut).
    "BR": (None, "Brazil"), "CN": (None, "China"), "TW": (None, "Taiwan"), "AR": (None, "Argentina"), "SG": (None, "Singapore"),
}

# Secteurs de l'outil → industries de Damodaran.
SECTORS = {
    "energie": ["Oil/Gas (Integrated)", "Oil/Gas (Production and Exploration)", "Oil/Gas Distribution", "Oilfield Svcs/Equip.", "Coal & Related Energy"],
    "materiaux": ["Chemical (Basic)", "Chemical (Diversified)", "Chemical (Specialty)", "Metals & Mining", "Steel", "Paper/Forest Products",
                  "Building Materials", "Construction Supplies", "Packaging & Container", "Precious Metals"],
    "industrie": ["Aerospace/Defense", "Machinery", "Electrical Equipment", "Engineering/Construction", "Business & Consumer Services",
                  "Transportation", "Transportation (Railroads)", "Trucking", "Air Transport", "Shipbuilding & Marine", "Diversified",
                  "Environmental & Waste Services", "Office Equipment & Services"],
    "conso_cyc": ["Auto & Truck", "Auto Parts", "Rubber& Tires", "Apparel", "Shoe", "Homebuilding", "Furn/Home Furnishings", "Hotel/Gaming",
                  "Recreation", "Restaurant/Dining", "Retail (Automotive)", "Retail (Building Supply)", "Retail (Distributors)",
                  "Retail (General)", "Retail (Special Lines)", "Education"],
    "conso_base": ["Food Processing", "Food Wholesalers", "Beverage (Alcoholic)", "Beverage (Soft)", "Household Products", "Tobacco",
                   "Retail (Grocery and Food)", "Farming/Agriculture"],
    "sante": ["Drugs (Pharmaceutical)", "Drugs (Biotechnology)", "Healthcare Products", "Healthcare Support Services",
              "Heathcare Information and Technology", "Hospitals/Healthcare Facilities"],
    "tech": ["Software (System & Application)", "Software (Internet)", "Software (Entertainment)", "Computer Services", "Computers/Peripherals",
             "Semiconductor", "Semiconductor Equip", "Electronics (General)", "Electronics (Consumer & Office)", "Information Services"],
    "telecom": ["Telecom. Services", "Telecom (Wireless)", "Telecom. Equipment", "Broadcasting", "Cable TV", "Entertainment",
                "Publishing & Newspapers", "Advertising"],
    "utilities": ["Utility (General)", "Utility (Water)", "Power", "Green & Renewable Energy"],
    "finance": ["Bank (Money Center)", "Banks (Regional)", "Insurance (General)", "Insurance (Life)", "Insurance (Prop/Cas.)", "Reinsurance",
                "Brokerage & Investment Banking", "Investments & Asset Management", "Financial Svcs. (Non-bank & Insurance)"],
    "immo": ["R.E.I.T.", "Real Estate (Development)", "Real Estate (General/Diversified)", "Real Estate (Operations & Services)", "Retail (REITs)"],
    "autre": ["Total Market (without financials)"],
}

log = lambda m: print(m, file=sys.stderr, flush=True)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("latin-1" if "stern" in url else "utf-8")


def pct(s):
    s = (s or "").replace("%", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def html_rows(text):
    cell = lambda c: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()
    return [[cell(c) for c in re.findall(r"<t[dh].*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", text, re.S)]


def riskfree(prev):
    out = dict(prev)
    for cc, (series, _) in COUNTRIES.items():
        if cc in ECB_CUR:
            try:
                rows = list(csv.DictReader(io.StringIO(fetch(ECB.format(cc, ECB_CUR[cc])))))
                if rows and rows[-1].get("OBS_VALUE"):
                    out[cc] = {"v": round(float(rows[-1]["OBS_VALUE"]), 3), "date": rows[-1]["TIME_PERIOD"], "src": "BCE"}
                    continue
            except Exception as e:  # noqa: BLE001
                log(f"  taux {cc} (BCE) : {e}")
        if not series:
            continue
        try:
            rows = list(csv.reader(io.StringIO(fetch(FRED.format(series)))))
            last = [(d, float(v)) for d, v in rows[1:] if v not in ("", ".")]
            if last:
                d, v = last[-1]
                out[cc] = {"v": round(v, 3), "date": d, "src": series}
        except Exception as e:  # noqa: BLE001 - une source en panne ne bloque pas les autres
            log(f"  taux {cc} ({series}) : {e}")
    return out


def erp(prev):
    try:
        text = fetch(CTRY)
    except Exception as e:  # noqa: BLE001
        log(f"  primes de risque : {e}")
        return prev
    upd = re.search(r"Last updated:\s*([A-Za-z]+ \d+, \d{4})", re.sub(r"<[^>]+>", " ", text))
    by_name = {}
    for r in html_rows(text):
        # Pays, note, écart de défaut, prime pays, prime de risque totale, taux d'IS, CDS, prime (CDS)
        if len(r) >= 6 and pct(r[4]) is not None and r[0]:
            by_name[r[0]] = {"erp": pct(r[4]), "crp": pct(r[3]), "tax": pct(r[5])}
    out = {"date": upd.group(1) if upd else prev.get("date"), "country": dict(prev.get("country", {}))}
    for cc, (_, name) in COUNTRIES.items():
        if name in by_name:
            out["country"][cc] = by_name[name]
    us = by_name.get("United States")
    if us:
        out["mature"] = round(us["erp"] - (us["crp"] or 0), 2)
    else:
        out["mature"] = prev.get("mature")
    return out


def betas(prev):
    try:
        text = fetch(BETAS)
    except Exception as e:  # noqa: BLE001
        log(f"  bêtas : {e}")
        return prev
    upd = re.search(r"as of ([A-Za-z]+ \d{4})", re.sub(r"<[^>]+>", " ", text))
    rows = html_rows(text)
    head = next((r for r in rows if r and r[0] == "Industry Name"), None)
    if not head:
        return prev
    k_n, k_b = head.index("Number of firms"), head.index("Unlevered beta corrected for cash")
    ind = {r[0]: (pct(r[k_n]), pct(r[k_b])) for r in rows if len(r) > k_b and pct(r[k_b]) is not None}
    out = {"date": upd.group(1) if upd else prev.get("date"), "sector": dict(prev.get("sector", {}))}
    for s, names in SECTORS.items():
        pts = [ind[n] for n in names if n in ind and ind[n][0]]
        if pts:
            out["sector"][s] = round(sum(n * b for n, b in pts) / sum(n for n, _ in pts), 2)
    return out


def main():
    prev = read_json("rates.json", {}) or {}
    rates = {
        "updated": date.today().isoformat(),
        "rf": riskfree(prev.get("rf", {})),
        "erp": erp(prev.get("erp", {})),
        "beta": betas(prev.get("beta", {})),
        "sources": {
            "rf": "Emprunts d'État à 10 ans : BCE (pays de l'UE), Réserve fédérale (DGS10) et OCDE via FRED",
            "erp": "Primes de risque par pays : A. Damodaran, NYU Stern (ctryprem)",
            "beta": "Bêtas d'actif par industrie : A. Damodaran, NYU Stern (Betas)",
        },
    }
    write_json("rates.json", rates)
    log(f"Taux sans risque : {len(rates['rf'])} pays ; primes de risque : {len(rates['erp'].get('country', {}))} pays "
        f"({rates['erp'].get('date')}) ; bêtas : {len(rates['beta'].get('sector', {}))} secteurs ({rates['beta'].get('date')})")


if __name__ == "__main__":
    main()
