"""Le verdict de prix annonce-t-il la performance ? Usage : python3 prixstats.py prix.json"""
import json
import statistics as S
import sys

obs = json.load(open(sys.argv[1]))
for y in {o["y"] for o in obs}:
    g = [o for o in obs if o["y"] == y]
    avg = S.mean(o["ret"] for o in g)
    for o in g:
        o["ex"] = o["ret"] - avg


def line(lab, grp):
    if len(grp) < 2:
        return f"  {lab:<36} n={len(grp)}"
    ex = [o["ex"] for o in grp]
    m, sd = S.mean(ex), S.stdev(ex)
    return (f"  {lab:<36} n={len(ex):>3}  écart moyen {m * 100:+6.1f} %  médian {S.median(ex) * 100:+6.1f} %"
            f"  battent la moyenne {sum(e > 0 for e in ex) / len(ex) * 100:3.0f} %  t={m / (sd / len(ex) ** .5):+.2f}")


def terciles(key, lab, low_is_cheap=True):
    print(lab)
    lo, mid, hi = [], [], []
    for y in sorted({o["y"] for o in obs}):
        g = sorted([o for o in obs if o["y"] == y and o.get(key) is not None], key=lambda o: o[key])
        k = len(g) // 3
        lo += g[:k]; mid += g[k:len(g) - k]; hi += g[len(g) - k:]
    names = ("le tiers le moins cher", "le tiers du milieu", "le tiers le plus cher")
    for nm, grp in zip(names, (lo, mid, hi) if low_is_cheap else (hi, mid, lo)):
        print(line(nm, grp))
    print()


print(f"{len(obs)} observations, exercices {sorted({o['y'] for o in obs})}\n")
print("Verdict Marché actuel de l'outil (cours de l'époque)")
for col in ("green", "orange", "red", "grey"):
    print(line(col, [o for o in obs if o["mv"] == col]))
print()
for o in obs:
    o["rel"] = o["vae"] / o["vaeTh"] if o.get("vae") and o.get("vaeTh") and o["vaeTh"] > 0 else None
terciles("rel", "VE/CE observée ÷ VE/CE justifiée (ROCE / coût du capital)")
terciles("gap", "Écart du cours à la valeur estimée (multiple sectoriel + flux actualisés)")
terciles("gapDcf", "Écart du cours aux flux actualisés seuls")
terciles("vae", "VE/CE observée seule")
terciles("per", "PER")
