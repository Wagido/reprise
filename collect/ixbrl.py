"""Lecture d'un rapport ESEF au format iXBRL (paquet .zip ou .xbri déposé à l'AMF).

Renvoie les faits sous la même forme que le xBRL-JSON de filings.xbrl.org
({"facts": {id: {"value": ..., "dimensions": {"concept", "entity", "period", "unit", ...}}}}),
pour que esef.parse_filing les lise sans changement. Bibliothèque standard uniquement.
"""
import io
import re
import xml.etree.ElementTree as ET
import zipfile

NS_IX = "http://www.xbrl.org/2013/inlineXBRL"
NS_XBRLI = "http://www.xbrl.org/2003/instance"
NS_XBRLDI = "http://xbrl.org/2006/xbrldi"


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _number(text, fmt):
    t = (text or "").strip()
    f = (fmt or "").lower()
    if "zero" in f or t in ("-", "–", "—", ""):
        return 0.0 if ("zero" in f or t in ("-", "–", "—")) else None
    if "comma" in f:          # 1.234,5 ou 1 234,5
        t = re.sub(r"[^0-9,]", "", t).replace(",", ".")
    else:                     # 1,234.5 (par défaut)
        t = re.sub(r"[^0-9.]", "", t)
    try:
        return float(t)
    except ValueError:
        return None


def _report(z):
    """Le rapport principal du paquet (le plus gros fichier .xhtml/.html sous reports/)."""
    cands = [i for i in z.infolist() if re.search(r"\.x?html?$", i.filename, re.I)]
    rep = [i for i in cands if "/reports/" in i.filename.replace("\\", "/")] or cands
    if not rep:
        return None
    return max(rep, key=lambda i: i.file_size).filename


def parse(data):
    """data : contenu du paquet (bytes). Renvoie le document à la xBRL-JSON, ou None."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return None
    name = _report(z)
    if not name:
        return None
    contexts, units, raw = {}, {}, []
    with z.open(name) as fh:
        keep = 0   # profondeur dans un contexte ou une unité : rien n'y est libéré avant lecture
        for ev, el in ET.iterparse(fh, events=("start", "end")):
            tag = el.tag
            if ev == "start":
                if tag in (f"{{{NS_XBRLI}}}context", f"{{{NS_XBRLI}}}unit"):
                    keep += 1
                continue
            if tag == f"{{{NS_XBRLI}}}context":
                ident = el.find(f".//{{{NS_XBRLI}}}identifier")
                start = el.findtext(f".//{{{NS_XBRLI}}}startDate")
                end = el.findtext(f".//{{{NS_XBRLI}}}endDate")
                inst = el.findtext(f".//{{{NS_XBRLI}}}instant")
                dims = {m.get("dimension"): (m.text or "").strip() for m in el.iter()
                        if _local(m.tag) in ("explicitMember", "typedMember")}
                period = f"{start.strip()}/{end.strip()}" if start and end else (inst or "").strip()
                contexts[el.get("id")] = ((ident.text or "").strip() if ident is not None else "", period, dims)
                keep -= 1
            elif tag == f"{{{NS_XBRLI}}}unit":
                meas = [(m.text or "").strip() for m in el.iter() if _local(m.tag) == "measure"]
                div = el.find(f"{{{NS_XBRLI}}}divide")
                units[el.get("id")] = "/".join(meas) if div is not None else (meas[0] if meas else "")
                keep -= 1
            elif tag == f"{{{NS_IX}}}nonFraction":
                if el.get(f"{{http://www.w3.org/2001/XMLSchema-instance}}nil") == "true":
                    el.clear()
                    continue
                v = _number("".join(el.itertext()), el.get("format"))
                if v is not None:
                    v *= 10 ** int(el.get("scale") or 0)
                    if el.get("sign") == "-":
                        v = -v
                    raw.append((el.get("name"), el.get("contextRef"), el.get("unitRef"), v))
            elif tag == f"{{{NS_IX}}}nonNumeric":
                if el.get("name", "").endswith("DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities"):
                    raw.append((el.get("name"), el.get("contextRef"), None, " ".join("".join(el.itertext()).split())[:2000]))
            # Les faits sont lus à la fin de leur balise : on libère la mémoire des balises ordinaires.
            if not keep:
                el.clear()
    facts = {}
    for k, (concept, ctx, unit, v) in enumerate(raw):
        if ctx not in contexts or not concept:
            continue
        ent, period, dims = contexts[ctx]
        d = {"concept": concept, "entity": ent, "period": period}
        if unit:
            d["unit"] = units.get(unit, "")
        d.update(dims)   # une dimension en plus : esef.parse_filing écarte le fait (ventilation)
        facts[f"f{k}"] = {"value": v, "dimensions": d}
    return {"facts": facts}


def lei_of(doc):
    """Code LEI de la société déclarante (identifiant des contextes)."""
    for f in doc.get("facts", {}).values():
        e = f["dimensions"].get("entity", "")
        if re.fullmatch(r"[A-Z0-9]{20}", e.rsplit(":", 1)[-1]):
            return e.rsplit(":", 1)[-1]
    return None
