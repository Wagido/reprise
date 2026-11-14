"""Outils partagés : téléchargement poli avec cache disque."""

import gzip
import json
import os
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache")
DATA = os.path.join(ROOT, "data")

# La SEC demande un User-Agent qui identifie l'outil et un contact.
# Mettre son propre contact dans la variable SEC_USER_AGENT.
USER_AGENT = os.environ.get("SEC_USER_AGENT", "reprise-screener contact@example.com")

_last = {}


def _throttle(host, min_interval):
    now = time.monotonic()
    wait = _last.get(host, 0) + min_interval - now
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.monotonic()


def get_json(url, cache_name=None, max_age_days=None, min_interval=0.15, retries=4):
    """Télécharge un JSON. Avec cache_name, garde une copie dans cache/.

    max_age_days=None : le cache n'expire jamais (données publiées figées).
    Renvoie None si la ressource n'existe pas (404).
    """
    path = None
    if cache_name:
        path = os.path.join(CACHE, cache_name)
        if os.path.exists(path):
            age = (time.time() - os.path.getmtime(path)) / 86400
            if max_age_days is None or age < max_age_days:
                with open(path, "rb") as f:
                    raw = f.read()
                if raw == b"null":
                    return None
                return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)

    host = url.split("/")[2]
    for attempt in range(retries):
        _throttle(host, min_interval)
        req = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept-Encoding": "gzip",
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
            data = json.loads(raw)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = None
                break
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt * (5 if e.code in (403, 429) else 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)

    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"null" if data is None else gzip.compress(json.dumps(data).encode()))
    return data


def write_json(name, obj):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return path


def read_json(name, default=None):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)
