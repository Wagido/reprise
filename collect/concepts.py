"""Correspondance entre les champs normalisés de l'outil et les étiquettes XBRL.

Chaque champ a une liste d'alternatives, essayées dans l'ordre. Une alternative
est une liste d'étiquettes dont on fait la somme (au moins une doit être
présente). La première alternative qui donne une valeur l'emporte.

D = flux sur l'exercice (compte de résultat, flux de trésorerie)
I = solde à la clôture (bilan)
"""

# Champs normalisés : (clé, nature, libellé)
FIELDS = [
    ("revenue", "D", "Chiffre d'affaires"),
    ("cost_of_revenue", "D", "Coût des ventes"),
    ("gross_profit", "D", "Marge brute"),
    ("sga", "D", "Frais commerciaux, généraux et administratifs"),
    ("rnd", "D", "Recherche et développement"),
    ("staff", "D", "Charges de personnel"),
    ("operating_income", "D", "Résultat opérationnel (EBIT)"),
    ("da", "D", "Dotations aux amortissements"),
    ("interest", "D", "Charges financières"),
    ("pretax", "D", "Résultat avant impôt"),
    ("tax", "D", "Impôt sur les résultats"),
    ("net_income_total", "D", "Résultat net de l'ensemble consolidé"),
    ("net_income", "D", "Résultat net part du groupe"),
    ("cfo", "D", "Flux de trésorerie d'exploitation"),
    ("capex", "D", "Investissements (capex)"),
    ("cfi", "D", "Flux d'investissement"),
    ("acquisitions", "D", "Acquisitions de sociétés"),
    ("cff", "D", "Flux de financement"),
    ("dividends", "D", "Dividendes versés"),
    ("buybacks", "D", "Rachats d'actions"),
    ("share_issue", "D", "Augmentations de capital"),
    ("debt_issued", "D", "Nouveaux emprunts"),
    ("debt_repaid", "D", "Remboursements d'emprunts"),
    ("total_assets", "I", "Total du bilan"),
    ("noncurrent_assets", "I", "Actif immobilisé"),
    ("goodwill", "I", "Écarts d'acquisition (goodwill)"),
    ("intangibles", "I", "Immobilisations incorporelles"),
    ("ppe", "I", "Immobilisations corporelles"),
    ("ppe_gross", "I", "Immobilisations corporelles brutes"),
    ("equity", "I", "Capitaux propres part du groupe"),
    ("equity_total", "I", "Capitaux propres de l'ensemble consolidé"),
    ("retained_earnings", "I", "Réserves (bénéfices accumulés)"),
    ("noncurrent_liabilities", "I", "Passifs à plus d'un an"),
    ("cash", "I", "Trésorerie"),
    ("st_invest", "I", "Placements financiers à court terme"),
    ("debt_lt", "I", "Dettes financières à long terme"),
    ("debt_st", "I", "Dettes financières à court terme"),
    ("debt_total", "I", "Dettes financières (total publié)"),
    ("leases", "I", "Dettes de location"),
    ("current_assets", "I", "Actif courant"),
    ("current_liabilities", "I", "Passif courant"),
    ("receivables", "I", "Créances clients"),
    ("inventory", "I", "Stocks"),
    ("payables", "I", "Dettes fournisseurs"),
    ("eps", "D", "Bénéfice net par action (de base)"),
    ("dps", "D", "Dividende par action"),
    # Hors table de correspondance : collecté à part (USA seulement).
    ("market_cap", "I", "Capitalisation flottante (déclarée à la SEC)"),
]

US_GAAP = {
    "revenue": [
        ["Revenues"],
        ["RevenueFromContractWithCustomerExcludingAssessedTax"],
        ["RevenueFromContractWithCustomerIncludingAssessedTax"],
        ["SalesRevenueNet"],
        ["RevenuesNetOfInterestExpense"],
    ],
    "cost_of_revenue": [["CostOfRevenue"], ["CostOfGoodsAndServicesSold"], ["CostOfGoodsSold"]],
    "gross_profit": [["GrossProfit"]],
    "sga": [["SellingGeneralAndAdministrativeExpense"],
            ["SellingAndMarketingExpense", "GeneralAndAdministrativeExpense"]],
    "rnd": [["ResearchAndDevelopmentExpense"]],
    "staff": [["LaborAndRelatedExpense"]],
    "pretax": [["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
               ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"]],
    "tax": [["IncomeTaxExpenseBenefit"]],
    "net_income_total": [["ProfitLoss"]],
    "cfi": [["NetCashProvidedByUsedInInvestingActivities"]],
    "acquisitions": [["PaymentsToAcquireBusinessesNetOfCashAcquired"]],
    "cff": [["NetCashProvidedByUsedInFinancingActivities"]],
    "buybacks": [["PaymentsForRepurchaseOfCommonStock"]],
    "share_issue": [["ProceedsFromIssuanceOfCommonStock"]],
    "debt_issued": [["ProceedsFromIssuanceOfLongTermDebt"], ["ProceedsFromIssuanceOfDebt"]],
    "debt_repaid": [["RepaymentsOfLongTermDebt"], ["RepaymentsOfDebt"]],
    "noncurrent_assets": [["NoncurrentAssets"]],
    "goodwill": [["Goodwill"]],
    "intangibles": [["IntangibleAssetsNetExcludingGoodwill"], ["FiniteLivedIntangibleAssetsNet"]],
    "ppe": [["PropertyPlantAndEquipmentNet"]],
    "ppe_gross": [["PropertyPlantAndEquipmentGross"]],
    "equity_total": [["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], ["StockholdersEquity"]],
    "retained_earnings": [["RetainedEarningsAccumulatedDeficit"]],
    "eps": [["EarningsPerShareBasic"], ["EarningsPerShareBasicAndDiluted"]],
    "dps": [["CommonStockDividendsPerShareCashPaid"], ["CommonStockDividendsPerShareDeclared"]],
    "noncurrent_liabilities": [["LiabilitiesNoncurrent"]],
    "operating_income": [["OperatingIncomeLoss"]],
    "da": [
        ["DepreciationDepletionAndAmortization"],
        ["DepreciationAmortizationAndAccretionNet"],
        ["DepreciationAndAmortization"],
        ["Depreciation", "AmortizationOfIntangibleAssets"],
    ],
    "interest": [["InterestExpense"], ["InterestExpenseNonoperating"], ["InterestExpenseDebt"],
                 ["InterestAndDebtExpense"], ["InterestPaidNet"], ["InterestPaid"]],
    "net_income": [["NetIncomeLoss"], ["ProfitLoss"]],
    "cfo": [
        ["NetCashProvidedByUsedInOperatingActivities"],
        ["NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    ],
    "capex": [
        ["PaymentsToAcquirePropertyPlantAndEquipment"],
        ["PaymentsToAcquireProductiveAssets"],
        ["PaymentsToAcquireOilAndGasPropertyAndEquipment"],
    ],
    "dividends": [["PaymentsOfDividends"], ["PaymentsOfDividendsCommonStock"]],
    "total_assets": [["Assets"]],
    "equity": [
        ["StockholdersEquity"],
        ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    ],
    "cash": [
        ["CashAndCashEquivalentsAtCarryingValue"],
        ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    ],
    "st_invest": [["ShortTermInvestments"], ["MarketableSecuritiesCurrent"], ["AvailableForSaleSecuritiesDebtSecuritiesCurrent"]],
    "debt_lt": [
        ["LongTermDebtNoncurrent"],
        ["LongTermDebtAndCapitalLeaseObligations"],
        ["SeniorLongTermNotes"],
        ["LongTermNotesPayable"],
        ["ConvertibleNotesPayable"],
        ["NotesPayable"],
    ],
    "debt_st": [
        ["DebtCurrent"],
        ["LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"],
        ["LongTermDebtAndCapitalLeaseObligationsCurrent"],
        ["LinesOfCreditCurrent"],
    ],
    "debt_total": [["LongTermDebt"]],
    "leases": [
        ["OperatingLeaseLiability"],
        ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiabilityCurrent"],
    ],
    "current_assets": [["AssetsCurrent"]],
    "current_liabilities": [["LiabilitiesCurrent"]],
    "receivables": [["AccountsReceivableNetCurrent"], ["ReceivablesNetCurrent"], ["AccountsNotesAndLoansReceivableNetCurrent"]],
    "inventory": [["InventoryNet"]],
    "payables": [["AccountsPayableCurrent"]],
}

IFRS = {
    "revenue": [["Revenue"], ["RevenueFromContractsWithCustomers"]],
    "cost_of_revenue": [["CostOfSales"]],
    "gross_profit": [["GrossProfit"]],
    "sga": [["SellingGeneralAndAdministrativeExpense"], ["DistributionCosts", "AdministrativeExpense"]],
    "rnd": [["ResearchAndDevelopmentExpense"]],
    "staff": [["EmployeeBenefitsExpense"]],
    "pretax": [["ProfitLossBeforeTax"]],
    "tax": [["IncomeTaxExpenseContinuingOperations"]],
    "net_income_total": [["ProfitLoss"]],
    "cfi": [["CashFlowsFromUsedInInvestingActivities"]],
    "acquisitions": [["CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities"]],
    "cff": [["CashFlowsFromUsedInFinancingActivities"]],
    "buybacks": [["PaymentsToAcquireOrRedeemEntitysShares"]],
    "share_issue": [["ProceedsFromIssuingShares"]],
    "debt_issued": [["ProceedsFromBorrowingsClassifiedAsFinancingActivities"], ["ProceedsFromNoncurrentBorrowings"]],
    "debt_repaid": [["RepaymentsOfBorrowingsClassifiedAsFinancingActivities"], ["RepaymentsOfNoncurrentBorrowings"]],
    "noncurrent_assets": [["NoncurrentAssets"]],
    "goodwill": [["Goodwill"]],
    "intangibles": [["IntangibleAssetsOtherThanGoodwill"]],
    "ppe": [["PropertyPlantAndEquipment"]],
    "ppe_gross": [["PropertyPlantAndEquipmentGrossCarryingAmount"]],
    "equity_total": [["Equity"]],
    "retained_earnings": [["RetainedEarnings"]],
    "eps": [["BasicEarningsLossPerShare"]],
    "dps": [["DividendsRecognisedAsDistributionsToOwnersPerShare"]],
    "noncurrent_liabilities": [["NoncurrentLiabilities"]],
    "operating_income": [["ProfitLossFromOperatingActivities"]],
    "da": [
        ["DepreciationAndAmortisationExpense"],
        ["DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"],
        ["AdjustmentsForDepreciationAndAmortisationExpense"],
        ["AdjustmentsForDepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"],
        ["AdjustmentsForDepreciationAndAmortisationExpenseAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"],
        ["DepreciationExpense", "AmortisationExpense"],
    ],
    "interest": [["FinanceCosts"], ["InterestExpense"], ["InterestExpenseOnBorrowings"],
                 ["InterestPaidClassifiedAsOperatingActivities"], ["InterestPaidClassifiedAsFinancingActivities"]],
    "net_income": [["ProfitLossAttributableToOwnersOfParent"], ["ProfitLoss"]],
    "cfo": [["CashFlowsFromUsedInOperatingActivities"]],
    "capex": [
        ["PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets"],
        ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
         "PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities"],
        ["PurchaseOfPropertyPlantAndEquipment"],
    ],
    "dividends": [
        ["DividendsPaidClassifiedAsFinancingActivities"],
        ["DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities"],
        ["DividendsPaid"],
    ],
    "total_assets": [["Assets"]],
    "equity": [["EquityAttributableToOwnersOfParent"], ["Equity"]],
    "cash": [["CashAndCashEquivalents"]],
    "st_invest": [["CurrentInvestments"], ["OtherCurrentFinancialAssets"]],
    "debt_lt": [["NoncurrentPortionOfNoncurrentBorrowings"], ["LongtermBorrowings"],
                ["NoncurrentPortionOfNoncurrentBondsIssued", "NoncurrentPortionOfOtherNoncurrentBorrowings", "NoncurrentPortionOfNoncurrentLoansReceived"],
                ["NoncurrentFinancialLiabilities"]],
    "debt_st": [
        ["CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings"],
        ["ShorttermBorrowings", "CurrentPortionOfLongtermBorrowings"],
        ["CurrentBondsIssuedAndCurrentPortionOfNoncurrentBondsIssued", "OtherCurrentBorrowingsAndCurrentPortionOfOtherNoncurrentBorrowings",
         "CurrentPortionOfNoncurrentLoansReceived", "CommercialPapersIssued"],
    ],
    "debt_total": [["Borrowings"]],
    "leases": [["LeaseLiabilities"], ["NoncurrentLeaseLiabilities", "CurrentLeaseLiabilities"]],
    "current_assets": [["CurrentAssets"]],
    "current_liabilities": [["CurrentLiabilities"]],
    "receivables": [["TradeAndOtherCurrentReceivables"], ["CurrentTradeReceivables"], ["TradeReceivables"]],
    "inventory": [["Inventories"]],
    "payables": [["TradeAndOtherCurrentPayables"], ["TradeAndOtherCurrentPayablesToTradeSuppliers"]],
}

# Champs exprimés par action (devise par action, pas en millions).
PER_SHARE = {"eps", "dps"}
PER_SHARE_TAGS = {t for m in (US_GAAP, IFRS) for f in PER_SHARE for alt in m[f] for t in alt}

# Valeurs toujours prises en positif (sorties de trésorerie ou charges
# parfois publiées avec un signe négatif).
ABSOLUTE = {"da", "capex", "dividends", "dps", "interest", "cost_of_revenue", "sga", "rnd", "staff",
            "acquisitions", "buybacks", "share_issue", "debt_issued", "debt_repaid"}


def all_tags(mapping):
    """Toutes les étiquettes d'une table, sans doublon, avec leur nature."""
    kinds = {k: kind for k, kind, _ in FIELDS}
    out = {}
    for field, alts in mapping.items():
        for alt in alts:
            for tag in alt:
                out[tag] = kinds[field]
    return out


def resolve(mapping, values):
    """values : {étiquette: nombre}. Renvoie {champ: nombre} pour une année."""
    out = {}
    for field, alts in mapping.items():
        for alt in alts:
            present = [values[t] for t in alt if t in values]
            if present:
                v = sum(present)
                out[field] = abs(v) if field in ABSOLUTE else v
                break
    return out


# ---------------------------------------------------------------------------
# Étiquettes propres à une société (ESEF). Beaucoup de sociétés françaises
# publient certaines lignes sous leur propre nom, par exemple
# « publicis:AcquisitionsDimmobilisationsCorporellesEtIncorporelles ».
# Quand la ligne standard manque, on cherche une étiquette propre dont le nom
# correspond. Ces valeurs sont marquées « estimées » dans l'application.

import re as _re

CUSTOM_RULES = {
    # champ : (nature, motifs tous requis, motif exclu)
    "capex": ("D", [r"purchase|acquisition|investissement|payment|decaissement|capex",
                    r"property|plant|tangible|corporel|intangible|incorporel|immobilisation|fixedasset|capex|equipment"],
              r"proceed|cession|disposal|sale|vente|financ|subsidiar|filiale|titre|participation|business|societe|compan|net(?:of)?change|right|droit"),
    "interest": ("D", [r"interest|interet|coutdelendettement|borrowingcost|chargesfinancieres|chargefinanciere|financialexpense|coutdeladette|costofdebt|coutdelendettementfinancier"],
                 r"income|produit|recu|receiv|lease|locati|capitalis|minorit|noncontrolling|rate|taux|accrued|couru|hedg|couverture|depreci|amorti|impair|mineral|mining|oilandgas|petrolier"),
    "da": ("D", [r"depreciation|amortisation|amortization|amortissement|dotation"],
           r"impair|perte|provision|accumulat|cumul|reprise|reversal|before|avant|hors(?:amort|depr)|excluding|receivable|creance|stock|inventor"),
    "debt": ("I", [r"borrowing|emprunt|dettefinanciere|dettesfinancieres|financialdebt|grossdebt|endettementbrut|bond|obligation|overdraft|decouvert|bankloan|bankfacilit|commercialpaper|negociable"],
             r"net|proceed|repay|rembours|nouveau|increase|decrease|variation|change|lease|locati|interest|interet|cost|cout|emission|issu|fairvalue|justevaleur|derivat|cash|tresorerie"),
    "retained_earnings": ("I", [r"reserve|retainedearning|resultatsaccumul|resultatsnondistribu|reportanouveau"],
                          r"translation|conversion|hedg|couverture|legal|revaluation|reevaluation|actuari|minorit|noncontrolling|interetsminoritaires|treasury|autocontrole|optionsurtitres|sharebased|paiementenactions|fairvalue|justevaleur|premium|prime"),
    "net_debt": ("I", [r"netdebt|endettementnet|dettenette|netfinancialdebt|netindebtedness|endettementfinanciernet|dettefinancierenette"],
                 r"change|variation|ratio|ebitda|increase|decrease|before|hors|excluding|avant"),
}
_LT = _re.compile(r"noncurrent|noncourant|longterm|longterme|plusdunan|morethan")
_ST = _re.compile(r"current|courant|shortterm|courtterme|moinsdunan|lessthan|overdraft|decouvert|commercialpaper|negociable")


def _norm(name):
    import unicodedata
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return _re.sub(r"[^a-z]", "", name.lower())


def _combine(values):
    """Plusieurs étiquettes trouvées : si l'une est la somme des autres, c'est le
    total ; sinon on additionne (les composantes d'un même agrégat)."""
    values = [abs(v) for v in values]
    if len(values) == 1:
        return values[0]
    total = sum(values)
    for v in values:
        rest = total - v
        if rest and abs(v - rest) <= 0.01 * abs(v):
            return v
    # Doublons exacts (même chiffre sous deux étiquettes) : on ne compte qu'une fois.
    return sum(set(values))


def guess_custom(custom, kind_of_period):
    """custom : {nom local: valeur} pour une année et une nature (D ou I).
    Renvoie {champ: valeur} pour les champs devinés."""
    out = {}
    rules = dict(CUSTOM_RULES)
    if kind_of_period == "D":
        # Dernier recours pour les amortissements : lignes qui y ajoutent dépréciations ou provisions
        # (« amortissements, dépréciations et provisions »), plutôt qu'un EBE inconnu.
        rules["da_loose"] = ("D", [r"depreciation|amortisation|amortization|amortissement|dotation"],
                             r"accumulat|cumul|reprise|reversal|before|avant|receivable|creance|stock|inventor|horsamort")
    for field, (kind, required, excluded) in rules.items():
        if kind != kind_of_period or (field == "da_loose" and "da" in out):
            continue
        hits = {}
        for name, v in custom.items():
            n = _norm(name)
            if all(_re.search(r, n) for r in required) and not _re.search(excluded, n):
                hits[n] = v
        if not hits:
            continue
        if field == "debt":
            lt = [v for n, v in hits.items() if _LT.search(n)]
            st = [v for n, v in hits.items() if not _LT.search(n) and _ST.search(n)]
            other = [v for n, v in hits.items() if not _LT.search(n) and not _ST.search(n)]
            if lt:
                out["debt_lt"] = _combine(lt)
            if st:
                out["debt_st"] = _combine(st)
            if other and not lt and not st:
                out["debt_total"] = _combine(other)
        elif field == "da_loose":
            out["da"] = _combine(list(hits.values()))
        elif field == "net_debt":
            out["net_debt"] = list(hits.values())[0]
        else:
            out[field] = _combine(list(hits.values()))
    return out
