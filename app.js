"use strict";

// ---------- État ----------
const state = {
  meta: null,
  companies: [],
  rows: [],          // lignes calculées pour l'exercice choisi, après filtres
  sort: { key: "score", dir: -1 },
  shown: 200,
  view: "list",
};
const $ = (id) => document.getElementById(id);
const PAGE = 200;

// ---------- Formatage ----------
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const ok = (v) => v !== null && v !== undefined && Number.isFinite(v);
function money(v) {
  if (!ok(v)) return '<span class="na">—</span>';
  const s = Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v);
  return v < 0 ? `<span class="neg">${s}</span>` : s;
}
function pct(v, signed) {
  if (!ok(v)) return '<span class="na">—</span>';
  const s = nf1.format(v * 100) + " %";
  if (signed && v < 0) return `<span class="neg">${s}</span>`;
  return s;
}
function mult(v) {
  if (!ok(v)) return '<span class="na">—</span>';
  return (v < 0 ? '<span class="pos">' : "") + nf1.format(v) + "×" + (v < 0 ? "</span>" : "");
}
function days(v) { return ok(v) ? nf0.format(v) + " j" : '<span class="na">—</span>'; }
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Calculs ----------
function fx(c, year) {
  if (c.cur === "EUR") return 1;
  const t = state.meta.fx[c.cur];
  if (!t) return null;
  return t[String(year)] ?? t[Object.keys(t).pop()];
}

// Valeur d'un champ pour l'index d'année i, en M€ (ou devise d'origine si native).
function val(c, field, i, native) {
  const row = c.v[field];
  if (!row) return null;
  const v = row[i];
  if (!ok(v)) return null;
  if (native) return v;
  const r = fx(c, state.meta.years[i]);
  return r === null ? null : v * r;
}

// Tous les agrégats d'une société pour l'année i.
function metrics(c, i, native = false) {
  const g = (f, j = i) => (j >= 0 ? val(c, f, j, native) : null);
  const rev = g("revenue");
  const ebit = g("operating_income");
  const da = g("da");
  const ebitda = ok(ebit) && ok(da) ? ebit + da : null;
  const cfo = g("cfo");
  const capex = g("capex");
  const fcf = ok(cfo) && ok(capex) ? cfo - capex : null;
  const lt = g("debt_lt"), st = g("debt_st"), tot = g("debt_total");
  const debt = ok(lt) || ok(st) ? (lt || 0) + (st || 0) : tot;
  const cash = g("cash");
  // Même définition que la fiche (Vernimmen, IFRS 16) : dettes financières + locations − trésorerie − placements.
  const netDebt = ok(debt) && ok(cash) ? debt + (g("leases") || 0) - cash - (g("st_invest") || 0) : null;
  const equity = g("equity");
  const ni = ok(g("net_income")) ? g("net_income") : g("net_income_total");
  const recv = g("receivables"), inv = g("inventory"), pay = g("payables");
  const rev3 = g("revenue", i - 3);
  const growth = ok(rev) && ok(rev3) && rev3 > 0 && rev > 0 ? Math.pow(rev / rev3, 1 / 3) - 1 : null;

  // Années bénéficiaires sur les 3 derniers exercices disponibles.
  let profitYears = 0, seenYears = 0;
  const margins = [];
  for (let j = i; j > i - 3 && j >= 0; j--) {
    const n = val(c, "net_income", j, true);
    if (ok(n)) { seenYears++; if (n > 0) profitYears++; }
    const r = val(c, "revenue", j, true), e = val(c, "operating_income", j, true), d = val(c, "da", j, true);
    if (ok(r) && r > 0 && ok(e) && ok(d)) margins.push((e + d) / r);
  }
  let marginStd = null;
  if (margins.length >= 2) {
    const m = margins.reduce((a, b) => a + b, 0) / margins.length;
    marginStd = Math.sqrt(margins.reduce((a, b) => a + (b - m) ** 2, 0) / margins.length);
  }

  const pos = (x) => ok(x) && x > 0;
  return {
    rev, ebit, da, ebitda, ni, cfo, capex, fcf, debt, cash, netDebt, equity, growth,
    leases: g("leases"), assets: g("total_assets"), interest: g("interest"), dividends: g("dividends"),
    ebitdaMargin: pos(rev) && ok(ebitda) ? ebitda / rev : null,
    ebitMargin: pos(rev) && ok(ebit) ? ebit / rev : null,
    netMargin: pos(rev) && ok(ni) ? ni / rev : null,
    fcfMargin: pos(rev) && ok(fcf) ? fcf / rev : null,
    conversion: pos(ebitda) && ok(fcf) ? fcf / ebitda : null,
    leverage: pos(ebitda) && ok(netDebt) ? netDebt / ebitda : null,
    roce: ok(ebit) && ok(equity) && ok(netDebt) && equity + netDebt > 0 ? ebit / (equity + netDebt) : null,
    roe: ok(ni) && pos(equity) ? ni / equity : null,
    coverage: ok(ebit) && pos(g("interest")) ? ebit / g("interest") : null,
    bfrDays: pos(rev) && (ok(recv) || ok(inv)) ? ((recv || 0) + (inv || 0) - (pay || 0)) / rev * 365 : null,
    equityRatio: ok(equity) && pos(g("total_assets")) ? equity / g("total_assets") : null,
    profitYears, seenYears, marginStd,
    complete: ok(rev) && ok(ebitda) && ok(fcf) && ok(netDebt) && ok(ni),
  };
}

// Rang relatif (0–1) d'une valeur dans une liste triée.
function rankFn(values, higherIsBetter) {
  const s = values.filter(ok).sort((a, b) => a - b);
  return (v) => {
    if (!ok(v) || !s.length) return null;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
    const r = s.length > 1 ? lo / (s.length - 1) : 0.5;
    return higherIsBetter ? r : 1 - r;
  };
}

function score(rows) {
  const clamp = (x, a, b) => (ok(x) ? Math.max(a, Math.min(b, x)) : null);
  // Le levier négatif (trésorerie nette) est le meilleur cas.
  const lev = (m) => (ok(m.leverage) ? m.leverage : (ok(m.netDebt) && m.netDebt < 0 && ok(m.ebitda) && m.ebitda > 0 ? -1 : null));
  const stab = (m) => (m.seenYears ? m.profitYears / m.seenYears - (ok(m.marginStd) ? Math.min(m.marginStd * 5, 0.5) : 0) : null);
  const parts = [
    [0.25, (m) => clamp(m.ebitdaMargin, -1, 1), true],
    [0.20, (m) => clamp(m.conversion, -2, 2), true],
    [0.20, lev, false],
    [0.20, (m) => clamp(m.growth, -0.5, 1), true],
    [0.15, stab, true],
  ].map(([w, f, hib]) => [w, f, rankFn(rows.map((r) => f(r.m)), hib)]);
  for (const r of rows) {
    let s = 0, w = 0;
    for (const [wt, f, rk] of parts) {
      const x = rk(f(r.m));
      if (x !== null) { s += wt * x; w += wt; }
    }
    // Pénalité si la moitié des indicateurs manque.
    r.score = w >= 0.5 ? Math.round((s / w) * 100 * (0.7 + 0.3 * w)) : null;
  }
}

// ---------- Filtres ----------
function readFilters() {
  const num = (id) => { const v = $(id).value.trim(); return v === "" ? null : Number(v.replace(",", ".")); };
  return {
    q: $("q").value.trim().toLowerCase(),
    country: $("country").value,
    index: $("index").value,
    sector: $("sector").value,
    year: Number($("year").value),
    revMin: num("revMin"), revMax: num("revMax"),
    ebitdaMin: num("ebitdaMin"), levMax: num("levMax"),
    profit3: $("profit3").checked, complete: $("complete").checked, banks: $("banks").checked,
    favOnly: $("favOnly").checked, strat: $("strat").value,
  };
}

function compute(ignoreSector = false) {
  const f = readFilters();
  const i = state.meta.years.indexOf(f.year);
  const out = [];
  for (const c of state.companies) {
    if (f.country && (c.z || c.c) !== f.country) continue;
    if (f.index && !(c.ix || []).includes(f.index)) continue;
    if (!ignoreSector && f.sector && c.s !== f.sector) continue;
    if (f.q) {
      const hay = c._hay || (c._hay = `${c.n} ${c.t || ""} ${c.sd || ""}`.toLowerCase());
      if (!hay.includes(f.q)) continue;
    }
    const m = metrics(c, i);
    if (!ok(m.rev)) continue;
    if (f.revMin !== null && m.rev < f.revMin) continue;
    if (f.revMax !== null && m.rev > f.revMax) continue;
    if (f.ebitdaMin !== null && !(ok(m.ebitdaMargin) && m.ebitdaMargin * 100 >= f.ebitdaMin)) continue;
    if (f.levMax !== null && !(ok(m.netDebt) && (m.netDebt <= 0 || (ok(m.leverage) && m.leverage <= f.levMax)))) continue;
    if (f.profit3 && !(m.seenYears >= 3 && m.profitYears === 3)) continue;
    // Banques et assurances : EBE, BFR et dette nette n'ont pas de sens ; exclues par défaut,
    // sauf si on les demande ou si on filtre explicitement leur secteur.
    if (!f.banks && c.s === "finance" && f.sector !== "finance") continue;
    if (f.complete && !m.complete) continue;
    if (f.favOnly && !Fav.has(c.id)) continue;
    if (f.strat && !Picking.passes(c, i, f.strat)) continue;
    out.push({ c, m });
  }
  // Scores de qualité (calculés à la demande, mis en cache par exercice).
  for (const r of out) {
    const key = "q" + i;
    if (!r.c[key]) {
      const p = Analyse.piotroski(r.c, i);
      const fq = Analyse.figures(r.c, i);
      r.c[key] = { fs: p.known >= 8 ? Math.round(p.score * 9 / p.known) : null, z: fq.zScore, per: fq.per, evx: fq.evEbitda, roce: fq.roce };
    }
    r.fs = r.c[key].fs; r.z = r.c[key].z; r.per = r.c[key].per; r.evx = r.c[key].evx; r.roce = r.c[key].roce;
  }
  score(out);
  return out;
}

// ---------- Valeurs préférées (étoiles) ----------
// { id: { entry: prix d'achat, qty: nombre d'actions, note } }, dans ce navigateur.
const Fav = (() => {
  let w = {};
  try { w = JSON.parse(localStorage.getItem("reprise.watch") || "{}"); } catch (e) { /* ignoré */ }
  const save = () => { try { localStorage.setItem("reprise.watch", JSON.stringify(w)); } catch (e) { /* ignoré */ } };
  return {
    ids: () => Object.keys(w), has: (id) => !!w[id], get: (id) => w[id],
    toggle(id) {
      if (w[id]) delete w[id];
      else { const c = state.companies.find((x) => x.id === id); w[id] = { entry: c && c.px ? c.px[0] : null, qty: null, note: "" }; }
      save();
    },
    set(id, k, v) { if (w[id]) { w[id][k] = v; save(); } },
  };
})();
const starBtn = (id) => `<button class="star" data-star="${esc(id)}" aria-pressed="${Fav.has(id)}" title="${Fav.has(id) ? "Retirer de mon portefeuille" : "Ajouter à mon portefeuille"}">${Fav.has(id) ? "★" : "☆"}</button>`;

// ---------- Tableau principal ----------
const COLS = [
  { key: "fav", label: "★", cls: "star-col", title: "Mes valeurs préférées", get: (r) => (Fav.has(r.c.id) ? 1 : 0), fmt: (r) => starBtn(r.c.id) },
  { key: "name", label: "Société", cls: "l", get: (r) => r.c.n, fmt: (r) => `${esc(r.c.n)}<span class="flag">${r.c.c}${r.c.t ? " · " + esc(r.c.t) : ""}</span>` },
  { key: "sector", label: "Secteur", cls: "l hide-sm", get: (r) => state.meta.sectors[r.c.s], fmt: (r) => esc(shortSector(r.c.s)) },
  { key: "score", label: "Score", get: (r) => r.score, fmt: (r) => (ok(r.score) ? `<span class="score">${r.score}</span>` : '<span class="na">—</span>') },
  { key: "rev", label: "CA M€", get: (r) => r.m.rev, fmt: (r) => money(r.m.rev) },
  { hib: true, key: "growth", label: "Crois. 3 ans", get: (r) => r.m.growth, fmt: (r) => pct(r.m.growth, true) },
  { extra: true, key: "ebitda", label: "EBITDA M€", get: (r) => r.m.ebitda, fmt: (r) => money(r.m.ebitda) },
  { hib: true, key: "ebitdaMargin", label: "Marge EBITDA", get: (r) => r.m.ebitdaMargin, fmt: (r) => pct(r.m.ebitdaMargin, true) },
  { hib: true, key: "netMargin", label: "Marge nette", get: (r) => r.m.netMargin, fmt: (r) => pct(r.m.netMargin, true) },
  { extra: true, key: "fcf", label: "FCF M€", get: (r) => r.m.fcf, fmt: (r) => money(r.m.fcf) },
  { extra: true, hib: true, key: "conversion", label: "Conv. cash", get: (r) => r.m.conversion, fmt: (r) => pct(r.m.conversion, true) },
  { extra: true, key: "netDebt", label: "Dette nette M€", get: (r) => r.m.netDebt, fmt: (r) => money(r.m.netDebt) },
  { hib: false, key: "leverage", label: "DN/EBITDA", get: (r) => r.m.leverage, fmt: (r) => mult(r.m.leverage) },
  { hib: true, key: "roce", label: "ROCE", title: "ROCE courant après impôt, sur capitaux employés moyens (comme dans la fiche)", get: (r) => r.roce, fmt: (r) => pct(r.roce, true) },
  { extra: true, hib: false, key: "bfrDays", label: "BFR", get: (r) => r.m.bfrDays, fmt: (r) => days(r.m.bfrDays) },
  { hib: false, key: "per", label: "PER", get: (r) => r.per, fmt: (r) => (ok(r.per) ? nf1.format(r.per) : '<span class="na">—</span>') },
  { extra: true, hib: false, key: "evx", label: "VE/EBE", get: (r) => r.evx, fmt: (r) => (ok(r.evx) ? nf1.format(r.evx) + "×" : '<span class="na">—</span>') },
  { extra: true, hib: true, key: "fscore", label: "Piotroski", get: (r) => r.fs, fmt: (r) => (ok(r.fs) ? `${r.fs}/9` : '<span class="na">—</span>') },
  { extra: true, hib: true, key: "z", label: "Altman", get: (r) => r.z, fmt: (r) => (ok(r.z) ? `<span class="${r.z > 2.6 ? "pos" : r.z < 1.1 ? "neg" : ""}">${nf1.format(r.z)}</span>` : '<span class="na">—</span>') },
];

function shortSector(s) {
  return (state.meta.sectors[s] || s).split(/[ ,(]/)[0].replace(/\.$/, "") + (s === "conso_cyc" ? ". discr." : s === "conso_base" ? ". base" : "");
}

// Colonnes affichées : l'essentiel par défaut, tout sur demande.
function visibleCols() {
  let all = false;
  try { all = localStorage.getItem("reprise.allcols") === "1"; } catch (e) { /* ignoré */ }
  return COLS.filter((c) => all || !c.extra);
}

// Quartiles par colonne sur les sociétés affichées : vert = quart supérieur, rouge = quart inférieur.
function quartiles(rows) {
  const q = {};
  for (const c of COLS) {
    if (c.hib === undefined) continue;
    const v = rows.map((r) => c.get(r)).filter(ok).sort((x, y) => x - y);
    if (v.length >= 8) q[c.key] = [v[Math.floor(v.length * 0.25)], v[Math.floor(v.length * 0.75)]];
  }
  return q;
}
function tint(c, r, q) {
  const t = q[c.key], v = c.get(r);
  if (!t || !ok(v)) return "";
  const good = c.hib ? v >= t[1] : v <= t[0], bad = c.hib ? v <= t[0] : v >= t[1];
  // Un levier négatif = trésorerie nette : bon, pas mauvais.
  if (c.key === "leverage" && v < 0) return " q-good";
  return good ? " q-good" : bad ? " q-bad" : "";
}

function renderHead() {
  $("thead").innerHTML = visibleCols().map((c) => {
    const on = state.sort.key === c.key;
    return `<th data-key="${c.key}" class="${c.cls || ""} ${on ? "sorted" : ""}"${c.title ? ` title="${esc(c.title)}"` : ""}>${c.label}${on ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`;
  }).join("");
}

function sortRows() {
  const col = COLS.find((c) => c.key === state.sort.key);
  const d = state.sort.dir;
  state.rows.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (!ok(x) && typeof x !== "string") return 1;
    if (!ok(y) && typeof y !== "string") return -1;
    return typeof x === "string" ? d * x.localeCompare(y, "fr") : d * (x - y);
  });
}

function renderList() {
  state.rows = compute();
  sortRows();
  renderHead();
  const n = state.rows.length;
  $("count").textContent = `${nf0.format(n)} société${n > 1 ? "s" : ""} — exercice ${$("year").value}. Cliquer une ligne pour la fiche, un titre de colonne pour trier.`;
  const rows = state.rows.slice(0, state.shown);
  const q = quartiles(state.rows), vc = visibleCols();
  $("tbody").innerHTML = rows.map((r, k) =>
    `<tr data-k="${k}">${vc.map((c) => `<td class="${c.cls || ""}${tint(c, r, q)}">${c.fmt(r)}</td>`).join("")}</tr>`).join("");
  let all = false;
  try { all = localStorage.getItem("reprise.allcols") === "1"; } catch (e) { /* ignoré */ }
  $("count").innerHTML = `${$("count").textContent} <button class="ghost linkbtn" id="allCols">${all ? "Moins de colonnes" : "Toutes les colonnes"}</button>
    <span class="qlegend"><i class="q-good"></i>quart supérieur <i class="q-bad"></i>quart inférieur</span>`;
  $("more").hidden = n <= state.shown;
  $("more").textContent = `Afficher plus (${nf0.format(n - state.shown)} restantes)`;
}

// ---------- Vue secteurs ----------
function median(a) {
  const s = a.filter(ok).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function renderSectors() {
  const rows = compute(true);
  const by = {};
  for (const r of rows) (by[r.c.s] ||= []).push(r.m);
  const keys = Object.keys(state.meta.sectors).filter((k) => by[k]);
  const cols = [
    ["Sociétés", (ms) => nf0.format(ms.length)],
    ["CA médian M€", (ms) => money(median(ms.map((m) => m.rev)))],
    ["Crois. 3 ans", (ms) => pct(median(ms.map((m) => m.growth)), true)],
    ["Marge EBITDA", (ms) => pct(median(ms.map((m) => m.ebitdaMargin)), true)],
    ["Marge nette", (ms) => pct(median(ms.map((m) => m.netMargin)), true)],
    ["Conv. cash", (ms) => pct(median(ms.map((m) => m.conversion)), true)],
    ["DN/EBITDA", (ms) => mult(median(ms.map((m) => m.leverage)))],
    ["ROCE", (ms) => pct(median(ms.map((m) => m.roce)), true)],
    ["BFR", (ms) => days(median(ms.map((m) => m.bfrDays)))],
  ];
  // Quatre nuages de secteurs (médianes), un par étape du plan : une bulle = un secteur, taille = nombre de sociétés.
  const short = (k) => (state.meta.sectors[k] || k).split(/[,(&]/)[0].trim();
  const yi = state.meta.years.indexOf(Number($("year").value));
  const figs = {};
  for (const r of rows) (figs[r.c.s] ||= []).push(Analyse.figures(r.c, yi));
  const med = (k, fn) => median((figs[k] || []).map(fn));
  const P = (v) => nf0.format(v * 100) + " %";
  const charts = [
    { t: "1. Marges : croissance × marge d'EBE", note: "En haut à droite, les métiers qui croissent avec une forte marge.",
      x: { l: "Croissance annuelle du CA (3 ans)", f: (k) => median(by[k].map((m) => m.growth)), fmt: P },
      y: { l: "Marge d'EBE", f: (k) => median(by[k].map((m) => m.ebitdaMargin)), fmt: P } },
    { t: "2. Investissements : BFR × investissements", note: "À gauche du zéro, le cycle d'exploitation finance l'entreprise ; en haut, les métiers capitalistiques.",
      x: { l: "BFR en jours de CA", f: (k) => median(by[k].map((m) => m.bfrDays)), fmt: (v) => nf0.format(v) + " j" },
      y: { l: "Investissements en % du CA", f: (k) => median(by[k].map((m) => (ok(m.capex) && ok(m.rev) && m.rev > 0 ? m.capex / m.rev : null))), fmt: P } },
    { t: "3. Financement : endettement × rentabilité", note: "Repère : dette nette / EBE de 3× au plus (ligne verticale).", ref: 3,
      x: { l: "Dette nette / EBE", f: (k) => median(by[k].map((m) => m.leverage)), fmt: (v) => nf1.format(v) + "×" },
      y: { l: "ROCE", f: (k) => median(by[k].map((m) => m.roce)), fmt: P } },
    { t: "4. Rentabilité : marge × rotation", note: "ROCE après IS = marge × rotation ; les courbes relient les points de même ROCE.", iso: [0.05, 0.1, 0.2],
      x: { l: "Rotation de l'actif économique (log)", f: (k) => med(k, (f) => (ok(f.rotation) && f.ae > 0 ? f.rotation : null)), fmt: (v) => nf1.format(v).replace(",0", "") + "×", log: true },
      y: { l: "Marge d'exploitation après impôt", f: (k) => med(k, (f) => f.margin), fmt: P } },
  ];
  const big = keys.filter((k) => by[k].length >= 5);
  const maxN = Math.max(1, ...big.map((k) => by[k].length));
  const focus = $("sector").value;
  $("sectorCharts").innerHTML = charts.map((ch) => {
    const pts = big.map((k) => ({ k, x: ch.x.f(k), y: ch.y.f(k), n: by[k].length })).filter((p) => ok(p.x) && ok(p.y) && (!ch.x.log || p.x > 0));
    if (pts.length < 2) return "";
    const W = 460, H = 320, L = 50, R = 12, T = 12, B = 38;
    const tx = ch.x.log ? Math.log10 : (v) => v;
    const xs = pts.map((p) => tx(p.x)), ys = pts.map((p) => p.y);
    const pad = (lo, hi) => { const d = (hi - lo) || Math.abs(hi) || 1; return [lo - d * 0.12, hi + d * 0.12]; };
    let [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    if (!ch.x.log) { x0 = Math.min(x0, 0); } y0 = Math.min(y0, 0);
    if (ch.ref) x1 = Math.max(x1, ch.ref * 1.1);
    const sx = (v) => L + (tx(v) - x0) / (x1 - x0) * (W - L - R), sy = (v) => T + (y1 - v) / (y1 - y0) * (H - T - B);
    const nice = (lo, hi) => { const st = (hi - lo) / 5, p = Math.pow(10, Math.floor(Math.log10(st))), s = [1, 2, 5, 10].map((m) => m * p).find((m) => m >= st); const o = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) o.push(+v.toFixed(6)); return o; };
    let g = "";
    const xt = ch.x.log ? [0.1, 0.2, 0.5, 1, 2, 5, 10].filter((v) => tx(v) >= x0 && tx(v) <= x1) : nice(x0, x1);
    for (const v of xt) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${sx(v)}" y="${H - B + 14}" text-anchor="middle">${ch.x.fmt(v)}</text>`;
    for (const v of nice(y0, y1)) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 5}" y="${sy(v) + 4}" text-anchor="end">${ch.y.fmt(v)}</text>`;
    g += `<text class="ax t" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(ch.x.l)}</text><text class="ax t" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(ch.y.l)}</text>`;
    if (ch.ref) g += `<line class="iso" x1="${sx(ch.ref)}" x2="${sx(ch.ref)}" y1="${T}" y2="${H - B}"/>`;
    for (const r of ch.iso || []) {
      const seg = [];
      for (let q = 0; q <= 60; q++) { const lv = x0 + q / 60 * (x1 - x0), x = Math.pow(10, lv), y = r / x; if (y >= y0 && y <= y1) seg.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`); }
      if (seg.length > 1) { const lp = seg[Math.floor(seg.length * 0.75)].split(","); g += `<polyline class="iso" points="${seg.join(" ")}"/><text class="iso-l" x="${+lp[0] + 3}" y="${+lp[1] - 3}">ROCE ${P(r)}</text>`; }
    }
    const sorted = pts.sort((p, q) => q.n - p.n);
    let m = "";
    for (const p of sorted) {
      const rr = 4 + 14 * Math.sqrt(p.n / maxN);
      m += `<circle class="sb${focus && p.k !== focus ? " dim" : ""}" data-sector="${p.k}" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${rr.toFixed(1)}"><title>${esc(state.meta.sectors[p.k])} (${p.n} sociétés)\n${esc(ch.x.l)} : ${ch.x.fmt(p.x)}\n${esc(ch.y.l)} : ${ch.y.fmt(p.y)}</title></circle>`;
    }
    const placed = [];
    // Nom à droite de la bulle, sinon à gauche, au-dessus ou en dessous : la première position libre.
    const bubbles = sorted.map((p) => [sx(p.x), sy(p.y), 4 + 14 * Math.sqrt(p.n / maxN)]);
    for (const p of sorted) {
      const nm = short(p.k), w = nm.length * 6.2, cx = sx(p.x), cy = sy(p.y), rr = 4 + 14 * Math.sqrt(p.n / maxN);
      const tries = [[cx + rr + 4, cy + 4, "start"], [cx - rr - 4, cy + 4, "end"], [cx, cy - rr - 5, "middle"], [cx, cy + rr + 13, "middle"]];
      for (const [x, y, an] of tries) {
        const x0 = an === "start" ? x : an === "end" ? x - w : x - w / 2, box = [x0, y - 11, x0 + w, y + 3];
        if (box[0] < L || box[2] > W - R + 8 || box[1] < 0 || box[3] > H - B + 4) continue;
        if (placed.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
        // Ne pas écrire sur une autre bulle.
        if (bubbles.some(([bx, by, br]) => !(bx === cx && by === cy) && bx + br > box[0] && bx - br < box[2] && by + br > box[1] && by - br < box[3])) continue;
        placed.push(box);
        m += `<text class="lbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${an}">${esc(nm)}</text>`;
        break;
      }
    }
    return `<div class="card schart"><h3>${esc(ch.t)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ch.t)}">${g}${m}</svg><p class="note">${esc(ch.note)}</p></div>`;
  }).join("") + `<p class="note" style="grid-column:1/-1">Une bulle = un secteur (5 sociétés au moins), placée à la médiane ; taille = nombre de sociétés. Survoler pour le détail, cliquer pour filtrer le tableau sur ce secteur.</p>`;

  $("sectorTable").innerHTML =
    `<thead><tr><th class="l">Secteur</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>` +
    keys.map((k) => `<tr data-sector="${k}"><td class="l">${esc(state.meta.sectors[k])}</td>${cols.map((c) => `<td>${c[1](by[k])}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
}

// ---------- Comparer : marge × rotation ----------
function renderCompare() {
  const mode = state.compareMode || "sectors";
  document.querySelectorAll("#view-compare [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  const i = state.meta.years.indexOf(Number($("year").value));
  const focus = $("sector").value;
  const rows = compute(true).map((r) => ({ c: r.c, f: Analyse.figures(r.c, i) }))
    .filter((r) => ok(r.f.margin) && ok(r.f.rotation) && r.f.rotation > 0 && r.f.ae > 0);
  // Cadrage : large pour les sociétés, resserré sur les médianes pour les secteurs.
  let X0 = 0.1, X1 = 10, Y0 = -0.1, Y1 = 0.4;
  if (mode === "sectors") { X0 = 0.1; X1 = 5; Y0 = -0.25; Y1 = 0.25; }
  const W = 760, H = 460, L = 52, R = 16, T = 14, B = 40;
  const lx = (v) => L + (Math.log10(Math.min(X1, Math.max(X0, v))) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0)) * (W - L - R);
  const ly = (v) => T + (Y1 - Math.min(Y1, Math.max(Y0, v))) / (Y1 - Y0) * (H - T - B);
  let g = "";
  // Grille et axes, discrets.
  for (const v of [0.1, 0.2, 0.5, 1, 2, 5, 10].filter((v) => v >= X0 && v <= X1)) g += `<line class="grid" x1="${lx(v)}" x2="${lx(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${lx(v)}" y="${H - B + 16}" text-anchor="middle">${nf1.format(v).replace(",0", "")}×</text>`;
  for (let v = Math.ceil(Y0 * 20) / 20; v <= Y1 + 1e-9; v += 0.05) if (Math.round(v * 100) % (mode === "sectors" ? 5 : 10) === 0) g += `<line class="grid${Math.abs(v) < 1e-9 ? " zero" : ""}" x1="${L}" x2="${W - R}" y1="${ly(v)}" y2="${ly(v)}"/><text class="ax" x="${L - 6}" y="${ly(v) + 4}" text-anchor="end">${nf0.format(Math.round(v * 100) || 0)} %</text>`;
  g += `<text class="ax t" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Rotation de l'actif économique (CA / actif économique, échelle log)</text>`;
  g += `<text class="ax t" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Marge d'exploitation après IS</text>`;
  // Courbes d'iso-ROCE : marge = ROCE / rotation.
  for (const r of [0.05, 0.1, 0.15, 0.2]) {
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const x = Math.pow(10, Math.log10(X0) + k / 60 * (Math.log10(X1) - Math.log10(X0)));
      const y = r / x;
      if (y <= Y1 && y >= Y0) pts.push(`${lx(x).toFixed(1)},${ly(y).toFixed(1)}`);
    }
    if (pts.length > 1) {
      g += `<polyline class="iso" points="${pts.join(" ")}"/>`;
      // Étiquette posée sur la courbe, à une hauteur différente pour chaque ROCE.
      const yl = Y1 - (Y1 - Math.max(Y0, 0)) * (0.12 + 0.2 * [0.05, 0.1, 0.15, 0.2].indexOf(r));
      const xl = r / yl;
      if (xl >= X0 && xl <= X1) g += `<text class="iso-l" x="${lx(xl) + 5}" y="${ly(yl) - 3}">ROCE ${nf0.format(r * 100)} %</text>`;
    }
  }
  let marks = "", table = "";
  const tipData = [];
  if (mode === "sectors") {
    const by = {};
    for (const r of rows) (by[r.c.s] ||= []).push(r.f);
    const med = (a) => { const s = a.filter(ok).sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
    const pts = Object.entries(by).filter(([, fs]) => fs.length >= 5).map(([s, fs]) => ({
      s, n: fs.length, m: med(fs.map((f) => f.margin)), rot: med(fs.map((f) => f.rotation)), roce: med(fs.map((f) => f.roce)),
    })).sort((p, q) => q.n - p.n);
    const maxN = Math.max(...pts.map((p) => p.n), 1);
    const placed = [];
    // Place le nom à droite, à gauche, au-dessus ou en dessous : la première position libre.
    const place = (cx, cy, rad, text) => {
      const w = text.length * 6.6 + 4, h = 14;
      const cands = [[cx + rad + 4, cy + 4, "start"], [cx - rad - 4, cy + 4, "end"], [cx, cy - rad - 5, "middle"], [cx, cy + rad + 14, "middle"],
        [cx + rad + 4, cy + 18, "start"], [cx + rad + 4, cy - 10, "start"], [cx - rad - 4, cy + 18, "end"], [cx - rad - 4, cy - 10, "end"]];
      for (const [x, y, anchor] of cands) {
        const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
        const box = [x0, y - h + 3, x0 + w, y + 3];
        if (box[0] < L || box[2] > W - R) continue;
        if (!placed.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) { placed.push(box); return [x, y, anchor]; }
      }
      return null;
    };
    // Bulles d'abord (réservent leur place), puis les noms.
    pts.forEach((p) => { const rad = 6 + 14 * Math.sqrt(p.n / maxN); placed.push([lx(p.rot) - rad, ly(p.m) - rad, lx(p.rot) + rad, ly(p.m) + rad]); });
    pts.forEach((p, k) => {
      const rad = 6 + 14 * Math.sqrt(p.n / maxN);
      const on = !focus || focus === p.s;
      const pos = place(lx(p.rot), ly(p.m), rad, shortSector(p.s));
      tipData.push(`<b>${esc(state.meta.sectors[p.s])}</b><br>${p.n} sociétés · marge ${pct(p.m)} · rotation ${nf1.format(p.rot)}× · ROCE ${pct(p.roce)}`);
      marks += `<g class="pt" data-tip="${k}" data-sector="${p.s}"><circle cx="${lx(p.rot)}" cy="${ly(p.m)}" r="${rad + 8}" class="hit"/>
        <circle cx="${lx(p.rot)}" cy="${ly(p.m)}" r="${rad}" class="bubble${on ? "" : " off"}"/>
        ${pos ? `<text class="lbl" x="${pos[0]}" y="${pos[1]}" text-anchor="${pos[2]}">${esc(shortSector(p.s))}</text>` : ""}</g>`;
    });
    table = `<thead><tr><th class="l">Secteur</th><th>Sociétés</th><th>Marge d'exploitation après IS</th><th>Rotation</th><th>ROCE après IS</th></tr></thead><tbody>` +
      pts.map((p) => `<tr data-sector="${p.s}"><td class="l">${esc(state.meta.sectors[p.s])}</td><td>${p.n}</td><td>${pct(p.m, true)}</td><td>${nf1.format(p.rot)}×</td><td>${pct(p.roce, true)}</td></tr>`).join("") + "</tbody>";
    $("scatterNote").textContent = "Médianes des sociétés qui passent les filtres (hors filtre secteur), secteurs d'au moins 5 sociétés. Taille du point : nombre de sociétés. Cliquer un secteur pour voir ses sociétés.";
  } else {
    const shown = rows.slice(0, 1500);
    shown.sort((a, b) => (a.c.s === focus) - (b.c.s === focus));
    shown.forEach((r, k) => {
      const on = !focus || r.c.s === focus;
      tipData.push(`<b>${esc(r.c.n)}</b> (${r.c.c})<br>${esc(state.meta.sectors[r.c.s])}<br>marge ${pct(r.f.margin)} · rotation ${nf1.format(r.f.rotation)}× · ROCE ${pct(r.f.roce)}`);
      marks += `<g class="pt" data-tip="${k}" data-id="${esc(r.c.id)}"><circle cx="${lx(r.f.rotation)}" cy="${ly(r.f.margin)}" r="9" class="hit"/>
        <circle cx="${lx(r.f.rotation)}" cy="${ly(r.f.margin)}" r="4" class="dot${on ? "" : " off"}"/></g>`;
    });
    table = "";
    $("scatterNote").textContent = `${nf0.format(shown.length)} sociétés${rows.length > shown.length ? " (les 1 500 premières)" : ""}. ${focus ? `En couleur : ${state.meta.sectors[focus]} ; en gris : les autres secteurs. ` : "Choisir un secteur dans les filtres pour le faire ressortir. "}Valeurs hors cadre ramenées au bord. Cliquer un point pour ouvrir la fiche.`;
  }
  const svg = $("scatter");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = g + marks;
  $("compareTable").innerHTML = table;
  $("compareTable").parentElement.hidden = !table;
  state.tips = tipData;
}

function bindCompare() {
  document.querySelectorAll("#view-compare [data-mode]").forEach((b) => (b.onclick = () => { state.compareMode = b.dataset.mode; renderCompare(); }));
  const svg = $("scatter"), tip = $("tip");
  svg.addEventListener("pointermove", (e) => {
    const p = e.target.closest(".pt");
    if (!p) { tip.hidden = true; return; }
    tip.innerHTML = state.tips[Number(p.dataset.tip)];
    const box = svg.parentElement.getBoundingClientRect();
    tip.hidden = false;
    const x = e.clientX - box.left, y = e.clientY - box.top;
    tip.style.left = Math.min(x + 12, box.width - tip.offsetWidth - 4) + "px";
    tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + "px";
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
  svg.addEventListener("click", (e) => {
    const p = e.target.closest(".pt");
    if (!p) return;
    if (p.dataset.id) { const c = state.companies.find((x) => x.id === p.dataset.id); if (c) openDetail(c); return; }
    if (p.dataset.sector) {
      $("sector").value = p.dataset.sector;
      state.compareMode = "companies";
      renderCompare();
      saveFilters();
    }
  });
  $("compareTable").onclick = (e) => {
    const tr = e.target.closest("tr[data-sector]");
    if (!tr) return;
    $("sector").value = tr.dataset.sector;
    state.compareMode = "companies";
    renderCompare();
    saveFilters();
  };
}

// ---------- Fiche société ----------
function barChart(c) {
  const ys = state.meta.years;
  const series = [
    ["CA", "--bar1", ys.map((_, i) => metrics(c, i, true).rev)],
    ["EBITDA", "--bar2", ys.map((_, i) => metrics(c, i, true).ebitda)],
    ["FCF", "--bar3", ys.map((_, i) => metrics(c, i, true).fcf)],
  ];
  const idx = ys.map((_, i) => i).filter((i) => series.some((s) => ok(s[2][i])));
  if (!idx.length) return "";
  const all = series.flatMap((s) => idx.map((i) => s[2][i])).filter(ok);
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const W = 640, H = 200, pad = 22, gw = (W - 10) / idx.length, bw = Math.min(26, (gw - 12) / 3);
  const y = (v) => pad + (max - v) / (max - min || 1) * (H - 2 * pad);
  let bars = "";
  idx.forEach((i, k) => {
    const x0 = 10 + k * gw + (gw - bw * 3) / 2;
    series.forEach((s, j) => {
      const v = s[2][i];
      if (!ok(v)) return;
      const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
      bars += `<rect x="${x0 + j * bw}" y="${top}" width="${bw - 2}" height="${h}" rx="2" fill="var(${s[1]})"><title>${s[0]} ${ys[i]} : ${money(v).replace(/<[^>]+>/g, "")}</title></rect>`;
    });
    bars += `<text x="${x0 + bw * 1.5}" y="${H - 4}" text-anchor="middle">${ys[i]}</text>`;
  });
  return `<div class="card"><h3>Évolution (M ${esc(c.cur)})</h3>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="CA, EBITDA et FCF par année">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>${bars}
    </svg>
    <div class="legend">${series.map((s) => `<span><i style="background:var(${s[1]})"></i>${s[0]}</span>`).join("")}</div></div>`;
}

function statementTable(c, title, rows) {
  const ys = state.meta.years;
  const ms = ys.map((_, i) => metrics(c, i, true));
  const idx = ys.map((_, i) => i).filter((i) => ok(ms[i].rev) || ok(ms[i].assets) || ok(ms[i].cash));
  const body = rows.map(([label, get, fmt = money]) => {
    const cells = idx.map((i) => get(ms[i], i));
    if (!cells.some(ok)) return "";
    return `<tr><td class="l">${label}</td>${cells.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`;
  }).join("");
  if (!body) return "";
  return `<div class="card"><h3>${title}</h3><div class="tablewrap"><table>
    <thead><tr><th class="l"></th>${idx.map((i) => `<th>${ys[i]}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table></div></div>`;
}

function openDetail(c, yearIdx, tab) {
  state.detailC = c;
  const ys = state.meta.years;
  const i = yearIdx ?? ys.indexOf(Number($("year").value));
  tab = tab || state.detailTab || "analyse";
  state.detailTab = tab;
  const m = metrics(c, i);
  const raw = (field) => (_, j) => val(c, field, j, true);
  const where = [(state.meta.countries || {})[c.c] || c.c, c.x, c.t].filter(Boolean).join(" · ");
  const sector = `${state.meta.sectors[c.s]}${c.sf === "estimé" ? " (estimé)" : c.sf === "SIC" && c.sd ? " — " + c.sd : ""}`;
  const row = state.rows.find((r) => r.c === c);
  const avail = ys.map((y, j) => [y, j]).filter(([, j]) => ok(val(c, "revenue", j, true)));
  const chips = avail.map(([y, j]) => `<button class="chip" data-y="${j}" aria-pressed="${j === i}">${y}</button>`).join("");
  const tabs = [["analyse", "Analyse financière"], ["comptes", "Comptes détaillés"]]
    .map(([k, l]) => `<button class="chip tab" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("");

  const comptes = `
    ${barChart(c)}
    ${statementTable(c, `Compte de résultat (M ${esc(c.cur)})`, [
      ["Chiffre d'affaires", (x) => x.rev], ["Coût des ventes", raw("cost_of_revenue")], ["Marge brute", raw("gross_profit")],
      ["Frais commerciaux et généraux", raw("sga")], ["R&D", raw("rnd")], ["Charges de personnel", raw("staff")],
      ["EBITDA", (x) => x.ebitda], ["Dotations aux amortissements", (x) => x.da],
      ["Résultat opérationnel", (x) => x.ebit], ["Charges financières", (x) => x.interest],
      ["Résultat avant impôt", raw("pretax")], ["Impôt", raw("tax")],
      ["Résultat net part du groupe", (x) => x.ni], ["Marge EBITDA", (x) => x.ebitdaMargin, (v) => pct(v, true)],
      ["Marge nette", (x) => x.netMargin, (v) => pct(v, true)]])}
    ${statementTable(c, `Bilan (M ${esc(c.cur)})`, [
      ["Total du bilan", (x) => x.assets], ["Actif immobilisé", raw("noncurrent_assets")], ["dont goodwill", raw("goodwill")],
      ["dont immo. incorporelles", raw("intangibles")], ["dont immo. corporelles", raw("ppe")],
      ["Actif courant", raw("current_assets")], ["Créances clients", raw("receivables")], ["Stocks", raw("inventory")],
      ["Trésorerie", (x) => x.cash],
      ["Capitaux propres part du groupe", (x) => x.equity], ["Capitaux propres de l'ensemble", raw("equity_total")],
      ["Passifs à plus d'un an", raw("noncurrent_liabilities")], ["Passif courant", raw("current_liabilities")],
      ["Dettes fournisseurs", raw("payables")], ["Dettes financières", (x) => x.debt],
      ["Dette nette", (x) => x.netDebt], ["Dettes de location", (x) => x.leases],
      ["Dette nette / EBITDA", (x) => x.leverage, mult], ["BFR (jours de CA)", (x) => x.bfrDays, days]])}
    ${statementTable(c, `Flux de trésorerie (M ${esc(c.cur)})`, [
      ["Flux d'exploitation", (x) => x.cfo], ["Investissements (capex)", (x) => x.capex],
      ["Free cash flow", (x) => x.fcf], ["Acquisitions", raw("acquisitions")], ["Flux d'investissement", raw("cfi")],
      ["Dividendes versés", (x) => x.dividends], ["Rachats d'actions", raw("buybacks")],
      ["Augmentations de capital", raw("share_issue")], ["Nouveaux emprunts", raw("debt_issued")],
      ["Remboursements d'emprunts", raw("debt_repaid")], ["Flux de financement", raw("cff")],
      ["Conversion cash (FCF / EBITDA)", (x) => x.conversion, (v) => pct(v, true)]])}
    <p class="desc">Cellule vide : ligne non publiée sous une étiquette standard, pas forcément nulle. Vérifier dans la source officielle.</p>`;

  $("detailBody").innerHTML = `
    <h2>${esc(c.n)} ${starBtn(c.id)}</h2>
    <p class="meta">${esc(where)} · ${esc(sector)} · comptes en ${esc(c.cur)}
      ${c.src ? ` · <a href="${esc(c.src)}" target="_blank" rel="noopener">source officielle</a>` : ""}</p>
    ${c.sf !== "SIC" && c.sd ? `<p class="desc">${esc(c.sd)}</p>` : ""}
    ${c.est && c.est.length ? `<p class="desc est">≈ Estimé à partir d'étiquettes propres à la société (à vérifier dans la source) :
      ${c.est.map((f) => esc((state.meta.fields[f] || {}).label || f).toLowerCase()).join(", ")}.</p>` : ""}
    <div class="chips">${tabs}<span class="sep"></span>${tab === "analyse" ? chips : ""}</div>
    ${tab === "analyse" ? Analyse.render(c, i) : comptes}`;
  $("detailBody").onchange = (e) => {
    const p = e.target.dataset && e.target.dataset.param;
    if (!p) return;
    Analyse.setParam(p, e.target.value);
    const scroll = $("detail").querySelector(".detail-inner").scrollTop;
    openDetail(c, i, tab);
    $("detail").querySelector(".detail-inner").scrollTop = scroll;
  };
  $("detailBody").onclick = (e) => {
    const sb = e.target.closest("h2 [data-star]");
    if (sb) {
      Fav.toggle(sb.dataset.star);
      sb.outerHTML = starBtn(c.id);
      if (state.view === "list") renderList(); else if (state.view === "pick") Picking.render();
      return;
    }
    const cb = e.target.closest("[data-open]");
    if (cb) {
      const d = $("detailBody").querySelector(`details[data-n="${cb.dataset.open}"]`);
      if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    const b = e.target.closest("button.chip");
    if (!b) return;
    const scroll = $("detail").querySelector(".detail-inner").scrollTop;
    if (b.dataset.resetRates) { Analyse.setParam("rf", ""); Analyse.setParam("prm", ""); openDetail(c, i, tab); }
    else if (b.dataset.tab) openDetail(c, i, b.dataset.tab);
    else openDetail(c, Number(b.dataset.y), tab);
    $("detail").querySelector(".detail-inner").scrollTop = scroll;
  };
  if ($("detail").hidden) {
    $("detail").hidden = false;
    $("detail").querySelector(".detail-inner").scrollTop = 0;
  }
}

// ---------- Export CSV ----------
function exportCsv() {
  const rows = state.rows.length ? state.rows : compute();
  const head = ["Société", "Pays", "Ticker", "Secteur", "Devise d'origine", "Score", "CA M€", "Croissance 3 ans",
    "EBITDA M€", "Marge EBITDA", "Résultat net M€", "Marge nette", "FCF M€", "Conversion cash", "Trésorerie M€",
    "Dettes financières M€", "Dette nette M€", "DN/EBITDA", "Capitaux propres M€", "ROCE", "BFR jours", "Piotroski", "Altman Z''", "Source"];
  const n = (v, d = 1) => (ok(v) ? v.toFixed(d).replace(".", ",") : "");
  const lines = rows.map(({ c, m, score, fs, z }) => [c.n, c.c, c.t || "", state.meta.sectors[c.s], c.cur, score ?? "",
    n(m.rev), n(m.growth, 4), n(m.ebitda), n(m.ebitdaMargin, 4), n(m.ni), n(m.netMargin, 4), n(m.fcf),
    n(m.conversion, 4), n(m.cash), n(m.debt), n(m.netDebt), n(m.leverage, 2), n(m.equity), n(m.roce, 4),
    n(m.bfrDays, 0), fs ?? "", n(z, 2), c.src || ""]);
  const csv = [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `reprise-${$("year").value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Mémoire des filtres (pratique, non essentielle) ----------
const FILTER_IDS = ["q", "country", "index", "sector", "year", "revMin", "revMax", "ebitdaMin", "levMax", "profit3", "complete", "banks", "favOnly", "strat"];
function saveFilters() {
  try {
    const o = {};
    for (const id of FILTER_IDS) o[id] = $(id).type === "checkbox" ? $(id).checked : $(id).value;
    o.sort = state.sort;
    localStorage.setItem("reprise.filters", JSON.stringify(o));
  } catch (e) { /* stockage indisponible : sans importance */ }
}
function loadFilters() {
  try {
    const o = JSON.parse(localStorage.getItem("reprise.filters") || "null");
    if (!o) return;
    for (const id of FILTER_IDS) {
      if (!(id in o)) continue;
      if ($(id).type === "checkbox") $(id).checked = !!o[id];
      else if (id !== "year" || [...$(id).options].some((op) => op.value === o[id])) $(id).value = o[id];
    }
    if (o.sort && COLS.some((c) => c.key === o.sort.key)) state.sort = o.sort;
  } catch (e) { /* ignoré */ }
}

// ---------- Rendu et événements ----------
function render() {
  if (state.view === "list") renderList();
  else if (state.view === "sectors") renderSectors();
  else if (state.view === "compare") renderCompare();
  else if (state.view === "pick") Picking.render();
  else if (state.view === "nuages") Nuages.render();
  else if (state.view === "tdb") TDB.render();
  saveFilters();
}

let timer;
function onFilter() {
  clearTimeout(timer);
  timer = setTimeout(() => { state.shown = PAGE; render(); }, 150);
}

const SPACE_OF = { banc: "invest", list: "invest", pick: "invest", nuages: "invest", tdb: "invest", sectors: "invest", compare: "invest", pme: "reprise", ptdb: "reprise", lbo: "reprise", help: "method" };
const lastView = { invest: "tdb", reprise: "ptdb", method: "help" };
// Sur grand écran, l'onglet Analyse garde la fiche ouverte à droite (méthode tant qu'aucune société n'est choisie).
const splitMode = () => (state.view === "list" || state.view === "pme") && window.innerWidth >= 880;
function showMethodPanel() {
  $("detailBody").innerHTML = `<div class="card method-panel"><details open><summary><b>La méthode : le plan d'analyse en 4 étapes</b><span class="pm"></span></summary>${Analyse.methodHtml}</details>
    <p class="note">Cliquer une société ${state.view === "pme" ? "sur la carte ou dans le tableau" : "dans le tableau"} pour afficher son analyse ici.</p></div>`;
  $("detailBody").onclick = null;
  $("detail").hidden = false;
}
function closeDetail() {
  if (splitMode()) showMethodPanel(); else $("detail").hidden = true;
}
function syncHeader() {
  document.documentElement.style.setProperty("--hdr", document.querySelector(".top").offsetHeight + "px");
}

function setView(v) {
  state.view = v;
  const space = SPACE_OF[v] || "invest";
  lastView[space] = v;
  document.querySelectorAll(".spaces button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.space === space)));
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.hidden = b.dataset.in !== space;
    b.setAttribute("aria-selected", String(b.dataset.view === v));
  });
  for (const s of ["list", "sectors", "compare", "pick", "nuages", "banc", "tdb", "pme", "ptdb", "lbo", "help"]) $("view-" + s).hidden = s !== v;
  document.body.dataset.view = v;
  syncHeader();
  if (splitMode()) { if ($("detail").hidden || !$("detailBody").innerHTML || state.splitOf !== v) showMethodPanel(); state.splitOf = v; }
  else $("detail").hidden = true;
  $("filters").hidden = space !== "invest";
  document.body.dataset.space = space;
  $("pmeHead").hidden = !(v === "pme" || v === "ptdb");
  if (v === "pme" || v === "ptdb") PME.show();
  if (v === "lbo") LBO.mount();
  if (v === "pick") Picking.mount();
  if (v === "nuages") Nuages.mount();
  if (v === "banc") Banc.mount();
  if (v === "tdb") TDB.mount();
  try { localStorage.setItem("reprise.view", v); } catch (e) { /* ignoré */ }
  render();
}

// ---------- Suggestion automatique dans la recherche ----------
// Sociétés dont le nom ou le ticker commence par la saisie (puis qui la contiennent), les plus grandes d'abord.
function bindSuggest() {
  const q = $("q"), box = $("qSug");
  let items = [], cur = -1;
  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const size = (c) => { const r = (c.v.revenue || []).filter(ok); return r.length ? r[r.length - 1] * (fx(c, state.meta.years[state.meta.years.length - 1]) || 1) : 0; };
  const close = () => { box.hidden = true; q.setAttribute("aria-expanded", "false"); cur = -1; };
  const show = () => {
    const t = norm(q.value.trim());
    if (t.length < 2) { close(); return; }
    const pre = [], inn = [];
    for (const c of state.companies) {
      const n = c._nn || (c._nn = norm(c.n)), tk = norm(c.t);
      if (n.startsWith(t) || tk === t || n.split(/[\s\-.&]+/).some((w) => w.startsWith(t))) pre.push(c);
      else if (n.includes(t) || (tk && tk.startsWith(t))) inn.push(c);
    }
    const by = (a, b) => size(b) - size(a);
    items = [...pre.sort(by), ...inn.sort(by)].slice(0, 8);
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((c, k) => `<li role="option" data-k="${k}" aria-selected="${k === cur}">${esc(c.n)}<span class="flag">${c.c}${c.t ? " · " + esc(c.t) : ""} · ${esc(shortSector(c.s))}</span>${Fav.has(c.id) ? ' <span class="star-in">★</span>' : ""}</li>`).join("");
    box.hidden = false; q.setAttribute("aria-expanded", "true");
  };
  const pick = (k) => {
    const c = items[k];
    if (!c) return;
    close();
    q.value = c.n;
    if (state.view !== "list") setView("list"); else onFilter();
    setTimeout(() => openDetail(c), state.view === "list" ? 200 : 0);
  };
  q.addEventListener("input", () => { cur = -1; show(); });
  q.addEventListener("focus", show);
  q.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      box.querySelectorAll("li").forEach((li, k) => li.setAttribute("aria-selected", String(k === cur)));
    } else if (e.key === "Enter" && cur >= 0) { e.preventDefault(); pick(cur); }
    else if (e.key === "Escape") close();
  });
  box.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(Number(li.dataset.k)); } });
  q.addEventListener("blur", () => setTimeout(close, 100));
}

function bind() {
  bindSuggest();
  $("ifrs16").checked = Analyse.params.ifrs16 !== false;
  $("ifrs16").addEventListener("change", () => {
    Analyse.setFlag("ifrs16", $("ifrs16").checked);
    render();
    if (state.view === "list" && state.detailC) openDetail(state.detailC);
  });
  for (const id of FILTER_IDS) $(id).addEventListener(id === "q" || id.endsWith("Min") || id.endsWith("Max") ? "input" : "change", onFilter);
  $("reset").onclick = () => {
    for (const id of FILTER_IDS) {
      if ($(id).type === "checkbox") $(id).checked = false;
      else if (id !== "year") $(id).value = "";
    }
    $("year").value = String(defaultYear());
    state.sort = { key: "score", dir: -1 };
    onFilter();
  };
  $("csv").onclick = exportCsv;
  $("view-list").addEventListener("click", (e) => {
    if (e.target.id !== "allCols") return;
    try { localStorage.setItem("reprise.allcols", localStorage.getItem("reprise.allcols") === "1" ? "0" : "1"); } catch (er) { /* ignoré */ }
    renderList();
  });
  $("more").onclick = () => { state.shown += PAGE; renderList(); };
  $("thead").onclick = (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const key = th.dataset.key;
    state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: key === "name" || key === "sector" ? 1 : -1 };
    renderList();
    saveFilters();
  };
  $("tbody").onclick = (e) => {
    const st = e.target.closest("[data-star]");
    if (st) { Fav.toggle(st.dataset.star); renderList(); return; }
    const tr = e.target.closest("tr");
    if (tr) openDetail(state.rows[Number(tr.dataset.k)].c);
  };
  $("sectorCharts").onclick = (e) => {
    const r = e.target.closest("[data-sector]");
    if (!r) return;
    $("sector").value = r.dataset.sector;
    setView("list");
  };
  $("sectorTable").onclick = (e) => {
    const tr = e.target.closest("tr[data-sector]");
    if (!tr) return;
    $("sector").value = tr.dataset.sector;
    setView("list");
  };
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  document.querySelectorAll(".spaces button").forEach((b) => (b.onclick = () => setView(lastView[b.dataset.space])));
  $("closeDetail").onclick = closeDetail;
  $("detail").onclick = (e) => { if (e.target === $("detail")) closeDetail(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  let rz;
  window.addEventListener("resize", () => {
    syncHeader();
    clearTimeout(rz);
    rz = setTimeout(() => { if (["list", "pme", "tdb", "ptdb"].includes(state.view)) setView(state.view); }, 150);
  });

}

// Exercice par défaut : le plus récent pour lequel au moins 60 % des sociétés
// ont déjà publié leur chiffre d'affaires.
function defaultYear() {
  const ys = state.meta.years;
  const counts = ys.map((_, i) => state.companies.filter((c) => c.v.revenue && ok(c.v.revenue[i])).length);
  const best = Math.max(...counts);
  for (let i = ys.length - 1; i >= 0; i--) if (counts[i] >= best * 0.6) return ys[i];
  return ys[ys.length - 1];
}

async function init() {
  try {
    const res = await fetch("data/companies.json");
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    state.meta = d.meta;
    state.companies = d.companies;
  } catch (e) {
    $("dataInfo").textContent = "Données introuvables : lancer la collecte (voir README).";
    return;
  }
  const { meta } = state;
  const date = new Date(meta.generated).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const zc = meta.zone_counts || { FR: meta.counts.FR, US: meta.counts.US };
  const total = Object.values(zc).reduce((x, y) => x + y, 0);
  document.querySelector(".brand").title = `${nf0.format(total)} sociétés cotées · données du ${date}`;
  $("dataInfo").textContent = `${nf0.format(total)} sociétés cotées (France ${nf0.format(zc.FR || 0)}, USA ${nf0.format(zc.US || 0)}, reste du monde ${nf0.format(total - (zc.FR || 0) - (zc.US || 0))}) · données du ${date}`;
  if (meta.zones) $("country").innerHTML = `<option value="">Toutes zones</option>` +
    Object.entries(meta.zones).filter(([k]) => zc[k]).map(([k, v]) => `<option value="${k}">${esc(v)} (${nf0.format(zc[k])})</option>`).join("");
  $("methodPlan").innerHTML = Analyse.methodHtml;
  $("sector").innerHTML += Object.entries(meta.sectors).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  // Indices boursiers (collect/indices.py) : membres retrouvés dans la base.
  $("index").innerHTML += Object.entries(meta.indices || {}).filter(([, v]) => v.found > 0)
    .map(([k, v]) => `<option value="${esc(k)}">${esc(k)} (${v.found}${v.found < v.members ? " sur " + v.members : ""})</option>`).join("");
  $("year").innerHTML = [...meta.years].reverse().map((y) => `<option>${y}</option>`).join("");
  $("year").value = String(defaultYear());
  loadFilters();
  const tb = $("themeBtn");
  const setIcon = () => { tb.textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾"; };
  setIcon();
  tb.onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("reprise.theme", t); } catch (e) { /* ignoré */ }
    setIcon();
    render();   // les graphiques reprennent les couleurs du thème
  };
  bind();
  bindCompare();
  let start = "tdb";
  try { start = localStorage.getItem("reprise.view") || "tdb"; } catch (e) { /* ignoré */ }
  setView(SPACE_OF[start] && !["compare", "sectors", "nuages"].includes(start) ? start : "tdb");
  // Plus de module hors connexion : on désinstalle celui des anciennes versions et on vide ses copies.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

init();
