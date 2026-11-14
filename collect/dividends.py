"""Dividende par action sur longue période et série des hausses consécutives.

Aux USA, l'API « frames » de la SEC donne le dividende par action de toutes les
sociétés pour chaque année depuis 2007 (début des déclarations XBRL), soit près
de vingt ans d'historique pour une trentaine de requêtes. Deux étiquettes
coexistent : dividende versé (CommonStockDividendsPerShareCashPaid) et dividende
déclaré (CommonStockDividendsPerShareDeclared). On garde, société par société,
celle qui couvre le plus d'années et on comble les trous avec l'autre.

Les montants anciens ne sont pas toujours retraités des divisions d'actions
(une action coupée en deux divise le dividende par action par deux). Une baisse
brutale proche d'un rapport de division usuel (2, 3, 4...) n'est retenue comme
division que si le nombre moyen d'actions saute du même facteur à la même
époque ; sinon, c'est une vraie baisse du dividende.
"""

SPLIT_RATIOS = [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50]


def combine(primary, secondary):
    """Deux séries {année: valeur} : la plus longue d'abord, l'autre pour les trous."""
    a, b = (primary, secondary) if len(primary) >= len(secondary) else (secondary, primary)
    out = dict(b)
    out.update(a)
    return {y: v for y, v in out.items() if v is not None and v >= 0}


def _split_ratio(r, shares, y):
    """Rapport de division à la frontière y -> y+1, ou None. r = dps[y] / dps[y+1]."""
    inverse = r < 1
    rr = 1 / r if inverse else r
    if rr < 1.35:
        return None
    for s in SPLIT_RATIOS:
        # Le dividende peut avoir monté jusqu'à +33 % ou baissé de 10 % la même année.
        if 0.75 <= rr / s <= 1.1:
            for k in (y - 1, y, y + 1):
                a, b = shares.get(k), shares.get(k + 1)
                if not a or not b:
                    continue
                q = a / b if inverse else b / a
                if abs(q / s - 1) <= 0.15:
                    return 1 / s if inverse else s
    return None


def adjust_splits(dps, shares):
    """Ramène tout l'historique à la base d'actions la plus récente."""
    years = sorted(dps)
    out = {years[-1]: dps[years[-1]]} if years else {}
    factor = 1.0
    splits = []
    for y0, y1 in zip(reversed(years[:-1]), reversed(years[1:])):
        if y1 == y0 + 1 and dps[y0] > 0 and dps[y1] > 0:
            s = _split_ratio(dps[y0] / dps[y1], shares, y0)
            if s:
                factor *= s
                splits.append(y1)
        out[y0] = dps[y0] / factor
    return out, splits


def smooth(dps):
    """Écarte une valeur isolée aberrante (dividende déclaré sur une autre période,
    exercice décalé) : pic ou creux d'une seule année encadré par deux valeurs
    cohérentes (celle d'après au-dessus de celle d'avant)."""
    out = dict(dps)
    ys = sorted(out)
    dropped = []
    for y in ys[1:-1]:
        a, b, c = out.get(y - 1), out.get(y), out.get(y + 1)
        if None in (a, b, c) or a <= 0:
            continue
        if c > a and ((b > c * 1.02) or (b < a * 0.98)):
            del out[y]
            dropped.append(y)
    return out, dropped


def streak(dps, compare=None):
    """{année: dividende ajusté} -> statistiques de régularité.

    hausses : années consécutives de hausse jusqu'à la dernière année connue ;
    sans_baisse : années consécutives sans baisse ;
    complet : la série de hausses remonte jusqu'au début de l'historique disponible
    (la vraie série peut alors être plus longue).
    compare(y0, y1) -> (avant, après) : valeurs à comparer pour deux années (par défaut dps)."""
    compare = compare or (lambda a, b: (dps[a], dps[b]))
    ys = sorted(y for y, v in dps.items() if v is not None)
    if not ys or dps[ys[-1]] <= 0:
        return {"hausses": 0, "sans_baisse": 0, "complet": False, "dernier": ys[-1] if ys else None}
    first_known = ys[0]
    up = flat = 0
    up_done = flat_done = False
    y = ys[-1]
    # Une année manquante interrompt la série, sauf une seule année écartée par smooth()
    # (on compare alors à l'année d'avant).
    while True:
        prev = y - 1 if (y - 1) in dps else (y - 2 if (y - 2) in dps else None)
        if prev is None or dps[prev] <= 0:
            break
        a, b = compare(prev, y)
        step = y - prev
        if not up_done:
            if b > a * 1.0005:
                up += step
            else:
                up_done = True
        if not flat_done:
            if b >= a * 0.995:
                flat += step
            else:
                flat_done = True
        if up_done and flat_done:
            break
        y = prev
    return {"hausses": up, "sans_baisse": flat, "complet": y == first_known and not up_done, "dernier": ys[-1]}


def nine_months(quarters):
    """{(année, trimestre): valeur} -> {année: T1 + T2 + T3} quand les trois sont connus."""
    out = {}
    for y in {y for y, _ in quarters}:
        q = [quarters.get((y, k)) for k in (1, 2, 3)]
        if all(v is not None and v >= 0 for v in q):
            out[y] = sum(q)
    return out


def history(paid, declared, shares, q_paid=None, q_declared=None):
    """Série longue ajustée et statistiques.

    paid, declared : {année: dividende annuel} ; q_paid, q_declared : {(année, trimestre): dividende}
    pour combler les années sans chiffre annuel (estimation : 9 mois × 4 / 3) ; shares : {année: actions}."""
    annual = combine(paid or {}, declared or {})
    nine = combine(nine_months(q_paid or {}), nine_months(q_declared or {}))
    filled = {y: annual[y] if y in annual else nine[y] * 4 / 3 for y in set(annual) | set(nine)}
    if not filled:
        return None
    adj, splits = adjust_splits(filled, shares or {})
    k = {y: adj[y] / filled[y] if filled[y] else 1.0 for y in adj}   # facteur de division par année
    clean, dropped = smooth(adj)

    def compare(a, b):
        # Même base des deux côtés : chiffres annuels si possible, sinon les neuf premiers mois.
        if a in annual and b in annual:
            return annual[a] * k[a], annual[b] * k[b]
        if a in nine and b in nine:
            return nine[a] * k[a], nine[b] * k[b]
        return clean[a], clean[b]

    st = streak(clean, compare)
    y0, y1 = min(adj), max(adj)
    return {
        "y0": y0,
        "v": [round(clean[y], 4) if y in clean else None for y in range(y0, y1 + 1)],
        "est": [y for y in sorted(clean) if y not in annual],   # années estimées sur neuf mois
        "splits": splits,
        "ecartees": dropped,
        **st,
    }
