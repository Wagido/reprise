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
  const netDebt = ok(debt) && ok(cash) ? debt - cash : null;
  const equity = g("equity");
  const ni = g("net_income");
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
    sector: $("sector").value,
    year: Number($("year").value),
    revMin: num("revMin"), revMax: num("revMax"),
    ebitdaMin: num("ebitdaMin"), levMax: num("levMax"),
    profit3: $("profit3").checked, complete: $("complete").checked,
  };
}

function compute(ignoreSector = false) {
  const f = readFilters();
  const i = state.meta.years.indexOf(f.year);
  const out = [];
  for (const c of state.companies) {
    if (f.country && c.c !== f.country) continue;
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
    if (f.complete && !m.complete) continue;
    out.push({ c, m });
  }
  score(out);
  return out;
}

// ---------- Tableau principal ----------
const COLS = [
  { key: "name", label: "Société", cls: "l", get: (r) => r.c.n, fmt: (r) => `${esc(r.c.n)}<span class="flag">${r.c.c}${r.c.t ? " · " + esc(r.c.t) : ""}</span>` },
  { key: "sector", label: "Secteur", cls: "l hide-sm", get: (r) => state.meta.sectors[r.c.s], fmt: (r) => esc(shortSector(r.c.s)) },
  { key: "score", label: "Score", get: (r) => r.score, fmt: (r) => (ok(r.score) ? `<span class="score">${r.score}</span>` : '<span class="na">—</span>') },
  { key: "rev", label: "CA M€", get: (r) => r.m.rev, fmt: (r) => money(r.m.rev) },
  { key: "growth", label: "Crois. 3 ans", get: (r) => r.m.growth, fmt: (r) => pct(r.m.growth, true) },
  { key: "ebitda", label: "EBITDA M€", get: (r) => r.m.ebitda, fmt: (r) => money(r.m.ebitda) },
  { key: "ebitdaMargin", label: "Marge EBITDA", get: (r) => r.m.ebitdaMargin, fmt: (r) => pct(r.m.ebitdaMargin, true) },
  { key: "netMargin", label: "Marge nette", get: (r) => r.m.netMargin, fmt: (r) => pct(r.m.netMargin, true) },
  { key: "fcf", label: "FCF M€", get: (r) => r.m.fcf, fmt: (r) => money(r.m.fcf) },
  { key: "conversion", label: "Conv. cash", get: (r) => r.m.conversion, fmt: (r) => pct(r.m.conversion, true) },
  { key: "netDebt", label: "Dette nette M€", get: (r) => r.m.netDebt, fmt: (r) => money(r.m.netDebt) },
  { key: "leverage", label: "DN/EBITDA", get: (r) => r.m.leverage, fmt: (r) => mult(r.m.leverage) },
  { key: "roce", label: "ROCE", get: (r) => r.m.roce, fmt: (r) => pct(r.m.roce, true) },
  { key: "bfrDays", label: "BFR", get: (r) => r.m.bfrDays, fmt: (r) => days(r.m.bfrDays) },
];

function shortSector(s) {
  return (state.meta.sectors[s] || s).split(/[ ,(]/)[0].replace(/\.$/, "") + (s === "conso_cyc" ? ". discr." : s === "conso_base" ? ". base" : "");
}

function renderHead() {
  $("thead").innerHTML = COLS.map((c) => {
    const on = state.sort.key === c.key;
    return `<th data-key="${c.key}" class="${c.cls || ""} ${on ? "sorted" : ""}">${c.label}${on ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`;
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
  $("tbody").innerHTML = rows.map((r, k) =>
    `<tr data-k="${k}">${COLS.map((c) => `<td class="${c.cls || ""}">${c.fmt(r)}</td>`).join("")}</tr>`).join("");
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
  $("sectorTable").innerHTML =
    `<thead><tr><th class="l">Secteur</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>` +
    keys.map((k) => `<tr data-sector="${k}"><td class="l">${esc(state.meta.sectors[k])}</td>${cols.map((c) => `<td>${c[1](by[k])}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
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
  const ys = state.meta.years;
  const i = yearIdx ?? ys.indexOf(Number($("year").value));
  tab = tab || state.detailTab || "analyse";
  state.detailTab = tab;
  const m = metrics(c, i);
  const raw = (field) => (_, j) => val(c, field, j, true);
  const where = [c.c === "US" ? "USA" : "France", c.x, c.t].filter(Boolean).join(" · ");
  const sector = `${state.meta.sectors[c.s]}${c.sf === "estimé" ? " (estimé)" : c.sd ? " — " + c.sd : ""}`;
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
    <h2>${esc(c.n)}</h2>
    <p class="meta">${esc(where)} · ${esc(sector)} · comptes en ${esc(c.cur)}
      ${c.src ? ` · <a href="${esc(c.src)}" target="_blank" rel="noopener">source officielle</a>` : ""}</p>
    ${c.c === "FR" && c.sd ? `<p class="desc">${esc(c.sd)}</p>` : ""}
    <div class="kpis">
      ${[["Score reprise", row && ok(row.score) ? row.score + " / 100" : "—"],
         ["CA " + ys[i], money(m.rev) + " M€"], ["Marge EBITDA", pct(m.ebitdaMargin, true)],
         ["Croissance 3 ans", pct(m.growth, true)], ["Conversion cash", pct(m.conversion, true)],
         ["Dette nette / EBITDA", mult(m.leverage)], ["ROCE avant IS", pct(m.roce, true)],
         ["Couverture des intérêts", ok(m.coverage) ? nf1.format(m.coverage) + "×" : "—"],
         ["Années bénéficiaires", m.seenYears ? `${m.profitYears} / ${m.seenYears}` : "—"]]
        .map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join("")}
    </div>
    <div class="chips">${tabs}<span class="sep"></span>${tab === "analyse" ? chips : ""}</div>
    ${tab === "analyse" ? Analyse.render(c, i) : comptes}`;
  $("detailBody").onclick = (e) => {
    const b = e.target.closest("button.chip");
    if (!b) return;
    const scroll = $("detail").querySelector(".detail-inner").scrollTop;
    if (b.dataset.tab) openDetail(c, i, b.dataset.tab);
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
    "Dettes financières M€", "Dette nette M€", "DN/EBITDA", "Capitaux propres M€", "ROCE", "BFR jours", "Source"];
  const n = (v, d = 1) => (ok(v) ? v.toFixed(d).replace(".", ",") : "");
  const lines = rows.map(({ c, m, score }) => [c.n, c.c, c.t || "", state.meta.sectors[c.s], c.cur, score ?? "",
    n(m.rev), n(m.growth, 4), n(m.ebitda), n(m.ebitdaMargin, 4), n(m.ni), n(m.netMargin, 4), n(m.fcf),
    n(m.conversion, 4), n(m.cash), n(m.debt), n(m.netDebt), n(m.leverage, 2), n(m.equity), n(m.roce, 4),
    n(m.bfrDays, 0), c.src || ""]);
  const csv = [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `reprise-${$("year").value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Mémoire des filtres (pratique, non essentielle) ----------
const FILTER_IDS = ["q", "country", "sector", "year", "revMin", "revMax", "ebitdaMin", "levMax", "profit3", "complete"];
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
  saveFilters();
}

let timer;
function onFilter() {
  clearTimeout(timer);
  timer = setTimeout(() => { state.shown = PAGE; render(); }, 150);
}

function setView(v) {
  state.view = v;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
  for (const s of ["list", "sectors", "help"]) $("view-" + s).hidden = s !== v;
  $("filters").hidden = v === "help";
  render();
}

function bind() {
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
    const tr = e.target.closest("tr");
    if (tr) openDetail(state.rows[Number(tr.dataset.k)].c);
  };
  $("sectorTable").onclick = (e) => {
    const tr = e.target.closest("tr[data-sector]");
    if (!tr) return;
    $("sector").value = tr.dataset.sector;
    setView("list");
  };
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $("closeDetail").onclick = () => ($("detail").hidden = true);
  $("detail").onclick = (e) => { if (e.target === $("detail")) $("detail").hidden = true; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("detail").hidden = true; });
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
  $("dataInfo").textContent = `${nf0.format(meta.counts.FR)} sociétés françaises, ${nf0.format(meta.counts.US)} américaines · données du ${date}`;
  $("sector").innerHTML += Object.entries(meta.sectors).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("year").innerHTML = [...meta.years].reverse().map((y) => `<option>${y}</option>`).join("");
  $("year").value = String(defaultYear());
  loadFilters();
  bind();
  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
