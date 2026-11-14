"use strict";
// Analyse financière d'une société selon le plan type en 4 étapes : marges,
// investissements (BFR et immobilisations), financement, rentabilité ; puis
// solvabilité, création de valeur, et valorisation par multiple avec un
// montage de reprise (LBO) indicatif. Chaque ratio est comparé au secteur.
// Dépend de app.js : val(), ok(), esc(), nf0, nf1, state.

const Analyse = (() => {
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
    const netDebt = ok(cash) ? debtLT + debtST - cash : null;

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
    const ni = g("net_income");
    let t = ok(tax) && ok(pretax) && pretax > 0 ? tax / pretax : null;
    const tUsed = ok(t) && t >= 0 && t <= 0.5 ? t : 0.25;

    // Rentabilité.
    const ropat = ok(ebit) ? ebit * (1 - tUsed) : null;           // résultat d'exploitation après IS
    const margin = ok(ropat) && ok(rev) && rev > 0 ? ropat / rev : null;
    const rotation = ok(rev) && ok(ae) && ae > 0 ? rev / ae : null;
    const roce = ok(ropat) && ok(ae) && ae > 0 ? ropat / ae : null;
    const interest = g("interest");
    const iCost = ok(interest) && ok(netDebt) && netDebt > 0 ? interest * (1 - tUsed) / netDebt : null;
    const de = ok(netDebt) && ok(eq) && eq > 0 ? netDebt / eq : null;
    const roeTheo = ok(roce) && ok(de) ? roce + (roce - (ok(iCost) ? iCost : 0)) * de : null;
    const roe = ok(ni) && ok(eqGroup) && eqGroup > 0 ? ni / eqGroup : null;

    return {
      A, CA, CL, cash, eq, NCA, NCL, debtLT, debtST, debtKnown, netDebt, bfr, ae, other, fr, tresoNette,
      goodwill: g("goodwill"), intangibles: g("intangibles"), ppe: g("ppe"),
      rev, ebit, da, ebitda, pretax, tax, niTotal, ni, t, tUsed, staff: g("staff"),
      cogs: g("cost_of_revenue"), gp: g("gross_profit"), sga: g("sga"), rnd: g("rnd"),
      cfo: g("cfo"), capex: g("capex"), cfi: g("cfi"), cff: g("cff"), acq: g("acquisitions"),
      div: g("dividends"), buyback: g("buybacks"), issue: g("share_issue"),
      debtIn: g("debt_issued"), debtOut: g("debt_repaid"),
      ropat, margin, rotation, roce, iCost, de, roeTheo, roe, interest,
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
      capexDa: ok(g("capex")) && ok(da) && da > 0 ? g("capex") / da : null,
      capexRev: ok(g("capex")) && ok(rev) && rev > 0 ? g("capex") / rev : null,
      // Capitalisation : cours actuel × nombre d'actions si disponible, sinon « public float » SEC de l'année.
      mcap: c.px && c.px[0] && c.px[1] ? c.px[0] * c.px[1] / 1e6 : g("market_cap"),
      mcapLive: !!(c.px && c.px[0] && c.px[1]),
      // Fiche 2 : état de l'outil industriel = immobilisations nettes / brutes.
      wear: ok(g("ppe")) && ok(g("ppe_gross")) && g("ppe_gross") > 0 ? g("ppe") / g("ppe_gross") : null,
      // Fiche 3 : ratios de liquidité.
      liqGen: ok(CA) && ok(CL) && CL > 0 ? CA / CL : null,
      liqRed: ok(CA) && ok(CL) && CL > 0 ? (CA - (g("inventory") || 0)) / CL : null,
      liqImm: ok(cash) && ok(CL) && CL > 0 ? cash / CL : null,
      // Fiche 4 : intensité capitalistique (inverse de la rotation) et levier financier.
      intensity: ok(ae) && ok(rev) && rev > 0 ? ae / rev : null,
      // Altman Z'' (1995, version sans cours de Bourse) :
      // 6,56 × BFR global / actif + 3,26 × réserves / actif + 6,72 × EBIT / actif + 1,05 × capitaux propres / dettes.
      zScore: (() => {
        const re = g("retained_earnings");
        if (!ok(A) || A <= 0 || !ok(CA) || !ok(CL) || !ok(re) || !ok(ebit) || !ok(eq)) return null;
        const liab = A - eq;
        if (liab <= 0) return null;
        return 6.56 * (CA - CL) / A + 3.26 * re / A + 6.72 * ebit / A + 1.05 * eq / liab;
      })(),
      divYield: null,
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
    }
    return f;
  };

  const M = (v) => (ok(v) ? (Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)) : "—");
  const P = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "—");
  const X = (v) => (ok(v) ? nf1.format(v) + "×" : "—");

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

  function economicBalance(f, cur) {
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
        { label: "Capitaux propres", value: f.eq, cls: "c-eq" },
        { label: "Provisions et autres passifs LT", value: f.other, cls: "c-other", neg: "Autres actifs nets" },
        { label: "Dette nette", value: f.netDebt, cls: "c-debt", neg: "Trésorerie nette" },
      ] },
    ], 300, !f.debtKnown ? "Dette financière non publiée sous une étiquette standard : elle est comptée dans « autres passifs »." : "");
    return card("Bilan économique", `M ${cur}`, html,
      `Actif économique = immobilisations + BFR ${M(f.ae)}. Il est financé par les capitaux propres et la dette nette.
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
    const capexDa = ok(f.capex) && ok(f.da) && f.da > 0 ? ` · capex / amortissements ${X(f.capex / f.da)} (au-dessus de 1×, l'outil se développe)` : "";
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
      ["Actif économique", (f) => M(f.ae)],
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

  // ---------- Paramètres réglables (mémorisés dans le navigateur) ----------
  const params = { wacc: 8.5, lev: 3.5, rate: 6, mult: null };
  try { Object.assign(params, JSON.parse(localStorage.getItem("reprise.params") || "{}")); } catch (e) { /* ignoré */ }
  function saveParams() { try { localStorage.setItem("reprise.params", JSON.stringify(params)); } catch (e) { /* ignoré */ } }

  // ---------- Comparaison au secteur ----------
  const sectorCache = {};
  const BENCH = ["per", "evSales", "fcfYield", "growth", "ebitdaMargin", "margin", "netMargin", "bfrDays", "capexRev", "rotation", "ndEbitda",
    "coverage", "roce", "roe", "evEbitda", "zScore", "divYield", "bookYield", "liqGen", "growth1"];
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
  const kpi = (label, value, extra = "") => `<div class="kpi"><b>${value}</b><span>${label}</span>${extra}</div>`;
  const D = (v) => (ok(v) ? nf0.format(v) + " j" : "—");
  const light = (state) => `<i class="light ${state}" aria-label="${state === "green" ? "bon" : state === "orange" ? "à surveiller" : state === "red" ? "alerte" : "inconnu"}"></i>`;
  function step(n, title, sub, body) {
    return `<section class="step"><h2 class="step-h"><span class="num">${n}</span>${title}<small>${sub}</small></h2>${body}</section>`;
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
    return step(2, "Les investissements", "immobilisations et BFR", kpis + economicBalance(f, c.cur) +
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
    const w = params.wacc / 100;
    const spread = ok(f.roce) ? f.roce - w : null;
    const eva = ok(spread) && ok(f.ae) ? spread * f.ae : null;
    const kpis = `<div class="kpis">
      ${kpi("ROCE après IS", P(f.roce), bench(st, "roce", f.roce, P))}
      ${kpi("Rentabilité des capitaux propres", P(f.roe), bench(st, "roe", f.roe, P))}
      ${kpi("Intensité capitalistique", ok(f.intensity) ? nf1.format(f.intensity) : "—", `<small class="bench">actif économique / CA = 1 / rotation</small>`)}
      ${kpi("Coût du capital (hypothèse)", `<input class="param" type="number" step="0.5" min="0" max="30" data-param="wacc" value="${params.wacc}"> %`)}
      ${kpi("ROCE − coût du capital", `<span class="${ok(spread) ? (spread >= 0 ? "pos" : "neg") : ""}">${ok(spread) ? (spread >= 0 ? "+" : "") + nf1.format(spread * 100) + " pts" : "—"}</span>`)}
      ${kpi(`Création de valeur ${state.meta.years[i]} (M ${esc(c.cur)})`, `<span class="${ok(eva) ? (eva >= 0 ? "pos" : "neg") : ""}">${M(eva)}</span>`)}
    </div>`;
    return step(4, "La rentabilité", "rentabilité économique, capitaux propres, effet de levier", kpis + leverage(f) +
      `<p class="note">Création de valeur (profit économique) = (ROCE après IS − coût du capital) × actif économique. L'effet de levier augmente la rentabilité des capitaux propres mais aussi leur risque : il ne crée pas de valeur. Seule une rentabilité économique durablement supérieure au coût du capital en crée.</p>` +
      history(c));
  }

  // ---------- Valorisation et reprise ----------
  function valuation(c, f, i, st) {
    if (!ok(f.ebitda) || f.ebitda <= 0) return step("€", "Valorisation et reprise", "multiple et montage LBO",
      `<div class="card"><p class="note">EBE négatif ou inconnu : pas de valorisation par multiple possible.</p></div>`);
    const secMult = st.evEbitda && ok(st.evEbitda.median) && st.evEbitda.sorted.length >= 5 ? st.evEbitda.median : null;
    const mult = ok(params.mult) && params.mult > 0 ? params.mult : ok(secMult) ? Math.round(secMult * 10) / 10 : 7;
    const ev = mult * f.ebitda;
    const equity = ok(f.netDebt) ? ev - f.netDebt : null;
    const debt = Math.min(params.lev * f.ebitda, ev * 0.75);
    const equityIn = ev - debt;
    const rate = params.rate / 100;
    const interest = debt * rate;
    const fcfPre = ok(f.fcf) ? f.fcf + (ok(f.interest) ? f.interest * (1 - f.tUsed) : 0) : null; // FCF avant frais financiers actuels
    const free = ok(fcfPre) ? fcfPre - interest * (1 - f.tUsed) : null;
    const years = ok(free) && free > 0 ? debt / free : null;
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
      </div><h4 class="sub">Prix de reprise par multiple</h4>` : "";
    const lbLight = !ok(years) ? "red" : years <= 7 ? "green" : years <= 10 ? "orange" : "red";
    const body = market + `<div class="kpis">
        ${kpi("Multiple VE / EBE retenu", `<input class="param" type="number" step="0.5" min="0" max="60" data-param="mult" value="${mult}">×`,
          `<small class="bench">médiane du secteur ${ok(secMult) ? X(secMult) : "indisponible"}${own}</small>`)}
        ${kpi(`Valeur d'entreprise (M ${esc(c.cur)})`, M(ev))}
        ${kpi("− dette nette", M(f.netDebt))}
        ${kpi(`= valeur des titres (M ${esc(c.cur)})`, M(equity))}
      </div>
      <h4 class="sub">Montage LBO indicatif</h4>
      <div class="kpis">
        ${kpi("Dette d'acquisition (× EBE)", `<input class="param" type="number" step="0.5" min="0" max="8" data-param="lev" value="${params.lev}">×`)}
        ${kpi("Taux de la dette", `<input class="param" type="number" step="0.5" min="0" max="20" data-param="rate" value="${params.rate}"> %`)}
        ${kpi(`Dette levée (M ${esc(c.cur)})`, M(debt))}
        ${kpi(`Apport en fonds propres (M ${esc(c.cur)})`, M(equityIn), `<small class="bench">${P(equityIn / ev)} du prix</small>`)}
        ${kpi("Flux disponible après intérêts", M(free))}
        ${kpi("Années pour rembourser", `${light(lbLight)} ${ok(years) ? nf1.format(years) + " ans" : "impossible"}`)}
      </div>`;
    return step("€", "Valorisation et reprise", "multiple et montage LBO", card("Prix par multiple et capacité de reprise", "", body,
      `Valeur d'entreprise = multiple × EBE ; on retranche la dette nette pour obtenir la valeur des titres. Multiples sectoriels :
       sociétés cotées (capitalisation au dernier cours connu + dette nette) / EBE ; ils sont en général plus élevés que les multiples
       de transaction de PME françaises (souvent 4 à 7×). Le remboursement suppose un flux disponible constant, sans croissance ni
       dividende, après impôt au taux de ${P(f.tUsed)} : c'est un ordre de grandeur, pas un plan de financement. La dette est plafonnée à 75 % du prix.`));
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
  function synthesis(c, f, i, st) {
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
      t2 = `BFR ${D(f.bfrDays)} de CA${ok(dBfr) ? ` (${dBfr >= 0 ? "+" : ""}${nf0.format(dBfr)} j en 3 ans)` : ""} ; investissements de ${capexNature(f.capexDa)}${ok(f.capexDa) ? ` (${X(f.capexDa)} les amortissements)` : ""} ; rotation de l'actif ${X(f.rotation)}.`;
    }
    verdict.push([2, "Investissements", s2, t2]);
    // 3. Financement
    const cash = ok(f.netDebt) && f.netDebt <= 0;
    let s3 = "grey", t3 = "Endettement non calculable.";
    if (cash) { s3 = "green"; t3 = `Trésorerie nette de ${M(-f.netDebt)} : aucun risque d'endettement.`; }
    else if (ok(f.ndEbitda)) {
      s3 = f.ndEbitda <= 3 && (!ok(f.coverage) || f.coverage >= 3) ? "green" : f.ndEbitda > 4 || (ok(f.coverage) && f.coverage < 1.5) ? "red" : "orange";
      t3 = `Dette nette / EBE ${X(f.ndEbitda)}, couverture des intérêts ${X(f.coverage)} (repères : ≤ 3× et ≥ 3×).`;
    }
    verdict.push([3, "Financement", s3, t3]);
    // 4. Rentabilité
    const w = params.wacc / 100;
    let s4 = "grey", t4 = "Rentabilité non calculable.";
    if (ok(f.roce)) {
      s4 = f.roce >= w + 0.02 ? "green" : f.roce >= w - 0.01 ? "orange" : "red";
      t4 = `ROCE après IS ${P(f.roce)} pour un coût du capital supposé de ${P(w)} ; ROE ${P(f.roe)}.`;
    }
    verdict.push([4, "Rentabilité", s4, t4]);
    // Conclusion
    const solv = s3 === "green" && (!ok(f.fcf) || f.fcf >= 0) ? ["green", "Solvable : la dette est remboursable par l'exploitation."]
      : s3 === "red" ? ["red", "Solvabilité fragile : endettement élevé au regard de l'EBE."]
        : s3 === "grey" ? ["grey", "Solvabilité non évaluable."] : ["orange", "Solvabilité à surveiller."];
    const val = s4 === "green" ? ["green", "Crée de la valeur : rentabilité économique supérieure au coût du capital."]
      : s4 === "red" ? ["red", "Détruit de la valeur : rentabilité économique inférieure au coût du capital."]
        : s4 === "grey" ? ["grey", "Création de valeur non évaluable."] : ["orange", "Création de valeur à la limite."];
    return `<div class="card synth"><h3>Synthèse ${state.meta.years[i]} <small>— plan d'analyse en 4 étapes</small></h3>
      <div class="synth-grid">${verdict.map(([n, k, s, t]) => `<div class="synth-row"><span class="num">${n}</span>${light(s)}<div><b>${k}</b><span>${t}</span></div></div>`).join("")}</div>
      <div class="synth-concl">
        <div>${light(val[0])}<b>Du point de vue des actionnaires</b> <span>${val[1]} ${ok(f.roe) ? `Rentabilité des capitaux propres ${P(f.roe)}${ok(f.roce) && ok(f.roe) ? `, dont ${f.roe > f.roce ? "un effet de levier positif" : "un effet de levier négatif ou nul"}` : ""}.` : ""}</span></div>
        <div>${light(solv[0])}<b>Du point de vue des prêteurs</b> <span>${solv[1]} ${ok(f.liqGen) ? `Liquidité générale ${nf1.format(f.liqGen)}.` : ""}</span></div>
      </div>
      <p class="note">Comparaison avec ${st.n} sociétés du secteur « ${esc(state.meta.sectors[c.s])} » (France et USA). Verdicts automatiques, à confirmer par l'analyse économique (marché, position concurrentielle) et la lecture des principes comptables.</p>
      <details class="method"><summary>Le plan d'analyse en 4 étapes</summary>${METHOD_HTML}</details></div>`;
  }

  function render(c, i) {
    const f = figures(c, i);
    const st = sectorStats(c.s, i);
    return synthesis(c, f, i, st) + qualityCard(c, f, i, st) + step1(c, f, i, st) + step2(c, f, i, st) + step3(c, f, i, st) + step4(c, f, i, st) + valuation(c, f, i, st);
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
        il augmente le ROE mais aussi le risque. Seule une bonne rentabilité économique dure.</li>
    </ol>
    <p><b>Conclusion</b>, rédigée sous les deux angles : « <b>du point de vue des actionnaires</b> » (création de valeur, c'est-à-dire
    ROCE comparé au <b>coût du capital</b>) et « <b>du point de vue des prêteurs</b> » (solvabilité et liquidité).
    Pour une reprise, la valeur vient ensuite d'un <b>multiple de l'EBE ou du résultat d'exploitation</b>, moins la dette nette.
    Le montage en LBO dépend de la capacité de la cible à rembourser sa dette avec son flux de trésorerie disponible.</p>
    <p class="note">Formules alignées sur les fiches de synthèse du cours ICCF (HEC Paris / First Finance) : rentabilité économique
    = résultat d'exploitation × (1 − IS) / actif économique ; effet de levier avec un coût de la dette <b>après impôt</b>.</p>
    <p>On mène l'analyse de trois façons : <b>en tendance</b> (sur plusieurs années), <b>en comparaison</b> (face aux concurrents
    du secteur) et <b>par rapport à des normes</b> (les repères ci-dessus).</p>`;

  function setParam(name, value) {
    const v = Number(String(value).replace(",", "."));
    params[name] = Number.isFinite(v) && v > 0 ? v : (name === "mult" ? null : params[name]);
    saveParams();
  }
  return { render, figures, piotroski, methodHtml: METHOD_HTML, params, setParam };
})();
