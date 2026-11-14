# Reprise — mémo pour une nouvelle session

Outil web (PWA statique, GitHub Pages : https://wagido.github.io/reprise/) d'analyse financière selon la
méthode Vernimmen / cours ICCF HEC (plan en 4 étapes : marges, investissements, financement,
rentabilité ; conclusion actionnaires / prêteurs). Tout en français. Propriétaire : ingénieur pétrole,
intéressé par la reprise d'entreprise et le stock picking.

## Deux espaces
- **Investir** (sociétés cotées) : Sociétés (tableau), 4 étapes (2 × 2 nuages, verdicts), Stock picking
  (stratégies, valeur DCF / multiple, liste de suivi), Secteurs (barres + tableau), Nuages, Comparer.
- **Reprendre** (PME françaises 2–50 M€) : Carte des PME (Leaflet, Plan IGN), fiche PME en 4 étapes,
  comparables cotés, Simulateur LBO de repreneur.
- **Méthode** : texte du plan en 4 étapes (`Analyse.methodHtml`).

## Fichiers
- `collect/` (Python sans dépendance) : `sec.py` (USA, frames SEC), `esef.py` (France, `--europe` pour
  13 pays), `sec_intl.py` (groupes étrangers cotés à New York), `pme.py` (ratios BCE/INPI + annuaire),
  `prices.py` (cours : Massive pour les USA, Alpha Vantage en rotation pour Paris ; part du flottant),
  `build.py` (fusion, secteurs, devises → `data/companies.json`), `concepts.py` (étiquettes XBRL),
  `sectors_fr.py` (secteurs français à la main), `dividends.py` (dividende par action sur longue période :
  frames SEC depuis 2007, divisions d'actions repérées par le nombre d'actions, série des hausses consécutives).
- Front : `index.html`, `app.js` (filtres, tableau, navigation), `analyse.js` (fiche 4 étapes, radar,
  Piotroski, Altman, distribution et dividendes en étape 4, valorisation), `tdb.js`, `picking.js`, `nuages.js`, `pme.js`, `lbo.js`, `style.css`.
- `.github/workflows/collect.yml` : collecte quotidienne + publication Pages. Secrets : `MASSIVE_API_KEY`,
  `ALPHAVANTAGE_API_KEY`, `SEC_USER_AGENT` (facultatif).

## Habitudes
- Environnement cloud « reprise » (pas « navshom », réservé à l'app GPS Balise).
- Branche de travail `claude/nifty-meitner-oyezey`, poussée aussi sur `main` (déclenche la publication).
- Tester en local : `python3 -m http.server 8765` à la racine, captures Playwright.
- Données dans `data/` et cache dans `cache/` : non versionnés.

## Idées en attente
- Japon (EDINET, clé à demander), comparables cotés par sous-secteur, liste de cibles PME.
