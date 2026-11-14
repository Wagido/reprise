"use strict";
// Analyse financière d'une société, dans l'esprit de l'analyse « par cycles »
// enseignée en finance d'entreprise : bilan économique (actif économique =
// immobilisations + BFR, financé par capitaux propres + dette nette), bilan
// financier (fonds de roulement), compte de résultat en cascade, tableau de
// flux, puis rentabilité et effet de levier.
// Dépend de app.js : val(), ok(), esc(), nf0, nf1, state.

const Analyse = (() => {
  // ---------- Agrégats ----------
  function figures(c, i) {
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
      ropat, margin, rotation, roce, iCost, de, roeTheo, roe,
      bfrDays: ok(bfr) && ok(rev) && rev > 0 ? bfr / rev * 365 : null,
    };
  }

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

  function render(c, i) {
    const f = figures(c, i);
    return economicBalance(f, c.cur) + financialBalance(f, c.cur) + incomeStatement(f, c.cur) +
      cashFlow(f, c.cur) + leverage(f) + history(c);
  }

  return { render, figures };
})();
