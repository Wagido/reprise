# Reprise — comparables cotés

Classe les sociétés cotées **en France et aux USA** à partir de leurs comptes publiés :
compte de résultat, bilan, flux de trésorerie, sur 5 à 6 exercices.
Premier outil d'une boîte à outils pour la reprise d'entreprise : les sociétés cotées
servent de **comparables** (marges, conversion cash, levier, BFR par secteur).

Application web installable (PWA), sans serveur : une collecte hebdomadaire dans
GitHub Actions produit un fichier JSON publié sur GitHub Pages avec l'interface.

## Sources (gratuites, officielles)

| Pays | Source | Normes | Historique | Secteur |
|---|---|---|---|---|
| USA | SEC EDGAR, API XBRL « frames » (`data.sec.gov`) | US GAAP (10-K) | 6 exercices | code SIC déclaré à la SEC |
| France | Rapports ESEF déposés à l'AMF, via `filings.xbrl.org` | IFRS | depuis 2020 | estimé (nom + description de l'activité) |

Les montants sont convertis en millions d'euros au taux moyen annuel (approximatif).

## Ce que fait l'interface

- Filtres : pays, secteur, exercice, fourchette de CA, marge EBITDA minimale, levier maximal,
  bénéficiaire 3 ans de suite, comptes complets seulement, recherche texte.
- Tableau triable : CA, croissance sur 3 ans, EBITDA et marge, marge nette, FCF, conversion cash,
  dette nette, dette nette / EBITDA, ROCE, BFR en jours.
- **Score reprise** (0–100) : rang relatif sur marge EBITDA, conversion cash, levier,
  croissance et régularité. Outil de tri, pas une recommandation.
- Fiche société : graphique CA / EBITDA / FCF, les trois états financiers par année,
  lien vers le document officiel.
- Vue **Secteurs** : médianes par secteur.
- Export CSV (séparateur `;`, virgule décimale, s'ouvre directement dans Excel en français).

## Lancer en local

Python 3.9 ou plus, sans dépendance.

```bash
python3 collect/sec.py      # USA (première fois : ~30 min, à cause des fiches secteur)
python3 collect/esef.py     # France (~10 min)
python3 collect/build.py    # fusion -> data/companies.json
python3 -m http.server 8000 # puis ouvrir http://localhost:8000
```

Test rapide : `python3 collect/sec.py --max-sic 200` et `python3 collect/esef.py --limit 50`.
Les téléchargements sont gardés dans `cache/` : les relances suivantes sont rapides.

## Publication

1. Dans **Settings > Pages**, choisir *Source : GitHub Actions*.
2. Dans **Settings > Secrets and variables > Actions > Variables**, créer `SEC_USER_AGENT`
   avec un nom d'outil et un e-mail de contact (la SEC le demande), par exemple
   `reprise-screener vous@exemple.fr`.
3. Lancer le workflow **Collecte et publication** (onglet Actions). Il tourne ensuite chaque lundi.

## Limites connues

- Certaines sociétés publient des lignes sous leurs propres étiquettes (fréquent pour la dette
  et le capex en France) : la case reste vide. Ce n'est pas un zéro.
- EBITDA recalculé (résultat opérationnel + amortissements), donc différent de l'EBITDA
  « ajusté » communiqué par les sociétés.
- Dette nette hors dettes de location (IFRS 16 / ASC 842), affichées à part.
- Les banques et assurances n'ont pas d'EBITDA ni de dette au sens industriel : leurs ratios
  n'ont pas de sens ici.
- Pas encore de cours de Bourse, donc pas de multiples de valorisation (VE/EBITDA).

## Suite possible

- Cours et capitalisation, pour les multiples VE/EBITDA et VE/CA par secteur.
- PME françaises non cotées (comptes INPI, annuaire des entreprises) : les vraies cibles.
- Simulateur de reprise : prix, dette d'acquisition, remboursement sur le FCF.

## Organisation

```
collect/concepts.py   correspondance champs <-> étiquettes US GAAP et IFRS
collect/sec.py        collecte USA
collect/esef.py       collecte France
collect/build.py      fusion, secteurs, taux de change -> data/companies.json
index.html, app.js, style.css, sw.js   application
```
