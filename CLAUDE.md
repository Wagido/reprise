# Reprise — mémo pour une nouvelle session

Outil web (PWA statique, GitHub Pages : https://wagido.github.io/reprise/) d'analyse financière selon la
méthode Vernimmen / cours ICCF HEC (plan en 4 étapes : marges, investissements, financement,
rentabilité ; conclusion actionnaires / prêteurs). Tout en français. Propriétaire : ingénieur pétrole,
intéressé par la reprise d'entreprise et le stock picking.

## Deux espaces
- **Investir** (sociétés cotées) : Vue générale (`tdb.js` : partie 1 analyse financière, 2 graphiques par étape ;
  partie 2 marché ; sélecteur Entreprises | Secteurs ; tableau des médianes par secteur en bas — les anciens onglets
  Secteurs et Ratios y sont fondus), Analyse (tableau + fiche à droite, étoiles ★, filtre Stratégie, suggestion automatique dans la recherche), Mon portefeuille (`picking.js` : valeurs ★, quantités, plus-values, verdicts, idées par stratégie), Banc d'essai (`banc.js` :
  l'analyse de l'outil face au consensus des analystes, CAC 40 ; consensus relevé à la main dans `consensus.json`).
  Style d'origine (en-tête aéré, filtres visibles), mode clair par défaut, plus de service worker.
- **Reprendre** (PME françaises 2–50 M€), même logique : Vue générale PME (4 nuages, verdicts, `TDB.panel`
  réutilisé, sélecteur Entreprises | Activités), Carte et analyse (Leaflet Plan IGN + tableau + fiche à droite), Simulateur LBO de repreneur.
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
- Tester en local : `python3 -m http.server 8765` à la racine, captures Playwright. Toujours vérifier le site EN LIGNE
  (version `?v=<sha>` dans la page) avant d'annoncer une publication ; `publish.yml` publie en 2 minutes.
- Données dans `data/` et cache dans `cache/` : non versionnés.

## Idées en attente
- Retraitements Vernimmen (IFRS 16, non récurrent, retraites), effet ciseaux, flux cumulés, scénario de crise.
- Japon (EDINET, clé à demander), comparables cotés par sous-secteur, liste de cibles PME.
