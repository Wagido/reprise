# Reprise — mémo pour une nouvelle session

Outil web (PWA statique, GitHub Pages : https://wagido.github.io/reprise/) d'analyse financière selon la
méthode Vernimmen / cours ICCF HEC (plan en 4 étapes : marges, investissements, financement,
rentabilité ; conclusion actionnaires / prêteurs). Tout en français. Propriétaire : ingénieur pétrole,
intéressé par la reprise d'entreprise et le stock picking.

## Deux espaces
- **Investir** (sociétés cotées) : Vue générale (`tdb.js`, 2 × 2 nuages, verdicts), Analyse (tableau + fiche
  toujours visible à droite sur grand écran, méthode repliable sinon), Stock picking, Secteurs (4 nuages de
  bulles par étape + tableau), Ratios (`nuages.js`, dont marge × rotation à iso-ROCE ; ex-« Comparer »), Banc d'essai (`banc.js` : l'analyse
  de l'outil face au consensus des analystes, CAC 40 ; consensus relevé à la main dans `consensus.json`, daté et sourcé).
- **Reprendre** (PME françaises 2–50 M€), même logique : Vue générale PME (4 nuages, verdicts, `TDB.panel`
  réutilisé), Carte et analyse (Leaflet Plan IGN + tableau + fiche à droite), Simulateur LBO de repreneur.
- **Méthode** : texte du plan en 4 étapes (`Analyse.methodHtml`).

## Fichiers
- `collect/` (Python sans dépendance) : `sec.py` (USA, frames SEC), `esef.py` (France, `--europe` pour
  13 pays), `sec_intl.py` (groupes étrangers cotés à New York), `pme.py` (ratios BCE/INPI + annuaire),
  `prices.py` (cours : Massive pour les USA, Alpha Vantage en rotation pour Paris ; part du flottant),
  `build.py` (fusion, secteurs, devises → `data/companies.json`), `concepts.py` (étiquettes XBRL),
  `sectors_fr.py` (secteurs français à la main), `rates.py` (coût du capital : taux à 10 ans BCE / FRED,
  primes de risque pays et bêtas d'actif sectoriels de Damodaran → `data/rates.json` → `meta.rates`), `dividends.py` (dividende par action sur longue période :
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
- Retraitements Vernimmen (IFRS 16, non récurrent, retraites), effet ciseaux, flux cumulés, scénario de crise.
- Japon (EDINET, clé à demander), comparables cotés par sous-secteur, liste de cibles PME.
