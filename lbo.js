"use strict";
// Simulateur de reprise à titre personnel (LBO de repreneur) :
// une holding achète 100 % des titres, financée par l'apport du repreneur, un
// prêt d'honneur, un crédit-vendeur, éventuellement un investisseur, et une
// dette bancaire. La cible fait remonter son flux disponible (dividendes),
// qui rembourse la dette. Montants en milliers d'euros.
// Dépend de app.js : $, ok, esc, nf0, nf1.

const LBO = (() => {
  const DEF = {
    nom: "", ca: 5000, ebe: 600, da: 100, bfrj: 45, detteCible: 300,
    croissance: 3, margeEbe: null, capexDa: 100, remu: 0,
    mult: 5, frais: 4,
    apport: 150, honneur: 50, investisseur: 0,
    cvPct: 15, cvTaux: 3, cvDuree: 5, cvDiffere: 2,
    taux: 5, duree: 7, bpi: 0.8,
    is: 25, integ: true, sortie: 7, multSortie: 5,
  };
  let p = { ...DEF };
  try { Object.assign(p, JSON.parse(localStorage.getItem("reprise.lbo") || "{}")); } catch (e) { /* ignoré */ }
  const save = () => { try { localStorage.setItem("reprise.lbo", JSON.stringify(p)); } catch (e) { /* ignoré */ } };

  const k = (v) => (ok(v) ? (Math.abs(v) >= 1000 ? nf1.format(v / 1000) + " M€" : nf0.format(v) + " k€") : "—");
  const pc = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "—");
  const x = (v) => (ok(v) ? nf1.format(v) + "×" : "—");

  // Annuité constante d'un prêt.
  function annuity(capital, rate, years) {
    if (years <= 0) return capital;
    return rate === 0 ? capital / years : capital * rate / (1 - Math.pow(1 + rate, -years));
  }

  // Taux de rendement interne par dichotomie.
  function irr(flows) {
    let lo = -0.99, hi = 5;
    const npv = (r) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (npv(lo) * npv(m) <= 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }

  function simulate() {
    const marge0 = p.ca > 0 ? (p.ebe - p.remu) / p.ca : 0;
    const marge = ok(p.margeEbe) ? p.margeEbe / 100 : marge0;
    const ebe0 = p.ebe - p.remu;                     // EBE retraité de la rémunération du repreneur
    const ve = p.mult * ebe0;
    const prixTitres = ve - p.detteCible;
    const frais = prixTitres * p.frais / 100;
    const besoin = prixTitres + frais;
    const cv = prixTitres * p.cvPct / 100;
    const fondsPropres = p.apport + p.honneur + p.investisseur;
    const senior = Math.max(0, besoin - fondsPropres - cv);
    const t = p.is / 100;
    const r = p.taux / 100, rcv = p.cvTaux / 100;
    const annSenior = annuity(senior, r, p.duree);
    const bpiCout = senior * p.bpi / 100;           // commission de garantie, par an sur l'encours (approx.)

    const rows = [];
    let dS = senior, dCV = cv, cash = 0, ca = p.ca, bfrPrev = p.ca * p.bfrj / 365;
    let dscrMin = Infinity;
    for (let y = 1; y <= Math.max(p.sortie, p.duree); y++) {
      ca = ca * (1 + p.croissance / 100);
      const ebe = ca * marge;
      const da = p.da * ca / p.ca;
      const ebit = ebe - da;
      const capex = da * p.capexDa / 100;
      const bfr = ca * p.bfrj / 365, dBfr = bfr - bfrPrev; bfrPrev = bfr;
      const intS = dS * r, intCV = dCV * rcv, garantie = dS * p.bpi / 100;
      const interets = intS + intCV + garantie;
      // Intégration fiscale : les intérêts de la holding s'imputent sur le résultat de la cible.
      const isGroupe = p.integ ? Math.max(0, ebit - interets) * t : Math.max(0, ebit) * t + 0.05 * t * Math.max(0, ebe - ebit);
      const flux = ebe - isGroupe - capex - dBfr;   // flux disponible remonté à la holding (avant service de la dette)
      const remS = dS > 0 ? Math.min(dS, annSenior - intS) : 0;
      const cvAmort = y > p.cvDiffere && dCV > 0 ? Math.min(dCV, cv / Math.max(1, p.cvDuree - p.cvDiffere)) : 0;
      const service = intS + remS + intCV + cvAmort + garantie;
      const dscr = service > 0 ? (flux + (p.integ ? 0 : 0)) / service : null;
      if (ok(dscr) && y <= p.duree) dscrMin = Math.min(dscrMin, dscr);
      dS -= remS; dCV -= cvAmort;
      cash += flux - service;
      rows.push({ y, ca, ebe, ebit, isGroupe, capex, dBfr, flux, intS, remS, intCV, cvAmort, garantie, service, dscr, dS, dCV, cash });
    }
    const exitRow = rows[p.sortie - 1];
    const valeurSortie = p.multSortie * exitRow.ebe - p.detteCible;
    const equitySortie = valeurSortie - exitRow.dS - exitRow.dCV + exitRow.cash;
    const partRepreneur = fondsPropres > 0 ? (p.apport + p.honneur) / fondsPropres : 1;
    const gainRep = equitySortie * partRepreneur;
    const flows = [-(p.apport + p.honneur), ...Array(p.sortie - 1).fill(0), gainRep];
    return {
      marge, ebe0, ve, prixTitres, frais, besoin, cv, fondsPropres, senior, annSenior, bpiCout, rows,
      dscrMin: dscrMin === Infinity ? null : dscrMin, cashMin: Math.min(0, ...rows.slice(0, p.sortie).map((o) => o.cash)), valeurSortie, equitySortie, partRepreneur, gainRep,
      tri: irr(flows), multiple: (p.apport + p.honneur) > 0 ? gainRep / (p.apport + p.honneur) : null,
      levier: ebe0 > 0 ? (senior + cv) / ebe0 : null,
      partFP: besoin > 0 ? fondsPropres / besoin : null,
    };
  }

  function field(id, label, unit, step = 1, help = "") {
    return `<label class="lf">${label}<span><input type="number" step="${step}" data-lbo="${id}" value="${p[id] ?? ""}" inputmode="decimal">${unit}</span>${help ? `<small>${help}</small>` : ""}</label>`;
  }

  function light(s) { return `<i class="light ${s}"></i>`; }

  function render() {
    const s = simulate();
    const checks = [
      [s.partFP >= 0.3 ? "green" : s.partFP >= 0.2 ? "orange" : "red", `Fonds propres ${pc(s.partFP)} du besoin`, "Les banques demandent en général 20 à 30 % d'apport (apport + prêt d'honneur + investisseurs)."],
      [s.levier <= 3.5 ? "green" : s.levier <= 4.5 ? "orange" : "red", `Dette d'acquisition ${x(s.levier)} l'EBE`, "Repère usuel pour une PME : 3 à 3,5× l'EBE au plus."],
      [!ok(s.dscrMin) ? "grey" : s.dscrMin >= 1.25 ? "green" : s.dscrMin >= 1 ? "orange" : "red", `Couverture minimale du service de la dette ${ok(s.dscrMin) ? nf1.format(s.dscrMin) : "—"}`, "Flux disponible / (intérêts + remboursements). Les banques veulent au moins 1,2 à 1,3 chaque année."],
      [s.cashMin < 0 ? "red" : "green", s.cashMin < 0 ? `Trou de trésorerie de ${k(-s.cashMin)} dans la holding` : "La holding reste en trésorerie positive",
        s.cashMin < 0 ? "Le flux remonté ne suffit pas à payer la dette : il faudrait plus d'apport, moins de dette, une dette plus longue ou un prix plus bas." : "Le flux de la cible paie chaque échéance."],
      [!ok(s.tri) ? "red" : s.cashMin < 0 ? "orange" : s.tri >= 0.2 ? "green" : s.tri >= 0.1 ? "orange" : "red", `TRI de ton apport ${pc(s.tri)} · multiple ${x(s.multiple)}`,
        `Sortie en année ${p.sortie} à ${x(p.multSortie)} l'EBE.${s.cashMin < 0 ? " Théorique tant que le trou de trésorerie n'est pas comblé." : ""}`],
    ];
    const r = s.rows.slice(0, Math.max(p.sortie, p.duree));
    const th = r.map((o) => `<th>An ${o.y}</th>`).join("");
    const line = (label, fn, cls = "") => `<tr class="${cls}"><td class="l">${label}</td>${r.map((o) => `<td>${fn(o)}</td>`).join("")}</tr>`;
    const kk = (v) => (ok(v) ? nf0.format(v) : "—");
    $("lboOut").innerHTML = `
      <div class="card synth"><h3>Verdict du montage</h3>
        <div class="checks">${checks.map(([c, t, h]) => `<div>${light(c)}<b>${t}</b><span>${h}</span></div>`).join("")}</div></div>
      <div class="card"><h3>Prix et plan de financement <small>(k€)</small></h3>
        <div class="fin">
          <div><h4>Emplois</h4><table><tbody>
            <tr><td class="l">EBE retraité (après ta rémunération)</td><td>${kk(s.ebe0)}</td></tr>
            <tr><td class="l">Valeur d'entreprise (${x(p.mult)} l'EBE)</td><td>${kk(s.ve)}</td></tr>
            <tr><td class="l">− dette nette de la cible</td><td>${kk(p.detteCible)}</td></tr>
            <tr><td class="l"><b>Prix des titres</b></td><td><b>${kk(s.prixTitres)}</b></td></tr>
            <tr><td class="l">Frais d'acquisition (${nf1.format(p.frais)} %)</td><td>${kk(s.frais)}</td></tr>
            <tr><td class="l"><b>Besoin total</b></td><td><b>${kk(s.besoin)}</b></td></tr></tbody></table></div>
          <div><h4>Ressources</h4><table><tbody>
            <tr><td class="l">Ton apport personnel</td><td>${kk(p.apport)}</td></tr>
            <tr><td class="l">Prêt d'honneur (à toi, 0 %)</td><td>${kk(p.honneur)}</td></tr>
            <tr><td class="l">Investisseur minoritaire</td><td>${kk(p.investisseur)}</td></tr>
            <tr><td class="l">Crédit-vendeur (${nf0.format(p.cvPct)} % du prix)</td><td>${kk(s.cv)}</td></tr>
            <tr><td class="l">Dette bancaire senior (${p.duree} ans, ${nf1.format(p.taux)} %)</td><td>${kk(s.senior)}</td></tr>
            <tr><td class="l"><b>Total</b></td><td><b>${kk(p.apport + p.honneur + p.investisseur + s.cv + s.senior)}</b></td></tr></tbody></table></div>
        </div>
        ${bars(s)}
      </div>
      <div class="card"><h3>Plan de remboursement année par année <small>(k€)</small></h3>
        <div class="tablewrap"><table><thead><tr><th class="l"></th>${th}</tr></thead><tbody>
          ${line("Chiffre d'affaires", (o) => kk(o.ca))}
          ${line("EBE", (o) => kk(o.ebe))}
          ${line("− impôt sur les sociétés", (o) => kk(-o.isGroupe))}
          ${line("− investissements", (o) => kk(-o.capex))}
          ${line("− variation du BFR", (o) => kk(-o.dBfr))}
          ${line("<b>= Flux remonté à la holding</b>", (o) => `<b>${kk(o.flux)}</b>`)}
          ${line("Intérêts bancaires + garantie", (o) => kk(o.intS + o.garantie))}
          ${line("Remboursement bancaire", (o) => kk(o.remS))}
          ${line("Crédit-vendeur (intérêts + capital)", (o) => kk(o.intCV + o.cvAmort))}
          ${line("<b>Service de la dette</b>", (o) => `<b>${kk(o.service)}</b>`)}
          ${line("Couverture (flux / service)", (o) => (ok(o.dscr) ? `<span class="${o.dscr >= 1.25 ? "pos" : o.dscr >= 1 ? "" : "neg"}">${nf1.format(o.dscr)}</span>` : "—"))}
          ${line("Dette bancaire restante", (o) => kk(o.dS))}
          ${line("Crédit-vendeur restant", (o) => kk(o.dCV))}
          ${line("Trésorerie cumulée de la holding", (o) => `<span class="${o.cash < 0 ? "neg" : ""}">${kk(o.cash)}</span>`)}
        </tbody></table></div>
        <p class="note">Hypothèses : marge d'EBE constante à ${pc(s.marge)}, croissance ${nf1.format(p.croissance)} % par an, investissements = ${nf0.format(p.capexDa)} % des amortissements,
          impôt ${nf0.format(p.is)} % ${p.integ ? "avec intégration fiscale (holding détenant au moins 95 % : les intérêts s'imputent sur le résultat de la cible)" : "sans intégration fiscale (régime mère-fille : 5 % des dividendes taxés)"}.
          Tout le flux disponible remonte à la holding ; ta rémunération est déjà déduite de l'EBE.</p>
      </div>
      <div class="card"><h3>Sortie en année ${p.sortie}</h3><div class="kpis">
        <div class="kpi"><b>${k(s.valeurSortie)}</b><span>Valeur des titres de la cible (${x(p.multSortie)} l'EBE − dette)</span></div>
        <div class="kpi"><b>${k(s.equitySortie)}</b><span>Valeur des fonds propres de la holding</span></div>
        <div class="kpi"><b>${pc(s.partRepreneur)}</b><span>Ta part du capital</span></div>
        <div class="kpi"><b>${k(s.gainRep)}</b><span>Ta part à la sortie</span></div>
        <div class="kpi"><b>${pc(s.tri)}</b><span>TRI de ton apport (apport + prêt d'honneur)</span></div>
        <div class="kpi"><b>${x(s.multiple)}</b><span>Multiple de ta mise</span></div></div>
        <p class="note">Simulation indicative avant impôt personnel, à valider avec un expert-comptable et ta banque. Le prêt d'honneur se rembourse sur tes revenus personnels.</p></div>`;
  }

  // Barre empilée des ressources, proportionnelle.
  function bars(s) {
    const parts = [["Apport", p.apport, "c-eq"], ["Prêt d'honneur", p.honneur, "c-intang"], ["Investisseur", p.investisseur, "c-gw"],
      ["Crédit-vendeur", s.cv, "c-bfr"], ["Dette bancaire", s.senior, "c-debt"]].filter((a) => a[1] > 0);
    const tot = parts.reduce((a, b) => a + b[1], 0) || 1;
    return `<div class="stackbar">${parts.map(([l, v, c]) => `<div class="${c}" style="width:${v / tot * 100}%" title="${l} ${nf0.format(v)} k€">${v / tot > 0.09 ? `${l}<br>${nf0.format(v / tot * 100)} %` : ""}</div>`).join("")}</div>
      <div class="legend">${parts.map(([l, v, c]) => `<span><i class="sw ${c}"></i>${l} ${nf0.format(v / tot * 100)} %</span>`).join("")}</div>`;
  }

  function form() {
    return `
      <div class="card"><h3>La cible ${p.nom ? `: ${esc(p.nom)}` : ""} <small>(k€)</small></h3><div class="lgrid">
        ${field("ca", "Chiffre d'affaires", "k€", 10)}
        ${field("ebe", "EBE actuel", "k€", 10, "après la rémunération du dirigeant actuel")}
        ${field("remu", "Surcoût de ta rémunération", "k€/an", 5, "si tu te paies plus que le cédant")}
        ${field("da", "Dotations aux amortissements", "k€", 5)}
        ${field("bfrj", "BFR", "jours de CA", 1)}
        ${field("detteCible", "Dette nette de la cible", "k€", 10, "négatif si trésorerie nette")}
        ${field("croissance", "Croissance du CA", "% / an", 0.5)}
        ${field("capexDa", "Investissements", "% des amort.", 10, "100 % = maintien")}
      </div></div>
      <div class="card"><h3>Prix</h3><div class="lgrid">
        ${field("mult", "Multiple d'EBE", "×", 0.25, "PME : souvent 4 à 7×")}
        ${field("frais", "Frais d'acquisition", "% du prix", 0.5, "audits, avocats, banque")}
      </div></div>
      <div class="card"><h3>Financement</h3><div class="lgrid">
        ${field("apport", "Ton apport personnel", "k€", 10)}
        ${field("honneur", "Prêt d'honneur", "k€", 5, "Réseau Entreprendre, Initiative France")}
        ${field("investisseur", "Investisseur minoritaire", "k€", 10)}
        ${field("cvPct", "Crédit-vendeur", "% du prix", 1, "10 à 30 % en pratique")}
        ${field("cvTaux", "Taux du crédit-vendeur", "%", 0.25)}
        ${field("cvDuree", "Durée du crédit-vendeur", "ans", 1)}
        ${field("cvDiffere", "dont différé", "ans", 1)}
        ${field("taux", "Taux de la dette bancaire", "%", 0.25)}
        ${field("duree", "Durée de la dette bancaire", "ans", 1, "souvent 7 ans")}
        ${field("bpi", "Garantie Bpifrance", "% / an", 0.1)}
      </div></div>
      <div class="card"><h3>Fiscalité et sortie</h3><div class="lgrid">
        ${field("is", "Impôt sur les sociétés", "%", 1)}
        <label class="lf check"><input type="checkbox" data-lbo="integ" ${p.integ ? "checked" : ""}> Intégration fiscale (holding ≥ 95 %)</label>
        ${field("sortie", "Année de sortie", "", 1)}
        ${field("multSortie", "Multiple de sortie", "×", 0.25)}
      </div>
      <button class="ghost" id="lboReset">Revenir aux valeurs par défaut</button></div>`;
  }

  function mount() {
    $("lboForm").innerHTML = form();
    render();
    $("lboForm").oninput = (e) => {
      const key = e.target.dataset.lbo;
      if (!key) return;
      if (e.target.type === "checkbox") p[key] = e.target.checked;
      else { const v = Number(String(e.target.value).replace(",", ".")); if (Number.isFinite(v)) p[key] = v; }
      if (["duree", "sortie", "cvDuree"].includes(key)) p[key] = Math.max(1, Math.min(15, Math.round(p[key])));
      save(); render();
    };
    $("lboForm").onclick = (e) => { if (e.target.id === "lboReset") { p = { ...DEF }; save(); mount(); } };
  }

  // Préremplit le simulateur avec une PME (montants en k€).
  function fromPme(o) {
    const caf = ok(o.cafca) ? o.cafca / 100 * o.ca : null;
    p = { ...p, nom: o.n, ca: o.ca, ebe: o.ebe, da: ok(o.ebit) ? Math.max(0, o.ebe - o.ebit) : p.da,
      bfrj: ok(o.bfrj) ? Math.round(o.bfrj) : p.bfrj,
      detteCible: ok(o.remb) && ok(caf) && caf > 0 ? Math.round(Math.max(0, o.remb * caf)) : 0,
      croissance: ok(o.g) ? Math.round(Math.max(-5, Math.min(10, o.g * 100)) * 2) / 2 : p.croissance, remu: 0, margeEbe: null };
    save();
  }

  return { mount, fromPme };
})();
