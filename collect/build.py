"""Fusionne les collectes USA et France en un seul fichier pour l'application.

Sortie : data/companies.json, compact. Les montants sont en millions de la
devise de publication ; l'application les convertit en euros avec les taux
moyens annuels de meta.fx (approximatifs, suffisants pour classer).
"""

import datetime
import re
import unicodedata

from common import read_json, write_json
from concepts import FIELDS

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
}


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
    fr = read_json("raw_fr.json", {"companies": []})["companies"]
    fields = [k for k, _, _ in FIELDS]

    years = sorted({int(y) for c in us + fr for y in c["years"]})
    # On ignore les années trop anciennes et les années à peine entamées.
    this_year = datetime.date.today().year
    years = [y for y in years if this_year - 7 <= y < this_year]

    out = []
    for c in us + fr:
        if c["country"] == "US":
            sector = sic_sector(c.get("sic"))
            sector_from = "SIC"
        else:
            sector = keyword_sector(c["name"], c.get("sector_desc"))
            sector_from = "estimé"
        values = {}
        for f in fields:
            row = []
            for y in years:
                v = c["years"].get(str(y), {}).get(f)
                row.append(None if v is None else round(v / 1e6, 3))
            if any(v is not None for v in row):
                values[f] = row
        if "revenue" not in values:
            continue
        out.append({
            "id": c["id"], "n": c["name"], "c": c["country"], "t": c.get("ticker"), "x": c.get("exchange"),
            "s": sector, "sf": sector_from, "sd": c.get("sector_desc"), "sic": c.get("sic"),
            "cur": c["currency"], "src": c.get("source"),
            "fy": {y: c.get("fy_end", {}).get(str(y)) for y in years[-1:]},
            "v": values,
        })

    meta = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes"),
        "years": years,
        "fields": {k: {"kind": kind, "label": label} for k, kind, label in FIELDS},
        "sectors": SECTORS,
        "fx": {cur: {str(y): r for y, r in rates.items()} for cur, rates in FX.items()},
        "counts": {"US": sum(1 for c in out if c["c"] == "US"), "FR": sum(1 for c in out if c["c"] == "FR")},
    }
    path = write_json("companies.json", {"meta": meta, "companies": out})
    print(f"{path} : {len(out)} sociétés, années {years[0]}–{years[-1]}")


if __name__ == "__main__":
    main()
