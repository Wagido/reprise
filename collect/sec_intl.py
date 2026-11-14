"""Grands groupes étrangers cotés à New York (rapports 20-F / 40-F à la SEC).

Leurs comptes IFRS ne sont pas dans l'API « frames » de la SEC : on lit la fiche
complète de chaque société (companyfacts). Liste choisie à la main des grands
groupes mondiaux (Japon, Royaume-Uni, Europe, Asie, Amériques) ; à compléter
librement. Les sociétés déjà couvertes autrement (France, comptes US GAAP)
sont ignorées au moment de la fusion.
"""

import sys

from common import get_json, read_json, write_json
from concepts import IFRS, US_GAAP, all_tags, resolve

TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json"
FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

# (ticker à New York, pays)
FOREIGN = [
    # Japon
    ("TM", "JP"), ("SONY", "JP"), ("HMC", "JP"), ("MUFG", "JP"), ("SMFG", "JP"), ("MFG", "JP"), ("TAK", "JP"),
    ("NMR", "JP"), ("IX", "JP"),
    # Taïwan, Corée, Inde, Chine, Hong Kong
    ("TSM", "TW"), ("UMC", "TW"), ("ASX", "TW"), ("CHT", "TW"), ("KB", "KR"), ("SHG", "KR"), ("PKX", "KR"),
    ("KEP", "KR"), ("SKM", "KR"), ("LPL", "KR"), ("INFY", "IN"), ("WIT", "IN"), ("HDB", "IN"), ("IBN", "IN"),
    ("RDY", "IN"), ("NTES", "CN"), ("TCOM", "CN"), ("TME", "CN"), ("BEKE", "CN"), ("LI", "CN"), ("NIO", "CN"),
    ("XPEV", "CN"), ("BILI", "CN"), ("ZTO", "CN"), ("VIPS", "CN"), ("HTHT", "CN"), ("YUMC", "CN"),
    # Royaume-Uni
    ("SHEL", "GB"), ("BP", "GB"), ("AZN", "GB"), ("GSK", "GB"), ("HSBC", "GB"), ("UL", "GB"), ("DEO", "GB"),
    ("BTI", "GB"), ("RIO", "GB"), ("RELX", "GB"), ("NGG", "GB"), ("VOD", "GB"), ("LYG", "GB"), ("BCS", "GB"),
    ("NWG", "GB"), ("SNN", "GB"), ("IHG", "GB"), ("ARM", "GB"),
    # Europe continentale
    ("ASML", "NL"), ("NVO", "DK"), ("SAP", "DE"), ("NVS", "CH"), ("UBS", "CH"), ("ALC", "CH"), ("ING", "NL"),
    ("PHG", "NL"), ("STLA", "NL"), ("SAN", "ES"), ("BBVA", "ES"), ("TEF", "ES"), ("E", "IT"), ("RACE", "IT"),
    ("EQNR", "NO"), ("NOK", "FI"), ("ERIC", "SE"), ("SPOT", "SE"), ("BUD", "BE"), ("ARGX", "NL"), ("AER", "IE"),
    ("FLUT", "IE"), ("ICLR", "IE"), ("DB", "DE"), ("BNTX", "DE"), ("FMS", "DE"), ("SIEGY", "DE"),
    # Amériques (hors USA)
    ("TD", "CA"), ("RY", "CA"), ("BNS", "CA"), ("BMO", "CA"), ("CM", "CA"), ("ENB", "CA"), ("CNQ", "CA"),
    ("SU", "CA"), ("CP", "CA"), ("CNI", "CA"), ("TRI", "CA"), ("BCE", "CA"), ("SHOP", "CA"), ("MFC", "CA"),
    ("NTR", "CA"), ("CVE", "CA"), ("TRP", "CA"), ("PBR", "BR"), ("VALE", "BR"), ("ITUB", "BR"), ("BBD", "BR"),
    ("ABEV", "BR"), ("SBS", "BR"), ("AMX", "MX"), ("FMX", "MX"), ("KOF", "MX"), ("CX", "MX"), ("PAC", "MX"),
    ("ASR", "MX"), ("TS", "LU"), ("MELI", "AR"), ("YPF", "AR"),
    # Océanie, Afrique, Israël, Singapour
    ("BHP", "AU"), ("WDS", "AU"), ("SE", "SG"), ("GFI", "ZA"), ("AU", "ZA"), ("CHKP", "IL"), ("TEVA", "IL"),
    ("NICE", "IL"), ("CYBR", "IL"),
]

LISTED = {"NYSE", "Nasdaq", "CBOE"}


def annual_values(facts, taxonomy, tags):
    """{(année, étiquette): (valeur, devise)} pour les comptes annuels (20-F, 40-F, 10-K)."""
    out = {}
    for tag in tags:
        node = facts.get(taxonomy, {}).get(tag)
        if not node:
            continue
        for unit, rows in node["units"].items():
            for r in rows:
                if r.get("form") not in ("20-F", "40-F", "10-K", "20-F/A", "40-F/A") or r.get("fp") not in ("FY", None):
                    continue
                end = r.get("end", "")
                if "start" in r:
                    # Flux sur environ douze mois seulement.
                    from datetime import date
                    d0, d1 = date.fromisoformat(r["start"]), date.fromisoformat(end)
                    if not 330 <= (d1 - d0).days <= 400:
                        continue
                year = int(end[:4]) - (1 if end[5:7] in ("01", "02", "03") else 0)
                key = (year, tag)
                # Le dépôt le plus récent l'emporte (retraitements).
                if key not in out or r.get("filed", "") >= out[key][2]:
                    out[key] = (r["val"], unit, r.get("filed", ""))
    return out


def main():
    log = lambda m: print(m, file=sys.stderr, flush=True)
    tickers = get_json(TICKERS, cache_name="sec/company_tickers_exchange.json.gz", max_age_days=7)
    by_ticker = {t: (cik, name, ex) for cik, name, t, ex in tickers["data"] if ex in LISTED}
    companies = []
    for k, (t, cc) in enumerate(FOREIGN, 1):
        if t not in by_ticker:
            log(f"  {t} : non coté à New York")
            continue
        cik, name, ex = by_ticker[t]
        d = get_json(FACTS.format(cik=cik), cache_name=f"sec/facts/{cik}.json.gz", max_age_days=7, min_interval=0.12)
        if not d:
            continue
        facts = d.get("facts", {})
        taxonomy, mapping = ("ifrs-full", IFRS) if "ifrs-full" in facts else ("us-gaap", US_GAAP)
        vals = annual_values(facts, taxonomy, list(all_tags(mapping)))
        # Devise de présentation : celle du chiffre d'affaires le plus récent.
        cur = None
        for (y, tag), (v, unit, _) in sorted(vals.items(), reverse=True):
            if tag in ("Revenue", "Revenues", "RevenueFromContractsWithCustomers", "RevenueFromContractWithCustomerExcludingAssessedTax"):
                cur = unit
                break
        if not cur:
            continue
        by_year = {}
        for (y, tag), (v, unit, _) in vals.items():
            if unit == cur or unit.startswith(cur + "/") or unit == "shares":
                by_year.setdefault(y, {})[tag] = v
        years = {str(y): r for y, r in ((y, resolve(mapping, v)) for y, v in sorted(by_year.items())) if r}
        if not any("revenue" in r for r in years.values()):
            continue
        sub = get_json(SUBMISSIONS.format(cik=cik), cache_name=f"sec/sub_intl/{cik}.json.gz", max_age_days=180, min_interval=0.12) or {}
        companies.append({
            "id": f"{cc}-SEC{cik}", "name": d.get("entityName") or name, "country": cc, "ticker": t, "exchange": ex,
            "sic": sub.get("sic") or None, "sector_desc": sub.get("sicDescription") or None,
            "currency": cur.split("/")[0], "fy_end": {}, "years": years,
            "source": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=20-F",
        })
        if k % 20 == 0:
            log(f"[{k}/{len(FOREIGN)}] groupes étrangers lus")
    log(f"Groupes étrangers cotés à New York : {len(companies)}")
    write_json("raw_intl.json", {"companies": companies})


if __name__ == "__main__":
    main()
