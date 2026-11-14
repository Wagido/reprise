"""Collecte des PME françaises : ratios financiers + identité et localisation.

Deux sources publiques et gratuites :
- « Ratios financiers (BCE / INPI) » sur data.economie.gouv.fr : un bilan par
  société et par exercice, calculé à partir des comptes annuels déposés au
  greffe (CA, EBE, EBIT, résultat net, endettement, liquidité, vétusté, BFR,
  délais clients et fournisseurs, capacité de remboursement…).
- L'API « Recherche d'entreprises » (annuaire des entreprises) : nom, activité
  (code NAF), effectif, commune et coordonnées du siège.

On ne garde que les sociétés actives, diffusibles, de CA compris entre
CA_MIN et CA_MAX, avec des comptes publics. Aucune donnée sur les personnes
(dirigeants) n'est collectée.
"""

import argparse
import csv
import gzip
import io
import os
import sys
import time
import urllib.parse
import urllib.request

from common import CACHE, USER_AGENT, get_json, write_json

CA_MIN, CA_MAX = 2_000_000, 50_000_000
FIRST_YEAR = 2020

RATIOS = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/exports/csv"
SEARCH = "https://recherche-entreprises.api.gouv.fr/search"

DEPARTEMENTS = [f"{i:02d}" for i in range(1, 96) if i != 20] + ["2A", "2B", "971", "972", "973", "974", "976"]
SECTIONS = "ABCDEFGHIJKLMNOPQRSTU"

NAF_SECTIONS = {
    "A": "Agriculture, sylviculture et pêche", "B": "Industries extractives", "C": "Industrie manufacturière",
    "D": "Électricité, gaz, vapeur", "E": "Eau, assainissement, déchets", "F": "Construction",
    "G": "Commerce, réparation automobile", "H": "Transports et entreposage", "I": "Hébergement et restauration",
    "J": "Information et communication", "K": "Activités financières et d'assurance", "L": "Activités immobilières",
    "M": "Activités spécialisées, scientifiques et techniques", "N": "Services administratifs et de soutien",
    "O": "Administration publique", "P": "Enseignement", "Q": "Santé humaine et action sociale",
    "R": "Arts, spectacles et loisirs", "S": "Autres activités de services", "T": "Ménages employeurs",
    "U": "Activités extra-territoriales",
}

EFFECTIFS = {
    "00": "0", "01": "1-2", "02": "3-5", "03": "6-9", "11": "10-19", "12": "20-49", "21": "50-99", "22": "100-199",
    "31": "200-249", "32": "250-499", "41": "500-999", "42": "1000-1999", "51": "2000-4999", "52": "5000-9999", "53": "10000+",
}

RATIO_FIELDS = [
    ("chiffre_d_affaires", "ca"), ("marge_brute", "mb"), ("ebe", "ebe"), ("ebit", "ebit"), ("resultat_net", "rn"),
    ("marge_ebe", "me"), ("resultat_courant_avant_impots_sur_ca", "rcai"), ("caf_sur_ca", "cafca"),
    ("taux_d_endettement", "endet"), ("capacite_de_remboursement", "remb"), ("couverture_des_interets", "couv"),
    ("ratio_de_liquidite", "liq"), ("autonomie_financiere", "auto"), ("ratio_de_vetuste", "vet"),
    ("poids_bfr_exploitation_sur_ca_jours", "bfrj"), ("rotation_des_stocks_jours", "stj"),
    ("credit_clients_jours", "clj"), ("credit_fournisseurs_jours", "foj"),
]


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def fetch_ratios(max_age_days=7):
    """Export CSV des bilans de PME depuis FIRST_YEAR (gardé en cache compressé)."""
    path = os.path.join(CACHE, "pme", "ratios.csv.gz")
    if os.path.exists(path) and (time.time() - os.path.getmtime(path)) / 86400 < max_age_days:
        log("ratios : cache")
    else:
        where = (f"chiffre_d_affaires>={CA_MIN // 2} and chiffre_d_affaires<={CA_MAX * 2} "
                 f"and date_cloture_exercice>=date'{FIRST_YEAR}-01-01'")
        url = RATIOS + "?" + urllib.parse.urlencode({
            "where": where, "delimiter": ";",
            "select": "siren,date_cloture_exercice,type_bilan,confidentiality," + ",".join(f for f, _ in RATIO_FIELDS),
        })
        os.makedirs(os.path.dirname(path), exist_ok=True)
        for attempt in range(5):
            try:
                log("ratios : téléchargement de l'export (quelques minutes)…")
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=900) as r, gzip.open(path + ".tmp", "wb") as out:
                    n = 0
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        out.write(chunk)
                        n += len(chunk)
                log(f"ratios : {n // 1_000_000} Mo")
                os.replace(path + ".tmp", path)
                break
            except Exception as e:  # coupures réseau fréquentes : on recommence
                log(f"  nouvel essai ({e})")
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("export des ratios impossible")

    # Un bilan par société et par année ; on préfère le bilan consolidé, puis complet.
    rank = {"K": 0, "C": 1, "S": 2}
    by = {}
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("confidentiality") not in ("Public", "Publication simplifiee"):
                continue
            year = int(row["date_cloture_exercice"][:4])
            # Exercice clos en début d'année : rattaché à l'année précédente.
            if row["date_cloture_exercice"][5:7] in ("01", "02", "03"):
                year -= 1
            key = (row["siren"], year)
            old = by.get(key)
            if old and rank.get(old["_t"], 9) <= rank.get(row["type_bilan"], 9):
                continue
            rec = {"_t": row["type_bilan"]}
            for src, dst in RATIO_FIELDS:
                v = row.get(src)
                if v not in (None, ""):
                    try:
                        rec[dst] = float(v)
                    except ValueError:
                        pass
            by[key] = rec
    out = {}
    for (siren, year), rec in by.items():
        out.setdefault(siren, {})[year] = rec
    log(f"ratios : {len(out)} sociétés")
    return out


def search_pages(params, label):
    """Toutes les pages d'une recherche (au plus 400 pages de 25)."""
    results, page = [], 1
    while True:
        q = dict(params, page=page, per_page=25)
        d = get_json(SEARCH + "?" + urllib.parse.urlencode(q),
                     cache_name=f"pme/search/{label}_{page}.json.gz", max_age_days=30, min_interval=0.16)
        if not d:
            break
        results += d.get("results", [])
        if page >= min(d.get("total_pages", 0), 400):
            return results, d.get("total_results", 0)
        page += 1
    return results, len(results)


def fetch_directory(departements):
    base = {"ca_min": CA_MIN, "ca_max": CA_MAX, "etat_administratif": "A"}
    found = {}
    for k, dep in enumerate(departements, 1):
        first = get_json(SEARCH + "?" + urllib.parse.urlencode(dict(base, departement=dep, per_page=1)),
                         cache_name=f"pme/search/count_{dep}.json.gz", max_age_days=30, min_interval=0.16)
        total = (first or {}).get("total_results", 0)
        if total > 9800:
            parts = [(dict(base, departement=dep, section_activite_principale=s), f"{dep}_{s}") for s in SECTIONS]
        else:
            parts = [(dict(base, departement=dep), dep)]
        for params, label in parts:
            rows, _ = search_pages(params, label)
            for r in rows:
                found.setdefault(r["siren"], r)
        log(f"[{k}/{len(departements)}] département {dep} : {total} résultats, {len(found)} sociétés au total")
    return found


def identity(r):
    s = r.get("siege") or {}
    if r.get("statut_diffusion") != "O" or s.get("statut_diffusion_etablissement") not in (None, "O"):
        return None
    if r.get("categorie_entreprise") == "GE":
        return None
    try:
        lat, lon = float(s.get("latitude")), float(s.get("longitude"))
    except (TypeError, ValueError):
        return None
    return {
        "n": r.get("nom_complet") or r.get("nom_raison_sociale"),
        "lat": round(lat, 4), "lon": round(lon, 4),
        "com": s.get("libelle_commune"), "dep": s.get("departement"),
        "naf": r.get("activite_principale"), "sec": r.get("section_activite_principale"),
        "eff": EFFECTIFS.get(r.get("tranche_effectif_salarie") or "", None),
        "cat": r.get("categorie_entreprise"), "cr": (r.get("date_creation") or "")[:4] or None,
    }


def build(ratios, directory):
    years = sorted({y for d in ratios.values() for y in d})
    years = [y for y in years if y >= FIRST_YEAR]
    keys = [k for _, k in RATIO_FIELDS]
    cols = {k: [] for k in ["siren", "n", "lat", "lon", "com", "dep", "naf", "sec", "eff", "cat", "cr", "y"] + keys + ["hist"]}
    for siren, r in directory.items():
        ident = identity(r)
        rec = ratios.get(siren)
        if not ident or not rec:
            continue
        last = max(rec)
        cur = rec[last]
        if not (CA_MIN <= cur.get("ca", 0) <= CA_MAX):
            continue
        cols["siren"].append(siren)
        for k, v in ident.items():
            cols[k].append(v)
        cols["y"].append(last)
        for k in keys:
            v = cur.get(k)
            if v is None:
                cols[k].append(None)
            elif k in ("ca", "mb", "ebe", "ebit", "rn"):
                cols[k].append(round(v / 1000))           # en milliers d'euros
            else:
                cols[k].append(round(v, 1))
        # Historique : CA, EBE, résultat net (k€) par année de meta.years.
        cols["hist"].append([[None if (rec.get(y) or {}).get(f) is None else round(rec[y][f] / 1000) for y in years]
                             for f in ("ca", "ebe", "rn")])
    return years, cols


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--departements", nargs="*", help="limiter à quelques départements (test)")
    a = p.parse_args()
    deps = a.departements or DEPARTEMENTS
    directory = fetch_directory(deps)
    ratios = fetch_ratios()
    years, cols = build(ratios, directory)
    import datetime
    meta = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes"),
        "years": years, "sections": NAF_SECTIONS, "ca_min": CA_MIN, "ca_max": CA_MAX, "count": len(cols["siren"]),
    }
    path = write_json("pme.json", {"meta": meta, "cols": cols})
    log(f"{path} : {len(cols['siren'])} PME")


if __name__ == "__main__":
    main()
