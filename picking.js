"use strict";
// Onglet « Mon portefeuille » : les valeurs marquées d'une étoile (★) dans l'onglet Analyse ou dans
// une fiche, avec la quantité, le prix d'achat, la plus-value, et pour chacune les deux réponses du
// plan d'analyse (crée-t-elle de la valeur ? le marché la paie-t-il déjà ?). Suggestions : les
// sociétés qui remplissent une stratégie et ne sont pas encore dans le portefeuille.
// Les stratégies servent aussi de filtre « Stratégie » dans les filtres du haut.
// Dépend de app.js ($, ok, esc, nf0, nf1, state, compute, openDetail, Fav, starBtn) et d'analyse.js.

const Picking = (() => {
  const P = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "—");
  const X = (v) => (ok(v) ? nf1.format(v) + "×" : "—");
  const light = (s, t) => `<i class="light ${s}" title="${esc(t || "")}"></i>`;

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
      ["ROCE après IS ≥ coût du capital", (f) => (ok(f.roce) && ok(f.k) ? f.roce >= f.k : null)],
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
  };

  // Le filtre « Stratégie » des filtres du haut (rempli avant le chargement des filtres enregistrés).
  $("strat").insertAdjacentHTML("beforeend", Object.entries(STRATS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join(""));

  // Une société remplit-elle tous les critères de la stratégie ? (cours requis ; mis en cache)
  const cache = new Map();
  function check(c, i, key) {
    const ck = `${c.id}|${i}|${key}`;
    if (cache.has(ck)) return cache.get(ck);
    const st = STRATS[key];
    let out = { passed: 0, total: st.crit.length, res: [], all: false };
    const f = Analyse.figures(c, i);
    if (c.px && ok(f.mcap) && f.mcap > 0) {
      const p = Analyse.piotroski(c, i);
      f.fs = p.known >= 8 ? Math.round(p.score * 9 / p.known) : null;
      f.roceP = Analyse.figures(c, i - 1).roce;
      const med = Analyse.sectorMedians(c.s, i);
      const res = st.crit.map(([, test]) => test(f, med));
      const passed = res.filter((x) => x === true).length;
      out = { passed, total: st.crit.length, res, all: passed === st.crit.length };
    }
    cache.set(ck, out);
    return out;
  }
  const passes = (c, i, key) => !!STRATS[key] && check(c, i, key).all;

  const yearIdx = () => state.meta.years.indexOf(Number($("year").value));
  const pxCur = (c) => (c.c === "US" ? "USD" : "EUR");
  const toEur = (cur) => (cur === "EUR" ? 1 : state.meta.fx[cur] ? Object.values(state.meta.fx[cur]).pop() : null);

  function lines() {
    const i = yearIdx();
    return Fav.ids().map((id) => {
      const c = state.companies.find((x) => x.id === id);
      if (!c) return null;
      const w = Fav.get(id);
      const sc = Analyse.stepColors(c, i);
      const { f, mv, fv } = Analyse.market(c, i);
      const px = c.px ? c.px[0] : null;
      const vEur = ok(px) && ok(w.qty) && toEur(pxCur(c)) ? px * w.qty * toEur(pxCur(c)) : null;
      const cEur = ok(w.entry) && ok(w.qty) && toEur(pxCur(c)) ? w.entry * w.qty * toEur(pxCur(c)) : null;
      const perf = ok(px) && ok(w.entry) && w.entry > 0 ? px / w.entry - 1 : null;
      const vals = [fv.sector, fv.dcf].filter(ok);
      const gap = ok(f.mcap) && vals.length ? f.mcap / (vals.reduce((a, b) => a + b, 0) / vals.length) - 1 : null;
      return { c, w, f, sc: sc.s, mv, px, vEur, cEur, perf, gap };
    }).filter(Boolean);
  }

  function summary(L) {
    const tot = L.reduce((a, l) => a + (l.vEur || 0), 0), cost = L.reduce((a, l) => a + (ok(l.vEur) && ok(l.cEur) ? l.cEur : 0), 0);
    const vCost = L.reduce((a, l) => a + (ok(l.vEur) && ok(l.cEur) ? l.vEur : 0), 0);
    const n = L.length, val = L.filter((l) => l.sc[3] === "green").length, solv = L.filter((l) => l.sc[2] === "green").length;
    const cheap = L.filter((l) => ok(l.gap) && l.gap <= -0.2).length, dear = L.filter((l) => ok(l.gap) && l.gap >= 0.2).length;
    const k = (v, l, s) => `<div class="kpi"><b>${v}</b><span>${l}</span>${s ? `<small class="bench">${s}</small>` : ""}</div>`;
    return `<div class="kpis">
      ${k(nf0.format(n), "valeurs suivies")}
      ${k(tot > 0 ? nf0.format(tot) + " €" : "—", "valeur au dernier cours", tot > 0 ? "" : "saisir les quantités")}
      ${k(cost > 0 ? `<span class="${vCost >= cost ? "pos" : "neg"}">${vCost >= cost ? "+" : ""}${nf1.format((vCost / cost - 1) * 100)} %</span>` : "—", "plus-value latente", cost > 0 ? `${vCost >= cost ? "+" : ""}${nf0.format(vCost - cost)} €` : "saisir quantités et prix d'achat")}
      ${k(`${val} / ${n}`, "créent de la valeur", "ROCE au-dessus du coût du capital")}
      ${k(`${solv} / ${n}`, "solides pour les prêteurs", "dette remboursable")}
      ${k(`${cheap} · ${dear}`, "sous · au-dessus de la valeur estimée", "écart de plus de 20 %")}
    </div>`;
  }

  function sectorBars(L) {
    const tot = L.reduce((a, l) => a + (l.vEur || 0), 0), byW = tot > 0;
    const by = {};
    for (const l of L) by[l.c.s] = (by[l.c.s] || 0) + (byW ? l.vEur || 0 : 1);
    const sum = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
    return `<div class="card"><h3>Répartition par secteur <small>— ${byW ? "en valeur" : "en nombre de lignes"}</small></h3>
      <div class="pf-bars">${rows.map(([s, v]) => `<div class="pf-bar"><span>${esc(state.meta.sectors[s] || s)}</span><i style="width:${(v / sum * 100).toFixed(1)}%"></i><b>${nf0.format(v / sum * 100)} %</b></div>`).join("")}</div></div>`;
  }

  function table(L) {
    const gapTxt = (g) => (ok(g) ? `<span class="${g <= -0.2 ? "pos" : g >= 0.2 ? "neg" : ""}">${g <= 0 ? nf0.format(-g * 100) + " % sous" : nf0.format(g * 100) + " % au-dessus"}</span>` : "—");
    const tot = L.reduce((a, l) => a + (l.vEur || 0), 0);
    return `<div class="tablewrap"><table class="watch pf"><thead><tr>
      <th class="l">Société</th><th>Cours</th><th>Quantité</th><th>Prix d'achat</th><th>Valeur (€)</th><th>Poids</th><th>Plus-value</th>
      <th title="Les 4 étapes : marges, investissements, financement, rentabilité">4 étapes</th><th title="Le marché la paie-t-il déjà ?">Marché</th><th>Cours / valeur estimée</th><th>PER</th><th class="l">Note</th><th></th></tr></thead><tbody>
      ${L.map((l, k) => `<tr data-k="${k}">
        <td class="l">${esc(l.c.n)}<span class="flag">${l.c.c}${l.c.t ? " · " + esc(l.c.t) : ""}</span></td>
        <td>${ok(l.px) ? nf1.format(l.px) + " " + (pxCur(l.c) === "USD" ? "$" : "€") : "—"}</td>
        <td><input type="number" step="1" min="0" data-qty="${esc(l.c.id)}" value="${l.w.qty ?? ""}" placeholder="—"></td>
        <td><input type="number" step="0.01" min="0" data-entry="${esc(l.c.id)}" value="${l.w.entry ?? ""}" placeholder="—"></td>
        <td>${ok(l.vEur) ? nf0.format(l.vEur) : "—"}</td><td>${ok(l.vEur) && tot > 0 ? nf0.format(l.vEur / tot * 100) + " %" : "—"}</td>
        <td>${ok(l.perf) ? `<span class="${l.perf >= 0 ? "pos" : "neg"}">${l.perf >= 0 ? "+" : ""}${nf1.format(l.perf * 100)} %</span>` : "—"}</td>
        <td class="lights">${l.sc.map((s, j) => light(s, ["Marges", "Investissements", "Financement", "Rentabilité"][j])).join("")}</td>
        <td>${light(l.mv[0], l.mv[1].replace(/<[^>]+>/g, ""))}</td>
        <td>${gapTxt(l.gap)}</td><td>${ok(l.f.per) ? nf1.format(l.f.per) : "—"}</td>
        <td class="l"><input type="text" data-note="${esc(l.c.id)}" value="${esc(l.w.note || "")}" placeholder="note"></td>
        <td>${starBtn(l.c.id)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  // Suggestions : sociétés qui remplissent la stratégie choisie, absentes du portefeuille.
  let sugStrat = "garp";
  function suggestions() {
    const i = yearIdx();
    const key = $("strat").value || sugStrat;
    const list = compute(true).filter((r) => !Fav.has(r.c.id) && passes(r.c, i, key))
      .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 12);
    state.pickSug = list;
    return `<div class="card"><h3>Idées à étudier <small>— sociétés qui remplissent la stratégie, hors portefeuille</small></h3>
      <div class="chips">${Object.entries(STRATS).map(([k, v]) => `<button class="chip" data-sug="${k}" aria-pressed="${k === key}">${esc(v.name)}</button>`).join("")}</div>
      <p class="note">${esc(STRATS[key].desc)} Critères : ${STRATS[key].crit.map(([l]) => esc(l)).join(" · ")}. Les filtres du haut (zone, secteur, taille) s'appliquent ; le même choix existe dans le filtre « Stratégie » de l'onglet Analyse.</p>
      ${list.length ? `<div class="tablewrap"><table class="pf-sug"><thead><tr><th></th><th class="l">Société</th><th>Score</th><th>ROCE</th><th>PER</th><th>VE/EBE</th></tr></thead><tbody>
        ${list.map((r, k) => `<tr data-s="${k}"><td>${starBtn(r.c.id)}</td><td class="l">${esc(r.c.n)}<span class="flag">${r.c.c} · ${esc((state.meta.sectors[r.c.s] || "").split(/[ ,]/)[0])}</span></td>
          <td>${ok(r.score) ? r.score : "—"}</td><td>${P(r.roce)}</td><td>${ok(r.per) ? nf1.format(r.per) : "—"}</td><td>${X(r.evx)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="note">Aucune société ne remplit tous les critères avec les filtres actuels.</p>`}</div>`;
  }

  function render() {
    const L = lines();
    state.pfLines = L;
    $("pickOut").innerHTML = `
      <div class="card"><h3>Mon portefeuille <small>— les valeurs marquées ★ dans l'onglet Analyse ou dans une fiche</small></h3>
        ${L.length ? summary(L) : `<p class="note">Aucune valeur pour l'instant : clique sur ☆ dans le tableau de l'onglet Analyse, dans une fiche, ou dans les idées ci-dessous.</p>`}</div>
      ${L.length ? table(L) + `<p class="note">Feux des 4 étapes et du marché : mêmes verdicts que les fiches (survoler pour le détail). Cours / valeur estimée : capitalisation comparée à la moyenne de la valeur par le multiple du secteur et par les flux actualisés. Valeurs en euros au dernier cours. Portefeuille enregistré dans ce navigateur uniquement. Outil d'aide à la décision, pas un conseil en investissement.</p>` + sectorBars(L) : ""}
      ${suggestions()}`;
  }

  let bound = false;
  function mount() {
    render();
    if (bound) return;
    bound = true;
    const box = $("pickOut");
    box.addEventListener("click", (e) => {
      const sg = e.target.closest("[data-sug]");
      if (sg) { sugStrat = sg.dataset.sug; if ($("strat").value) { $("strat").value = sugStrat; } render(); return; }
      const st = e.target.closest("[data-star]");
      if (st) { Fav.toggle(st.dataset.star); render(); return; }
      if (e.target.closest("button,input")) return;
      const tr = e.target.closest("tr[data-k]"), ts = e.target.closest("tr[data-s]");
      if (tr) openDetail(state.pfLines[Number(tr.dataset.k)].c);
      else if (ts) openDetail(state.pickSug[Number(ts.dataset.s)].c);
    });
    box.addEventListener("change", (e) => {
      const t = e.target, v = Number(String(t.value).replace(",", "."));
      if (t.dataset.qty) Fav.set(t.dataset.qty, "qty", Number.isFinite(v) && v > 0 ? v : null);
      else if (t.dataset.entry) Fav.set(t.dataset.entry, "entry", Number.isFinite(v) && v > 0 ? v : null);
      else if (t.dataset.note !== undefined) { Fav.set(t.dataset.note, "note", t.value); return; }
      else return;
      render();
    });
  }

  return { mount, render, passes, STRATS };
})();
