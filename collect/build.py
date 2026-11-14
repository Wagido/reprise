"""Fusionne les collectes USA et France en un seul fichier pour l'application.

Sortie : data/companies.json, compact. Les montants sont en millions de la
devise de publication ; l'application les convertit en euros avec les taux
moyens annuels de meta.fx (approximatifs, suffisants pour classer).
"""

import datetime
import re
import unicodedata

from common import read_json, write_json
from concepts import FIELDS, PER_SHARE
from dividends import history as dividend_history
from sectors_fr import SECTORS_FR

SECTORS = {
    "energie": "Pétrole, gaz & parapétrolier",
    "materiaux": "Chimie, métaux & matériaux",
    "industrie": "Industrie, BTP & services aux entreprises",
    "conso_cyc": "Conso. discrétionnaire (auto, luxe, distribution, loisirs)",
    "conso_base": "Conso. de base (alimentation, boissons, hygiène)",
    "sante": "Santé & pharmacie",
    "tech": "Technologies & logiciels",
    "telecom": "Télécoms & médias",
    "utilities": "Électricité, eau & gaz réseaux",
    "finance": "Banques, assurances & finance",
    "immo": "Immobilier",
    "autre": "Autre / non classé",
}

# Taux moyens annuels : euros pour une unité de devise (source BCE, arrondis).
FX = {
    "EUR": {},
    "USD": {2018: 0.847, 2019: 0.893, 2020: 0.877, 2021: 0.846, 2022: 0.951, 2023: 0.925, 2024: 0.924, 2025: 0.886, 2026: 0.87},
    "GBP": {2018: 1.130, 2019: 1.140, 2020: 1.125, 2021: 1.163, 2022: 1.173, 2023: 1.150, 2024: 1.181, 2025: 1.170, 2026: 1.16},
    "CHF": {2018: 0.866, 2019: 0.899, 2020: 0.934, 2021: 0.925, 2022: 0.995, 2023: 1.029, 2024: 1.050, 2025: 1.070, 2026: 1.07},
    # Taux moyens annuels approximatifs (euros pour une unité).
    "JPY": {2019: 0.0082, 2020: 0.0082, 2021: 0.0077, 2022: 0.0072, 2023: 0.0066, 2024: 0.0061, 2025: 0.0059, 2026: 0.0058},
    "TWD": {2019: 0.029, 2020: 0.030, 2021: 0.030, 2022: 0.032, 2023: 0.0297, 2024: 0.0287, 2025: 0.027, 2026: 0.027},
    "KRW": {2019: 0.00077, 2020: 0.00074, 2021: 0.00074, 2022: 0.00074, 2023: 0.00071, 2024: 0.00068, 2025: 0.00063, 2026: 0.00062},
    "INR": {2019: 0.0127, 2020: 0.0118, 2021: 0.0114, 2022: 0.0121, 2023: 0.0112, 2024: 0.0111, 2025: 0.0103, 2026: 0.0100},
    "CNY": {2019: 0.129, 2020: 0.127, 2021: 0.131, 2022: 0.141, 2023: 0.131, 2024: 0.128, 2025: 0.123, 2026: 0.122},
    "HKD": {2019: 0.114, 2020: 0.113, 2021: 0.109, 2022: 0.121, 2023: 0.118, 2024: 0.118, 2025: 0.114, 2026: 0.112},
    "DKK": {2019: 0.134, 2020: 0.134, 2021: 0.134, 2022: 0.134, 2023: 0.134, 2024: 0.134, 2025: 0.134, 2026: 0.134},
    "SEK": {2019: 0.0945, 2020: 0.0954, 2021: 0.0986, 2022: 0.0940, 2023: 0.0872, 2024: 0.0877, 2025: 0.090, 2026: 0.091},
    "NOK": {2019: 0.1016, 2020: 0.0930, 2021: 0.0983, 2022: 0.0990, 2023: 0.0877, 2024: 0.0858, 2025: 0.086, 2026: 0.086},
    "PLN": {2019: 0.233, 2020: 0.225, 2021: 0.219, 2022: 0.213, 2023: 0.220, 2024: 0.232, 2025: 0.235, 2026: 0.234},
    "CAD": {2019: 0.674, 2020: 0.654, 2021: 0.674, 2022: 0.731, 2023: 0.685, 2024: 0.675, 2025: 0.635, 2026: 0.63},
    "AUD": {2019: 0.621, 2020: 0.604, 2021: 0.635, 2022: 0.660, 2023: 0.614, 2024: 0.611, 2025: 0.575, 2026: 0.57},
    "BRL": {2019: 0.227, 2020: 0.171, 2021: 0.157, 2022: 0.184, 2023: 0.185, 2024: 0.172, 2025: 0.158, 2026: 0.16},
    "MXN": {2019: 0.0464, 2020: 0.041, 2021: 0.042, 2022: 0.047, 2023: 0.052, 2024: 0.051, 2025: 0.046, 2026: 0.047},
    "ZAR": {2019: 0.062, 2020: 0.053, 2021: 0.057, 2022: 0.058, 2023: 0.050, 2024: 0.050, 2025: 0.049, 2026: 0.049},
    "ILS": {2019: 0.251, 2020: 0.255, 2021: 0.262, 2022: 0.283, 2023: 0.251, 2024: 0.250, 2025: 0.245, 2026: 0.24},
    "SGD": {2019: 0.655, 2020: 0.636, 2021: 0.629, 2022: 0.690, 2023: 0.688, 2024: 0.690, 2025: 0.665, 2026: 0.66},
    "ARS": {},
}

COUNTRY_NAMES = {
    "FR": "France", "US": "USA", "GB": "Royaume-Uni", "NL": "Pays-Bas", "IT": "Italie", "ES": "Espagne",
    "BE": "Belgique", "SE": "Suède", "DK": "Danemark", "NO": "Norvège", "FI": "Finlande", "AT": "Autriche",
    "PT": "Portugal", "PL": "Pologne", "LU": "Luxembourg", "DE": "Allemagne", "CH": "Suisse", "IE": "Irlande",
    "JP": "Japon", "TW": "Taïwan", "KR": "Corée du Sud", "IN": "Inde", "CN": "Chine", "SG": "Singapour",
    "AU": "Australie", "CA": "Canada", "BR": "Brésil", "MX": "Mexique", "AR": "Argentine", "ZA": "Afrique du Sud",
    "IL": "Israël",
}
ZONES = {"FR": "FR", "US": "US", "GB": "GB", "JP": "ASIA", "TW": "ASIA", "KR": "ASIA", "IN": "ASIA", "CN": "ASIA",
         "SG": "ASIA", "AU": "ASIA", "CA": "AM", "BR": "AM", "MX": "AM", "AR": "AM", "ZA": "OTHER", "IL": "OTHER"}
ZONE_NAMES = {"FR": "France", "EU": "Europe (hors France et R.-U.)", "GB": "Royaume-Uni", "US": "USA",
              "ASIA": "Asie-Pacifique", "AM": "Amériques (hors USA)", "OTHER": "Autres"}


def sic_sector(sic):
    """Code SIC (USA) vers secteur large."""
    try:
        s = int(sic)
    except (TypeError, ValueError):
        return "autre"
    if s in (1311, 1321, 1381, 1382, 1389, 2911, 2990, 2992, 3533, 5171, 5172, 4922, 4923) or 4610 <= s <= 4619 or 2900 <= s <= 2999:
        return "energie"
    if 2833 <= s <= 2836 or 3841 <= s <= 3851 or 8000 <= s <= 8099 or s in (5047, 5122, 8731):
        return "sante"
    if 2840 <= s <= 2844 or 2000 <= s <= 2199 or 5400 <= s <= 5499 or s in (5140, 5141, 5149, 5180, 5190):
        return "conso_base"
    if 1000 <= s <= 1499 or 2400 <= s <= 2499 or 2600 <= s <= 2699 or 2800 <= s <= 2899 or 3200 <= s <= 3399:
        return "materiaux"
    if 3570 <= s <= 3579 or 3660 <= s <= 3699 or 7370 <= s <= 7379 or s in (3577, 3825, 3826):
        return "tech"
    if 4800 <= s <= 4899 or 2700 <= s <= 2799 or 7810 <= s <= 7829:
        return "telecom"
    if 4900 <= s <= 4999:
        return "utilities"
    if s == 6798 or 6500 <= s <= 6599:
        return "immo"
    if 6000 <= s <= 6799:
        return "finance"
    if 3710 <= s <= 3716 or 2200 <= s <= 2399 or 2500 <= s <= 2599 or 3630 <= s <= 3639 or 3940 <= s <= 3949 \
            or 5000 <= s <= 5999 or 7000 <= s <= 7099 or 7800 <= s <= 7999 or 3140 <= s <= 3149:
        return "conso_cyc"
    if 1500 <= s <= 1799 or 3400 <= s <= 3899 or 4000 <= s <= 4799 or 7300 <= s <= 7399 or 8700 <= s <= 8799:
        return "industrie"
    return "autre"


# Mots-clés (français et anglais, sans accents) pour estimer le secteur
# des sociétés françaises, qui ne publient pas de code secteur dans l'ESEF.
KEYWORDS = {
    "energie": ["petrol", "oil", "gaz naturel", "natural gas", "hydrocarbur", "forage", "drilling", "offshore",
                "parapetrol", "raffin", "refin", "gnl", "lng", "subsea", "sismique", "seismic", "pipeline",
                "exploration-production", "upstream", "carburant", "fuel", "energies fossiles"],
    "materiaux": ["chimi", "chemic", "acier", "steel", "metal", "ciment", "cement", "verre", "glass", "papier",
                  "paper", "emballage", "packaging", "minier", "mining", "mine ", "materiaux", "materials", "aluminium"],
    "industrie": ["aeronaut", "aerospace", "defense", "btp", "construction", "ingenierie", "engineering",
                  "industriel", "industrial", "transport", "logistique", "logistics", "equipement", "equipment",
                  "machine", "electrique", "electrical", "ferroviaire", "rail", "naval", "nettoyage", "facility",
                  "interim", "staffing", "conseil", "consulting", "maintenance", "travaux"],
    "conso_cyc": ["luxe", "luxury", "mode", "fashion", "maroquinerie", "automobile", "automotive", "pneumatique",
                  "tyre", "hotel", "tourisme", "tourism", "loisirs", "leisure", "distribution", "retail",
                  "jeux", "gaming", "video", "montres", "joaillerie", "jewel", "ameublement", "sport"],
    "conso_base": ["aliment", "food", "boisson", "beverage", "spiritueux", "spirits", "vin", "wine", "cosmet",
                   "hygiene", "agricol", "agri", "laitier", "dairy", "sucre", "sugar"],
    "sante": ["pharma", "sante", "health", "medic", "biotech", "diagnost", "therapeut", "clinique", "clinical",
              "vaccin", "dentaire", "dental", "hopital", "hospital"],
    "tech": ["logiciel", "software", "numerique", "digital", "informatique", "semi-conduct", "semiconductor",
             "cloud", "saas", "cybersecur", "electronique", "electronic", "data", "internet", "it services"],
    "telecom": ["telecom", "media", "television", "publicite", "advertising", "presse", "edition", "publishing",
                "radio", "cinema", "film", "musique", "music", "satellite"],
    "utilities": ["electricite", "electricity", "eau", "water", "reseau de gaz", "utilities", "renouvelable",
                  "renewable", "eolien", "wind", "solaire", "solar", "dechets", "waste"],
    "finance": ["banque", "bank", "assurance", "insurance", "gestion d'actifs", "asset management",
                "investment funds", "fonds d'investissement", "credit", "financement", "capital-investissement",
                "private equity", "holding"],
    "immo": ["fonciere", "immobili", "real estate", "reit", "siic", "bureaux", "centres commerciaux", "logement"],
}

# Quelques sociétés françaises dont le secteur est connu (nom en majuscules).
NAME_OVERRIDES = [
    ("TOTALENERGIES", "energie"), ("TECHNIP", "energie"), ("VALLOUREC", "energie"), ("VIRIDIEN", "energie"),
    ("CGG", "energie"), ("RUBIS", "energie"), ("ESSO", "energie"), ("MAUREL", "energie"),
    ("GAZTRANSPORT", "energie"), ("BOURBON", "energie"), ("EXAIL", "industrie"), ("ENGIE", "utilities"),
    ("EDF", "utilities"), ("VEOLIA", "utilities"), ("LVMH", "conso_cyc"), ("HERMES", "conso_cyc"),
    ("KERING", "conso_cyc"), ("L'OREAL", "conso_base"), ("DANONE", "conso_base"), ("PERNOD", "conso_base"),
    ("SANOFI", "sante"), ("PUBLICIS", "telecom"), ("ORANGE", "telecom"), ("AIR LIQUIDE", "materiaux"),
    ("ARKEMA", "materiaux"), ("SAINT-GOBAIN", "materiaux"), ("COMPAGNIE DE SAINT", "materiaux"),
    ("VINCI", "industrie"), ("BOUYGUES", "industrie"), ("EIFFAGE", "industrie"), ("AIRBUS", "industrie"),
    ("SAFRAN", "industrie"), ("THALES", "industrie"), ("SCHNEIDER", "industrie"), ("LEGRAND", "industrie"),
    ("DASSAULT SYSTEMES", "tech"), ("CAPGEMINI", "tech"), ("STMICRO", "tech"), ("BNP", "finance"),
    ("SOCIETE GENERALE", "finance"), ("CREDIT AGRICOLE", "finance"), ("AXA", "finance"),
    ("UNIBAIL", "immo"), ("KLEPIERRE", "immo"), ("GECINA", "immo"), ("COVIVIO", "immo"),
    ("RENAULT", "conso_cyc"), ("STELLANTIS", "conso_cyc"), ("MICHELIN", "conso_cyc"), ("CARREFOUR", "conso_base"),
]


def _plain(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return text.lower()


def keyword_sector(name, desc):
    upper = _plain(name).upper()
    for key, sector in NAME_OVERRIDES:
        if _plain(key).upper() in upper:
            return sector
    text = " " + _plain(name) + " " + _plain(desc) + " "
    scores = {}
    for sector, words in KEYWORDS.items():
        n = sum(len(re.findall(r"\b" + re.escape(w), text)) for w in words)
        if n:
            scores[sector] = n
    return max(scores, key=scores.get) if scores else "autre"


def main():
    us = read_json("raw_us.json", {"companies": []})["companies"]
    prices = read_json("prices.json", {})
    fr = read_json("raw_fr.json", {"companies": []})["companies"]
    eu = read_json("raw_eu.json", {"companies": []})["companies"]
    # Groupes étrangers cotés à New York, sauf ceux déjà couverts (comptes US GAAP, France, Europe).
    known_t = {c.get("ticker") for c in us if c.get("ticker")}
    intl = [c for c in read_json("raw_intl.json", {"companies": []})["companies"] if c.get("ticker") not in known_t]
    # Une société déposant en France apparaît parfois aussi dans la collecte européenne (même LEI) : on garde la française.
    fr_lei = {c["id"].split("-", 1)[1] for c in fr}
    eu = [c for c in eu if c["id"].split("-", 1)[1] not in fr_lei]
    fr = fr + eu + intl
    fields = [k for k, _, _ in FIELDS]

    years = sorted({int(y) for c in us + fr for y in c["years"]})
    # On ignore les années trop anciennes et les années à peine entamées.
    this_year = datetime.date.today().year
    years = [y for y in years if this_year - 7 <= y < this_year]

    out = []
    for c in us + fr:
        if c.get("sic"):
            sector = sic_sector(c.get("sic"))
            sector_from = "SIC"
        else:
            if c.get("lei") in SECTORS_FR:
                sector, sector_from = SECTORS_FR[c["lei"]], "classé"
            else:
                sector, sector_from = keyword_sector(c["name"], c.get("sector_desc")), "estimé"
        # Totaux absents, reconstitués : résultat avant impôt = résultat net + impôt ;
        # résultat opérationnel = résultat avant impôt + charges financières.
        est = set(c.get("estimated") or [])
        for y, r in c["years"].items():
            if "pretax" not in r and "net_income_total" in r and "tax" in r:
                r["pretax"] = r["net_income_total"] + r["tax"]
                est.add("pretax")
            if "operating_income" not in r and "pretax" in r and "interest" in r:
                r["operating_income"] = r["pretax"] + r["interest"]
                est.add("operating_income")
        # Capitalisation déclarée à la SEC : certaines déclarations sont fausses d'un facteur 1 000
        # (erreur d'unité). On écarte les valeurs incohérentes avec le CA ou avec les autres années.
        caps = [r.get("market_cap") for r in c["years"].values() if r.get("market_cap")]
        if caps:
            med = sorted(caps)[len(caps) // 2]
            for y, r in c["years"].items():
                v, rev = r.get("market_cap"), r.get("revenue")
                if v and ((rev and rev > 0 and v > 50 * rev) or v > 30 * med):
                    del r["market_cap"]
        values = {}
        for f in fields:
            row = []
            for y in years:
                v = c["years"].get(str(y), {}).get(f)
                row.append(None if v is None else (round(v, 4) if f in PER_SHARE else round(v / 1e6, 3)))
            if any(v is not None for v in row):
                values[f] = row
        if "revenue" not in values:
            continue
        # Résultat net aberrant (valeur publiée dans une mauvaise unité, ex. 0,004 M$ pour un bénéfice
        # de plusieurs milliards) : écarté quand il est infime face au résultat d'exploitation.
        for f in ("net_income", "net_income_total"):
            row = values.get(f)
            if not row:
                continue
            for j, v in enumerate(row):
                rev = values["revenue"][j]
                ebit = (values.get("operating_income") or [None] * len(row))[j]
                if v is not None and rev and rev > 0 and ebit is not None and abs(ebit) > 0.02 * rev and abs(v) < 1e-4 * rev:
                    row[j] = None
        # Résultat net manquant au dernier exercice : bénéfice par action × nombre d'actions (cours collectés).
        px_c = (prices.get("us", {}) if c["country"] == "US" else prices.get("fr", {})).get(c["id"])
        eps_row = values.get("eps")
        if px_c and px_c[1] and eps_row:
            j = len(years) - 1
            while j >= 0 and values["revenue"][j] is None:
                j -= 1
            ni_row = values.setdefault("net_income", [None] * len(years))
            if j >= 0 and ni_row[j] is None and eps_row[j] is not None:
                ni_row[j] = round(eps_row[j] * px_c[1] / 1e6, 3)
        # Dividende par action sur longue période (SEC) ; sinon, années collectées (ESEF), avec un
        # nombre d'actions approché par résultat net / bénéfice par action pour repérer les divisions.
        dh = c.get("div_hist")
        if not dh:
            dps = {int(y): r["dps"] for y, r in c["years"].items() if r.get("dps") is not None}
            shares = {int(y): r["net_income"] / r["eps"] for y, r in c["years"].items()
                      if r.get("net_income") and r.get("eps") and r["net_income"] / r["eps"] > 0}
            dh = dividend_history(dps, {}, shares) if dps else None
        if dh and not any(v for v in dh["v"] if v):
            dh = None
        div_hist = {"y0": dh["y0"], "v": dh["v"], "h": dh["hausses"], "sb": dh["sans_baisse"], "cp": dh["complet"],
                    "e": dh.get("est", []), "sp": dh["splits"]} if dh else None
        out.append({
            "id": c["id"], "n": c["name"], "c": c["country"], "z": ZONES.get(c["country"], "EU"), "t": c.get("ticker"), "x": c.get("exchange"),
            "s": sector, "sf": sector_from, "sd": c.get("sector_desc"), "sic": c.get("sic"),
            "cur": c["currency"], "src": c.get("source"), "est": sorted(est),
            "fy": {y: c.get("fy_end", {}).get(str(y)) for y in years[-1:]},
            # Cours de clôture et nombre d'actions : capitalisation actuelle.
            "px": (prices.get("us", {}) if c["country"] == "US" else prices.get("fr", {})).get(c["id"]),
            "ff": prices.get("us_float", {}).get(c["id"]),   # part du flottant (USA)
            "v": values,
            "dh": div_hist,
        })

    meta = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes"),
        "years": years,
        "fields": {k: {"kind": kind, "label": label} for k, kind, label in FIELDS},
        "sectors": SECTORS,
        "fx": {cur: {str(y): r for y, r in rates.items()} for cur, rates in FX.items()},
        "price_date": {"US": prices.get("date_us"), "FR": prices.get("date_fr")},
        "countries": COUNTRY_NAMES, "zones": ZONE_NAMES,
        "zone_counts": {z: sum(1 for c in out if c["z"] == z) for z in ZONE_NAMES},
        "counts": {"US": sum(1 for c in out if c["c"] == "US"), "FR": sum(1 for c in out if c["c"] == "FR")},
        # Coût du capital : taux sans risque, primes de risque et bêtas de référence (collect/rates.py).
        "rates": read_json("rates.json", None),
    }
    path = write_json("companies.json", {"meta": meta, "companies": out})
    print(f"{path} : {len(out)} sociétés, années {years[0]}–{years[-1]}")


if __name__ == "__main__":
    main()
