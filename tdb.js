"use strict";
// Vue générale : tous les graphiques de l'outil, rangés comme la fiche.
//   Partie 1 — l'analyse financière : 2 graphiques par étape (marges, investissements, financement, rentabilité).
//   Partie 2 — le marché la paie-t-il déjà ? : création de valeur et prix, ROE × PBR, PER, VE / EBE.
// Deux lectures : Entreprises (un point par société, couleur = verdict de l'étape) ou Secteurs (une bulle
// par secteur, à la médiane, taille = nombre de sociétés).
// Dépend de app.js ($, ok, esc, nf0, nf1, state, compute, fx, openDetail) et d'analyse.js.

const TDB = (() => {
  const P = (v) => nf0.format(v * 100) + " %";
  const X = (v) => nf1.format(v).replace(",0", "") + "×";
  const M = (v) => (Math.abs(v) >= 1000 ? nf0.format(v / 1000) + " Md" : nf0.format(v) + " M");
  const S = (v) => (v > 0 ? "+" : "") + nf0.format(v * 100) + " pts";
  const kMarket = () => Analyse.marketK();

  // step : indice du verdict qui colore les points (0 marges … 3 rentabilité).
  const PART1 = [
    { n: 1, step: 0, title: "Les marges", sub: "croissance × marge d'EBE",
      x: { k: "growth", label: "Croissance du CA (par an, 3 ans)", min: -0.2, max: 0.4, fmt: P },
      y: { k: "ebitdaMargin", label: "Marge d'EBE", min: -0.1, max: 0.6, fmt: P },
      guides: [{ axis: "x", v: 0 }], note: "En haut à droite : on grandit et on garde une marge élevée." },
    { n: 1, step: 0, title: "Les marges", sub: "taille : CA × résultat net",
      x: { k: "revE", label: "Chiffre d'affaires (M€, log)", min: 10, max: 1e6, log: true, fmt: M },
      y: { k: "niE", label: "Résultat net (M€, log symétrique)", min: -1e4, max: 2e5, symlog: true, fmt: M },
      iso: { kind: "ratio", values: [0.05, 0.1, 0.2], label: (r) => `marge nette ${P(r)}` },
      note: "Les géants en haut à droite, les sociétés en perte sous zéro. Les diagonales relient les points de même marge nette." },
    { n: 2, step: 1, title: "Les investissements", sub: "BFR × investissements / amortissements",
      x: { k: "bfrDays", label: "BFR en jours de CA", min: -60, max: 180, fmt: (v) => nf0.format(v) + " j" },
      y: { k: "capexDa", label: "Investissements / amortissements", min: 0, max: 3, fmt: X },
      guides: [{ axis: "y", v: 0.9, label: "↓ retrait" }, { axis: "y", v: 1.1, label: "capacité ↑", above: true }, { axis: "x", v: 0 }],
      note: "À gauche : BFR faible ou négatif (clients et fournisseurs financent). Au-dessus de 1,1× : l'outil se développe." },
    { n: 2, step: 1, title: "Les investissements", sub: "BFR × investissements en % du CA",
      x: { k: "bfrDays", label: "BFR en jours de CA", min: -60, max: 180, fmt: (v) => nf0.format(v) + " j" },
      y: { k: "capexRev", label: "Investissements en % du CA", min: 0, max: 0.3, fmt: P },
      guides: [{ axis: "x", v: 0 }], note: "En haut : les métiers capitalistiques (énergie, télécoms, électricité) ; à gauche, le cycle d'exploitation finance l'entreprise." },
    { n: 3, step: 2, title: "Le financement", sub: "dette nette / EBE × couverture des intérêts",
      x: { k: "ndEbitda", label: "Dette nette / EBE", min: -3, max: 8, fmt: X },
      y: { k: "coverage", label: "Résultat d'exploitation / frais financiers (log)", min: 0.5, max: 100, log: true, fmt: X },
      guides: [{ axis: "x", v: 3, label: "3×" }, { axis: "y", v: 3, label: "3×" }],
      zone: { x1: -3, x2: 3, y1: 3, y2: 100 }, note: "Zone tramée : dette ≤ 3× l'EBE et intérêts couverts au moins 3 fois." },
    { n: 3, step: 2, title: "Le financement", sub: "dette nette / EBE × rentabilité",
      x: { k: "ndEbitda", label: "Dette nette / EBE", min: -3, max: 8, fmt: X },
      y: { k: "roce", label: "ROCE courant après IS", min: -0.2, max: 0.6, fmt: P },
      guides: [{ axis: "x", v: 0 }, { axis: "x", v: 3, label: "3×" }, { axis: "y", v: "k", label: "coût du capital moyen", above: true }],
      note: "À gauche du zéro : trésorerie nette. À droite de 3× : endettement lourd, à surveiller si la rentabilité est faible." },
    { n: 4, step: 3, title: "La rentabilité", sub: "rotation × marge = ROCE",
      x: { k: "rotation", label: "Rotation des capitaux employés (log)", min: 0.1, max: 10, log: true, fmt: X },
      y: { k: "margin", label: "Marge d'exploitation après IS", min: -0.1, max: 0.4, fmt: P },
      iso: { kind: "inverse", values: ["k", 0.2], label: (r) => `ROCE ${nf1.format(r * 100)} %` },
      note: "Courbes : ROCE égal au coût du capital moyen du marché, et à 20 %. Au-dessus de la première, la société crée de la valeur." },
    { n: 4, step: 3, title: "La rentabilité", sub: "effet de levier : ROCE × ROE",
      x: { k: "roce", label: "ROCE courant après IS", min: -0.2, max: 0.6, fmt: P },
      y: { k: "roe", label: "Rentabilité des capitaux propres (ROE)", min: -0.3, max: 0.8, fmt: P },
      iso: { kind: "diag", label: () => "ROE = ROCE" }, guides: [{ axis: "x", v: 0 }, { axis: "y", v: 0 }],
      note: "Au-dessus de la diagonale, l'endettement augmente le ROE (effet de levier positif) ; il augmente aussi le risque et ne crée pas de valeur." },
  ];
  const PART2 = [
    { n: "€", step: 3, title: "Création de valeur × prix", sub: "ROCE − coût du capital × VE / capitaux employés",
      x: { k: "spread", label: "ROCE après IS − coût du capital (points)", min: -0.2, max: 0.4, fmt: S },
      y: { k: "vae", label: "Valeur d'entreprise / capitaux employés (log)", min: 0.2, max: 30, log: true, fmt: X },
      guides: [{ axis: "x", v: 0 }, { axis: "y", v: 1 }], iso: { kind: "curve", fn: (x) => 1 + x / kMarket(), label: () => "justifié sans croissance" },
      note: "Sur la courbe, le cours ne paie que la rentabilité actuelle. Au-dessus, il paie de la croissance ; en dessous à droite du zéro : crée de la valeur mais cotée sous son prix justifié." },
    { n: "€", step: 3, title: "Côté actionnaire", sub: "ROE − coût des fonds propres × PBR",
      x: { k: "roeSpread", label: "ROE − coût des fonds propres (points)", min: -0.3, max: 0.5, fmt: S },
      y: { k: "pbr", label: "Capitalisation / capitaux propres (log)", min: 0.2, max: 50, log: true, fmt: X },
      guides: [{ axis: "x", v: 0 }, { axis: "y", v: 1 }],
      note: "Au-dessus de 1× sans ROE supérieur au coût des fonds propres, le marché paie une croissance ou un redressement attendus." },
    { n: "€", step: 3, title: "Valorisation", sub: "résultat net × capitalisation",
      x: { k: "niE", label: "Résultat net (M€, log)", min: 1, max: 2e5, log: true, fmt: M },
      y: { k: "mcapE", label: "Capitalisation (M€, log)", min: 10, max: 5e6, log: true, fmt: M },
      iso: { kind: "ratio", values: [10, 20, 40], label: (r) => `PER ${r}` },
      note: "Les diagonales relient les points de même PER : au-dessus de 40, le marché paie cher les bénéfices actuels." },
    { n: "€", step: 3, title: "Rentabilité × prix", sub: "ROCE × VE / EBE",
      x: { k: "roce", label: "ROCE courant après IS", min: -0.2, max: 0.6, fmt: P },
      y: { k: "evEbitda", label: "VE / EBE (log)", min: 1, max: 60, log: true, fmt: X },
      note: "En bas à droite : rentables et peu chères. En haut à gauche : chères et peu rentables." },
  ];
  const STATUS = { green: "bon", orange: "à surveiller", red: "alerte", grey: "non évaluable" };
  let onlyAll = false, hot = null, data = [], mode = "ent";
  try { mode = localStorage.getItem("reprise.tdbMode") === "sec" ? "sec" : "ent"; } catch (e) { /* ignoré */ }

  // Entreprises : filtres du haut, secteur compris. Secteurs : tous les secteurs (le filtre de secteur est ignoré).
  function build() {
    const i = state.meta.years.indexOf(Number($("year").value));
    const y = state.meta.years[i];
    data = compute(mode === "sec").map((r) => {
      const { f, s } = Analyse.stepColors(r.c, i);
      const rate = fx(r.c, y) || 1;
      f.revE = ok(f.rev) ? f.rev * rate : null;
      f.niE = ok(f.ni) ? f.ni * rate : null;
      f.mcapE = ok(f.mcap) ? f.mcap * rate : null;
      return { c: r.c, id: r.c.id, sec: r.c.s, f, s, all: s.every((x) => x === "green") };
    });
    data.forEach((d, k) => (d.k = k));
  }

  // Médianes par groupe (secteur, section NAF…) : une bulle par groupe d'au moins 5 sociétés.
  function groupPoints(D, panels, keyOf, labelOf) {
    const by = new Map();
    for (const d of D) { const k = keyOf(d); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(d); } }
    const keys = [...new Set(panels.flatMap((p) => [p.x.k, p.y.k]))];
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    return [...by.entries()].filter(([, ds]) => ds.length >= 5).map(([k, ds]) => {
      const f = {};
      for (const key of keys) f[key] = med(ds.map((d) => d.f[key]).filter(ok));
      return { grp: k, label: labelOf(k), n: ds.length, f };
    });
  }

  // Un graphique. D : points ({ k, id, f, s }) ou bulles ({ grp, label, n, f }). Réutilisé par la vue PME.
  // o : { only, hot, size: { W, H }, groups } — groups = bulles du mode Secteurs (sinon points).
  function panel(p, D = data, o = {}) {
    if (typeof o !== "object" || o === null || Array.isArray(o)) o = {};
    const only = o.only ?? false, h = o.hot ?? null, size = o.size || { W: 460, H: 300 }, groups = o.groups || null;
    const W = size.W, H = size.H, L = 54, R = 14, T = 12, B = 36;
    const symlog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v));
    const tf = (ax) => (ax.log ? Math.log10 : ax.symlog ? symlog : (v) => v);
    const tx = tf(p.x), ty = tf(p.y);
    const sx = (v) => L + (tx(Math.min(p.x.max, Math.max(p.x.min, v))) - tx(p.x.min)) / (tx(p.x.max) - tx(p.x.min)) * (W - L - R);
    const sy = (v) => H - B - (ty(Math.min(p.y.max, Math.max(p.y.min, v))) - ty(p.y.min)) / (ty(p.y.max) - ty(p.y.min)) * (H - T - B);
    const valid = (ax, v) => ok(v) && (!ax.log || v > 0);
    const ticks = (ax) => {
      if (ax.log || ax.symlog) {
        const out = [];
        for (let e = -1; e <= 7; e++) for (const m of [1, 3]) {
          const v = m * Math.pow(10, e);
          if (v >= ax.min && v <= ax.max && (m === 1 || Math.log10(ax.max / Math.max(ax.min, 1e-9)) < 4)) out.push(v);
          if (ax.symlog && m === 1 && -v >= ax.min && -v <= ax.max) out.push(-v);
        }
        if (ax.symlog) out.push(0);
        return out;
      }
      const raw = (ax.max - ax.min) / 5, q = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map((m) => m * q).find((m) => m >= raw);
      const out = [];
      for (let v = Math.ceil(ax.min / step) * step; v <= ax.max + 1e-9; v += step) out.push(+v.toFixed(6));
      return out;
    };
    let g = "";
    for (const v of ticks(p.x)) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${sx(v)}" y="${H - B + 14}" text-anchor="middle">${p.x.fmt(v)}</text>`;
    for (const v of ticks(p.y)) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 5}" y="${sy(v) + 4}" text-anchor="end">${p.y.fmt(v)}</text>`;
    g += `<text class="ax t" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(p.x.label)}</text>`;
    g += `<text class="ax t" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(p.y.label)}</text>`;
    if (p.zone) g += `<rect class="zone" x="${sx(p.zone.x1)}" y="${sy(p.zone.y2)}" width="${sx(p.zone.x2) - sx(p.zone.x1)}" height="${sy(p.zone.y1) - sy(p.zone.y2)}"/>`;
    for (const gd of p.guides || []) {
      const v = gd.v === "k" ? kMarket() : gd.v;
      g += gd.axis === "x" ? `<line class="guide" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/>${gd.label ? `<text class="gl" x="${sx(v) + 4}" y="${T + 11}">${esc(gd.label)}</text>` : ""}`
        : `<line class="guide" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/>${gd.label ? `<text class="gl" x="${W - R - 4}" y="${sy(v) + (gd.above ? -5 : 12)}" text-anchor="end">${esc(gd.label)}</text>` : ""}`;
    }
    // Courbes de référence : y = r·x (ratio), y = r / x (inverse), y = x (diagonale) ou fonction.
    const curves = !p.iso ? [] : p.iso.kind === "diag" ? [{ f: (x) => x, lab: p.iso.label() }]
      : p.iso.kind === "curve" ? [{ f: p.iso.fn, lab: p.iso.label() }]
        : p.iso.values.map((r0) => { const r = r0 === "k" ? kMarket() : r0; return { f: p.iso.kind === "inverse" ? (x) => r / x : (x) => r * x, lab: p.iso.label(r) }; });
    for (const cv of curves) {
      const pts = [];
      for (let k = 0; k <= 80; k++) {
        const t0 = tx(p.x.min) + k / 80 * (tx(p.x.max) - tx(p.x.min));
        const x = p.x.log ? Math.pow(10, t0) : p.x.symlog ? Math.sign(t0) * (Math.pow(10, Math.abs(t0)) - 1) : t0;
        const y = cv.f(x);
        if (ok(y) && y >= p.y.min && y <= p.y.max && (!p.y.log || y > 0)) pts.push([sx(x), sy(y)]);
      }
      if (pts.length > 1) {
        const lp = pts[Math.floor(pts.length * 0.8)];
        g += `<polyline class="iso" points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")}"/><text class="gl" x="${(lp[0] - 4).toFixed(1)}" y="${(lp[1] - 5).toFixed(1)}" text-anchor="end">${esc(cv.lab)}</text>`;
      }
    }
    let marks = "", counts = null;
    if (groups) {
      // Mode Secteurs : bulles aux médianes, nom placé à droite, à gauche, au-dessus ou en dessous.
      const pts = groups.filter((q) => valid(p.x, q.f[p.x.k]) && valid(p.y, q.f[p.y.k])).sort((a, b) => b.n - a.n);
      const maxN = Math.max(1, ...pts.map((q) => q.n));
      const rad = (q) => 5 + 13 * Math.sqrt(q.n / maxN);
      const bub = pts.map((q) => [sx(q.f[p.x.k]), sy(q.f[p.y.k]), rad(q)]);
      pts.forEach((q, j) => { marks += `<circle class="sb" data-grp="${esc(q.grp)}" cx="${bub[j][0].toFixed(1)}" cy="${bub[j][1].toFixed(1)}" r="${bub[j][2].toFixed(1)}"><title>${esc(q.label)} (${q.n} sociétés)\n${esc(p.x.label)} : ${p.x.fmt(q.f[p.x.k])}\n${esc(p.y.label)} : ${p.y.fmt(q.f[p.y.k])}</title></circle>`; });
      const placed = [];
      pts.forEach((q, j) => {
        const [cx, cy, rr] = bub[j], w = q.label.length * 6.4;
        for (const [x, y, an] of [[cx + rr + 4, cy + 4, "start"], [cx - rr - 4, cy + 4, "end"], [cx, cy - rr - 5, "middle"], [cx, cy + rr + 13, "middle"]]) {
          const x0 = an === "start" ? x : an === "end" ? x - w : x - w / 2, box = [x0, y - 11, x0 + w, y + 3];
          if (box[0] < L || box[2] > W - R + 6 || box[1] < T - 4 || box[3] > H - B + 2) continue;
          if (placed.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
          if (bub.some(([bx, by, br], m) => m !== j && bx + br > box[0] && bx - br < box[2] && by + br > box[1] && by - br < box[3])) continue;
          placed.push(box);
          marks += `<text class="lbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${an}">${esc(q.label)}</text>`;
          break;
        }
      });
    } else {
      const idx = p.step ?? (Number(p.n) - 1);
      const order = { grey: 0, red: 1, orange: 2, green: 3 };
      const shown = D.filter((d) => valid(p.x, d.f[p.x.k]) && valid(p.y, d.f[p.y.k]) && (!only || d.all))
        .sort((a, b) => order[a.s[idx]] - order[b.s[idx]]);
      shown.forEach((d) => {
        const k = d.k ?? D.indexOf(d);
        marks += `<circle class="dp s-${d.s[idx]}${d.id === h ? " hot" : ""}" data-k="${k}" cx="${sx(d.f[p.x.k]).toFixed(1)}" cy="${sy(d.f[p.y.k]).toFixed(1)}" r="${d.id === h ? 7.5 : 4}"/>`;
      });
      counts = { green: 0, orange: 0, red: 0 };
      shown.forEach((d) => { if (counts[d.s[idx]] !== undefined) counts[d.s[idx]]++; });
    }
    return `<div class="card tdb-panel"><h3 title="${esc(p.note)}"><span class="num">${p.n}</span> ${p.title} <small>${p.sub}</small>
        ${counts ? `<span class="cnt"><i class="sw s-green"></i>${counts.green} <i class="sw s-orange"></i>${counts.orange} <i class="sw s-red"></i>${counts.red}</span>` : ""}</h3>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.title + " : " + p.sub)}">${g}${marks}</svg>
      <p class="note pnote">${p.note}</p></div>`;
  }

  // Taille réelle des graphiques, en pixels, aux proportions d'origine (3 de large pour 2 de haut).
  function fit(box) {
    const w = box.clientWidth || 900;
    const W = Math.round(window.innerWidth <= 900 ? Math.max(280, w - 24) : (w - 12) / 2 - 24);
    return { W, H: Math.round(Math.max(240, Math.min(440, W / 1.55))) };
  }
  const fitH = fit;

  // Sélecteur Entreprises | Secteurs (aussi utilisé par la vue PME).
  const modeSwitch = (m, what = "Secteurs") => `<div class="chips mode-switch" role="radiogroup" aria-label="Lecture">
      <button class="chip" data-mode="ent" aria-pressed="${m === "ent"}">Entreprises</button>
      <button class="chip" data-mode="sec" aria-pressed="${m === "sec"}">${what}</button></div>`;

  function render() {
    build();
    const good = data.filter((d) => d.all).sort((a, b) => (b.f.roce || 0) - (a.f.roce || 0));
    const sec = mode === "sec";
    $("tdbOut").innerHTML = `
      <div class="card tdb-intro"><h3>Toutes les sociétés, selon le plan d'analyse ${modeSwitch(mode)}</h3>
        <p class="note">${sec ? `Une bulle par secteur (5 sociétés au moins), placée à la médiane de ses sociétés ; taille = nombre de sociétés. Cliquer une bulle affiche les sociétés de ce secteur (filtre Secteur du haut).`
          : `Chaque point est une société (filtres du haut appliqués, exercice ${$("year").value}). Sa couleur est le verdict de l'étape, avec les mêmes règles que la synthèse des fiches :
          <span class="cnt"><i class="sw s-green"></i>bon <i class="sw s-orange"></i>à surveiller <i class="sw s-red"></i>alerte</span> ; dans la partie 2, le verdict de rentabilité (création de valeur). Survoler un point montre la société dans tous les graphiques.`}</p>
        ${sec ? "" : `<label class="check tdb-toggle"><input type="checkbox" id="tdbAll" ${onlyAll ? "checked" : ""}> N'afficher que les sociétés bonnes dans les 4 étapes (${nf0.format(good.length)} sur ${nf0.format(data.length)})</label>
        <div id="tdbHot" class="tdb-hot">${hotLine()}</div>`}
      </div>
      <h3 class="part"><span class="part-n">1</span> L'analyse financière <small>— les 4 étapes, deux graphiques par étape</small></h3>
      <div class="tdb-grid" id="tdbGrid1"></div>
      <h3 class="part"><span class="part-n">2</span> Le marché <small>— si elle crée de la valeur, la paie-t-il déjà ? (sociétés qui ont un cours)</small></h3>
      <div class="tdb-grid" id="tdbGrid2"></div>
      <details class="card tdb-list"><summary><b>Bonnes dans les 4 étapes (${nf0.format(good.length)})</b> <small>— classées par ROCE après IS · ouvrir la liste</small></summary>
        <div class="tablewrap"><table><thead><tr><th class="l">Société</th><th class="l">Secteur</th><th>CA M€</th><th>Croissance</th><th>Marge d'EBE</th><th>BFR</th><th>Dette nette / EBE</th><th>ROCE</th><th>PER</th></tr></thead><tbody>
        ${good.slice(0, 100).map((d) => `<tr data-k="${d.k}"><td class="l">${esc(d.c.n)}<span class="flag">${esc(d.c.c)} · ${esc(d.c.t || "")}</span></td>
          <td class="l">${esc((state.meta.sectors[d.c.s] || "").split(/[,(]/)[0])}</td><td>${ok(d.f.revE) ? nf0.format(d.f.revE) : "—"}</td>
          <td>${ok(d.f.growth) ? P(d.f.growth) : "—"}</td><td>${ok(d.f.ebitdaMargin) ? P(d.f.ebitdaMargin) : "—"}</td><td>${ok(d.f.bfrDays) ? nf0.format(d.f.bfrDays) + " j" : "—"}</td>
          <td>${ok(d.f.netDebt) && d.f.netDebt <= 0 ? "trésorerie nette" : ok(d.f.ndEbitda) ? X(d.f.ndEbitda) : "—"}</td><td>${ok(d.f.roce) ? P(d.f.roce) : "—"}</td><td>${ok(d.f.per) ? nf1.format(d.f.per) : "—"}</td></tr>`).join("")}
        </tbody></table></div>${good.length > 100 ? `<p class="note">Les 100 premières sur ${good.length}.</p>` : ""}</details>`;
    const size = fit($("tdbGrid1"));
    const groups = sec ? groupPoints(data, PART1.concat(PART2), (d) => d.sec, (k) => (state.meta.sectors[k] || k).split(/[,(&]/)[0].trim()) : null;
    const o = { only: onlyAll, hot, size, groups };
    $("tdbGrid1").innerHTML = PART1.map((pn) => panel(pn, data, o)).join("");
    $("tdbGrid2").innerHTML = PART2.map((pn) => panel(pn, data, o)).join("");
    if (typeof renderSectors === "function") renderSectors();   // tableau des médianes par secteur (en bas de page)
  }

  function hotLine() {
    const d = data.find((x) => x.c.id === hot);
    if (!d) return `<span class="note">Survoler un point pour suivre une société dans tous les graphiques, cliquer pour ouvrir sa fiche.</span>`;
    return `<b>${esc(d.c.n)}</b> ${["Marges", "Investissements", "Financement", "Rentabilité"].map((t, k) => `<span class="pill s-${d.s[k]}">${t} : ${STATUS[d.s[k]]}</span>`).join(" ")}`;
  }

  let bound = false, raf = null;
  function mount() {
    render();
    if (bound) return;
    bound = true;
    const box = $("tdbOut");
    box.addEventListener("change", (e) => { if (e.target.id === "tdbAll") { onlyAll = e.target.checked; render(); } });
    box.addEventListener("pointerover", (e) => {
      const c = e.target.closest("circle.dp");
      if (!c) return;
      const d = data[Number(c.dataset.k)];
      if (!d || d.c.id === hot) return;
      hot = d.c.id;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        box.querySelectorAll("circle.dp.hot").forEach((x) => { x.classList.remove("hot"); x.setAttribute("r", 4); });
        box.querySelectorAll(`circle.dp[data-k="${c.dataset.k}"]`).forEach((x) => { x.classList.add("hot"); x.setAttribute("r", 7.5); x.parentNode.appendChild(x); });
        if ($("tdbHot")) $("tdbHot").innerHTML = hotLine();
      });
    });
    box.addEventListener("click", (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) { mode = m.dataset.mode; try { localStorage.setItem("reprise.tdbMode", mode); } catch (er) { /* ignoré */ } render(); return; }
      const b = e.target.closest("circle.sb");
      if (b) {
        mode = "ent"; try { localStorage.setItem("reprise.tdbMode", mode); } catch (er) { /* ignoré */ }
        $("sector").value = b.dataset.grp; $("sector").dispatchEvent(new Event("change"));
        render(); return;
      }
      const c = e.target.closest("circle.dp, tr[data-k]");
      if (c) openDetail(data[Number(c.dataset.k)].c);
    });
  }

  return { mount, render, panel, fit, fitH, groupPoints, modeSwitch, STATUS };
})();
