# Banc d'essai historique

Les verdicts de l'outil annoncent-ils la performance boursière des 12 mois suivants ?

1. Serveur local à la racine : `python3 -m http.server 8765`, avec `data/companies.json` et `data/histo.json`
   (copiés depuis https://wagido.github.io/reprise/data/).
2. Verdict de prix (feu Marché, VE/CE observée ÷ justifiée, PER…) avec le cours de fin avril suivant chaque exercice :
   `node outils/banc/prixtest.js data/histo.json /tmp/prix.json` puis `python3 outils/banc/prixstats.py /tmp/prix.json`.
3. Verdicts financiers (A, P, étapes 1 à 4) : `IDS=ids.json node outils/banc/verdicts.js /tmp/verdicts.json`
   (ids.json : liste des identifiants), puis `python3 outils/banc/backtest.py /tmp/verdicts.json data/histo.json`.

Performance comparée à la moyenne des sociétés testées la même année ; cours ajustés des dividendes.
