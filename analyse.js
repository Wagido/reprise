"use strict";
// Analyse financière d'une société selon le plan type en 4 étapes : marges,
// investissements (BFR et immobilisations), financement, rentabilité ; puis
// solvabilité, création de valeur, et valorisation (cours de Bourse et
// multiple sectoriel). Chaque ratio est comparé au secteur.
// Dépend de app.js : val(), ok(), esc(), nf0, nf1, state.

const Analyse = (() => {
  // Bêtas d'actif (désendettés) par secteur : ordres de grandeur des tables sectorielles publiées
  // (Vernimmen, Damodaran), arrondis. CMPC = taux sans risque + bêta d'actif × prime de risque.
  const BETA_A = { energie: 0.85, materiaux: 0.9, industrie: 0.9, conso_cyc: 1.0, conso_base: 0.65, sante: 0.85,
    tech: 1.15, telecom: 0.6, utilities: 0.45, finance: 0.6, immo: 0.55, autre: 0.9 };
  // ---------- Agrégats ----------
  let figures = function (c, i) {
    const g = (f, j = i) => (j >= 0 ? val(c, f, j, true) : null);
    const A = g("total_assets");
    let CA = g("current_assets"), CL = g("current_liabilities");
    const cash = g("cash");
    const eq = ok(g("equity_total")) ? g("equity_total") : g("equity");
    const eqGroup = g("equity");
    let NCA = g("noncurrent_assets");
    let NCL = g("noncurrent_liabilities");
    // Totaux manquants recalculés : actif = immobilisé + circulant = CP + passif LT + passif CT.
    if (!ok(NCA) && ok(A) && ok(CA)) NCA = A - CA;
    if (!ok(CA) && ok(A) && ok(NCA)) CA = A - NCA;
    if (!ok(NCL) && ok(A) && ok(eq) && ok(CL)) NCL = A - eq - CL;
    if (!ok(CL) && ok(A) && ok(eq) && ok(NCL)) CL = A - eq - NCL;
    const dlt = g("debt_lt"), dst = g("debt_st"), dtot = g("debt_total");
    const debtKnown = ok(dlt) || ok(dst) || ok(dtot);
    // Dette long terme : publiée, ou à défaut le total publié moins la part courte.
    const debtLT = ok(dlt) ? dlt : ok(dtot) ? Math.max(0, dtot - (dst || 0)) : 0;
    const debtST = ok(dst) ? dst : 0;
    // Dette nette (Vernimmen, IFRS 16) : dettes financières + dettes de location − trésorerie − placements à court terme.
    // Sans dette financière publiée, la dette nette reste inconnue (et non égale à − trésorerie).
    const leases = g("leases") || 0;
    const netDebt = ok(cash) && debtKnown ? debtLT + debtST + leases - cash - (g("st_invest") || 0) : null;

    // Bilan économique.
    const bfr = ok(CA) && ok(cash) && ok(CL) ? (CA - cash) - (CL - debtST) : null;
    const ae = ok(NCA) && ok(bfr) ? NCA + bfr : null;
    const other = ok(ae) && ok(eq) && ok(netDebt) ? ae - eq - netDebt : null;

    // Bilan financier.
    const fr = ok(CA) && ok(CL) ? CA - CL : null;
    const tresoNette = ok(cash) ? cash - debtST : null;

    // Compte de résultat.
    const rev = g("revenue"), ebit = g("operating_income"), da = g("da");
    const ebitda = ok(ebit) && ok(da) ? ebit + da : null;
    const pretax = g("pretax"), tax = g("tax");
    const niTotal = ok(g("net_income_total")) ? g("net_income_total") : ok(pretax) && ok(tax) ? pretax - tax : null;
    const ni = ok(g("net_income")) ? g("net_income") : niTotal;
    let t = ok(tax) && ok(pretax) && pretax > 0 ? tax / pretax : null;
    // Taux d'impôt normatif : taux effectif moyen des 3 derniers exercices (borné à 0–50 %).
    const tj = [i, i - 1, i - 2].map((j) => { const x = g("tax", j), p = g("pretax", j); return ok(x) && ok(p) && p > 0 ? x / p : null; })
      .filter((v) => ok(v) && v >= 0 && v <= 0.5);
    const tUsed = tj.length ? tj.reduce((s, v) => s + v, 0) / tj.length : 0.25;

    // Résultat d'exploitation courant (Vernimmen : rentabilité durable, hors éléments non récurrents).
    // 1. ligne « résultat opérationnel courant » publiée ; 2. résultat publié + dépréciations d'actifs − plus-values
    // de cession, seulement si les dépréciations sont identifiées (sinon le retraitement serait biaisé) ;
    // 3. marge d'exploitation moyenne des 3 derniers exercices × CA (résultat normatif) ; 4. résultat publié.
    const ebitCourant = (j) => {
      const e = g("operating_income", j), r = g("revenue", j), roc = g("roc", j), imp = g("impair", j);
      if (!ok(e)) return { v: null, src: null };
      if (ok(roc) && Math.abs(roc) <= 3 * Math.abs(e) + 0.05 * Math.abs(r || 0)) return { v: roc, src: "roc" };
      if (ok(imp)) {
        const dg = ok(g("disposal_gain", j)) ? g("disposal_gain", j) : ok(g("disposal_adj", j)) ? -g("disposal_adj", j) : 0;
        return { v: e + imp - dg, src: "retraite" };
      }
      const ms = [j, j - 1, j - 2].map((k) => { const x = g("operating_income", k), y = g("revenue", k); return ok(x) && ok(y) && y > 0 ? x / y : null; }).filter(ok);
      if (ms.length >= 2 && ok(r) && r > 0) return { v: ms.reduce((s, v) => s + v, 0) / ms.length * r, src: "moyenne" };
      return { v: e, src: "publie" };
    };
    const EC = ebitCourant(i);
    const ebitC = EC.v;
    // Éléments non récurrents retirés trois années de suite (> 10 % du résultat) : ils ne sont plus exceptionnels.
    const nrRepeat = [i, i - 1, i - 2].every((j) => {
      const x = ebitCourant(j), e = g("operating_income", j);
      return (x.src === "roc" || x.src === "retraite") && ok(e) && e !== 0 && (x.v - e) / Math.abs(e) > 0.1;
    });

    // Rentabilité (sur le résultat courant).
    const ropat = ok(ebitC) ? ebitC * (1 - tUsed) : null;          // résultat d'exploitation courant après IS
    const ropatPub = ok(ebit) ? ebit * (1 - tUsed) : null;
    const margin = ok(ropat) && ok(rev) && rev > 0 ? ropat / rev : null;
    // Capitaux employés = capitaux propres + dette nette (passif du bilan économique), en moyenne sur l'exercice
    // (ouverture et clôture), comme dans les rentabilités publiées (ROACE). À défaut, l'actif économique calculé à l'actif.
    const ceAt = (j) => {
      const e = ok(g("equity_total", j)) ? g("equity_total", j) : g("equity", j), ch = g("cash", j);
      if (!ok(e) || !ok(ch)) return null;
      const lt = ok(g("debt_lt", j)) ? g("debt_lt", j) : ok(g("debt_total", j)) ? Math.max(0, g("debt_total", j) - (g("debt_st", j) || 0)) : 0;
      if (!ok(g("debt_lt", j)) && !ok(g("debt_st", j)) && !ok(g("debt_total", j))) return null;
      const v = e + lt + (g("debt_st", j) || 0) + (g("leases", j) || 0) - ch - (g("st_invest", j) || 0);
      return v > 0 ? v : null;
    };
    const ce1 = ceAt(i), ce0 = ceAt(i - 1);
    const ceAvg = ok(ce1) ? (ok(ce0) ? (ce0 + ce1) / 2 : ce1) : ok(ae) && ae > 0 ? ae : null;
    const rotation = ok(rev) && ok(ceAvg) && rev > 0 ? rev / ceAvg : null;
    const roce = ok(ropat) && ok(ceAvg) ? ropat / ceAvg : null;
    const roceReported = ok(ropatPub) && ok(ceAvg) ? ropatPub / ceAvg : null;
    const interest = g("interest");
    const iCost = ok(interest) && ok(netDebt) && netDebt > 0 ? interest * (1 - tUsed) / netDebt : null;
    const de = ok(netDebt) && ok(eq) && eq > 0 ? netDebt / eq : null;
    const roeTheo = ok(roce) && ok(de) ? roce + (roce - (ok(iCost) ? iCost : 0)) * de : null;
    const roe = ok(ni) && ok(eqGroup) && eqGroup > 0 ? ni / eqGroup : null;

    return {
      A, CA, CL, cash, eq, eqGroup, NCA, NCL, debtLT, debtST, debtKnown, netDebt, bfr, ae, other, fr, tresoNette,
      goodwill: g("goodwill"), intangibles: g("intangibles"), ppe: g("ppe"),
      rev, ebit, da, ebitda, pretax, tax, niTotal, ni, t, tUsed, staff: g("staff"),
      cogs: g("cost_of_revenue"), gp: g("gross_profit"), sga: g("sga"), rnd: g("rnd"),
      cfo: g("cfo"), capex: g("capex"), cfi: g("cfi"), cff: g("cff"), acq: g("acquisitions"),
      div: g("dividends"), buyback: g("buybacks"), issue: g("share_issue"),
      debtIn: g("debt_issued"), debtOut: g("debt_repaid"),
      ropat, margin, rotation, roce, roceReported, ebitC, ebitSrc: EC.src, nrRepeat, ce: ce1, ceAvg, iCost, de, roeTheo, roe, interest,
      bfrDays: ok(bfr) && ok(rev) && rev > 0 ? bfr / rev * 365 : null,
      recvDays: ok(g("receivables")) && ok(rev) && rev > 0 ? g("receivables") / rev * 365 : null,
      invDays: ok(g("inventory")) && ok(rev) && rev > 0 ? g("inventory") / rev * 365 : null,
      // Délai fournisseurs rapporté aux achats ; à défaut au coût des ventes, sinon au CA.
      payDays: ok(g("payables")) && ok(rev) && rev > 0
        ? g("payables") / (ok(g("cost_of_revenue")) && g("cost_of_revenue") > 0 ? g("cost_of_revenue") : rev) * 365 : null,
      ebitdaMargin: ok(ebitda) && ok(rev) && rev > 0 ? ebitda / rev : null,
      netMargin: ok(ni) && ok(rev) && rev > 0 ? ni / rev : null,
      ndEbitda: ok(netDebt) && ok(ebitda) && ebitda > 0 ? netDebt / ebitda : null,
      coverage: ok(ebit) && ok(interest) && interest > 0 ? ebit / interest : null,
      fcf: ok(g("cfo")) && ok(g("capex")) ? g("cfo") - g("capex") : null,
      // Investissements / amortissements. Retraitement IFRS 16 (case à cocher, actif par défaut) : hors des
      // États-Unis, les dotations incluent l'amortissement des loyers (droits d'utilisation), alors que les
      // nouveaux contrats de location ne sont pas des investissements. Rarement publié sous une étiquette
      // standard : estimé à 20 % des dettes de location (durée résiduelle moyenne des baux de l'ordre de 5 ans),
      // plafonné à la moitié des dotations. Les normes américaines laissent les loyers simples hors des dotations.
      daRou: params.ifrs16 !== false && c.c !== "US" && ok(da) && leases > 0 ? Math.min(0.2 * leases, 0.5 * da) : 0,
      get daAdj() { return ok(da) ? da - this.daRou : null; },
      get capexDa() { return ok(g("capex")) && ok(this.daAdj) && this.daAdj > 0 ? g("capex") / this.daAdj : null; },
      capexRev: ok(g("capex")) && ok(rev) && rev > 0 ? g("capex") / rev : null,
      // Capitalisation : cours actuel × nombre d'actions si disponible, sinon « public float » SEC de l'année.
      ...(() => {
        // Capitalisation au dernier cours (cours × actions déclarées). Contrôle de cohérence avec la
        // capitalisation flottante déclarée à la SEC : si le calcul en donne moins de la moitié, le nombre
        // d'actions ne couvre sans doute qu'une catégorie de titres (sociétés à plusieurs classes, LP) :
        // on garde alors la valeur déclarée.
        const fl = (c.v.market_cap || []).filter(ok);
        const lastFloat = fl.length ? fl[fl.length - 1] : null;
        let live = c.px && c.px[0] && c.px[1] ? c.px[0] * c.px[1] / 1e6 : null;
        // Le cours est en dollars (USA) ou en euros (Paris) : conversion dans la devise des comptes (Total publie en dollars).
        const pxCur = c.c === "US" ? "USD" : "EUR";
        if (ok(live) && pxCur !== c.cur) {
          const toEur = (cur) => (cur === "EUR" ? 1 : state.meta.fx[cur] ? Object.values(state.meta.fx[cur]).pop() : null);
          const a1 = toEur(pxCur), b1 = toEur(c.cur);
          live = a1 && b1 ? live * a1 / b1 : null;
        }
        // Cohérence : entre 0,3× et 3× la capitalisation déclarée ; sans déclaration, au plus 50× le CA.
        const rv = (c.v.revenue || []).filter(ok), lastRev = rv.length ? rv[rv.length - 1] : null;
        const sane = ok(live) && (ok(lastFloat) ? live >= 0.3 * lastFloat && live <= 3 * lastFloat
          : !ok(lastRev) || lastRev <= 0 || live <= 50 * lastRev);
        if (sane) return { mcap: live, mcapLive: true };
        return { mcap: ok(lastFloat) && i === state.meta.years.length - 1 ? lastFloat : g("market_cap") ?? lastFloat, mcapLive: false };
      })(),
      // Fiche 2 : état de l'outil industriel = immobilisations nettes / brutes.
      wear: ok(g("ppe")) && ok(g("ppe_gross")) && g("ppe_gross") > 0 ? g("ppe") / g("ppe_gross") : null,
      // Fiche 3 : ratios de liquidité.
      liqGen: ok(CA) && ok(CL) && CL > 0 ? CA / CL : null,
      liqRed: ok(CA) && ok(CL) && CL > 0 ? (CA - (g("inventory") || 0)) / CL : null,
      liqImm: ok(cash) && ok(CL) && CL > 0 ? cash / CL : null,
      // Fiche 4 : intensité capitalistique (inverse de la rotation) et levier financier.
      intensity: ok(ceAvg) && ok(rev) && rev > 0 ? ceAvg / rev : null,
      // Altman Z'' (1995, version sans cours de Bourse) :
      // 6,56 × BFR global / actif + 3,26 × réserves / actif + 6,72 × EBIT / actif + 1,05 × capitaux propres / dettes.
      zScore: (() => {
        const re = g("retained_earnings");
        if (!ok(A) || A <= 0 || !ok(CA) || !ok(CL) || !ok(re) || !ok(ebit) || !ok(eq)) return null;
        const liab = A - eq;
        if (liab <= 0) return null;
        return 6.56 * (CA - CL) / A + 3.26 * re / A + 6.72 * ebit / A + 1.05 * eq / liab;
      })(),
      divYield: null, totalYield: null,
      // Distribution : dividende par action, taux de distribution, couverture par le flux disponible.
      dps: g("dps"),
      payout: ok(g("dividends")) && ok(ni) && ni > 0 ? g("dividends") / ni : null,
      totalPayout: ok(ni) && ni > 0 && (ok(g("dividends")) || ok(g("buybacks"))) ? ((g("dividends") || 0) + (g("buybacks") || 0)) / ni : null,
      divCover: ok(g("cfo")) && ok(g("capex")) && ok(g("dividends")) && g("dividends") > 0 ? (g("cfo") - g("capex")) / g("dividends") : null,
      bookYield: ok(g("dividends")) && ok(eqGroup) && eqGroup > 0 ? g("dividends") / eqGroup : null,
      roa: ok(ni) && ok(A) && A > 0 ? ni / A : null,
      ev: null, evEbitda: null, evSales: null, per: null, fcfYield: null,
      growth: (() => {
        const r3 = g("revenue", i - 3);
        return ok(rev) && ok(r3) && rev > 0 && r3 > 0 ? Math.pow(rev / r3, 1 / 3) - 1 : null;
      })(),
      growth1: (() => {
        const r1 = g("revenue", i - 1);
        return ok(rev) && ok(r1) && r1 > 0 ? rev / r1 - 1 : null;
      })(),
    };
  };

  // Multiples de marché, calculés après coup à partir de la capitalisation retenue.
  const _figures = figures;
  figures = function (c, i) {
    const f = _figures(c, i);
    const m = f.mcap;
    if (ok(m) && m > 0) {
      f.ev = ok(f.netDebt) ? m + f.netDebt : null;
      f.evEbitda = ok(f.ev) && ok(f.ebitda) && f.ebitda > 0 ? f.ev / f.ebitda : null;
      f.evSales = ok(f.ev) && ok(f.rev) && f.rev > 0 ? f.ev / f.rev : null;
      f.per = ok(f.ni) && f.ni > 0 ? m / f.ni : null;
      f.fcfYield = ok(f.fcf) ? f.fcf / m : null;
      f.divYield = ok(f.div) ? f.div / m : null;
      f.totalYield = ok(f.div) || ok(f.buyback) ? ((f.div || 0) + (f.buyback || 0)) / m : null;
    }
    // Coût du capital du secteur (CMPC) : taux sans risque + bêta d'actif × prime de risque du marché.
    const R = refRates(c);
    const ba = R.beta, rf = R.rf / 100, prm = R.prm / 100;
    f.betaA = ba;
    f.rates = R;
    f.k = rf + ba * prm;
    f.spread = ok(f.roce) ? f.roce - f.k : null;
    f.eva = ok(f.spread) && ok(f.ceAvg) ? f.spread * f.ceAvg : null;
    f.vaeTh = ok(f.roce) && f.k > 0 ? f.roce / f.k : null;           // VE / actif économique théorique, sans croissance
    // Coût des fonds propres : bêta réendetté avec la dette nette / capitalisation (ou / capitaux propres comptables).
    const de = ok(f.netDebt) ? Math.max(0, f.netDebt) / (ok(m) && m > 0 ? m : ok(f.eqGroup) && f.eqGroup > 0 ? f.eqGroup : NaN) : null;
    f.de = ok(de) && Number.isFinite(de) ? de : null;
    f.betaE = ok(de) ? Math.min(3, ba * (1 + (1 - (f.tUsed ?? 0.25)) * de)) : ba;
    f.kE = rf + f.betaE * prm;
    f.roeSpread = ok(f.roe) ? f.roe - f.kE : null;
    if (ok(m) && m > 0) {
      f.vae = ok(f.ev) && ok(f.ceAvg) ? f.ev / f.ceAvg : null;
      f.mva = ok(f.ev) && ok(f.ceAvg) ? f.ev - f.ceAvg : null;
      f.pbr = ok(f.eqGroup) && f.eqGroup > 0 ? m / f.eqGroup : null;
    }
    // Croissance soutenable (autofinancée) : ROE × (1 − taux de distribution).
    f.sustGrowth = ok(f.roe) && ok(f.payout) ? f.roe * (1 - f.payout) : ok(f.roe) && !ok(f.div) ? f.roe : null;
    return f;
  };

  const M = (v) => (ok(v) ? (Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)) : "—");
  const P = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "—");
  const X = (v) => (ok(v) ? nf1.format(v) + "×" : "—");
  const d2 = (v) => (ok(v) ? v.toFixed(2).replace(".", ",") : "—");

  // ---------- Colonnes empilées proportionnelles ----------
  // side = [{label, value, cls}] ; les montants négatifs passent dans la colonne d'en face.
  function balance(cols, height, note) {
    const fixed = cols.map((c) => ({ title: c.title, blocks: c.blocks.filter((b) => ok(b.value) && b.value > 0) }));
    cols.forEach((c, k) => {
      const partner = fixed[c.partner ?? (k % 2 ? k - 1 : k + 1)];
      for (const b of c.blocks) {
        if (ok(b.value) && b.value < 0 && partner) partner.blocks.push({ ...b, value: -b.value, label: b.neg || b.label + " (négatif)" });
      }
    });
    const max = Math.max(...fixed.map((c) => c.blocks.reduce((a, b) => a + b.value, 0)), 1e-9);
    const colHtml = fixed.map((c) => {
      const total = c.blocks.reduce((a, b) => a + b.value, 0);
      const blocks = c.blocks.map((b) => {
        const h = b.value / max * 100;
        const small = h < 9;
        return `<div class="blk ${b.cls}" style="height:${h}%" title="${esc(b.label)} : ${M(b.value)}">
          ${small ? "" : `<span>${esc(b.label)}<b>${M(b.value)}</b></span>`}</div>`;
      }).join("");
      return `<div class="bcol"><div class="bstack" style="height:${height}px">
        <div class="bfill" style="height:${total / max * 100}%">${blocks}</div></div>
        <div class="btitle">${esc(c.title)}<br><b>${M(total)}</b></div></div>`;
    }).join("");
    const legend = fixed.flatMap((c) => c.blocks).filter((b, k, a) => a.findIndex((x) => x.label === b.label) === k)
      .map((b) => `<span><i class="sw ${b.cls}"></i>${esc(b.label)} ${M(b.value)}</span>`).join("");
    return `<div class="bal">${colHtml}</div><div class="legend">${legend}</div>${note ? `<p class="note">${note}</p>` : ""}`;
  }

  // Capitaux propres détaillés : part du groupe (flottant / actionnaires de contrôle si connu) et minoritaires.
  function equityBlocks(c, f) {
    const group = ok(f.eqGroup) ? f.eqGroup : f.eq;
    const minor = ok(f.eqGroup) && ok(f.eq) ? f.eq - f.eqGroup : null;
    const out = [];
    if (c.ff && ok(group) && group > 0) {
      out.push({ label: `CP part du groupe — flottant (${nf0.format(c.ff * 100)} %)`, value: group * c.ff, cls: "c-eq" });
      out.push({ label: `CP part du groupe — actionnaires de contrôle et dirigeants (${nf0.format((1 - c.ff) * 100)} %)`, value: group * (1 - c.ff), cls: "c-eq2" });
    } else {
      out.push({ label: "Capitaux propres part du groupe", value: group, cls: "c-eq" });
    }
    if (ok(minor) && Math.abs(minor) > 0.005 * Math.abs(f.eq || 1)) out.push({ label: "Intérêts minoritaires", value: minor, cls: "c-minor" });
    return out;
  }

  function economicBalance(f, cur, c) {
    if (!ok(f.ae) || !ok(f.eq) || !ok(f.netDebt)) return missing("Bilan économique", "actif, passif courant, trésorerie ou capitaux propres");
    const immoParts = [
      { label: "Goodwill", value: f.goodwill, cls: "c-gw" },
      { label: "Immo. incorporelles", value: f.intangibles, cls: "c-intang" },
      { label: "Immo. corporelles", value: f.ppe, cls: "c-ppe" },
    ].filter((b) => ok(b.value) && b.value > 0);
    const known = immoParts.reduce((a, b) => a + b.value, 0);
    const immo = immoParts.length && known <= f.NCA * 1.001
      ? [...immoParts, { label: "Autres immobilisations", value: f.NCA - known, cls: "c-immo" }]
      : [{ label: "Immobilisations", value: f.NCA, cls: "c-immo" }];
    const html = balance([
      { title: "Actif économique", blocks: [...immo, { label: "BFR", value: f.bfr, cls: "c-bfr", neg: "BFR négatif (ressource)" }] },
      { title: "Capitaux investis", blocks: [
        ...equityBlocks(c, f),
        { label: "Provisions et autres passifs LT", value: f.other, cls: "c-other", neg: "Autres actifs nets" },
        { label: "Dette nette", value: f.netDebt, cls: "c-debt", neg: "Trésorerie nette" },
      ] },
    ], 300, !f.debtKnown ? "Dette financière non publiée sous une étiquette standard : elle est comptée dans « autres passifs »." : "");
    return card("Bilan économique", `M ${cur}`, html,
      `${c && c.ff ? `Flottant : ${nf0.format(c.ff * 100)} % du capital est détenu par le public ; le reste par les dirigeants, administrateurs et actionnaires de plus de 10 % (déclaration à la SEC, rapportée à la capitalisation à la même date). Le flottant ne change pas la valeur des capitaux propres : il mesure la liquidité du titre et la possibilité d'une prise de contrôle (un flottant faible signale un actionnaire de référence qui décide). ` : c && c.c !== "US" ? "Flottant non disponible hors USA (pas de source publique gratuite). " : ""}Actif économique = immobilisations + BFR ${M(f.ae)}. Il est financé par les capitaux propres et la dette nette.
       BFR = ${M(f.bfr)}, soit ${ok(f.bfrDays) ? nf0.format(f.bfrDays) + " jours de CA" : "—"}.`);
  }

  function financialBalance(f, cur) {
    if (!ok(f.NCA) || !ok(f.CA) || !ok(f.CL) || !ok(f.eq) || !ok(f.NCL)) return missing("Bilan financier", "actif ou passif courant/non courant");
    const frBlock = { label: "Fonds de roulement", value: f.fr, cls: "c-fr", neg: "Fonds de roulement négatif" };
    const html = balance([
      { title: "Emplois stables", partner: 1, blocks: [{ label: "Actif immobilisé", value: f.NCA, cls: "c-immo" }, frBlock] },
      { title: "Ressources stables", partner: 0, blocks: [
        { label: "Capitaux propres", value: f.eq, cls: "c-eq" },
        { label: "Dettes à plus d'un an", value: f.NCL, cls: "c-debt" }] },
      { title: "Actif circulant", partner: 3, blocks: [{ label: "Actif circulant", value: f.CA, cls: "c-bfr" }] },
      { title: "Passif circulant", partner: 2, blocks: [frBlock, { label: "Dettes à moins d'un an", value: f.CL, cls: "c-other" }] },
    ], 260);
    return card("Bilan financier — fonds de roulement", `M ${cur}`, html,
      `Par le haut : capitaux propres + dettes à plus d'un an − actif immobilisé = <b>${M(f.fr)}</b>.
       Par le bas : actif circulant − dettes à moins d'un an = <b>${M(f.fr)}</b>.
       Fonds de roulement − BFR = trésorerie nette (${M(f.tresoNette)}).`);
  }

  // ---------- Cascade horizontale ----------
  // rows : {label, value, kind: "start" | "delta" | "sub", group}
  function waterfall(rows) {
    let cum = 0;
    const pts = [];
    for (const r of rows) {
      if (!ok(r.value)) continue;
      if (r.kind === "start") { pts.push({ ...r, from: 0, to: r.value }); cum = r.value; }
      else if (r.kind === "sub") { pts.push({ ...r, from: 0, to: r.value }); cum = r.value; }
      else { pts.push({ ...r, from: cum, to: cum + r.value }); cum += r.value; }
    }
    if (!pts.length) return "";
    const lo = Math.min(0, ...pts.map((p) => Math.min(p.from, p.to)));
    const hi = Math.max(0, ...pts.map((p) => Math.max(p.from, p.to)));
    const span = hi - lo || 1;
    const x = (v) => (v - lo) / span * 100;
    let lastGroup = null;
    return `<div class="wf">${pts.map((p) => {
      const head = p.group && p.group !== lastGroup ? `<div class="wf-group">${esc(p.group)}</div>` : "";
      lastGroup = p.group || lastGroup;
      const left = x(Math.min(p.from, p.to)), w = Math.max(0.4, Math.abs(x(p.to) - x(p.from)));
      const cls = p.kind === "delta" ? (p.value >= 0 ? "up" : "down") : "sub";
      return `${head}<div class="wf-row ${p.kind}"><div class="wf-label">${esc(p.label)}</div>
        <div class="wf-track"><div class="wf-zero" style="left:${x(0)}%"></div>
        <div class="wf-bar ${cls}" style="left:${left}%;width:${w}%"></div></div>
        <div class="wf-val ${p.value < 0 ? "neg" : ""}">${M(p.value)}</div></div>`;
    }).join("")}</div>`;
  }

  function incomeStatement(f, cur) {
    if (!ok(f.rev)) return missing("Compte de résultat", "chiffre d'affaires");
    const rows = [{ label: "Chiffre d'affaires", value: f.rev, kind: "start", group: "Cycle d'exploitation" }];
    if (ok(f.ebitda)) {
      const opex = f.rev - f.ebitda;
      if (ok(f.staff) && f.staff > 0 && f.staff < opex) {
        rows.push({ label: "Achats et charges externes", value: -(opex - f.staff), kind: "delta" });
        rows.push({ label: "Charges de personnel", value: -f.staff, kind: "delta" });
      } else {
        rows.push({ label: "Charges d'exploitation (hors amort.)", value: -opex, kind: "delta" });
      }
      rows.push({ label: "EBITDA (EBE)", value: f.ebitda, kind: "sub" });
      rows.push({ label: "Dotations aux amortissements", value: -f.da, kind: "delta" });
    } else if (ok(f.ebit)) {
      rows.push({ label: "Charges d'exploitation", value: -(f.rev - f.ebit), kind: "delta" });
    }
    if (ok(f.ebit)) rows.push({ label: "Résultat d'exploitation (EBIT)", value: f.ebit, kind: "sub" });
    if (ok(f.pretax) && ok(f.ebit)) {
      rows.push({ label: "Résultat financier et autres", value: f.pretax - f.ebit, kind: "delta", group: "Cycle de financement" });
      rows.push({ label: "Résultat avant impôt", value: f.pretax, kind: "sub" });
    }
    if (ok(f.tax) && ok(f.pretax)) {
      rows.push({ label: "Impôt sur les résultats", value: -f.tax, kind: "delta", group: "Impôt et minoritaires" });
      if (ok(f.niTotal)) {
        const rest = f.niTotal - (f.pretax - f.tax);
        if (Math.abs(rest) > Math.abs(f.rev) * 0.001) rows.push({ label: "Activités cédées et autres", value: rest, kind: "delta" });
        rows.push({ label: "Résultat net de l'ensemble", value: f.niTotal, kind: "sub" });
      }
    }
    if (ok(f.ni)) {
      const base = rows[rows.length - 1];
      if (base.kind === "sub" && base.label.startsWith("Résultat net")) {
        const minor = f.ni - f.niTotal;
        if (Math.abs(minor) > Math.abs(f.rev) * 0.001) rows.push({ label: "Intérêts minoritaires", value: minor, kind: "delta" });
      }
      rows.push({ label: "Résultat net part du groupe", value: f.ni, kind: "sub" });
    }
    const fn = [["Coût des ventes", f.cogs], ["Marge brute", f.gp], ["Frais commerciaux et généraux", f.sga], ["R&D", f.rnd]]
      .filter(([, v]) => ok(v));
    const extra = fn.length ? `<p class="note">Présentation par fonction publiée : ${fn.map(([k, v]) => `${k} ${M(v)}`).join(" · ")}.</p>` : "";
    const marg = [["EBITDA", f.ebitda], ["EBIT", f.ebit], ["Net", f.ni]].filter(([, v]) => ok(v))
      .map(([k, v]) => `marge ${k} ${P(v / f.rev)}`).join(" · ");
    return card("Compte de résultat en cascade", `M ${cur}`, waterfall(rows) + extra, marg);
  }

  function cashFlow(f, cur) {
    if (!ok(f.cfo)) return missing("Tableau de flux", "flux de trésorerie d'exploitation");
    const rows = [{ label: "Flux de trésorerie d'exploitation", value: f.cfo, kind: "start", group: "Exploitation" }];
    let sum = f.cfo;
    if (ok(f.capex)) {
      rows.push({ label: "Investissements industriels (capex)", value: -f.capex, kind: "delta", group: "Investissement" });
      sum -= f.capex;
      rows.push({ label: "Flux de trésorerie disponible (FCF)", value: sum, kind: "sub" });
    }
    if (ok(f.cfi)) {
      if (ok(f.acq) && f.acq > 0) { rows.push({ label: "Acquisitions de sociétés", value: -f.acq, kind: "delta" }); }
      const otherInv = f.cfi + (f.capex || 0) + (f.acq || 0);
      if (Math.abs(otherInv) > 0.0005 * Math.abs(f.cfo)) rows.push({ label: "Cessions et autres investissements", value: otherInv, kind: "delta" });
      sum = f.cfo + f.cfi;
      rows.push({ label: "Flux après investissements", value: sum, kind: "sub" });
    }
    if (ok(f.cff)) {
      let known = 0;
      const push = (label, v, group) => { if (ok(v) && v !== 0) { rows.push({ label, value: v, kind: "delta", group }); known += v; } };
      push("Dividendes versés", ok(f.div) ? -f.div : null, "Financement — actionnaires");
      push("Rachats d'actions", ok(f.buyback) ? -f.buyback : null);
      push("Augmentations de capital", f.issue);
      push("Nouveaux emprunts", f.debtIn, "Financement — prêteurs");
      push("Remboursements d'emprunts", ok(f.debtOut) ? -f.debtOut : null);
      const rest = f.cff - known;
      if (Math.abs(rest) > 0.0005 * Math.abs(f.cfo)) rows.push({ label: "Autres flux de financement (dont loyers)", value: rest, kind: "delta" });
      rows.push({ label: "Variation de trésorerie", value: sum + f.cff, kind: "sub", group: "Résultat" });
    }
    const conv = ok(f.ebitda) && f.ebitda > 0 && ok(f.capex) ? `FCF / EBITDA ${P((f.cfo - f.capex) / f.ebitda)}` : "";
    const capexDa = ok(f.capexDa) ? ` · capex / amortissements ${X(f.capexDa)}${f.daRou > 0 ? " hors amortissement des loyers (IFRS 16, estimé)" : ""} (au-dessus de 1×, l'outil se développe)` : "";
    return card("Tableau de flux de trésorerie", `M ${cur}`, waterfall(rows), conv + capexDa);
  }

  function leverage(f) {
    if (!ok(f.roce)) return missing("Rentabilité et effet de levier", "résultat d'exploitation ou actif économique");
    const box = (k, v, sub) => `<div class="lv-box"><b>${v}</b><span>${k}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const op = (s) => `<div class="lv-op">${s}</div>`;
    const levEffect = ok(f.de) ? (f.roce - (ok(f.iCost) ? f.iCost : 0)) * f.de : null;
    return card("Rentabilité et effet de levier", "", `
      <div class="lv">
        ${box("Marge d'exploitation après IS", P(f.margin), "EBIT × (1 − t) / CA")}${op("×")}
        ${box("Rotation de l'actif économique", X(f.rotation), "CA / actif économique")}${op("=")}
        ${box("ROCE après IS", P(f.roce), "rentabilité économique")}
      </div>
      <div class="lv">
        ${box("ROCE", P(f.roce))}${op("+")}
        ${box("(ROCE − i) × D / CP", P(levEffect), `i = ${P(f.iCost)} · D/CP = ${ok(f.de) ? nf1.format(f.de) : "—"}`)}${op("≈")}
        ${box("Rentabilité des capitaux propres", P(f.roeTheo), `publiée : ${P(f.roe)}`)}
      </div>`,
      `Taux d'impôt ${ok(f.t) && f.t >= 0 && f.t <= 0.5 ? "effectif " + P(f.t) : "normatif 25 %"}. i = coût de la dette nette après impôt (charges financières / dette nette).
       Quand le ROCE dépasse i, la dette augmente la rentabilité des capitaux propres ; sinon elle la détruit.
       L'écart avec la rentabilité publiée vient des éléments hors exploitation et des minoritaires.`);
  }

  function history(c) {
    const ys = state.meta.years;
    const fs = ys.map((_, i) => figures(c, i));
    const idx = ys.map((_, i) => i).filter((i) => ok(fs[i].rev));
    if (idx.length < 2) return "";
    const rows = [
      ["Chiffre d'affaires", (f) => M(f.rev)],
      ["Actif économique (immobilisations + BFR)", (f) => M(f.ae)],
      ["Capitaux employés moyens (CP + dette nette)", (f) => M(f.ceAvg)],
      ["dont BFR", (f) => M(f.bfr)],
      ["BFR en jours de CA", (f) => (ok(f.bfrDays) ? nf0.format(f.bfrDays) + " j" : "—")],
      ["Fonds de roulement", (f) => M(f.fr)],
      ["Trésorerie nette (FR − BFR)", (f) => M(f.tresoNette)],
      ["Marge d'exploitation après IS", (f) => P(f.margin)],
      ["Rotation de l'actif économique", (f) => X(f.rotation)],
      ["ROCE après IS", (f) => P(f.roce)],
      ["Coût de la dette après IS (i)", (f) => P(f.iCost)],
      ["Dette nette / capitaux propres", (f) => (ok(f.de) ? nf1.format(f.de) : "—")],
      ["Rentabilité des capitaux propres", (f) => P(f.roe)],
    ];
    return card("Évolution des grands équilibres", `M ${c.cur}`, `<div class="tablewrap"><table>
      <thead><tr><th class="l"></th>${idx.map((i) => `<th>${ys[i]}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(([k, fn]) => `<tr><td class="l">${k}</td>${idx.map((i) => `<td>${fn(fs[i])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`, "Effet ciseaux à surveiller : un BFR ou un actif économique qui grossit plus vite que le CA fait baisser la rotation et consomme la trésorerie.");
  }

  function card(title, unit, body, foot) {
    return `<div class="card"><h3>${title}${unit ? ` <small>(${esc(unit)})</small>` : ""}</h3>${body}${foot ? `<p class="note">${foot}</p>` : ""}</div>`;
  }
  function missing(title, what) {
    return `<div class="card"><h3>${title}</h3><p class="note">Non disponible : ${what} non publié sous une étiquette standard pour cet exercice.</p></div>`;
  }

  // ---------- Coût du capital : valeurs de référence (collect/rates.py), sauf si l'utilisateur les force ----------
  // Taux sans risque du pays (emprunt d'État à 10 ans), prime de risque du pays (Damodaran), bêta d'actif du secteur.
  const MOIS = { January: "janvier", February: "février", March: "mars", April: "avril", May: "mai", June: "juin", July: "juillet",
    August: "août", September: "septembre", October: "octobre", November: "novembre", December: "décembre" };
  const frDate = (s) => String(s || "").replace(/([A-Z][a-z]+)(?: \d+,)? (\d{4})/, (m, mo, y) => `${MOIS[mo] || mo} ${y}`)
    .replace(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/, (m, y, mo, d) => (d ? `${Number(d)}/${mo}/${y}` : `${Object.values(MOIS)[Number(mo) - 1]} ${y}`));
  function refRates(c) {
    const R = state.meta.rates || {};
    const rfRef = R.rf && (R.rf[c.c] || R.rf.US);
    const e = R.erp && R.erp.country && R.erp.country[c.c];
    const erpRef = e && ok(e.erp) ? e.erp : R.erp && ok(R.erp.mature) ? R.erp.mature : null;
    const betaRef = R.beta && R.beta.sector && R.beta.sector[c.s];
    return {
      rf: ok(params.rf) ? params.rf : rfRef ? rfRef.v : 4,
      rfInfo: rfRef ? `emprunt d'État à 10 ans ${R.rf[c.c] ? `(${(state.meta.countries || {})[c.c] || c.c})` : "américain"}, ${frDate(rfRef.date)}` : "valeur par défaut",
      prm: ok(params.prm) ? params.prm : ok(erpRef) ? erpRef : 5,
      prmInfo: ok(erpRef) ? `Damodaran, ${frDate(R.erp.date)}` : "valeur par défaut",
      beta: ok(betaRef) ? betaRef : BETA_A[c.s] ?? 0.9,
      betaInfo: ok(betaRef) ? `Damodaran, ${R.beta.date ? frDate(R.beta.date) : "dernière table"}` : "ordre de grandeur",
      forced: ok(params.rf) || ok(params.prm),
      updated: R.updated,
    };
  }

  // ---------- Paramètres réglables (mémorisés dans le navigateur) ----------
  // rf = taux sans risque (%), prm = prime de risque (%) : vides = valeurs de référence mises à jour par la collecte.
  const params = { rf: null, prm: null, mult: null, ifrs16: true };
  try { Object.assign(params, JSON.parse(localStorage.getItem("reprise.params") || "{}")); } catch (e) { /* ignoré */ }
  delete params.wacc;
  if (params.rf === 3 && params.prm === 6) { params.rf = null; params.prm = null; }   // anciennes valeurs par défaut
  function saveParams() { try { localStorage.setItem("reprise.params", JSON.stringify(params)); } catch (e) { /* ignoré */ } }

  // ---------- Comparaison au secteur ----------
  const sectorCache = {};
  const BENCH = ["per", "evSales", "fcfYield", "growth", "ebitdaMargin", "margin", "netMargin", "bfrDays", "capexRev", "rotation", "ndEbitda",
    "coverage", "roce", "roe", "evEbitda", "zScore", "divYield", "bookYield", "liqGen", "growth1",
    "payout", "totalYield", "divCover", "sustGrowth", "vae", "spread", "pbr"];
  function sectorStats(sector, i) {
    const key = sector + "|" + i;
    if (sectorCache[key]) return sectorCache[key];
    const vals = Object.fromEntries(BENCH.map((k) => [k, []]));
    let n = 0;
    for (const c of state.companies) {
      if (c.s !== sector) continue;
      const f = figures(c, i);
      if (!ok(f.rev) || f.rev <= 0) continue;
      n++;
      for (const k of BENCH) if (ok(f[k])) vals[k].push(f[k]);
    }
    const out = { n };
    for (const k of BENCH) {
      const a = vals[k].sort((x, y) => x - y);
      out[k] = { sorted: a, median: a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null };
    }
    return (sectorCache[key] = out);
  }
  // Petite mention « secteur : médiane · rang » sous un indicateur.
  function bench(stats, key, v, fmt, higherIsBetter = true) {
    const s = stats[key];
    if (!s || !ok(s.median) || s.sorted.length < 5) return "";
    let rank = "";
    if (ok(v)) {
      const below = s.sorted.filter((x) => x < v).length;
      const pctl = Math.round(below / s.sorted.length * 100);
      const good = higherIsBetter ? pctl >= 50 : pctl <= 50;
      rank = ` · <span class="${good ? "pos" : "neg"}">${pctl}e centile</span>`;
    }
    return `<small class="bench">secteur ${fmt(s.median)}${rank}</small>`;
  }

  // ---------- Briques d'affichage ----------
  const kpi = (label, value, extra = "") => `<div class="kpi"><b>${value}</b><span>${gloss(label)}</span>${extra}</div>`;
  const D = (v) => (ok(v) ? nf0.format(v) + " j" : "—");
  const light = (state) => `<i class="light ${state}" aria-label="${state === "green" ? "bon" : state === "orange" ? "à surveiller" : state === "red" ? "alerte" : "inconnu"}"></i>`;
  // Chaque étape est repliable : on lit d'abord le résumé, on ouvre le détail au besoin.
  // Une ligne repliable. Si la fiche a un verdict pour n (étapes 1 à 4, A = actionnaire, P = prêteur,
  // € = marché), l'en-tête montre le feu et la phrase de verdict : synthèse et détail ne font qu'un.
  let curV = null;
  function step(n, title, sub, body) {
    const v = curV && curV[n];
    const head = v
      ? `<span class="num">${n}</span>${light(v[0])}<span class="st-t"><b>${title}</b><span class="st-v">${v[1]}</span></span>`
      : `<span class="num">${n}</span>${title}<small>${sub}</small>`;
    return `<details class="step${v ? " vstep" : ""}" data-n="${n}" name="etapes"><summary class="step-h">${head}<span class="open-hint">détail</span></summary>${body}</details>`;
  }

  // Valeur estimée des capitaux propres : multiple sectoriel et flux actualisés (même méthode que le stock picking).
  function fairValue(c, f, i, st) {
    const medEv = st.evEbitda && st.evEbitda.median;
    const sector = ok(medEv) && ok(f.ebitda) && f.ebitda > 0 && ok(f.netDebt) ? medEv * f.ebitda - f.netDebt : null;
    const fcfs = [0, 1, 2].map((k) => figures(c, i - k).fcf).filter(ok);
    const fcf = fcfs.length ? fcfs.reduce((a, b) => a + b, 0) / fcfs.length : null;
    const w = f.k, g = 0.03, gT = Math.min(0.02, w - 0.01);
    let dcf = null;
    if (ok(fcf) && fcf > 0 && ok(f.netDebt) && w > gT) {
      let v = 0, cf = fcf;
      for (let t = 1; t <= 5; t++) { cf *= 1 + g; v += cf / Math.pow(1 + w, t); }
      dcf = v + cf * (1 + gT) / (w - gT) / Math.pow(1 + w, 5) - f.netDebt;
    }
    return { sector: ok(sector) && sector > 0 ? sector : null, dcf: ok(dcf) && dcf > 0 ? dcf : null };
  }

  function valueBar(c, f, fv) {
    const vals = [fv.sector, fv.dcf].filter(ok);
    if (!ok(f.mcap) || !vals.length) return "";
    const fair = vals.reduce((a, b) => a + b, 0) / vals.length;
    const gap = f.mcap / fair - 1;
    const max = Math.max(f.mcap, ...vals) * 1.15;
    const x = (v) => Math.min(100, v / max * 100);
    const zone = gap <= -0.2 ? ["green", `${nf0.format(-gap * 100)} % sous la valeur estimée`] : gap >= 0.2 ? ["red", `${nf0.format(gap * 100)} % au-dessus de la valeur estimée`] : ["orange", "proche de la valeur estimée (± 20 %)"];
    return `<div class="vbar">
      <div class="vbar-track">
        <div class="vbar-zone z1" style="left:0;width:${x(fair * 0.8)}%"></div>
        <div class="vbar-zone z2" style="left:${x(fair * 0.8)}%;width:${x(fair * 1.2) - x(fair * 0.8)}%"></div>
        <div class="vbar-zone z3" style="left:${x(fair * 1.2)}%;right:0"></div>
        <div class="vbar-mark price" style="left:${x(f.mcap)}%"><span>Cours<br><b>${M(f.mcap)}</b></span></div>
        <div class="vbar-mark fair" style="left:${x(fair)}%"><span>Valeur estimée<br><b>${M(fair)}</b></span></div>
      </div>
      <p class="vbar-txt">${light(zone[0])}<b>Le cours est ${zone[1]}.</b> <small>Moyenne de la valeur par le multiple du secteur (${M(fv.sector)}) et par les flux actualisés (${M(fv.dcf)}), en M ${esc(c.cur)}.</small></p>
    </div>`;
  }

  function seriesFor(c, fn) {
    const ys = state.meta.years;
    return ys.map((y, j) => ({ y, v: fn(figures(c, j)) }));
  }

  // Effet ciseaux : CA et charges d'exploitation (hors amortissements) en base 100.
  function scissors(c, cur) {
    const ys = state.meta.years;
    const rows = ys.map((y, j) => { const f = figures(c, j); return { y, rev: f.rev, opex: ok(f.rev) && ok(f.ebitda) ? f.rev - f.ebitda : null, staff: f.staff }; })
      .filter((r) => ok(r.rev) && ok(r.opex) && r.rev > 0 && r.opex > 0);
    if (rows.length < 3) return "";
    const b = rows[0];
    const lines = [
      ["Chiffre d'affaires", "--bar1", rows.map((r) => r.rev / b.rev * 100)],
      ["Charges d'exploitation (hors amort.)", "--c-debt", rows.map((r) => r.opex / b.opex * 100)],
    ];
    if (rows.every((r) => ok(r.staff) && r.staff > 0)) lines.push(["Charges de personnel", "--bar2", rows.map((r) => r.staff / b.staff * 100)]);
    const all = lines.flatMap((l) => l[2]);
    const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03;
    const W = 640, H = 190, padL = 34, padB = 20;
    const x = (k) => padL + k * (W - padL - 26) / (rows.length - 1);
    const y = (v) => 8 + (hi - v) / (hi - lo || 1) * (H - padB - 8);
    const svg = lines.map(([, col, vs]) => `<polyline fill="none" stroke="var(${col})" stroke-width="2.5" points="${vs.map((v, k) => `${x(k)},${y(v)}`).join(" ")}"/>` +
      vs.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="3" fill="var(${col})"><title>${nf0.format(v)}</title></circle>`).join("")).join("");
    const axis = rows.map((r, k) => `<text x="${x(k)}" y="${H - 4}" text-anchor="middle">${r.y}</text>`).join("") +
      `<line x1="${padL}" x2="${W - 10}" y1="${y(100)}" y2="${y(100)}" stroke="var(--line)" stroke-dasharray="4 3"/><text x="2" y="${y(100) + 4}">100</text>`;
    const last = rows.length - 1;
    const gap = lines[0][2][last] - lines[1][2][last];
    const msg = Math.abs(gap) < 3 ? "Produits et charges évoluent au même rythme : pas d'effet ciseaux marqué."
      : gap > 0 ? `Effet ciseaux favorable : depuis ${b.y}, le CA progresse plus vite que les charges (écart de ${nf0.format(gap)} points), la marge s'élargit.`
        : `Effet ciseaux défavorable : depuis ${b.y}, les charges progressent plus vite que le CA (écart de ${nf0.format(-gap)} points), la marge se comprime.`;
    return card("Effet ciseaux", `base 100 en ${b.y}`, `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution comparée du CA et des charges">${axis}${svg}</svg>
      <div class="legend">${lines.map((l) => `<span><i style="background:var(${l[1]})"></i>${l[0]}</span>`).join("")}</div>`, msg);
  }

  // Levier opérationnel observé : variation du résultat d'exploitation pour 1 % de variation du CA.
  function operatingLeverage(c) {
    const ys = state.meta.years, el = [];
    for (let j = 1; j < ys.length; j++) {
      const a = figures(c, j - 1), b = figures(c, j);
      if (!ok(a.rev) || !ok(b.rev) || !ok(a.ebit) || !ok(b.ebit) || a.rev <= 0 || a.ebit <= 0) continue;
      const dr = b.rev / a.rev - 1, de = b.ebit / a.ebit - 1;
      if (Math.abs(dr) >= 0.02) el.push(de / dr);
    }
    if (el.length < 2) return null;
    el.sort((p, q) => p - q);
    return el[el.length >> 1];
  }

  // ---------- Étape 1 : les marges ----------
  function step1(c, f, i, st) {
    const lev = operatingLeverage(c);
    let levTxt = "Pas assez d'années comparables pour estimer le levier opérationnel.";
    if (ok(lev)) {
      if (lev > 1.05) {
        const pm = 1 - 1 / lev;
        levTxt = `Levier opérationnel observé ≈ ${nf1.format(lev)} : quand le CA varie de 1 %, le résultat d'exploitation varie d'environ ${nf1.format(lev)} %.
          Comme levier = marge sur coûts variables / (marge sur coûts variables − coûts fixes), le point mort se situe vers
          <b>${nf0.format(pm * 100)} % du CA</b>${ok(f.rev) ? ` (≈ ${M(pm * f.rev)} M ${esc(c.cur)})` : ""} ; position par rapport au point mort
          (CA / point mort − 1) ≈ <b>${nf0.format(1 / (lev - 1) * 100)} %</b>. ${pm > 0.8 ? "Entreprise proche de son point mort : bénéfice fragile." : pm > 0.6 ? "Sensibilité moyenne à la conjoncture." : "Bénéfice plutôt stable, loin du point mort."}`;
      } else {
        levTxt = `Levier opérationnel observé ≈ ${nf1.format(lev)} : le résultat ne suit pas mécaniquement le CA (coûts très variables, ou effets prix et non récurrents). Point mort non estimable ainsi.`;
      }
    }
    const kpis = `<div class="kpis">
      ${kpi("Croissance du CA sur 1 an", P(f.growth1))}
      ${kpi("Croissance annuelle sur 3 ans", P(f.growth), bench(st, "growth", f.growth, P))}
      ${kpi("Marge d'EBE (EBITDA)", P(f.ebitdaMargin), bench(st, "ebitdaMargin", f.ebitdaMargin, P))}
      ${kpi("Marge d'exploitation après IS", P(f.margin), bench(st, "margin", f.margin, P))}
      ${kpi("Marge nette", P(f.netMargin), bench(st, "netMargin", f.netMargin, P))}
    </div>`;
    return step(1, "Les marges", "la création de richesse", kpis + incomeStatement(f, c.cur) + scissors(c, c.cur) +
      card("Risque d'exploitation : point mort", "", `<p class="note">${levTxt}</p>`,
        "Estimation statistique à partir des comptes publiés (la répartition coûts fixes / variables n'est pas publiée). À confirmer par l'analyse des coûts."));
  }

  // ---------- Étape 2 : les investissements ----------
  function capexNature(r) {
    if (!ok(r)) return "—";
    return r > 1.1 ? "capacité" : r >= 0.9 ? "maintien" : "retrait";
  }
  function wearTxt(w) {
    if (!ok(w)) return "brut non publié";
    return w > 0.6 ? "outil récent" : w >= 0.4 ? "outil à mi-vie" : "outil vieillissant, réinvestissement à prévoir";
  }
  function step2(c, f, i, st) {
    const ys = state.meta.years;
    const fs = ys.map((_, j) => figures(c, j));
    const idx = ys.map((_, j) => j).filter((j) => ok(fs[j].rev));
    const row = (label, fn) => `<tr><td class="l">${label}</td>${idx.map((j) => `<td>${fn(fs[j])}</td>`).join("")}</tr>`;
    const head = `<thead><tr><th class="l"></th>${idx.map((j) => `<th>${ys[j]}</th>`).join("")}</tr></thead>`;
    const bfrTable = `<div class="tablewrap"><table>${head}<tbody>
      ${row("Clients (jours de CA)", (x) => D(x.recvDays))}
      ${row("Stocks (jours de CA)", (x) => D(x.invDays))}
      ${row("Fournisseurs (jours d'achats)", (x) => D(x.payDays))}
      ${row("<b>BFR (jours de CA)</b>", (x) => `<b>${D(x.bfrDays)}</b>`)}
      ${row("Croissance du CA", (x) => P(x.growth1))}
      ${row(`BFR (M ${esc(c.cur)})`, (x) => M(x.bfr))}
      ${idx.length > 1 ? `<tr><td class="l">Variation du BFR</td>${idx.map((j, k) => {
        const p = k > 0 ? fs[idx[k - 1]].bfr : null, v = fs[j].bfr;
        return `<td>${ok(p) && ok(v) ? `<span class="${v - p > 0 ? "neg" : "pos"}">${v - p > 0 ? "+" : ""}${M(v - p)}</span>` : "—"}</td>`;
      }).join("")}</tr>` : ""}
    </tbody></table></div>`;
    // BFR qui grossit plus vite que le CA ?
    const first = idx.find((j) => ok(fs[j].bfrDays)), lastJ = [...idx].reverse().find((j) => ok(fs[j].bfrDays));
    let bfrMsg = "";
    if (first !== undefined && lastJ !== undefined && lastJ > first) {
      const d = fs[lastJ].bfrDays - fs[first].bfrDays;
      bfrMsg = Math.abs(d) < 5 ? `BFR stable en jours de CA depuis ${ys[first]}.`
        : d > 0 ? `Le BFR a gagné ${nf0.format(d)} jours de CA depuis ${ys[first]} : il croît plus vite que l'activité et consomme de la trésorerie.`
          : `Le BFR a perdu ${nf0.format(-d)} jours de CA depuis ${ys[first]} : le cycle d'exploitation libère de la trésorerie.`;
    }
    if (ok(f.bfr) && f.bfr < 0) bfrMsg += " BFR négatif : les clients et fournisseurs financent l'exploitation, atout pour la croissance.";
    const invTable = `<div class="tablewrap"><table>${head}<tbody>
      ${row("Investissements (capex)", (x) => M(x.capex))}
      ${row("Dotations aux amortissements", (x) => M(x.da))}
      ${row("Capex / amortissements", (x) => X(x.capexDa))}
      ${row("Nature", (x) => capexNature(x.capexDa))}
      ${row("Capex en % du CA", (x) => P(x.capexRev))}
      ${row("Flux d'exploitation", (x) => M(x.cfo))}
      ${row("Rotation de l'actif économique", (x) => X(x.rotation))}
    </tbody></table></div>`;
    // Les investissements passés se traduisent-ils par plus de flux d'exploitation ?
    const withCfo = idx.filter((j) => ok(fs[j].cfo));
    let invMsg = "";
    if (withCfo.length >= 3) {
      const a = fs[withCfo[0]], b = fs[withCfo[withCfo.length - 1]];
      const ratios = withCfo.map((j) => fs[j].capexDa).filter(ok);
      const avg = ratios.length ? ratios.reduce((p, q) => p + q, 0) / ratios.length : null;
      invMsg = `Sur ${ys[withCfo[0]]}–${ys[withCfo[withCfo.length - 1]]}, capex / amortissements moyen ${X(avg)} (${capexNature(avg)}) ; flux d'exploitation ${b.cfo > a.cfo ? "en hausse" : "en baisse"} de ${M(a.cfo)} à ${M(b.cfo)}.`;
      if (ok(avg) && avg > 1.1 && b.cfo <= a.cfo) invMsg += " Des investissements de capacité qui ne produisent pas encore de flux supplémentaires : à surveiller.";
    }
    const kpis = `<div class="kpis">
      ${kpi("BFR en jours de CA", D(f.bfrDays), bench(st, "bfrDays", f.bfrDays, D, false))}
      ${kpi("Capex en % du CA", P(f.capexRev), bench(st, "capexRev", f.capexRev, P))}
      ${kpi("Capex / amortissements", X(f.capexDa) + `<small> ${capexNature(f.capexDa)}</small>`)}
      ${kpi("Rotation de l'actif économique", X(f.rotation), bench(st, "rotation", f.rotation, X))}
      ${kpi("État de l'outil (immo. nettes / brutes)", P(f.wear), `<small class="bench">${wearTxt(f.wear)}</small>`)}
    </div>`;
    return step(2, "Les investissements", "immobilisations et BFR", kpis + economicBalance(f, c.cur, c) +
      card("Besoin en fonds de roulement", "", bfrTable, bfrMsg + " Une hausse du BFR est un besoin de financement, une baisse libère de la trésorerie. Le BFR à la clôture n'est qu'une photo : on le lit en tendance. Ratios calculés sur le CA hors taxes (la TVA n'est pas publiée).") +
      card("Politique d'investissement", `M ${c.cur}`, invTable,
        (invMsg ? invMsg + " " : "") + "Capex supérieurs aux amortissements : investissements de capacité ; égaux : maintien ; inférieurs : retrait."));
  }

  // ---------- Étape 3 : le financement ----------
  function step3(c, f, i, st) {
    const fcfAfter = ok(f.fcf) && ok(f.interest) ? f.fcf - f.interest * (1 - f.tUsed) : null;
    const nd = f.ndEbitda, cov = f.coverage;
    const ndLight = ok(f.netDebt) && f.netDebt <= 0 ? "green" : !ok(nd) ? "grey" : nd <= 3 ? "green" : nd <= 4 ? "orange" : "red";
    const covLight = ok(f.netDebt) && f.netDebt <= 0 ? "green" : !ok(cov) ? "grey" : cov >= 3 ? "green" : cov >= 1.5 ? "orange" : "red";
    const liqLight = !ok(f.fr) ? "grey" : f.fr >= 0 && ok(f.tresoNette) && f.tresoNette >= 0 ? "green" : f.fr >= 0 || (ok(f.tresoNette) && f.tresoNette >= 0) ? "orange" : "red";
    const stShare = f.debtLT + f.debtST > 0 ? f.debtST / (f.debtLT + f.debtST) : null;
    const checks = `<div class="checks">
      <div>${light(ndLight)}<b>Dette nette / EBE : ${ok(f.netDebt) && f.netDebt <= 0 ? "trésorerie nette" : X(nd)}</b>
        <span>Capacité de remboursement : environ 3× au plus. ${bench(st, "ndEbitda", nd, X, false)}</span></div>
      <div>${light(covLight)}<b>Résultat d'exploitation / frais financiers : ${X(cov)}</b>
        <span>Couverture des intérêts : au moins 3×. ${bench(st, "coverage", cov, X)}</span></div>
      <div>${light(liqLight)}<b>Liquidité : fonds de roulement ${M(f.fr)}, trésorerie nette ${M(f.tresoNette)}</b>
        <span>Les ressources stables doivent couvrir les emplois stables ; dettes à court terme ${ok(stShare) ? P(stShare) + " de la dette financière" : "—"}.</span></div>
      <div>${light(!ok(fcfAfter) ? "grey" : fcfAfter >= 0 ? "green" : "red")}<b>Flux disponible après frais financiers : ${M(fcfAfter)}</b>
        <span>Positif : l'exploitation finance ses investissements et ses intérêts ; négatif : il faut s'endetter ou augmenter le capital.</span></div>
    </div>`;
    const ys = state.meta.years;
    const fs = ys.map((_, j) => figures(c, j));
    const idx = ys.map((_, j) => j).filter((j) => ok(fs[j].cfo));
    let table = "";
    if (idx.length) {
      const cell = (fn) => idx.map((j) => `<td>${fn(fs[j], j)}</td>`).join("");
      const dBfr = (j) => (j > 0 && ok(fs[j].bfr) && ok(fs[j - 1].bfr) ? fs[j].bfr - fs[j - 1].bfr : null);
      table = `<div class="tablewrap"><table><thead><tr><th class="l"></th>${idx.map((j) => `<th>${ys[j]}</th>`).join("")}</tr></thead><tbody>
        <tr><td class="l">Capacité d'autofinancement (CAF)</td>${cell((x, j) => M(ok(dBfr(j)) ? x.cfo + dBfr(j) : null))}</tr>
        <tr><td class="l">− variation du BFR</td>${cell((x, j) => M(ok(dBfr(j)) ? -dBfr(j) : null))}</tr>
        <tr><td class="l"><b>= Flux de trésorerie d'exploitation</b></td>${cell((x) => `<b>${M(x.cfo)}</b>`)}</tr>
        <tr><td class="l">− investissements industriels</td>${cell((x) => M(ok(x.capex) ? -x.capex : null))}</tr>
        <tr><td class="l"><b>= Flux disponible</b></td>${cell((x) => `<b>${M(x.fcf)}</b>`)}</tr>
        <tr><td class="l">− dividendes</td>${cell((x) => M(ok(x.div) ? -x.div : null))}</tr>
        <tr><td class="l">+ augmentations de capital − rachats</td>${cell((x) => M((x.issue || 0) - (x.buyback || 0)))}</tr>
        <tr><td class="l"><b>Dette nette en fin d'année</b></td>${cell((x) => `<b>${M(x.netDebt)}</b>`)}</tr>
      </tbody></table></div>`;
    }
    const liq = (v) => (ok(v) ? nf1.format(v) : "—");
    const liquidity = `<div class="kpis">
      ${kpi("Liquidité générale", liq(f.liqGen), `<small class="bench">actif circulant / passif à court terme ; > 1 attendu</small>`)}
      ${kpi("Liquidité réduite", liq(f.liqRed), `<small class="bench">hors stocks</small>`)}
      ${kpi("Liquidité immédiate", liq(f.liqImm), `<small class="bench">trésorerie / passif à court terme</small>`)}
      ${kpi("Levier financier (D / CP)", ok(f.de) ? nf1.format(f.de) : "—")}
    </div>`;
    return step(3, "Le financement", "autofinancement, capitaux propres, dette", card("Repères de solvabilité et de liquidité", "", checks,
      "Repères usuels de l'analyse financière : les connaître, mais toujours les replacer dans le contexte du secteur.") +
      (table ? card("Approche dynamique : tableau de financement", `M ${c.cur}`, table,
        "La CAF est reconstituée à partir des flux publiés (flux d'exploitation + variation du BFR). Les investissements sont financés d'abord par le flux disponible, puis, compte tenu de la distribution, par augmentation de capital ou endettement.") : "") +
      cashFlow(f, c.cur) +
      card("Approche statique : liquidité", "", liquidity, "Le risque d'illiquidité s'apprécie en comparant les échéances des dettes à la vitesse de transformation des actifs en trésorerie.") +
      financialBalance(f, c.cur));
  }

  // ---------- Étape 4 : la rentabilité ----------
  function step4(c, f, i, st) {
    const sg = (v, u = " pts") => `<span class="${ok(v) ? (v >= 0 ? "pos" : "neg") : ""}">${ok(v) ? (v >= 0 ? "+" : "") + nf1.format(v * 100) + u : "—"}</span>`;
    const kpis = `<div class="kpis">
      ${kpi("ROCE après IS", P(f.roce), bench(st, "roce", f.roce, P))}
      ${kpi("Rentabilité des capitaux propres", P(f.roe), bench(st, "roe", f.roe, P))}
      ${kpi("Intensité capitalistique", ok(f.intensity) ? nf1.format(f.intensity) : "—", `<small class="bench">actif économique / CA = 1 / rotation</small>`)}
    </div>`;
    return step(4, "La rentabilité", "rentabilité économique, effet de levier, distribution", kpis + leverage(f) +
      history(c) + dividends(c, f, i, st));
  }

  // ---------- Coût du capital selon l'endettement (graphique du Vernimmen) ----------
  // k_CP = rf + bêta d'actif × (1 + (1 − IS) × D/CP) × prime ; k_D = rf + marge de crédit croissante avec la dette ;
  // CMPC = (k_CP × CP + k_D × (1 − IS) × D) / (CP + D). Le levier fait monter le coût des fonds propres mais pas le CMPC.
  function costChart(f) {
    const rf = f.rates.rf / 100, prm = f.rates.prm / 100, t = f.tUsed ?? 0.25, ba = f.betaA;
    const cur = ok(f.de) ? f.de : null;
    const xMax = Math.max(1.5, Math.min(4, ok(cur) ? cur * 1.4 : 0));
    const kE = (d) => rf + ba * (1 + (1 - t) * d) * prm;
    const kD = (d) => rf + 0.01 + 0.025 * d;               // marge de crédit indicative : 1 % + 2,5 % par unité de D/CP
    const kDat = (d) => kD(d) * (1 - t);
    const wacc = (d) => (kE(d) + kDat(d) * d) / (1 + d);
    const W = 460, H = 230, L = 40, R = 92, T = 10, B = 30;
    const roceIn = ok(f.roce) && f.roce <= Math.max(0.3, kE(xMax) * 1.6);
    const yMax = Math.max(0.12, Math.max(kE(xMax), roceIn ? f.roce : 0) * 1.15), yMin = 0;
    const sx = (v) => L + v / xMax * (W - L - R), sy = (v) => T + (yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin) * (H - T - B);
    const line = (fn) => Array.from({ length: 41 }, (_, k) => k / 40 * xMax).map((d) => `${sx(d).toFixed(1)},${sy(fn(d)).toFixed(1)}`).join(" ");
    let g = "";
    const ys = []; for (let v = 0; v <= yMax + 1e-9; v += yMax > 0.2 ? 0.05 : 0.02) ys.push(v);
    for (const v of ys) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 4}" y="${sy(v) + 3}" text-anchor="end">${nf0.format(v * 100)} %</text>`;
    for (let d = 0; d <= xMax + 1e-9; d += xMax > 2 ? 1 : 0.5) g += `<text class="ax" x="${sx(d)}" y="${H - B + 13}" text-anchor="middle">${nf1.format(d)}</text>`;
    g += `<text class="ax" x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">Dette nette / capitaux propres</text>`;
    const lab = (fn, txt, cls) => `<text class="cl ${cls}" x="${W - R + 4}" y="${sy(fn(xMax)) + 4}">${txt}</text>`;
    g += `<polyline class="c-ke" points="${line(kE)}"/>${lab(kE, "fonds propres", "c-ke")}`;
    g += `<polyline class="c-w" points="${line(wacc)}"/>${lab(wacc, "CMPC", "c-w")}`;
    g += `<polyline class="c-kd" points="${line(kDat)}"/>${lab(kDat, "dette après IS", "c-kd")}`;
    if (ok(f.roce)) g += roceIn ? `<line class="c-roce" x1="${L}" x2="${W - R}" y1="${sy(f.roce)}" y2="${sy(f.roce)}"/><text class="cl" x="${L + 4}" y="${sy(f.roce) - 4}">ROCE après IS ${P(f.roce)}</text>`
      : `<text class="cl" x="${L + 4}" y="${T + 10}">↑ ROCE après IS ${P(f.roce)}, hors cadre</text>`;
    if (ok(cur) && cur <= xMax) g += `<line class="guide" x1="${sx(cur)}" x2="${sx(cur)}" y1="${T}" y2="${H - B}"/><circle class="c-dot" cx="${sx(cur)}" cy="${sy(wacc(cur))}" r="4.5"/>
      <circle class="c-dot ke" cx="${sx(cur)}" cy="${sy(kE(cur))}" r="4.5"/><text class="cl" x="${sx(cur) + 5}" y="${T + 24}">la société</text>`;
    return `<h4 class="sub">Coût du capital selon l'endettement</h4>
      <svg class="cost-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Coût des fonds propres, coût de la dette et coût moyen pondéré du capital en fonction de l'endettement">${g}</svg>
      <p class="note">Plus la dette est lourde, plus les actionnaires exigent une rentabilité élevée (le risque de leurs titres augmente) :
        la dette, moins chère, est compensée par des fonds propres plus chers et le CMPC reste presque plat — il ne baisse que de l'économie d'impôt sur les intérêts,
        avant de remonter quand le risque de défaut renchérit la dette. L'endettement ne crée donc pas de valeur par lui-même : seul compte l'écart entre ROCE et CMPC.
        Marge de crédit indicative (1 % + 2,5 % par unité d'endettement).</p>`;
  }

  // ---------- Partie 1, conclusion : création de valeur (actionnaire) et solvabilité (prêteur) ----------
  function conclusion(c, f, i, st, V) {
    const cur = esc(c.cur);
    const sg = (v) => `<span class="${ok(v) ? (v >= 0 ? "pos" : "neg") : ""}">${ok(v) ? (v >= 0 ? "+" : "") + nf1.format(v * 100) + " pts" : "—"}</span>`;
    const SRC = { roc: "résultat opérationnel courant publié", retraite: "résultat publié + dépréciations − plus-values de cession",
      moyenne: "marge d'exploitation moyenne sur 3 ans (résultat normatif)", publie: "résultat publié (aucun élément non récurrent identifiable)" };
    const share = `<div class="kpis">
        ${kpi("ROCE courant après IS", P(f.roce), `<small class="bench">${esc(SRC[f.ebitSrc] || "")}</small>` + bench(st, "roce", f.roce, P))}
        ${kpi("ROCE sur le résultat publié", P(f.roceReported), `<small class="bench">écart : éléments non récurrents</small>`)}
        ${kpi("Coût du capital (CMPC)", P(f.k), `<small class="bench">${nf1.format(f.rates.rf)} % + bêta d'actif ${d2(f.betaA)} × ${nf1.format(f.rates.prm)} %</small>`)}
        ${kpi("ROCE − coût du capital", sg(f.spread))}
        ${kpi(`Valeur créée ${state.meta.years[i]} (M ${cur})`, `<span class="${ok(f.eva) ? (f.eva >= 0 ? "pos" : "neg") : ""}">${M(f.eva)}</span>`, `<small class="bench">(ROCE − CMPC) × capitaux employés</small>`)}
        ${kpi("ROE", P(f.roe), bench(st, "roe", f.roe, P))}
        ${kpi("Coût des fonds propres", P(f.kE), `<small class="bench">bêta des actions ${d2(f.betaE)} (réendetté)</small>`)}
        ${kpi("ROE − coût des fonds propres", sg(f.roeSpread))}
      </div>
      ${costChart(f)}
      <p class="note">Taux sans risque <input class="param" type="number" step="0.1" min="0" max="20" data-param="rf" value="${params.rf ?? ""}" placeholder="${nf1.format(f.rates.rf)}"> %
        (${esc(f.rates.rfInfo)}) · prime de risque <input class="param" type="number" step="0.1" min="0" max="20" data-param="prm" value="${params.prm ?? ""}" placeholder="${nf1.format(f.rates.prm)}"> %
        (${esc(f.rates.prmInfo)}) · bêta d'actif du secteur ${d2(f.betaA)} (${esc(f.rates.betaInfo)}).
        ${f.rates.forced ? `<b>Valeurs forcées à la main.</b> <button class="chip" data-reset-rates="1">Revenir aux valeurs de référence</button>` : `Valeurs de référence mises à jour automatiquement${f.rates.updated ? ` (le ${new Date(f.rates.updated).toLocaleDateString("fr-FR")})` : ""} ; saisir un chiffre pour le forcer.`}</p>`;
    const lend = `<div class="kpis">
        ${kpi("Dette nette / EBE", ok(f.netDebt) && f.netDebt <= 0 ? "trésorerie nette" : X(f.ndEbitda), `<small class="bench">repère ≤ 3×</small>`)}
        ${kpi("Couverture des frais financiers", X(f.coverage), `<small class="bench">résultat d'exploitation / frais financiers, repère ≥ 3×</small>`)}
        ${kpi("Flux de trésorerie disponible", M(f.fcf), `<small class="bench">M ${cur}</small>`)}
        ${kpi("Liquidité générale", X(f.liqGen), `<small class="bench">actif circulant / dettes à court terme</small>`)}
        ${kpi("Altman Z''", ok(f.zScore) ? nf1.format(f.zScore) : "—", `<small class="bench">> 2,6 risque faible ; < 1,1 risque élevé</small>`)}
      </div>`;
    return {
      share: card("Création de valeur : rentabilité économique et coût du capital", "",
        (f.nrRepeat ? `<p class="note warn">⚠ Des éléments « non récurrents » sont retirés trois années de suite : ils font partie de l'activité. Le ROCE sur le résultat publié (${P(f.roceReported)}) est ici le plus prudent.</p>` : "") + share,
        `Une entreprise crée de la valeur quand sa rentabilité économique après impôt (ROCE) dépasse le coût moyen pondéré du capital (CMPC) exigé par
         actionnaires et prêteurs. Le ROCE se juge sur le résultat d'exploitation courant, hors éléments réellement exceptionnels (dépréciations, plus-values
         de cession), avec un taux d'impôt normatif (moyenne sur 3 ans) et des capitaux employés moyens. L'effet de levier augmente le ROE mais aussi le coût des fonds propres (bêta réendetté) : il ne crée pas de valeur.`),
      lend: card("Solvabilité et liquidité", "", lend,
        "Solvabilité : la dette se rembourse par l'exploitation (dette nette / EBE, couverture des intérêts, flux disponible). Liquidité : les échéances des dettes face à la vitesse de transformation des actifs en trésorerie. Le détail (tableau de flux, bilan) est dans l'étape 3."),
    };
  }

  // ---------- Partie 2 : le marché paie-t-il déjà la valeur créée ? ----------
  // Verdict « Marché » : d'abord la VE / capitaux employés observée face à celle que justifie la rentabilité
  // (ROCE / coût du capital, sans croissance), puis le PER face à la médiane du secteur en confirmation.
  // Les flux actualisés ne sont qu'une information : trop sensibles aux hypothèses (banc d'essai historique).
  // Médiane du marché (hors banques) de VE/CE observée ÷ VE/CE justifiée, chez les sociétés qui créent de la valeur :
  // même les meilleures paient une croissance future, le repère est donc la place, pas 1×.
  const relCache = {};
  function marketRel(i) {
    if (i in relCache) return relCache[i];
    const a = [];
    for (const c of state.companies) {
      if (c.s === "finance") continue;
      const f = figures(c, i);
      if (ok(f.vae) && ok(f.vaeTh) && f.vaeTh > 0 && ok(f.spread) && f.spread >= 0) a.push(f.vae / f.vaeTh);
    }
    a.sort((x, y) => x - y);
    return (relCache[i] = a.length >= 50 ? a[a.length >> 1] : null);
  }
  function marketVerdict(c, f, i, st) {
    if (!ok(f.mcap)) return ["grey", "Pas de cours de Bourse disponible pour cette société : la question reste ouverte."];
    const fv = fairValue(c, f, i, st);
    const vals = [fv.sector, fv.dcf].filter(ok);
    const gap = vals.length ? f.mcap / (vals.reduce((x, y) => x + y, 0) / vals.length) - 1 : null;
    const perMed = st.per && st.per.sorted.length >= 5 ? st.per.median : null;
    const perRel = ok(f.per) && ok(perMed) && perMed > 0 ? f.per / perMed : null;
    const rel = ok(f.vae) && ok(f.vaeTh) && f.vaeTh > 0 ? f.vae / f.vaeTh : null;
    const obs = ok(f.vae) ? `VE / capitaux employés ${X(f.vae)}${ok(f.vaeTh) && f.vaeTh > 0 ? ` pour ${X(f.vaeTh)} justifiés par la rentabilité` : ""}` : "VE / capitaux employés inconnue";
    const per = ok(f.per) ? ` ; PER ${X(f.per)}${ok(perMed) ? ` (secteur ${X(perMed)})` : ""}` : ok(f.ni) && f.ni <= 0 ? " ; pas de PER (perte)" : "";
    const info = ok(gap) ? ` Pour information, l'actualisation des flux et le multiple du secteur placent le cours ${gap <= 0 ? nf0.format(-gap * 100) + " % sous" : nf0.format(gap * 100) + " % au-dessus de"} leur valeur estimée.` : "";
    if (!ok(f.spread) || !ok(f.vae)) return ["grey", obs + per + "." + info];
    if (f.vae <= 0) return ["grey", `Valeur d'entreprise négative : la trésorerie déclarée dépasse la capitalisation (souvent une activité de financement consolidée, comme une banque captive). Le ratio n'est pas exploitable${per}.`];
    let s, head;
    const med = marketRel(i);
    const place = ok(med) && ok(rel) && ok(f.spread) && f.spread >= 0 ? ` Elle cote ${X(rel)} son multiple justifié, contre ${X(med)} pour la médiane de la place.` : "";
    if (f.spread >= 0 && ok(rel)) {
      const r = rel / (med || 1.8);
      if (r < 0.6) { s = "green"; head = "<b>Prix raisonnable :</b> elle crée de la valeur et le marché la paie nettement moins cher que les autres sociétés rentables."; }
      else if (r > 1.5) { s = "red"; head = "<b>Prix élevé :</b> le marché paie sa rentabilité bien plus cher que la moyenne ; il parie sur une forte croissance."; }
      else { s = "orange"; head = "<b>Prix dans la norme</b> de la place pour la valeur qu'elle crée."; }
    } else if (f.vae > 1) { s = "red"; head = "<b>Prix élevé :</b> elle ne couvre pas son coût du capital et le marché la paie pourtant plus que ses capitaux employés ; il parie sur un redressement."; }
    else { s = "orange"; head = "<b>Prix bas mais cohérent :</b> elle détruit de la valeur, le marché la paie moins que ses capitaux employés."; }
    // Confirmation par le PER : un PER très éloigné du secteur tempère le feu d'un cran.
    let conf = "";
    const plain = (h) => h.replace(/^<b>[^<]*<\/b>\s*/, "");
    if (s === "green" && (ok(f.ni) && f.ni <= 0 || ok(perRel) && perRel > 1.2)) { s = "orange"; head = "<b>Signaux partagés :</b> " + plain(head); conf = " Mais le PER, nettement au-dessus du secteur, ne confirme pas."; }
    else if (s === "red" && ok(perRel) && perRel < 0.7) { s = "orange"; head = "<b>Signaux partagés :</b> " + plain(head); conf = " Mais le PER, nettement sous le secteur, tempère ce jugement."; }
    else if (ok(perRel)) conf = perRel < 0.8 ? " Le PER, sous le secteur, va dans le même sens." : perRel > 1.2 ? " Le PER est au-dessus du secteur." : "";
    return [s, `${head} ${obs}${per}.${place}${conf}${info}`];
  }
  function marketCard(c, f, i, st, mv) {
    const cur = esc(c.cur);
    return card("Le prix de marché face à la valeur créée", "", `<div class="kpis">
        ${kpi("VE / capitaux employés", X(f.vae), `<small class="bench">${ok(f.vaeTh) ? `justifié sans croissance : ROCE / CMPC = ${X(f.vaeTh)}` : "valeur de marché / capitaux employés"}</small>` + bench(st, "vae", f.vae, X, false))}
        ${kpi(`Valeur créée selon le marché (M ${cur})`, `<span class="${ok(f.mva) ? (f.mva >= 0 ? "pos" : "neg") : ""}">${M(f.mva)}</span>`, `<small class="bench">VE − capitaux employés</small>`)}
        ${kpi("Capitalisation / capitaux propres (PBR)", X(f.pbr), `<small class="bench">${ok(f.roe) && f.kE > 0 ? `justifié sans croissance : ROE / coût des fonds propres = ${X(f.roe / f.kE)}` : ""}</small>`)}
      </div>${valueBar(c, f, fairValue(c, f, i, st))}`,
      `Si l'entreprise crée de la valeur, sa valeur d'entreprise doit dépasser ses capitaux employés : sans croissance, VE / capitaux employés ≈ ROCE / CMPC,
       et côté actionnaire capitalisation / capitaux propres ≈ ROE / coût des fonds propres. Un multiple observé bien supérieur signifie que le marché paie
       déjà une croissance future ; bien inférieur, qu'il doute de la pérennité de la rentabilité, ou qu'il y a une opportunité.`);
  }


  // ---------- Étape 4 (suite) : la politique de distribution ----------
  // Série longue du dividende par action (c.dh, préparée par collect/dividends.py) :
  // y0 = première année, v = montants ajustés des divisions d'actions, h = hausses consécutives,
  // sb = années sans baisse, cp = série de hausses qui remonte au début de l'historique,
  // e = années estimées sur neuf mois, sp = années de division d'actions.
  function dpsSeries(c) {
    const d = c.dh;
    if (!d || !d.v) return [];
    return d.v.map((v, k) => ({ y: d.y0 + k, v, est: (d.e || []).includes(d.y0 + k), split: (d.sp || []).includes(d.y0 + k) }));
  }
  function streakLabel(c) {
    const d = c.dh;
    if (!d) return null;
    const rows = dpsSeries(c).filter((r) => ok(r.v));
    const last = rows.length ? rows[rows.length - 1] : null;
    const lastYear = state.meta.years[state.meta.years.length - 1];
    if (!last || last.v <= 0) return { light: "grey", txt: "Pas de dividende au dernier exercice connu.", n: 0 };
    if (last.y < lastYear - 1) return { light: "grey", txt: `Dernier dividende par action publié en ${last.y} : série interrompue ou non déclarée depuis.`, n: 0 };
    const n = d.h, first = rows[0].y;
    const plus = d.cp ? "au moins " : "";
    let tier = "";
    if (n >= 25) tier = "<b>aristocrate du dividende</b> (25 ans de hausse ou plus)";
    else if (n >= 10 && d.cp) tier = `en hausse chaque année depuis le début de l'historique (${first}) : <b>candidat aristocrate</b>, la série réelle est sans doute plus longue (à vérifier dans les rapports annuels antérieurs)`;
    else if (n >= 10) tier = "dividende <b>régulièrement relevé</b> (10 ans ou plus)";
    else if (n >= 5) tier = "dividende en progression (5 à 9 ans)";
    else if (n >= 1) tier = "hausses récentes";
    else tier = d.sb >= 3 ? `pas de hausse au dernier exercice, mais pas de baisse depuis ${d.sb} ans` : "dividende baissé ou stable au dernier exercice";
    return {
      light: n >= 10 ? "green" : n >= 3 || d.sb >= 5 ? "orange" : "red", n,
      txt: n ? `${plus}${n} hausse${n > 1 ? "s" : ""} consécutive${n > 1 ? "s" : ""} du dividende par action : ${tier}.` : tier.charAt(0).toUpperCase() + tier.slice(1) + ".",
    };
  }
  function dpsChart(c) {
    const rows = dpsSeries(c);
    const vals = rows.filter((r) => ok(r.v));
    if (vals.length < 2) return "";
    const W = 640, H = 170, padL = 40, padB = 20, top = 10;
    const hi = Math.max(...vals.map((r) => r.v)) * 1.08 || 1;
    const bw = (W - padL - 6) / rows.length;
    const y = (v) => top + (1 - v / hi) * (H - padB - top);
    let prev = null;
    const bars = rows.map((r, k) => {
      const x = padL + k * bw + bw * 0.15, w = bw * 0.7;
      const lbl = `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" class="ax">${rows.length > 14 ? String(r.y).slice(2) : r.y}</text>`;
      if (!ok(r.v)) { prev = null; return lbl; }
      const down = ok(prev) && r.v < prev * 0.995;
      const col = down ? "var(--bad)" : "var(--bar1)";
      prev = r.v;
      return `<rect x="${x}" y="${y(r.v)}" width="${w}" height="${Math.max(0.5, y(0) - y(r.v))}" fill="${col}" ${r.est ? `fill-opacity=".45" stroke="${col}" stroke-dasharray="3 2"` : ""}><title>${r.y} : ${nf2.format(r.v)}${r.est ? " (estimé sur 9 mois)" : ""}${r.split ? " · division d'actions" : ""}</title></rect>` +
        (r.split ? `<text x="${x + w / 2}" y="${y(r.v) - 3}" text-anchor="middle" class="ax">÷</text>` : "") + lbl;
    }).join("");
    const grid = [0.5, 1].map((t) => `<line x1="${padL}" x2="${W}" y1="${y(hi / 1.08 * t)}" y2="${y(hi / 1.08 * t)}" stroke="var(--line)"/><text x="${padL - 4}" y="${y(hi / 1.08 * t) + 4}" text-anchor="end" class="ax">${(hi / 1.08 * t).toFixed(2).replace(".", ",")}</text>`).join("");
    return `<svg class="dps-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dividende par action, ${rows[0].y}–${rows[rows.length - 1].y}">${grid}${bars}</svg>`;
  }
  function dpsCagr(c, n) {
    const rows = dpsSeries(c).filter((r) => ok(r.v) && r.v > 0);
    if (rows.length < 2) return null;
    const last = rows[rows.length - 1], first = rows.find((r) => r.y >= last.y - n);
    return first && last.y > first.y ? Math.pow(last.v / first.v, 1 / (last.y - first.y)) - 1 : null;
  }

  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const DPS = (v) => (ok(v) ? nf2.format(v) : "—");
  function dividends(c, f, i, st) {
    if (!ok(f.div) && !ok(f.buyback) && !c.dh) return card("Politique de distribution", "", `<p class="note">Aucun dividende ni rachat d'actions publié pour cet exercice.</p>`);
    const sk = streakLabel(c);
    const g5 = dpsCagr(c, 5), g10 = dpsCagr(c, 10);
    const payLight = !ok(f.div) || f.div === 0 ? "grey" : !ok(f.payout) ? "red" : f.payout <= 0.6 ? "green" : f.payout <= 0.9 ? "orange" : "red";
    const covLight = !ok(f.divCover) ? "grey" : f.divCover >= 1.5 ? "green" : f.divCover >= 1 ? "orange" : "red";
    const growLight = !ok(f.sustGrowth) || !ok(g5) ? "grey" : f.sustGrowth >= g5 ? "green" : f.sustGrowth >= g5 / 2 ? "orange" : "red";
    const checks = `<div class="checks">
      <div>${light(payLight)}<b>Taux de distribution : ${ok(f.payout) ? P(f.payout) : ok(f.div) && f.div > 0 ? "bénéfice nul ou négatif" : "—"}</b>
        <span>Dividendes versés / résultat net part du groupe. Au-delà de 60 à 70 %, peu de marge en cas de recul des bénéfices (sauf foncières, services aux collectivités). ${bench(st, "payout", f.payout, P, false)}</span></div>
      <div>${light(covLight)}<b>Couverture par le flux disponible : ${X(f.divCover)}</b>
        <span>Flux disponible (exploitation − investissements) / dividendes. Sous 1×, le dividende est payé par la dette, la trésorerie ou des cessions. ${bench(st, "divCover", f.divCover, X)}</span></div>
      <div>${light(growLight)}<b>Croissance soutenable : ${P(f.sustGrowth)}</b>
        <span>ROE ${P(f.roe)} × (1 − ${ok(f.payout) ? P(f.payout) : "0 %"}) : croissance que les bénéfices mis en réserve permettent sans emprunter davantage ni augmenter le capital.
          ${ok(f.roe) && f.roe > 0.4 ? "ROE très élevé, souvent dû à des capitaux propres réduits par les rachats d'actions : la croissance soutenable est alors surestimée." : ""}
          ${ok(g5) ? `Le dividende par action a crû de ${P(g5)} par an sur 5 ans${ok(g10) ? ` (${P(g10)} sur 10 ans)` : ""} : ${f.sustGrowth >= g5 ? "rythme tenable" : "rythme supérieur à ce que la rentabilité autofinance, le taux de distribution va monter"}.` : ""}</span></div>
      ${sk ? `<div>${light(sk.light)}<b>Série des hausses : ${sk.n ? (c.dh.cp ? "≥ " : "") + sk.n + " an" + (sk.n > 1 ? "s" : "") : "—"}</b><span>${sk.txt}</span></div>` : ""}
    </div>`;
    const kpis = `<div class="kpis">
      ${kpi(`Dividende par action (${esc(c.cur)})`, DPS(f.dps), ok(dpsCagr(c, 5)) ? `<small class="bench">${P(dpsCagr(c, 5))} par an sur 5 ans</small>` : "")}
      ${kpi(`Dividendes versés (M ${esc(c.cur)})`, M(f.div))}
      ${kpi(`Rachats d'actions (M ${esc(c.cur)})`, M(f.buyback))}
      ${kpi("Distribution totale / résultat net", P(f.totalPayout), `<small class="bench">dividendes + rachats</small>`)}
      ${kpi("Rendement du dividende", P(f.divYield), bench(st, "divYield", f.divYield, P))}
      ${kpi("Rendement total pour l'actionnaire", P(f.totalYield), `<small class="bench">(dividendes + rachats) / capitalisation</small>` + bench(st, "totalYield", f.totalYield, P))}
    </div>`;
    const ys = state.meta.years;
    const fs = ys.map((_, j) => figures(c, j));
    const idx = ys.map((_, j) => j).filter((j) => ok(fs[j].div) || ok(fs[j].buyback));
    const table = idx.length > 1 ? `<div class="tablewrap"><table><thead><tr><th class="l"></th>${idx.map((j) => `<th>${ys[j]}</th>`).join("")}</tr></thead><tbody>
      <tr><td class="l">Résultat net part du groupe</td>${idx.map((j) => `<td>${M(fs[j].ni)}</td>`).join("")}</tr>
      <tr><td class="l">Dividendes versés</td>${idx.map((j) => `<td>${M(fs[j].div)}</td>`).join("")}</tr>
      <tr><td class="l">Rachats d'actions</td>${idx.map((j) => `<td>${M(fs[j].buyback)}</td>`).join("")}</tr>
      <tr><td class="l">Taux de distribution</td>${idx.map((j) => `<td>${P(fs[j].payout)}</td>`).join("")}</tr>
      <tr><td class="l">Distribution totale / résultat net</td>${idx.map((j) => `<td>${P(fs[j].totalPayout)}</td>`).join("")}</tr>
      <tr><td class="l">Flux disponible / dividendes</td>${idx.map((j) => `<td>${X(fs[j].divCover)}</td>`).join("")}</tr>
      <tr><td class="l">Croissance soutenable</td>${idx.map((j) => `<td>${P(fs[j].sustGrowth)}</td>`).join("")}</tr>
      <tr><td class="l">Dividende par action (${esc(c.cur)})</td>${idx.map((j) => `<td>${DPS(fs[j].dps)}</td>`).join("")}</tr>
    </tbody></table></div>` : "";
    const rows = dpsSeries(c).filter((r) => ok(r.v));
    const chart = dpsChart(c);
    const src = c.c === "US" ? "déclarations XBRL à la SEC, depuis 2007" : c.id.includes("-SEC") ? "rapports 20-F / 40-F à la SEC" : "rapports ESEF, depuis 2020 environ";
    const chartCard = chart ? card(`Dividende par action, ${rows[0].y}–${rows[rows.length - 1].y}`, c.cur, chart,
      `Source : ${src}. Montants ramenés au nombre d'actions actuel (÷ : division d'actions détectée). En rouge : baisse ; en pointillé : année estimée à partir des trois premiers trimestres.
       Les déclarations XBRL ne remontent pas avant 2007 : une série « ≥ » peut être plus longue en réalité. Les dividendes exceptionnels et les scissions peuvent créer de fausses hausses ou baisses.`) : "";
    return card("Politique de distribution", "", checks + kpis,
      "Le dividende rémunère l'actionnaire mais réduit l'autofinancement : un taux de distribution élevé limite la croissance que l'entreprise peut financer seule. Les rachats d'actions sont une autre forme de distribution, plus souple (pas d'engagement de régularité).") +
      chartCard + (table ? card("Distribution année par année", `M ${c.cur}`, table) : "");
  }

  // ---------- Valorisation ----------
  function valuation(c, f, i, st) {
    const mv = marketVerdict(c, f, i, st);
    if (!ok(f.ebitda) || f.ebitda <= 0) return step("€", "Le marché la paie-t-il déjà ?", "prix de marché face à la valeur créée",
      marketCard(c, f, i, st, mv) + `<div class="card"><p class="note">EBE négatif ou inconnu : pas de valorisation par multiple possible.</p></div>`);
    const secMult = st.evEbitda && ok(st.evEbitda.median) && st.evEbitda.sorted.length >= 5 ? st.evEbitda.median : null;
    const mult = ok(params.mult) && params.mult > 0 ? params.mult : ok(secMult) ? Math.round(secMult * 10) / 10 : 7;
    const ev = mult * f.ebitda;
    const equity = ok(f.netDebt) ? ev - f.netDebt : null;
    const own = ok(f.evEbitda) ? ` · société elle-même en Bourse : ${X(f.evEbitda)}` : "";
    const pd = state.meta.price_date && state.meta.price_date[c.c];
    const market = ok(f.mcap) ? `<h4 class="sub">En Bourse ${f.mcapLive && pd ? `au ${new Date(pd).toLocaleDateString("fr-FR")}` : "(capitalisation déclarée à la SEC)"}</h4>
      <div class="kpis">
        ${kpi(`Capitalisation (M ${esc(c.cur)})`, M(f.mcap), c.px ? `<small class="bench">cours ${nf1.format(c.px[0])} × ${nf0.format(c.px[1] / 1e6)} M d'actions</small>` : "")}
        ${kpi("Valeur d'entreprise", M(f.ev))}
        ${kpi("PER", X(f.per), bench(st, "per", f.per, X, false))}
        ${kpi("VE / EBE", X(f.evEbitda), bench(st, "evEbitda", f.evEbitda, X, false))}
        ${kpi("VE / CA", X(f.evSales), bench(st, "evSales", f.evSales, X, false))}
        ${kpi("Rendement du flux disponible", P(f.fcfYield), bench(st, "fcfYield", f.fcfYield, P))}
        ${kpi("Rendement du dividende", P(f.divYield), bench(st, "divYield", f.divYield, P))}
      </div><h4 class="sub">Valeur au multiple du secteur</h4>` : "";
    const body = market + `<div class="kpis">
        ${kpi("Multiple VE / EBE retenu", `<input class="param" type="number" step="0.5" min="0" max="60" data-param="mult" value="${mult}">×`,
          `<small class="bench">médiane du secteur ${ok(secMult) ? X(secMult) : "indisponible"}${own}</small>`)}
        ${kpi(`Valeur d'entreprise (M ${esc(c.cur)})`, M(ev))}
        ${kpi("− dette nette", M(f.netDebt))}
        ${kpi(`= valeur des titres (M ${esc(c.cur)})`, M(equity))}
      </div>`;
    return step("€", "Le marché la paie-t-il déjà ?", "prix de marché face à la valeur créée, multiples", marketCard(c, f, i, st, mv) + card("Cours, multiples et valeur au multiple du secteur", "", body,
      `Valeur d'entreprise = multiple × EBE ; on retranche la dette nette pour obtenir la valeur des titres. Multiples sectoriels :
       médiane des sociétés cotées du secteur (capitalisation au dernier cours connu + dette nette) / EBE. Une valeur des titres
       supérieure à la capitalisation suggère une décote par rapport au secteur, à confirmer par l'analyse des 4 étapes.`));
  }

  // ---------- Scores de qualité ----------
  // Piotroski F-score : 9 critères binaires comparant l'exercice au précédent.
  function piotroski(c, i) {
    const f = figures(c, i), p = figures(c, i - 1);
    const gm = (x) => (ok(x.gp) && ok(x.rev) && x.rev > 0 ? x.gp / x.rev : ok(x.ebitdaMargin) ? x.ebitdaMargin : null);
    const lev = (x) => (ok(x.A) && x.A > 0 ? x.debtLT / x.A : null);
    const turn = (x) => (ok(x.rev) && ok(x.A) && x.A > 0 ? x.rev / x.A : null);
    const test = (a, b) => (ok(a) && ok(b) ? a : null);
    const crit = [
      ["Rentabilité", "Résultat net positif (ROA > 0)", ok(f.roa) ? f.roa > 0 : null],
      ["Rentabilité", "Flux de trésorerie d'exploitation positif", ok(f.cfo) ? f.cfo > 0 : null],
      ["Rentabilité", "ROA en hausse sur un an", ok(f.roa) && ok(p.roa) ? f.roa > p.roa : null],
      ["Rentabilité", "Flux d'exploitation supérieur au résultat net (bénéfice de qualité)", ok(f.cfo) && ok(f.ni) ? f.cfo > f.ni : null],
      ["Structure", "Dette long terme / actif en baisse", ok(lev(f)) && ok(lev(p)) && f.debtKnown ? lev(f) <= lev(p) : null],
      ["Structure", "Liquidité générale en hausse", ok(f.liqGen) && ok(p.liqGen) ? f.liqGen > p.liqGen : null],
      ["Structure", "Pas d'augmentation de capital significative", ok(f.issue) && ok(f.eq) && f.eq > 0 ? f.issue <= 0.02 * f.eq : (ok(f.cff) ? true : null)],
      ["Efficacité", ok(f.gp) ? "Marge brute en hausse" : "Marge d'EBE en hausse (marge brute non publiée)", test(gm(f), gm(p)) !== null ? gm(f) > gm(p) : null],
      ["Efficacité", "Rotation de l'actif (CA / actif) en hausse", ok(turn(f)) && ok(turn(p)) ? turn(f) > turn(p) : null],
    ];
    const known = crit.filter((x) => x[2] !== null);
    return { crit, score: known.filter((x) => x[2]).length, known: known.length };
  }

  // Radar 5 axes : rang de la société dans son secteur (0 à 100) sur chaque dimension.
  function radarAxes(c, f, st) {
    const rank = (k, v, hib = true) => {
      const s = st[k];
      if (!s || !ok(v) || s.sorted.length < 5) return null;
      const r = s.sorted.filter((x) => x < v).length / s.sorted.length * 100;
      return hib ? r : 100 - r;
    };
    const avg = (a) => { const b = a.filter(ok); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null; };
    const health = avg([
      ok(f.netDebt) && f.netDebt <= 0 ? 100 : rank("ndEbitda", f.ndEbitda, false),
      rank("coverage", f.coverage), rank("liqGen", f.liqGen), rank("zScore", f.zScore)]);
    return [
      ["Valorisation", rank("evEbitda", f.evEbitda, false), ok(f.evEbitda) ? `VE / EBE ${X(f.evEbitda)} (moins cher que ${nf0.format(rank("evEbitda", f.evEbitda, false) || 0)} % du secteur)` : "pas de capitalisation (sociétés françaises)"],
      ["Croissance", avg([rank("growth", f.growth), rank("growth1", f.growth1)]), `CA ${P(f.growth)} par an sur 3 ans, ${P(f.growth1)} sur 1 an`],
      ["Rentabilité", avg([rank("roce", f.roce), rank("ebitdaMargin", f.ebitdaMargin)]), `ROCE après IS ${P(f.roce)}, marge d'EBE ${P(f.ebitdaMargin)}`],
      ["Santé financière", health, `dette nette / EBE ${ok(f.netDebt) && f.netDebt <= 0 ? "trésorerie nette" : X(f.ndEbitda)}, couverture ${X(f.coverage)}, Altman ${ok(f.zScore) ? nf1.format(f.zScore) : "—"}`],
      ["Dividende", ok(f.divYield) ? rank("divYield", f.divYield) : rank("bookYield", f.bookYield),
        ok(f.divYield) ? `rendement ${P(f.divYield)}` : ok(f.bookYield) ? `dividendes / capitaux propres ${P(f.bookYield)}` : "pas de dividende publié"],
    ];
  }

  function radarSvg(axes) {
    const S = 300, cx = S / 2, cy = S / 2 + 6, R = 100;
    const pt = (k, v) => {
      const a = -Math.PI / 2 + k * 2 * Math.PI / axes.length;
      return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100];
    };
    let g = "";
    for (const lvl of [25, 50, 75, 100]) g += `<polygon class="ring" points="${axes.map((_, k) => pt(k, lvl).join(",")).join(" ")}"/>`;
    axes.forEach((a, k) => {
      const [x, y] = pt(k, 100), [lx, ly] = pt(k, 122);
      g += `<line class="spoke" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
      g += `<text class="rl${ok(a[1]) ? "" : " nd"}" x="${lx}" y="${ly + 4}" text-anchor="${Math.abs(lx - cx) < 5 ? "middle" : lx > cx ? "start" : "end"}">${a[0]}${ok(a[1]) ? "" : " (n.d.)"}</text>`;
    });
    const poly = axes.map((a, k) => (ok(a[1]) ? pt(k, Math.max(4, a[1])).join(",") : null)).filter(Boolean).join(" ");
    g += `<polygon class="area" points="${poly}"/>`;
    axes.forEach((a, k) => { if (ok(a[1])) { const [x, y] = pt(k, Math.max(4, a[1])); g += `<circle class="dotr" cx="${x}" cy="${y}" r="4"><title>${a[0]} : ${nf0.format(a[1])} / 100</title></circle>`; } });
    return `<svg viewBox="-40 0 ${S + 80} ${S + 12}" class="radar" role="img" aria-label="Radar de la société sur 5 axes">${g}</svg>`;
  }

  function qualityCard(c, f, i, st) {
    const axes = radarAxes(c, f, st);
    const pio = piotroski(c, i);
    const z = f.zScore;
    const zZone = !ok(z) ? ["grey", "non calculable (réserves ou bilan non publiés)"] : z > 2.6 ? ["green", "zone sûre (> 2,6)"] : z >= 1.1 ? ["orange", "zone grise (1,1 à 2,6)"] : ["red", "zone de détresse (< 1,1)"];
    const pLight = pio.known < 6 ? "grey" : pio.score >= 7 ? "green" : pio.score >= 4 ? "orange" : "red";
    return `<div class="card"><h3>Radar et scores de qualité</h3>
      <div class="quality">
        <div>${radarSvg(axes)}
          <table class="axes"><tbody>${axes.map((a) => `<tr><td class="l"><b>${a[0]}</b><br><small>${a[2]}</small></td><td>${ok(a[1]) ? nf0.format(a[1]) + " / 100" : "—"}</td></tr>`).join("")}</tbody></table>
          <p class="note">Chaque axe est le rang de la société dans son secteur (100 = la meilleure). Valorisation : moins cher = mieux noté.</p></div>
        <div>
          <h4 class="sub">Piotroski F-score : ${light(pLight)}<b>${pio.score} / ${pio.known}</b>${pio.known < 9 ? ` <small>(${9 - pio.known} critère(s) non calculable(s))</small>` : ""}</h4>
          <ul class="pio">${pio.crit.map(([grp, t, v]) => `<li class="${v === null ? "na" : v ? "pos" : "neg"}">${v === null ? "?" : v ? "✓" : "✗"} <span>${t}</span> <small>${grp}</small></li>`).join("")}</ul>
          <p class="note">9 critères comparant ${state.meta.years[i]} à ${state.meta.years[i - 1] || "l'année précédente"} : 7 à 9 = entreprise solide et qui s'améliore, 0 à 3 = fragile.</p>
          <h4 class="sub">Altman Z-score : ${light(zZone[0])}<b>${ok(z) ? nf1.format(z) : "—"}</b></h4>
          <p class="note">${zZone[1]}. Version Z'' (1995), sans cours de Bourse, adaptée aux sociétés hors industrie :
            6,56 × fonds de roulement / actif + 3,26 × réserves / actif + 6,72 × résultat d'exploitation / actif + 1,05 × capitaux propres / dettes.
            Mesure le risque de défaillance à deux ans ; peu pertinent pour les banques et assurances.</p>
        </div>
      </div></div>`;
  }

  // ---------- Synthèse ----------
  function verdicts(c, f, i, st) {
    const verdict = [];
    // 1. Marges
    const med = st.ebitdaMargin && st.ebitdaMargin.median;
    const prev = figures(c, i - 2);
    const trend = ok(f.ebitdaMargin) && ok(prev.ebitdaMargin) ? f.ebitdaMargin - prev.ebitdaMargin : null;
    let s1 = "grey", t1 = "Marges non calculables.";
    if (ok(f.ebit) && f.ebit < 0) { s1 = "red"; t1 = "Résultat d'exploitation négatif : l'entreprise ne couvre pas ses coûts."; }
    else if (ok(f.ebitdaMargin)) {
      const above = ok(med) ? f.ebitdaMargin >= med : true;
      s1 = above && (!ok(trend) || trend > -0.01) ? "green" : !above && ok(trend) && trend < -0.01 ? "red" : "orange";
      t1 = `Marge d'EBE ${P(f.ebitdaMargin)}${ok(med) ? `, ${above ? "au-dessus" : "en dessous"} de la médiane du secteur (${P(med)})` : ""}${ok(trend) ? `, ${trend >= 0 ? "en progression" : "en recul"} de ${nf1.format(Math.abs(trend) * 100)} pts sur 2 ans` : ""}.`;
    }
    verdict.push([1, "Marges", s1, t1]);
    // 2. Investissements
    const f0 = figures(c, i - 3);
    const dBfr = ok(f.bfrDays) && ok(f0.bfrDays) ? f.bfrDays - f0.bfrDays : null;
    let s2 = "grey", t2 = "Investissements non analysables.";
    if (ok(f.bfrDays) || ok(f.capexDa)) {
      s2 = ok(dBfr) && dBfr > 10 ? "orange" : "green";
      if (ok(f.rotation) && st.rotation && ok(st.rotation.median) && f.rotation < st.rotation.median * 0.7) s2 = "orange";
      t2 = `BFR ${D(f.bfrDays)} de CA${ok(dBfr) ? ` (${dBfr >= 0 ? "+" : ""}${nf0.format(dBfr)} j en 3 ans)` : ""}${ok(f.capexDa) ? ` ; investissements de ${capexNature(f.capexDa)} (${X(f.capexDa)} les amortissements)` : ""} ; rotation de l'actif ${X(f.rotation)}.`;
    }
    verdict.push([2, "Investissements", s2, t2]);
    // 3. Financement
    const cash = ok(f.netDebt) && f.netDebt <= 0;
    let s3 = "grey", t3 = "Endettement non calculable.";
    if (cash) { s3 = "green"; t3 = `Trésorerie nette de ${M(-f.netDebt)} M ${esc(c.cur)} : aucun risque d'endettement.`; }
    else if (ok(f.ndEbitda)) {
      s3 = f.ndEbitda <= 3 && (!ok(f.coverage) || f.coverage >= 3) ? "green" : f.ndEbitda > 4 || (ok(f.coverage) && f.coverage < 1.5) ? "red" : "orange";
      t3 = `Dette nette / EBE ${X(f.ndEbitda)}, couverture des intérêts ${X(f.coverage)} (repères : ≤ 3× et ≥ 3×).`;
    }
    verdict.push([3, "Financement", s3, t3]);
    // 4. Rentabilité
    const w = f.k;
    let s4 = "grey", t4 = "Rentabilité non calculable.";
    if (ok(f.roce)) {
      s4 = f.roce >= w + 0.02 ? "green" : f.roce >= w - 0.01 ? "orange" : "red";
      t4 = `ROCE courant après IS ${P(f.roce)}${ok(f.roceReported) && Math.abs(f.roceReported - f.roce) > 0.005 ? ` (${P(f.roceReported)} sur le résultat publié)` : ""} pour un coût du capital de ${P(w)} ; ROE ${P(f.roe)}.`;
    }
    verdict.push([4, "Rentabilité", s4, t4]);
    // Conclusion
    const solv = s3 === "green" && (!ok(f.fcf) || f.fcf >= 0) ? ["green", "Solvable : la dette est remboursable par l'exploitation."]
      : s3 === "red" ? ["red", "Solvabilité fragile : endettement élevé au regard de l'EBE."]
        : s3 === "grey" ? ["grey", "Solvabilité non évaluable."] : ["orange", "Solvabilité à surveiller."];
    const val = s4 === "green" ? ["green", "Crée de la valeur : rentabilité économique supérieure au coût du capital."]
      : s4 === "red" ? ["red", "Détruit de la valeur : rentabilité économique inférieure au coût du capital."]
        : s4 === "grey" ? ["grey", "Création de valeur non évaluable."] : ["orange", "Création de valeur à la limite."];
    const valTxt = `${val[1]}${ok(f.eva) ? ` ROCE courant après IS ${P(f.roce)} contre un coût du capital de ${P(f.k)} : ${M(f.eva)} M ${esc(c.cur)} de valeur ${f.eva >= 0 ? "créée" : "détruite"} sur l'exercice.` : ""}`;
    const solvTxt = `${solv[1]}${cash ? "" : ok(f.ndEbitda) ? ` Dette nette / EBE ${X(f.ndEbitda)}, couverture des intérêts ${X(f.coverage)}.` : ""}${ok(f.liqGen) ? ` Liquidité générale ${nf1.format(f.liqGen)}.` : ""}${ok(f.zScore) ? ` Altman ${nf1.format(f.zScore)}.` : ""}`;
    return { rows: verdict, val: [val[0], valTxt], solv: [solv[0], solvTxt] };
  }

  // ---------- Synthèse visuelle : une vignette par réponse et par étape ----------
  // Feu, chiffre clé, et petite courbe sur les exercices disponibles avec son repère (coût du capital,
  // médiane du secteur, seuil). Un clic ouvre la rubrique correspondante.
  const COLOR = { green: "#1e8a4c", orange: "#d9922e", red: "#c8402f", grey: "#9aa3ad" };
  function spark(vals, ref, state, fmt) {
    const pts = vals.map((v, k) => [k, v]).filter(([, v]) => ok(v));
    if (pts.length < 2) return `<svg class="spk" viewBox="0 0 150 40"></svg>`;
    const all = pts.map(([, v]) => v).concat(ok(ref) ? [ref] : []);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    // Abscisses sur les seuls exercices disponibles : la courbe occupe toute la largeur.
    const k0 = pts[0][0], k1 = pts[pts.length - 1][0];
    const x = (k) => 4 + (k - k0) / Math.max(1, k1 - k0) * 142, y = (v) => 36 - (v - lo) / (hi - lo) * 32;
    const line = pts.map(([k, v]) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const [lk, lv] = pts[pts.length - 1];
    return `<svg class="spk" viewBox="0 0 150 40" preserveAspectRatio="none">
      ${ok(ref) ? `<line x1="2" x2="148" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}" class="spk-ref"><title>repère ${fmt(ref)}</title></line>` : ""}
      <polyline points="${line}" class="spk-l"/><circle cx="${x(lk).toFixed(1)}" cy="${y(lv).toFixed(1)}" r="3.2" fill="${COLOR[state] || COLOR.grey}"/></svg>`;
  }
  function cubes(c, f, i, st, V, mv) {
    const ys = state.meta.years, from = Math.max(0, i - 5);
    const hist = (g) => ys.slice(from, i + 1).map((_, k) => { const x = figures(c, from + k); return x && ok(x.rev) ? g(x) : null; });
    const med = (k) => st[k] && ok(st[k].median) ? st[k].median : null;
    const cur = esc(c.cur);
    const cash = ok(f.netDebt) && f.netDebt <= 0;
    const rows = Object.fromEntries(V.rows.map(([n, , s]) => [n, s]));
    const warnRoce = ok(f.roce) && Math.abs(f.roce) > 1 ? ' <span class="warn" title="Valeur hors norme : capitaux employés très faibles ou donnée à vérifier">⚠</span>' : "";
    const tiles = [
      ["A", "Valeur", V.val[0], `${P(f.roce)}${warnRoce} <small>vs ${P(f.k)}</small>`, `${gloss("ROCE")} vs ${gloss("coût du capital")}`, hist((x) => x.roce), f.k, P,
        V.val[1].replace(/<[^>]+>/g, "")],
      ["P", "Dettes", V.solv[0], cash ? `+${M(-f.netDebt)} <small>M ${cur}</small>` : X(f.ndEbitda), cash ? "trésorerie nette" : gloss("dette nette / EBE"), hist((x) => x.ndEbitda), 3, X,
        V.solv[1].replace(/<[^>]+>/g, "")],
      [1, "Marges", rows[1], P(f.ebitdaMargin), `marge d'${gloss("EBE")} · secteur ${P(med("ebitdaMargin"))}`, hist((x) => x.ebitdaMargin), med("ebitdaMargin"), P, V.rows[0][3]],
      [2, "Investissements", rows[2], D(f.bfrDays), `${gloss("BFR")}${ok(f.capexDa) ? ` · invest. ${X(f.capexDa)} amort.` : ""}`, hist((x) => x.bfrDays), med("bfrDays"), D, V.rows[1][3]],
      ok(f.fcf) ? [3, "Financement", rows[3], `${M(f.fcf)} <small>M ${cur}</small>`, gloss("flux disponible"), hist((x) => x.fcf), 0, M, V.rows[2][3]]
        : ok(f.cfo) ? [3, "Financement", rows[3], `${M(f.cfo)} <small>M ${cur}</small>`, "flux d'exploitation", hist((x) => x.cfo), 0, M, V.rows[2][3] + " Investissements non publiés."]
          : [3, "Financement", rows[3], cash ? "Trés. nette" : X(f.ndEbitda), gloss("dette nette / EBE"), hist((x) => x.ndEbitda), 3, X, V.rows[2][3]],
      [4, "Rentabilité", rows[4], `${P(f.roe)} <small>vs ${P(f.kE)}</small>`, `${gloss("ROE")} vs ${gloss("coût des fonds propres")}`, hist((x) => x.roe), f.kE, P, V.rows[3][3]],
      ["€", "Marché", mv[0], ok(f.vae) ? `${X(f.vae)} <small>vs ${X(f.vaeTh)}</small>` : "—", ok(f.vae) ? gloss("VE / capitaux employés") : "pas de cours", null, null, X, mv[1].replace(/<[^>]+>/g, "")],
    ];
    return `<div class="cubes">${tiles.map(([n, t, s, big, sub, h, ref, fmt, tip]) => `
      <button class="cube ${s || "grey"}" data-open="${n}" title="${esc(tip || "")} — cliquer pour le détail">
        <span class="cube-h"><span class="num">${n}</span>${light(s || "grey")}<span>${t}</span></span>
        <b class="cube-v">${big}</b><span class="cube-s">${sub}</span>
        ${h ? spark(h, ref, s, fmt) + (h.filter(ok).length >= 2 ? `<span class="cube-y">${ys[from + h.findIndex(ok)]}–${ys[i]}</span>` : "") : n === "€" && ok(f.vae) && ok(f.vaeTh) ? vaeBar(f.vae, f.vaeTh, s) : ""}
      </button>`).join("")}</div>
      <p class="note cubes-note">Courbes : les derniers exercices ; pointillé : le repère (coût du capital, médiane du secteur, dette nette / EBE de 3×, flux nul). Cliquer une vignette pour le détail.</p>`;
  }
  // Deux barres : repère (gris) et valeur (couleur du feu). Partagé avec la fiche PME.
  function miniBars(v, ref, s, refLabel, valLabel) {
    const hi = Math.max(Math.abs(v || 0), Math.abs(ref || 0)) * 1.1 || 1, w = (x) => Math.max(2, Math.abs(x || 0) / hi * 142);
    return `<svg class="spk" viewBox="0 0 150 40"><rect x="4" y="6" width="${w(ref).toFixed(1)}" height="11" rx="2" fill="#b9c3cf"><title>${esc(refLabel)}</title></rect>
      <rect x="4" y="22" width="${w(v).toFixed(1)}" height="11" rx="2" fill="${COLOR[s] || COLOR.grey}"><title>${esc(valLabel)}</title></rect></svg>`;
  }
  function vaeBar(obs, th, s) {
    const hi = Math.max(obs, th) * 1.1, w = (v) => Math.max(2, v / hi * 142);
    return `<svg class="spk" viewBox="0 0 150 40"><rect x="4" y="6" width="${w(th).toFixed(1)}" height="11" rx="2" fill="#b9c3cf"><title>justifié ${X(th)}</title></rect>
      <rect x="4" y="22" width="${w(obs).toFixed(1)}" height="11" rx="2" fill="${COLOR[s] || COLOR.grey}"><title>observé ${X(obs)}</title></rect></svg><span class="cube-y">gris : justifié · couleur : marché</span>`;
  }

  // Phrase d'identité en tête de fiche.
  function intro(c, f, i) {
    const sec = state.meta.sectors[c.s] || "";
    const size = !ok(f.rev) ? "" : f.rev >= 10000 ? "un géant" : f.rev >= 1000 ? "une grande entreprise" : f.rev >= 100 ? "une entreprise moyenne" : "une petite entreprise";
    return `<p class="intro"><b>${esc(c.n)}</b> est ${size} du secteur ${esc(sec.split(/[,(]/)[0].trim().toLowerCase())} : ${M(f.rev)} M ${esc(c.cur)} de chiffre d'affaires en ${state.meta.years[i]}${ok(f.growth) ? `, ${f.growth >= 0.02 ? "en croissance" : f.growth <= -0.02 ? "en recul" : "stable"} (${P(f.growth)} par an sur 3 ans)` : ""}.</p>`;
  }

  // La fiche, en une colonne : 1. l'analyse financière (les deux réponses, puis les 4 étapes), 2. le marché.
  // Chaque ligne porte son feu et sa phrase de verdict, et se déplie pour le détail.
  function render(c, i) {
    const f = figures(c, i);
    const st = sectorStats(c.s, i);
    const V = verdicts(c, f, i, st), mv = marketVerdict(c, f, i, st);
    const K = conclusion(c, f, i, st, V);
    curV = { A: V.val, P: V.solv, "€": mv };
    V.rows.forEach(([n, , s, t]) => (curV[n] = [s, t]));
    const html = intro(c, f, i) + cubes(c, f, i, st, V, mv) +
      `<h3 class="part"><span class="part-n">1</span> L'analyse financière <small>— deux questions, puis les 4 étapes ; cliquer une ligne pour le détail</small></h3>` +
      step("A", "Actionnaire : l'entreprise crée-t-elle de la valeur ?", "", K.share) +
      step("P", "Prêteur : peut-elle rembourser ses dettes ?", "", K.lend) +
      `<h4 class="sub">Les 4 étapes</h4>` +
      step1(c, f, i, st) + step2(c, f, i, st) + step3(c, f, i, st) + step4(c, f, i, st) +
      `<h3 class="part"><span class="part-n">2</span> Le marché <small>— si elle crée de la valeur, la paie-t-il déjà ?</small></h3>` +
      valuation(c, f, i, st) +
      (ok(f.mcap) && new Date().getFullYear() - state.meta.years[i] >= 2 ? `<p class="note warn">⚠ Comptes ${state.meta.years[i]} : le cours actuel est comparé à des comptes de plus d'un an (le rapport annuel plus récent n'est pas encore dans la base ESEF). Les multiples de marché sont à prendre avec prudence.</p>` : "") +
      `<h4 class="sub">Pour aller plus loin</h4>` +
      step("+", "Scores complémentaires", "radar sectoriel, Piotroski, Altman", qualityCard(c, f, i, st)) +
      `<p class="note">Comparaison avec ${st.n} sociétés cotées du secteur « ${esc(state.meta.sectors[c.s])} », toutes zones. Verdicts automatiques, à confirmer par l'analyse économique (marché, position concurrentielle) et la lecture des principes comptables.</p>
      <details class="method"><summary>Le plan d'analyse</summary>${METHOD_HTML}</details>`;
    curV = null;
    return html;
  }

  // Texte de la méthode, affiché dans l'onglet Méthode et dans chaque fiche.
  const METHOD_HTML = `
    <p>L'analyse financière répond à deux questions : <b>l'entreprise crée-t-elle de la valeur</b> (point de vue de l'actionnaire)
    et <b>peut-elle rembourser ses dettes</b> (point de vue du prêteur) ? La méthode est la même dans les deux cas.</p>
    <p><b>Deux préalables</b> : comprendre l'économie de l'entreprise (son marché, sa position, sa façon de produire) et vérifier
    que la comptabilité reflète bien cette réalité.</p>
    <p><b>Puis le plan en 4 étapes</b>, chacune menant à la suivante :</p>
    <ol>
      <li><b>Les marges</b> (la création de richesse) : croissance du CA, effets ciseaux, valeur ajoutée, EBE, résultat d'exploitation.
        Le <b>point mort</b> mesure le risque : plus l'entreprise en est loin, plus son bénéfice est stable.</li>
      <li><b>Les investissements</b> nécessaires : le BFR, analysé en jours (clients, stocks, fournisseurs) et toujours en évolution,
        ainsi que les immobilisations. Un investissement supérieur aux amortissements est un investissement de <b>capacité</b>,
        égal un investissement de <b>maintien</b>, inférieur un <b>retrait</b>.</li>
      <li><b>Le financement</b>, en deux approches. En <b>dynamique</b>, le tableau de flux est l'outil central : CAF − variation du BFR
        = flux d'exploitation, − investissements = flux disponible, puis distribution, augmentation de capital ou endettement.
        En <b>statique</b>, le bilan : <b>dette nette / EBE inférieure à environ 3</b>, <b>résultat d'exploitation / frais financiers
        supérieur à environ 3</b>, et la liquidité (générale, réduite, immédiate : échéances des dettes face à celles des actifs).</li>
      <li><b>La rentabilité</b> : ROCE = marge × rotation, puis l'effet de levier. Le levier ne crée pas de valeur :
        il augmente le ROE mais aussi le risque. Seule une bonne rentabilité économique dure.
        Puis la <b>politique de distribution</b> : taux de distribution (dividendes / résultat net), <b>croissance soutenable
        = ROE × (1 − taux de distribution)</b>, couverture du dividende par le flux disponible, rendement total
        (dividendes + rachats d'actions) et régularité du dividende par action (années de hausse consécutives).</li>
    </ol>
    <p><b>Conclusion</b>, rédigée sous les deux angles : « <b>du point de vue des actionnaires</b> » (création de valeur : ROCE après IS
    comparé au <b>coût du capital</b>, CMPC = taux sans risque + bêta d'actif × prime de risque) et « <b>du point de vue des prêteurs</b> »
    (solvabilité et liquidité).</p>
    <p><b>Puis, pour une société cotée, une seconde question : si elle crée de la valeur, le marché la paie-t-il déjà ?</b>
    Sa valeur d'entreprise devrait dépasser ses capitaux employés (sans croissance, VE / capitaux employés ≈ ROCE / CMPC). On compare
    le multiple observé à ce multiple justifié, puis ce rapport à celui de la médiane de la place (même les sociétés les plus
    rentables cotent au-dessus, le marché payant une croissance future) : quart le moins cher en vert, quart le plus cher en rouge.
    Le PER face au secteur confirme ou tempère d'un cran. L'actualisation des flux n'est donnée qu'à titre d'information :
    sur le banc d'essai historique (20 sociétés du CAC 40, 2021–2026), elle n'annonçait pas la performance qui suivait, alors que
    le multiple observé rapporté au multiple justifié et le PER l'annonçaient en partie.</p>
    <p class="note">Formules alignées sur les fiches de synthèse du cours ICCF (HEC Paris / First Finance) : rentabilité économique
    = résultat d'exploitation × (1 − IS) / capitaux employés moyens (capitaux propres + dette nette, moyenne ouverture–clôture) ;
    dette nette = dettes financières + dettes de location (IFRS 16) − trésorerie − placements à court terme ; effet de levier avec un coût de la dette <b>après impôt</b>.</p>
    <p>On mène l'analyse de trois façons : <b>en tendance</b> (sur plusieurs années), <b>en comparaison</b> (face aux concurrents
    du secteur) et <b>par rapport à des normes</b> (les repères ci-dessus).</p>`;

  // Retraitement IFRS 16 des amortissements (case à cocher des filtres).
  function setFlag(name, on) {
    params[name] = !!on;
    saveParams();
    for (const k of Object.keys(sectorCache)) delete sectorCache[k];
    for (const k of Object.keys(relCache)) delete relCache[k];
  }
  function setParam(name, value) {
    const s = String(value ?? "").trim();
    const v = Number(s.replace(",", "."));
    params[name] = s === "" ? null : Number.isFinite(v) && v >= 0 ? v : params[name];
    saveParams();
    for (const k of Object.keys(relCache)) delete relCache[k];
  }
  // Verdicts des 4 étapes (mêmes règles que la synthèse de la fiche), pour le tableau de bord.
  function stepColors(c, i) {
    const f = figures(c, i), st = sectorStats(c.s, i);
    const med = st.ebitdaMargin && st.ebitdaMargin.median;
    const prev = figures(c, i - 2), f0 = figures(c, i - 3);
    const trend = ok(f.ebitdaMargin) && ok(prev.ebitdaMargin) ? f.ebitdaMargin - prev.ebitdaMargin : null;
    let s1 = "grey";
    if (ok(f.ebit) && f.ebit < 0) s1 = "red";
    else if (ok(f.ebitdaMargin)) {
      const above = ok(med) ? f.ebitdaMargin >= med : true;
      s1 = above && (!ok(trend) || trend > -0.01) ? "green" : !above && ok(trend) && trend < -0.01 ? "red" : "orange";
    }
    const dBfr = ok(f.bfrDays) && ok(f0.bfrDays) ? f.bfrDays - f0.bfrDays : null;
    let s2 = "grey";
    if (ok(f.bfrDays) || ok(f.capexDa)) {
      s2 = ok(dBfr) && dBfr > 10 ? "orange" : "green";
      if (ok(f.rotation) && st.rotation && ok(st.rotation.median) && f.rotation < st.rotation.median * 0.7) s2 = "orange";
    }
    let s3 = "grey";
    if (ok(f.netDebt) && f.netDebt <= 0) s3 = "green";
    else if (ok(f.ndEbitda)) s3 = f.ndEbitda <= 3 && (!ok(f.coverage) || f.coverage >= 3) ? "green" : f.ndEbitda > 4 || (ok(f.coverage) && f.coverage < 1.5) ? "red" : "orange";
    const w = f.k;
    const s4 = !ok(f.roce) ? "grey" : f.roce >= w + 0.02 ? "green" : f.roce >= w - 0.01 ? "orange" : "red";
    return { f, s: [s1, s2, s3, s4] };
  }

  function sectorMedians(sector, i) {
    const st = sectorStats(sector, i);
    return Object.fromEntries(BENCH.map((k) => [k, st[k] ? st[k].median : null]));
  }

  // Coût du capital moyen du marché (bêta d'actif 1), pour les repères des graphiques.
  const marketK = () => {
    const R = state.meta.rates || {};
    const rf = ok(params.rf) ? params.rf : R.rf && R.rf.US ? R.rf.US.v : 4;
    const prm = ok(params.prm) ? params.prm : R.erp && ok(R.erp.mature) ? R.erp.mature : 5;
    return (rf + prm) / 100;
  };
  // Pour le portefeuille : verdict de marché et valeur estimée des capitaux propres.
  function market(c, i) {
    const f = figures(c, i), st = sectorStats(c.s, i);
    return { f, mv: marketVerdict(c, f, i, st), fv: fairValue(c, f, i, st) };
  }
  // Verdicts d'un exercice (feux seulement) : banc d'essai historique.
  function verdictsAt(c, i) {
    const f = figures(c, i), st = sectorStats(c.s, i), V = verdicts(c, f, i, st);
    const o = { A: V.val[0], P: V.solv[0] };
    V.rows.forEach(([n, , s]) => (o[n] = s));
    return o;
  }
  return { render, verdictsAt, figures: (c, i) => figures(c, i), piotroski, sectorMedians, stepColors, market, spark, miniBars, methodHtml: METHOD_HTML, params, setParam, setFlag, marketK };
})();
