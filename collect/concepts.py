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
    ("equity", "I", "Capitaux propres part du groupe"),
    ("equity_total", "I", "Capitaux propres de l'ensemble consolidé"),
    ("noncurrent_liabilities", "I", "Passifs à plus d'un an"),
    ("cash", "I", "Trésorerie"),
    ("debt_lt", "I", "Dettes financières à long terme"),
    ("debt_st", "I", "Dettes financières à court terme"),
    ("debt_total", "I", "Dettes financières (total publié)"),
    ("leases", "I", "Dettes de location"),
    ("current_assets", "I", "Actif courant"),
    ("current_liabilities", "I", "Passif courant"),
    ("receivables", "I", "Créances clients"),
    ("inventory", "I", "Stocks"),
    ("payables", "I", "Dettes fournisseurs"),
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
    "equity_total": [["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], ["StockholdersEquity"]],
    "noncurrent_liabilities": [["LiabilitiesNoncurrent"]],
    "operating_income": [["OperatingIncomeLoss"]],
    "da": [
        ["DepreciationDepletionAndAmortization"],
        ["DepreciationAmortizationAndAccretionNet"],
        ["DepreciationAndAmortization"],
        ["Depreciation", "AmortizationOfIntangibleAssets"],
    ],
    "interest": [["InterestExpense"], ["InterestExpenseNonoperating"]],
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
    "debt_lt": [
        ["LongTermDebtNoncurrent"],
        ["LongTermDebtAndCapitalLeaseObligations"],
        ["LongTermNotesPayable"],
    ],
    "debt_st": [
        ["DebtCurrent"],
        ["LongTermDebtCurrent", "ShortTermBorrowings"],
    ],
    "debt_total": [["LongTermDebt"]],
    "leases": [
        ["OperatingLeaseLiability"],
        ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiabilityCurrent"],
    ],
    "current_assets": [["AssetsCurrent"]],
    "current_liabilities": [["LiabilitiesCurrent"]],
    "receivables": [["AccountsReceivableNetCurrent"]],
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
    "equity_total": [["Equity"]],
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
    "interest": [["FinanceCosts"], ["InterestExpense"]],
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
    "debt_lt": [["NoncurrentPortionOfNoncurrentBorrowings"], ["LongtermBorrowings"]],
    "debt_st": [
        ["CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings"],
        ["ShorttermBorrowings", "CurrentPortionOfLongtermBorrowings"],
    ],
    "debt_total": [["Borrowings"]],
    "leases": [["LeaseLiabilities"], ["NoncurrentLeaseLiabilities", "CurrentLeaseLiabilities"]],
    "current_assets": [["CurrentAssets"]],
    "current_liabilities": [["CurrentLiabilities"]],
    "receivables": [["TradeAndOtherCurrentReceivables"], ["CurrentTradeReceivables"]],
    "inventory": [["Inventories"]],
    "payables": [["TradeAndOtherCurrentPayables"], ["TradeAndOtherCurrentPayablesToTradeSuppliers"]],
}

# Valeurs toujours prises en positif (sorties de trésorerie ou charges
# parfois publiées avec un signe négatif).
ABSOLUTE = {"da", "capex", "dividends", "interest", "cost_of_revenue", "sga", "rnd", "staff",
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
