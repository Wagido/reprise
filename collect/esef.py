"""Collecte des comptes des sociétés cotées en France (rapports ESEF, IFRS).

Les rapports financiers annuels déposés à l'AMF sont au format européen ESEF
depuis l'exercice 2020. La fondation XBRL les regroupe sur filings.xbrl.org,
avec pour chacun un fichier xBRL-JSON (une liste de « faits » comptables).
Chaque rapport contient l'exercice et l'exercice précédent en comparatif.
"""

import argparse
import collections
import datetime
import sys
from urllib.parse import quote

from common import get_json, write_json
from concepts import IFRS, PER_SHARE_TAGS, all_tags, guess_custom, resolve

BASE = "https://filings.xbrl.org"
LIST = BASE + "/api/filings?filter%5Bcountry%5D={country}&page%5Bsize%5D=200&include=entity&page%5Bnumber%5D={page}"

TAGS = all_tags(IFRS)
DESC = "ifrs-full:DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities"
BASE_DIMS = {"concept", "entity", "period", "unit", "language"}

# Pays européens présents sur filings.xbrl.org (l'Allemagne, l'Irlande et la Suisse n'y sont pas).
EUROPE = ["GB", "NL", "IT", "ES", "BE", "SE", "DK", "NO", "FI", "AT", "PT", "PL", "LU"]


def list_filings(country, log):
    filings, entities = [], {}
    page = 1
    while True:
        d = get_json(LIST.format(country=country, page=page),
                     cache_name=f"esef/list_{country}_{page}.json.gz", max_age_days=7, min_interval=0.3)
        for e in d.get("included", []):
            if e["type"] == "entity":
                entities[e["id"]] = e["attributes"]
        for f in d["data"]:
            a = f["attributes"]
            if not a.get("json_url"):
                continue
            ent = f["relationships"]["entity"]["links"]["related"].rsplit("/", 1)[-1]
            filings.append({**a, "lei": ent})
        log(f"liste {country} page {page} : {len(filings)} rapports")
        if not d["links"].get("next"):
            break
        page += 1
    names = {e["identifier"]: e["name"] for e in entities.values()}
    return filings, names


def _date(s):
    return datetime.date.fromisoformat(s[:10])


def period_year(period):
    """Année d'exercice d'une période xBRL-JSON, ou None si ce n'est pas un an."""
    if "/" in period:
        start, end = period.split("/")
        d0, d1 = _date(start), _date(end)
        if "T" in end:
            d1 -= datetime.timedelta(days=1)
        if not 330 <= (d1 - d0).days <= 400:
            return None, None
        return d1.year, d1.isoformat()
    d = _date(period)
    if "T" in period:
        d -= datetime.timedelta(days=1)
    return d.year, None


def parse_filing(doc):
    """Renvoie (valeurs par année, devise, description, année du rapport)."""
    by_year = collections.defaultdict(dict)
    units = collections.Counter()
    ends = {}
    desc = None
    for fact in doc.get("facts", {}).values():
        dims = fact.get("dimensions", {})
        concept = dims.get("concept", "")
        if concept == DESC and not desc and fact.get("value"):
            desc = " ".join(str(fact["value"]).split())[:400]
            continue
        if set(dims) - BASE_DIMS or ":" not in concept:
            continue
        prefix, tag = concept.split(":", 1)
        custom = prefix != "ifrs-full"
        if not custom and tag not in TAGS:
            continue
        unit = dims.get("unit", "")
        per_share = tag in PER_SHARE_TAGS and unit.startswith("iso4217:") and "/" in unit
        if not unit.startswith("iso4217:") or ("/" in unit and not per_share):
            continue
        try:
            val = float(fact["value"])
        except (TypeError, ValueError):
            continue
        year, end = period_year(dims.get("period", ""))
        if year is None:
            continue
        duration = "/" in dims["period"]
        if custom:
            # Étiquette propre à la société, gardée à part pour les lignes manquantes.
            by_year[year][("~D:" if duration else "~I:") + tag] = val
            continue
        if (TAGS[tag] == "D") != duration:
            continue
        by_year[year][tag] = val
        if not per_share:
            units[unit[8:]] += 1
        if end:
            ends[year] = end
    if not units:
        return {}, None, desc, None, {}
    # L'année du rapport : la plus récente qui a un flux sur douze mois.
    own = max(ends) if ends else max(by_year)
    return by_year, units.most_common(1)[0][0], desc, own, ends


def collect(country="FR", limit=None, log=print, per_entity=None, workers=1):
    filings, names = list_filings(country, log)
    # Un rapport par société et par date de clôture : le plus récent traité.
    best = {}
    for f in filings:
        key = (f["lei"], f["period_end"])
        if key not in best or (f.get("processed") or "") > (best[key].get("processed") or ""):
            best[key] = f
    chosen = sorted(best.values(), key=lambda f: (f["lei"], f["period_end"]))
    # Au plus `per_entity` rapports par société (les plus récents) : chaque rapport contient aussi
    # l'exercice précédent, 3 rapports donnent donc 4 à 5 années.
    if per_entity:
        by_lei = {}
        for f in chosen:
            by_lei.setdefault(f["lei"], []).append(f)
        chosen = [f for fs in by_lei.values() for f in fs[-per_entity:]]
    if limit:
        chosen = chosen[:limit]

    # Téléchargement en parallèle (4 à la fois), gardé en cache : les relances sont rapides.
    from concurrent.futures import ThreadPoolExecutor

    def fetch(f):
        try:
            return get_json(BASE + quote(f["json_url"]), cache_name=f"esef/json/{f['fxo_id']}.json.gz", min_interval=0.05)
        except Exception as e:  # un rapport illisible ne doit pas bloquer la collecte
            log(f"  ignoré {f['fxo_id']} : {e}")
            return None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        docs = pool.map(fetch, chosen)
        docs = list(docs)

    per_lei = {}
    for i, (f, doc) in enumerate(zip(chosen, docs), 1):
        if not doc:
            continue
        by_year, cur, desc, own, ends = parse_filing(doc)
        if i % 25 == 0 or i == len(chosen):
            log(f"[{i}/{len(chosen)}] rapports lus")
        if not by_year:
            continue
        c = per_lei.setdefault(f["lei"], {"own": {}, "comp": {}, "cur": None, "desc": None,
                                          "viewer": None, "last": None, "ends": {}})
        for y, vals in by_year.items():
            target = c["own"] if y == own else c["comp"]
            # Rapports parcourus du plus ancien au plus récent : les
            # comparatifs retraités les plus récents l'emportent.
            target[y] = vals
        c["ends"].update(ends)
        if own and (c["last"] is None or own >= c["last"]):
            c["last"] = own
            c["cur"] = cur or c["cur"]
            c["desc"] = desc or c["desc"]
            c["viewer"] = BASE + quote(f["viewer_url"]) if f.get("viewer_url") else c["viewer"]

    companies = []
    for lei, c in per_lei.items():
        years = {}
        estimated = set()
        for y in sorted(set(c["own"]) | set(c["comp"])):
            vals = c["own"].get(y) or c["comp"].get(y)
            r = resolve(IFRS, vals)
            for kind in ("D", "I"):
                custom = {k[3:]: v for k, v in vals.items() if k.startswith(f"~{kind}:")}
                if not custom:
                    continue
                g = guess_custom(custom, kind)
                net_debt = g.pop("net_debt", None)
                has_debt = any(k in r for k in ("debt_lt", "debt_st", "debt_total"))
                for field, v in g.items():
                    if field == "debt_total":
                        if has_debt:
                            continue
                    elif field.startswith("debt"):
                        if field in r or "debt_total" in r:
                            continue
                    elif field in r:
                        continue
                    r[field] = v
                    estimated.add(field)
                if net_debt is not None and "cash" in r and not any(k in r for k in ("debt_lt", "debt_st", "debt_total")):
                    r["debt_total"] = net_debt + r["cash"]
                    estimated.add("debt_total")
            if r:
                years[str(y)] = r
        if not any("revenue" in r for r in years.values()):
            continue
        companies.append({
            "id": f"{country}-{lei}",
            "name": names.get(lei, lei),
            "country": country,
            "lei": lei,
            "sector_desc": c["desc"],
            "currency": c["cur"] or "EUR",
            "fy_end": {str(k): v for k, v in c["ends"].items()},
            "source": c["viewer"],
            "years": years,
            "estimated": sorted(estimated),
        })
    log(f"ESEF {country} : {len(companies)} sociétés avec des comptes")
    return companies


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--country", default="FR")
    p.add_argument("--limit", type=int, default=None, help="nombre maximal de rapports (test rapide)")
    p.add_argument("--europe", action="store_true", help="tous les pays européens couverts (hors France)")
    a = p.parse_args()
    lg = lambda m: print(m, file=sys.stderr, flush=True)
    if a.europe:
        out = []
        for cc in EUROPE:
            try:
                out += collect(cc, a.limit, log=lg, per_entity=2, workers=4)
            except Exception as ex:   # un pays en échec ne bloque pas les autres
                lg(f"{cc} : échec ({ex})")
        write_json("raw_eu.json", {"companies": out})
    else:
        companies = collect(a.country, a.limit, log=lg)
        write_json(f"raw_{a.country.lower()}.json", {"companies": companies})


if __name__ == "__main__":
    main()
