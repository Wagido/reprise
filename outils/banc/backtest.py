"""Banc d'essai historique : les verdicts de l'outil annoncent-ils la performance boursière qui suit ?

Achat fin avril de l'année suivant l'exercice (comptes publiés), revente 12 mois plus tard (ou au dernier cours).
Performance dividendes réinvestis, comparée à la moyenne des 20 sociétés sur la même période.
Usage : python3 backtest.py verdicts.json histo.json
"""
import json
import statistics as S
import sys

V = json.load(open(sys.argv[1]))
H = json.load(open(sys.argv[2]))["series"]
LIGHTS = ["A", "P", "1", "2", "3", "4"]


def px(m, ym):
    """Cours ajusté du mois ym (aaaa-mm), ou le dernier connu avant."""
    best = None
    for d, v in m:
        if d <= ym:
            best = v
    return best


obs = []
for cid, info in V.items():
    if cid not in H:
        continue
    m = H[cid]["m"]
    last = m[-1][0]
    for y, r in info["y"].items():
        buy, sell = f"{int(y) + 1}-04", f"{int(y) + 2}-04"
        if buy > last:
            continue
        sell = min(sell, last)
        p0, p1 = px(m, buy), px(m, sell)
        if not p0 or not p1:
            continue
        months = (int(sell[:4]) - int(buy[:4])) * 12 + int(sell[5:]) - int(buy[5:])
        g = sum(r[k] == "green" for k in LIGHTS)
        red = sum(r[k] == "red" for k in LIGHTS)
        obs.append({"n": info["n"], "y": int(y), "ret": p1 / p0 - 1, "months": months, "A": r["A"], "P": r["P"],
                    "s1": r["1"], "s4": r["4"], "score": g - red})

# Excès de performance sur la moyenne des 20 la même année
for y in {o["y"] for o in obs}:
    grp = [o for o in obs if o["y"] == y]
    avg = S.mean(o["ret"] for o in grp)
    for o in grp:
        o["ex"] = o["ret"] - avg


def line(label, grp):
    if not grp:
        return f"{label:<28} —"
    ex = [o["ex"] for o in grp]
    hit = sum(e > 0 for e in ex) / len(ex)
    return f"{label:<28} n={len(grp):>3}  écart moyen {S.mean(ex) * 100:+6.1f} %  médian {S.median(ex) * 100:+6.1f} %  battent la moyenne {hit * 100:4.0f} %"


print(f"{len(obs)} observations, exercices {sorted({o['y'] for o in obs})}\n")
for key, title in [("A", "Actionnaire (crée de la valeur ?)"), ("P", "Prêteur (solvable ?)"), ("s1", "Étape 1 marges"), ("s4", "Étape 4 rentabilité")]:
    print(title)
    for col in ["green", "orange", "red"]:
        print("  " + line(col, [o for o in obs if o[key] == col]))
    print()
print("Score global (feux verts − feux rouges sur 6)")
for lab, f in [("≥ 5 (presque tout vert)", lambda s: s >= 5), ("2 à 4", lambda s: 2 <= s <= 4), ("≤ 1", lambda s: s <= 1)]:
    print("  " + line(lab, [o for o in obs if f(o["score"])]))
print("\nPar exercice : portefeuille des verts (Actionnaire) moins portefeuille des rouges")
for y in sorted({o["y"] for o in obs}):
    g = [o["ret"] for o in obs if o["y"] == y and o["A"] == "green"]
    r = [o["ret"] for o in obs if o["y"] == y and o["A"] == "red"]
    allr = [o["ret"] for o in obs if o["y"] == y]
    mo = max(o["months"] for o in obs if o["y"] == y)
    print(f"  comptes {y} (achat avril {y + 1}, {mo} mois) : verts {S.mean(g) * 100 if g else float('nan'):+6.1f} % ({len(g)})"
          f"  rouges {S.mean(r) * 100 if r else float('nan'):+6.1f} % ({len(r)})  moyenne des 20 {S.mean(allr) * 100:+6.1f} %")
print("\nDétail")
for o in sorted(obs, key=lambda o: (o["y"], -o["ex"])):
    print(f"  {o['y']} {o['n'][:24]:<24} A={o['A']:<6} score={o['score']:+d}  perf {o['ret'] * 100:+6.1f} %  écart {o['ex'] * 100:+6.1f} %")
