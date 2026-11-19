"""Rapports ESEF déposés à l'AMF (info-financiere.gouv.fr), en complément de filings.xbrl.org.

filings.xbrl.org reprend les rapports avec retard, et pas tous : en 2026 il manquait par exemple
les rapports 2025 de LVMH, Danone, Air Liquide ou Orange (nouveau format de paquet .xbri).
On ne télécharge ici que ce qui manque : un rapport AMF plus récent que le dernier exercice connu
sur filings.xbrl.org, ou une société absente de filings.xbrl.org.
"""
import datetime
import gzip
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

import ixbrl
from common import CACHE, get_json

API = "https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/exports/json?"
ESEF = "300005"   # type d'information : rapport financier annuel au format ESEF


def norm(name):
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\b(SA|SE|SCA|SAS|NV|S A|GROUPE|GROUP)\b", " ", s.replace(".", " "))
    return re.sub(r"[^A-Z]", "", s)


def list_reports(since="2022-01-01", log=print):
    q = urllib.parse.urlencode({
        "select": "identificationsociete_iso_nom_soc as name, identificationsociete_iso_cd_lei as lei, "
                  "uin_idt_uin as uin, uin_dat_amf as date, url_de_recuperation as url",
        "where": f"informationdeposee_inf_stp_pri='{ESEF}' and uin_dat_amf >= '{since}'",
    })
    for attempt in range(8):   # ce serveur coupe souvent les connexions
        try:
            rows = get_json(API + q, cache_name="esef/amf_list.json.gz", max_age_days=1, retries=2) or []
            break
        except Exception as e:
            log(f"AMF : liste indisponible ({e}), nouvel essai")
            time.sleep(10)
    else:
        return []
    rows = [r for r in rows if r.get("url") and re.search(r"\.(zip|xbri)$", r["url"], re.I)]
    log(f"AMF : {len(rows)} rapports ESEF depuis {since}")
    return rows


def fetch(rec, log=print):
    """Télécharge et lit un rapport (gardé en cache sous forme de faits)."""
    path = os.path.join(CACHE, "esef", "amf", rec["uin"] + ".json.gz")
    if os.path.exists(path):
        with open(path, "rb") as f:
            raw = f.read()
        return None if raw == b"null" else json.loads(gzip.decompress(raw))
    doc = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(rec["url"], headers={"User-Agent": "reprise-screener"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
            doc = ixbrl.parse(data)
            break
        except Exception as e:
            if attempt == 3:
                log(f"  AMF {rec['name']} : {e}")
                return None   # pas de cache : nouvel essai à la prochaine collecte
            time.sleep(5 * (attempt + 1))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"null" if doc is None else gzip.compress(json.dumps(doc).encode()))
    return doc


def missing(filings, names, log=print, per_company=2):
    """Rapports AMF à lire : plus récents que filings.xbrl.org, ou sociétés absentes.

    filings : rapports de filings.xbrl.org (lei, period_end) ; names : {lei: nom}.
    Renvoie [(enregistrement AMF, document)].
    """
    last = {}
    for f in filings:
        if f.get("period_end"):
            last[f["lei"]] = max(last.get(f["lei"], ""), f["period_end"])
    by_name = {norm(n): lei for lei, n in names.items()}
    todo = {}
    for r in list_reports(log=log):
        lei = r.get("lei") or by_name.get(norm(r["name"]))
        known = last.get(lei)
        # Un rapport déposé plus de 13 mois après la dernière clôture connue porte un exercice plus récent.
        if known:
            limit = (datetime.date.fromisoformat(known[:10]) + datetime.timedelta(days=395)).isoformat()
            if r["date"][:10] <= limit:
                continue
        todo.setdefault(lei or "?" + norm(r["name"]), []).append(r)
    picked = [r for rs in todo.values() for r in sorted(rs, key=lambda r: r["date"])[-per_company:]]
    log(f"AMF : {len(picked)} rapports à lire pour {len(todo)} sociétés (plus récents que filings.xbrl.org ou absents)")
    out = []
    for k, r in enumerate(sorted(picked, key=lambda r: r["date"]), 1):
        doc = fetch(r, log)
        if doc and doc.get("facts"):
            out.append((r, doc))
        if k % 10 == 0:
            log(f"  AMF [{k}/{len(picked)}]")
    return out
