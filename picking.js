"use strict";
// Onglet « Stock picking » : stratégies d'investissement, valeur intrinsèque
// (multiple sectoriel et flux actualisés), marge de sécurité et liste de suivi.
// Ne porte que sur les sociétés dont on a la capitalisation au dernier cours.
// Dépend de app.js ($, ok, esc, nf0, nf1, state, compute, openDetail) et d'analyse.js.

const Picking = (() => {
  const P = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "—");
  const X = (v) => (ok(v) ? nf1.format(v) + "×" : "—");

  const DEF = { strat: "garp", wacc: 9, g: 3, horizon: 5, custom: { roce: 12, per: 20, fs: 6, nd: 2, gr: 0, fy: 4 } };
  let s = { ...DEF };
  try { Object.assign(s, JSON.parse(localStorage.getItem("reprise.picking") || "{}")); } catch (e) { /* ignoré */ }
  let watch = {};
  try { watch = JSON.parse(localStorage.getItem("reprise.watch") || "{}"); } catch (e) { /* ignoré */ }
  const save = () => {
    try { localStorage.setItem("reprise.picking", JSON.stringify(s)); localStorage.setItem("reprise.watch", JSON.stringify(watch)); } catch (e) { /* ignoré */ }
  };

  // Critère : [libellé, test(f, med) -> true/false/null]
  const STRATS = {
    garp: { name: "Qualité à prix raisonnable", desc: "Bonne entreprise, bien financée, pas plus chère que son secteur.", crit: [
      ["ROCE après IS ≥ 12 %", (f) => (ok(f.roce) ? f.roce >= 0.12 : null)],
      ["Piotroski ≥ 6", (f) => (ok(f.fs) ? f.fs >= 6 : null)],
      ["Altman hors zone de détresse", (f) => (ok(f.zScore) ? f.zScore >= 1.1 : true)],
      ["Dette nette / EBE ≤ 2", (f) => (ok(f.netDebt) && f.netDebt <= 0) || (ok(f.ndEbitda) ? f.ndEbitda <= 2 : null)],
      ["PER ≤ médiane du secteur", (f, m) => (ok(f.per) && ok(m.per) ? f.per <= m.per : null)],
    ] },
    value: { name: "Décote", desc: "Moins chère que son secteur, avec des flux réels et une situation saine.", crit: [
      ["VE / EBE ≤ 70 % de la médiane du secteur", (f, m) => (ok(f.evEbitda) && ok(m.evEbitda) ? f.evEbitda <= 0.7 * m.evEbitda : null)],
      ["Rendement du flux disponible ≥ 6 %", (f) => (ok(f.fcfYield) ? f.fcfYield >= 0.06 : null)],
      ["Piotroski ≥ 5", (f) => (ok(f.fs) ? f.fs >= 5 : null)],
      ["Altman ≥ 1,1", (f) => (ok(f.zScore) ? f.zScore >= 1.1 : true)],
    ] },
    growth: { name: "Croissance rentable", desc: "Croît vite, sans sacrifier la rentabilité.", crit: [
      ["Croissance du CA ≥ 10 % par an sur 3 ans", (f) => (ok(f.growth) ? f.growth >= 0.10 : null)],
      ["Marge d'EBE ≥ médiane du secteur", (f, m) => (ok(f.ebitdaMargin) && ok(m.ebitdaMargin) ? f.ebitdaMargin >= m.ebitdaMargin : null)],
      ["ROCE après IS ≥ coût du capital", (f) => (ok(f.roce) ? f.roce >= s.wacc / 100 : null)],
      ["Flux disponible positif", (f) => (ok(f.fcf) ? f.fcf > 0 : null)],
    ] },
    income: { name: "Rendement", desc: "Dividende élevé et soutenable.", crit: [
      ["Rendement du dividende ≥ 3 %", (f) => (ok(f.divYield) ? f.divYield >= 0.03 : null)],
      ["Flux disponible ≥ dividendes", (f) => (ok(f.fcf) && ok(f.div) ? f.fcf >= f.div : null)],
      ["Dette nette / EBE ≤ 3", (f) => (ok(f.netDebt) && f.netDebt <= 0) || (ok(f.ndEbitda) ? f.ndEbitda <= 3 : null)],
      ["Bénéficiaire", (f) => (ok(f.ni) ? f.ni > 0 : null)],
    ] },
    turnaround: { name: "Redressement", desc: "Les fondamentaux s'améliorent nettement, le marché ne le valorise pas encore.", crit: [
      ["Piotroski ≥ 7", (f) => (ok(f.fs) ? f.fs >= 7 : null)],
      ["ROCE en hausse sur un an", (f) => (ok(f.roce) && ok(f.roceP) ? f.roce > f.roceP : null)],
      ["PER ≤ 15", (f) => (ok(f.per) ? f.per <= 15 : null)],
      ["Altman ≥ 1,1", (f) => (ok(f.zScore) ? f.zScore >= 1.1 : true)],
    ] },
    custom: { name: "Critères libres", desc: "Tes propres seuils.", crit: [
      ["ROCE après IS ≥ {roce} %", (f) => (ok(f.roce) ? f.roce * 100 >= s.custom.roce : null)],
      ["PER ≤ {per}", (f) => (ok(f.per) ? f.per <= s.custom.per : null)],
      ["Piotroski ≥ {fs}", (f) => (ok(f.fs) ? f.fs >= s.custom.fs : null)],
      ["Dette nette / EBE ≤ {nd}", (f) => (ok(f.netDebt) && f.netDebt <= 0) || (ok(f.ndEbitda) ? f.ndEbitda <= s.custom.nd : null)],
      ["Croissance du CA ≥ {gr} % par an", (f) => (ok(f.growth) ? f.growth * 100 >= s.custom.gr : null)],
      ["Rendement du flux disponible ≥ {fy} %", (f) => (ok(f.fcfYield) ? f.fcfYield * 100 >= s.custom.fy : null)],
    ] },
  };

  // Valeur intrinsèque des capitaux propres (millions, devise d'origine).
  function intrinsic(f, med) {
    const sector = ok(med.evEbitda) && ok(f.ebitda) && f.ebitda > 0 && ok(f.netDebt) ? med.evEbitda * f.ebitda - f.netDebt : null;
    // Flux actualisés : flux disponible normalisé (moyenne des 3 derniers), croissance g sur l'horizon
    // puis g terminale prudente (2 %), actualisé au coût du capital.
    let dcf = null;
    const w = s.wacc / 100, g = s.g / 100, gT = Math.min(0.02, w - 0.01);
    if (ok(f.fcfNorm) && f.fcfNorm > 0 && ok(f.netDebt) && w > gT) {
      let v = 0, cf = f.fcfNorm;
      for (let t = 1; t <= s.horizon; t++) { cf *= 1 + g; v += cf / Math.pow(1 + w, t); }
      v += cf * (1 + gT) / (w - gT) / Math.pow(1 + w, s.horizon);
      dcf = v - f.netDebt;
    }
    return { sector, dcf };
  }

  function rows() {
    const i = state.meta.years.indexOf(Number($("year").value));
    const st = STRATS[s.strat];
    const base = compute(true).filter((r) => r.c.px);
    const out = [];
    for (const r of base) {
      const c = r.c;
      const f = Analyse.figures(c, i);
      if (!ok(f.mcap) || f.mcap <= 0) continue;
      const p = Analyse.piotroski(c, i);
      f.fs = p.known >= 8 ? Math.round(p.score * 9 / p.known) : null;
      f.roceP = Analyse.figures(c, i - 1).roce;
      const fcfs = [0, 1, 2].map((k) => Analyse.figures(c, i - k).fcf).filter(ok);
      f.fcfNorm = fcfs.length ? fcfs.reduce((a, b) => a + b, 0) / fcfs.length : null;
      const med = Analyse.sectorMedians(c.s, i);
      const res = st.crit.map(([, test]) => test(f, med));
      const known = res.filter((x) => x !== null && x !== undefined);
      const passed = known.filter(Boolean).length;
      const iv = intrinsic(f, med);
      const mos = (v) => (ok(v) && v > 0 ? 1 - f.mcap / v : null);   // marge de sécurité : décote du cours sur la valeur
      out.push({ c, f, res, passed, total: st.crit.length, known: known.length, all: passed === st.crit.length,
        ivS: iv.sector, ivD: iv.dcf, mosS: mos(iv.sector), mosD: mos(iv.dcf) });
    }
    // Classement : nombre de critères remplis, puis décote la plus prudente des deux méthodes ;
    // une décote extrême (> 70 %) est jugée douteuse et passe après les décotes crédibles.
    const key = (r) => { const m = [r.mosS, r.mosD].filter(ok); if (!m.length) return -9; const v = Math.min(...m); return v > 0.7 ? 0.2 : v; };
    out.sort((a, b) => (b.passed - a.passed) || (key(b) - key(a)));
    return out;
  }

  function stratTabs() {
    return Object.entries(STRATS).map(([k, v]) => `<button class="chip" data-strat="${k}" aria-pressed="${k === s.strat}">${v.name}</button>`).join("");
  }

  function customForm() {
    if (s.strat !== "custom") return "";
    const f = (k, l, u) => `<label>${l} <input type="number" step="0.5" data-cust="${k}" value="${s.custom[k]}"> ${u}</label>`;
    return `<div class="filters pick-custom">${f("roce", "ROCE min", "%")}${f("per", "PER max", "")}${f("fs", "Piotroski min", "/9")}${f("nd", "Dette nette / EBE max", "×")}${f("gr", "Croissance min", "%")}${f("fy", "Rendement du flux min", "%")}</div>`;
  }

  function render() {
    const st = STRATS[s.strat];
    const list = rows();
    const full = list.filter((r) => r.all);
    const crit = st.crit.map(([l]) => l.replace(/\{(\w+)\}/g, (_, k) => s.custom[k]));
    const pd = state.meta.price_date && state.meta.price_date.US;
    const mos = (v) => (ok(v) ? `<span class="${v >= 0.2 ? "pos" : v < 0 ? "neg" : ""}">${v >= 0 ? "" : "+"}${nf0.format(Math.abs(v) * 100)} %${v >= 0 ? " de décote" : " de prime"}</span>${v > 0.7 ? ' <span class="warn" title="Décote extrême : vérifier le nombre d\'actions, un élément exceptionnel ou une activité en déclin">⚠</span>' : ""}` : "—");
    const shown = list.slice(0, 150);
    $("pickOut").innerHTML = `
      <div class="card">
        <div class="chips">${stratTabs()}</div>
        <p class="note"><b>${esc(st.name)}</b> — ${esc(st.desc)} Critères : ${crit.map((c) => esc(c)).join(" · ")}.</p>
        ${customForm()}
        <div class="filters pick-params">
          <label>Coût du capital <input type="number" step="0.5" data-p="wacc" value="${s.wacc}"> %</label>
          <label>Croissance du flux (${s.horizon} ans) <input type="number" step="0.5" data-p="g" value="${s.g}"> % / an</label>
          <label>Horizon <input type="number" step="1" min="3" max="10" data-p="horizon" value="${s.horizon}"> ans</label>
        </div>
        <p class="count">${nf0.format(full.length)} société${full.length > 1 ? "s" : ""} remplissent tous les critères, sur ${nf0.format(list.length)} avec un cours${pd ? ` (au ${new Date(pd).toLocaleDateString("fr-FR")})` : ""}. Les filtres du haut (pays, secteur, taille, exercice) s'appliquent.</p>
      </div>
      <div class="tablewrap"><table><thead><tr>
        <th class="l">Société</th><th>Critères</th><th>Capitalisation</th><th>PER</th><th>VE/EBE</th><th>Rdt flux</th><th>ROCE</th><th>Piotroski</th>
        <th>Valeur (secteur)</th><th>Valeur (DCF)</th><th class="l">Suivi</th></tr></thead><tbody>
        ${shown.map((r, k) => `<tr data-k="${k}">
          <td class="l">${esc(r.c.n)}<span class="flag">${r.c.c} · ${esc(r.c.t || "")} · ${esc((state.meta.sectors[r.c.s] || "").split(/[ ,]/)[0])}</span></td>
          <td><span class="score ${r.all ? "" : "partial"}" title="${r.res.map((x, j) => (x === null ? "?" : x ? "✓" : "✗") + " " + crit[j]).join("\n")}">${r.passed}/${r.total}</span></td>
          <td>${nf0.format(r.f.mcap)} M ${esc(r.c.cur)}</td><td>${ok(r.f.per) ? nf1.format(r.f.per) : "—"}</td><td>${X(r.f.evEbitda)}</td>
          <td>${P(r.f.fcfYield)}</td><td>${P(r.f.roce)}</td><td>${ok(r.f.fs) ? r.f.fs + "/9" : "—"}</td>
          <td>${mos(r.mosS)}</td><td>${mos(r.mosD)}</td>
          <td class="l"><button class="star" data-star="${esc(r.c.id)}" aria-pressed="${!!watch[r.c.id]}" title="Ajouter à ma liste de suivi">${watch[r.c.id] ? "★" : "☆"}</button></td></tr>`).join("")}
      </tbody></table></div>
      <p class="note">Valeur (secteur) : EBE × VE / EBE médian du secteur − dette nette. Valeur (DCF) : flux disponible moyen des 3 derniers exercices, croissance de ${s.g} % par an
        pendant ${s.horizon} ans puis 2 % à l'infini, actualisé à ${s.wacc} %, − dette nette. Décote = 1 − capitalisation / valeur ; à partir de 20 % on parle de marge de sécurité. ⚠ au-delà de 70 % : souvent une donnée à vérifier
        (catégories d'actions, élément exceptionnel, flux non récurrents) plutôt qu'une vraie aubaine.
        Outil d'aide à la sélection, pas un conseil en investissement.</p>
      ${watchlist()}`;
    state.pickRows = shown;
  }

  function watchlist() {
    const ids = Object.keys(watch);
    if (!ids.length) return `<div class="card"><h3>Ma liste de suivi</h3><p class="note">Clique sur ☆ pour suivre une société.</p></div>`;
    const i = state.meta.years.indexOf(Number($("year").value));
    const lines = ids.map((id) => {
      const c = state.companies.find((x) => x.id === id);
      if (!c) return "";
      const f = Analyse.figures(c, i);
      const w = watch[id];
      const px = c.px ? c.px[0] : null;
      const perf = ok(px) && ok(w.entry) && w.entry > 0 ? px / w.entry - 1 : null;
      return `<tr><td class="l">${esc(c.n)}<span class="flag">${esc(c.t || "")}</span></td><td>${ok(px) ? nf1.format(px) : "—"}</td>
        <td><input type="number" step="0.01" data-entry="${esc(id)}" value="${w.entry ?? ""}" placeholder="prix d'achat"></td>
        <td>${ok(perf) ? `<span class="${perf >= 0 ? "pos" : "neg"}">${perf >= 0 ? "+" : ""}${nf1.format(perf * 100)} %</span>` : "—"}</td>
        <td>${ok(f.per) ? nf1.format(f.per) : "—"}</td><td>${X(f.evEbitda)}</td>
        <td class="l"><input type="text" data-note="${esc(id)}" value="${esc(w.note || "")}" placeholder="note"></td>
        <td><button class="star" data-star="${esc(id)}" aria-pressed="true" title="Retirer">★</button></td></tr>`;
    }).join("");
    return `<div class="card"><h3>Ma liste de suivi</h3><div class="tablewrap"><table class="watch"><thead><tr><th class="l">Société</th><th>Cours</th><th>Prix d'achat</th><th>Plus-value</th><th>PER</th><th>VE/EBE</th><th class="l">Note</th><th></th></tr></thead>
      <tbody>${lines}</tbody></table></div><p class="note">Enregistrée dans ce navigateur uniquement.</p></div>`;
  }

  let bound = false;
  function mount() {
    render();
    if (bound) return;
    bound = true;
    const box = $("pickOut");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-strat]");
      if (b) { s.strat = b.dataset.strat; save(); render(); return; }
      const st = e.target.closest("[data-star]");
      if (st) {
        const id = st.dataset.star;
        if (watch[id]) delete watch[id]; else { const c = state.companies.find((x) => x.id === id); watch[id] = { entry: c && c.px ? c.px[0] : null, note: "" }; }
        save(); render(); return;
      }
      const tr = e.target.closest("tr[data-k]");
      if (tr && !e.target.closest("button,input")) openDetail(state.pickRows[Number(tr.dataset.k)].c);
    });
    box.addEventListener("change", (e) => {
      const t = e.target, v = Number(String(t.value).replace(",", "."));
      if (t.dataset.p && Number.isFinite(v)) s[t.dataset.p] = t.dataset.p === "horizon" ? Math.max(3, Math.min(10, Math.round(v))) : v;
      else if (t.dataset.cust && Number.isFinite(v)) s.custom[t.dataset.cust] = v;
      else if (t.dataset.entry) watch[t.dataset.entry].entry = Number.isFinite(v) && v > 0 ? v : null;
      else if (t.dataset.note !== undefined) { watch[t.dataset.note].note = t.value; save(); return; }
      else return;
      save(); render();
    });
  }

  return { mount, render };
})();
