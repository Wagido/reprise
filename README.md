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
| France | Rapports ESEF déposés à l'AMF, via `filings.xbrl.org` | IFRS | depuis 2020 | classé à la main (`collect/sectors_fr.py`), sinon estimé |

Les montants sont convertis en millions d'euros au taux moyen annuel (approximatif).

## PME françaises (onglet PME)

| Source | Contenu |
|---|---|
| « Ratios financiers BCE / INPI » (`data.economie.gouv.fr`) | CA, EBE, résultat d'exploitation, résultat net, marge d'EBE, CAF / CA, taux d'endettement, capacité de remboursement, charges financières / EBE, liquidité, autonomie financière, état de l'outil (immobilisations nettes / brutes), BFR, stocks, crédit clients et fournisseurs en jours |
| Annuaire des entreprises (`recherche-entreprises.api.gouv.fr`) | nom, code NAF, effectif, commune et coordonnées du siège |

Sociétés actives et diffusibles, CA de 2 à 50 M€, comptes publics (les sociétés qui ont choisi
la confidentialité de leurs comptes n'y figurent pas). Aucune donnée sur les dirigeants n'est
collectée. Carte (Leaflet, Plan IGN), filtres, classement et fiche selon le plan en 4 étapes,
avec valorisation par multiple d'EBE et montage LBO indicatif.

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
python3 collect/pme.py      # PME françaises -> data/pme.json (première fois : 1 à 2 h)
python3 -m http.server 8000 # puis ouvrir http://localhost:8000
```

Test rapide : `python3 collect/sec.py --max-sic 200` et `python3 collect/esef.py --limit 50`.
Les téléchargements sont gardés dans `cache/` : les relances suivantes sont rapides.

## Publication

1. Dans **Settings > Pages**, choisir *Source : GitHub Actions*.
2. Facultatif : dans **Settings > Secrets and variables > Actions > Secrets**, créer le secret
   `SEC_USER_AGENT` avec un nom d'outil et une adresse de contact, par exemple
   `reprise-screener une-adresse@exemple.fr`. La SEC demande aux programmes de s'identifier
   ainsi pour pouvoir prévenir leur auteur en cas de trop nombreuses requêtes. L'adresse
   n'est envoyée qu'à la SEC, dans l'en-tête des requêtes, et un secret n'apparaît ni dans le
   code ni dans les journaux. Sans ce secret, une identification générique est utilisée.
3. Lancer le workflow **Collecte et publication** (onglet Actions). Il tourne ensuite chaque lundi.

## Limites connues

- Couverture française : environ 230 sociétés par an, celles que filings.xbrl.org a collectées.
  La base de l'AMF (info-financiere.gouv.fr) ne diffuse que les PDF, pas les données ESEF.
- Certaines sociétés publient des lignes sous leurs propres étiquettes (fréquent pour la dette
  et le capex en France). L'outil les reconnaît par leur nom quand c'est possible et les marque
  « estimé » dans la fiche ; sinon la case reste vide (ce n'est pas un zéro).
- EBITDA recalculé (résultat opérationnel + amortissements), donc différent de l'EBITDA
  « ajusté » communiqué par les sociétés.
- Dette nette hors dettes de location (IFRS 16 / ASC 842), affichées à part.
- Les banques et assurances n'ont pas d'EBITDA ni de dette au sens industriel : leurs ratios
  n'ont pas de sens ici.
- Capitalisation disponible pour les sociétés américaines seulement (« public float » déclaré à la
  SEC, approximation de la capitalisation boursière).

## Suite possible

- Simulateur LBO complet : structure (dette senior, crédit-vendeur, apport), tableau de
  remboursement année par année, TRI et multiple de sortie pour le repreneur.
- Liste de cibles : PME en favoris, notes, comparaison côte à côte.
- Multiples VE / EBE et VE / CA par secteur dans l'onglet Secteurs ; cours des sociétés françaises.
- Alerte hebdomadaire des nouvelles PME correspondant à des critères enregistrés.

Déjà fait : capitalisation des sociétés américaines (SEC) et multiple VE / EBE sectoriel,
PME françaises non cotées avec carte, valorisation et montage LBO simple dans chaque fiche.

## Organisation

```
collect/concepts.py   correspondance champs <-> étiquettes US GAAP et IFRS
collect/sec.py        collecte USA
collect/esef.py       collecte France
collect/build.py      fusion, secteurs, taux de change -> data/companies.json
collect/pme.py        PME françaises -> data/pme.json
collect/sectors_fr.py secteurs des sociétés cotées françaises (classés à la main)
index.html, app.js    application (liste, secteurs, comparer)
analyse.js            fiche société selon le plan en 4 étapes, valorisation, LBO
pme.js                onglet PME : carte, classement, fiche PME
```
