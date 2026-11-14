"use strict";
// Tableau de bord du plan en 4 étapes : quatre nuages de points (2 × 2), une
// société par point, couleur = verdict de l'étape (vert / orange / rouge).
// Option : n'afficher que les sociétés vertes dans les 4 étapes.
// Dépend de app.js ($, ok, esc, nf0, nf1, state, compute, openDetail) et d'analyse.js.

const TDB = (() => {
  const P = (v) => nf0.format(v * 100) + " %";
  const X = (v) => nf1.format(v) + "×";
  const PANELS = [
    { n: 1, title: "Les marges", sub: "croissance × marge d'EBE",
      x: { k: "growth", label: "Croissance du CA (par an, 3 ans)", min: -0.2, max: 0.4, fmt: P },
      y: { k: "ebitdaMargin", label: "Marge d'EBE", min: -0.1, max: 0.6, fmt: P },
      guides: [{ axis: "x", v: 0 }], note: "En haut à droite : on grandit et on garde une marge élevée." },
    { n: 2, title: "Les investissements", sub: "BFR × investissements / amortissements",
      x: { k: "bfrDays", label: "BFR en jours de CA", min: -60, max: 180, fmt: (v) => nf0.format(v) + " j" },
      y: { k: "capexDa", label: "Investissements / amortissements", min: 0, max: 3, fmt: X },
      guides: [{ axis: "y", v: 0.9, label: "↓ retrait" }, { axis: "y", v: 1.1, label: "capacité ↑", above: true }, { axis: "x", v: 0 }],
      note: "À gauche : BFR faible ou négatif (les clients et fournisseurs financent). Au-dessus de 1,1× : l'outil se développe." },
    { n: 3, title: "Le financement", sub: "dette nette / EBE × couverture des intérêts",
      x: { k: "ndEbitda", label: "Dette nette / EBE", min: -3, max: 8, fmt: X },
      y: { k: "coverage", label: "Résultat d'exploitation / frais financiers (log)", min: 0.5, max: 100, log: true, fmt: X },
      guides: [{ axis: "x", v: 3, label: "3×" }, { axis: "y", v: 3, label: "3×" }],
      zone: { x1: -3, x2: 3, y1: 3, y2: 100 }, note: "Zone tramée : dette ≤ 3× l'EBE et intérêts couverts au moins 3 fois." },
    { n: 4, title: "La rentabilité", sub: "rotation × marge = ROCE",
      x: { k: "rotation", label: "Rotation de l'actif économique (log)", min: 0.1, max: 10, log: true, fmt: X },
      y: { k: "margin", label: "Marge d'exploitation après IS", min: -0.1, max: 0.4, fmt: P },
      iso: true, note: "Courbes : ROCE égal au coût du capital moyen du marché, et à 20 %. Au-dessus de la première, la société crée de la valeur." },
  ];
  const STATUS = { green: "bon", orange: "à surveiller", red: "alerte", grey: "non évaluable" };
  let onlyAll = false, hot = null, data = [];

  function build() {
    const i = state.meta.years.indexOf(Number($("year").value));
    data = compute(true).map((r) => {
      const { f, s } = Analyse.stepColors(r.c, i);
      return { c: r.c, id: r.c.id, f, s, all: s.every((x) => x === "green") };
    });
    data.forEach((d, k) => (d.k = k));
  }

  // Un panneau : D = [{ id, f, s }], s = verdicts des 4 étapes ; réutilisé par la vue générale des PME.
  // size = { W, H } : dimensions réelles du graphique en pixels (le texte garde sa taille sur tout écran).
  function panel(p, D = data, only = onlyAll, h = hot, size = { W: 460, H: 300 }) {
    const W = size.W, H = size.H, L = 52, R = 12, T = 10, B = 36;
    const tx = (v) => (p.x.log ? Math.log10(v) : v), ty = (v) => (p.y.log ? Math.log10(v) : v);
    const sx = (v) => L + (tx(Math.min(p.x.max, Math.max(p.x.min, v))) - tx(p.x.min)) / (tx(p.x.max) - tx(p.x.min)) * (W - L - R);
    const sy = (v) => H - B - (ty(Math.min(p.y.max, Math.max(p.y.min, v))) - ty(p.y.min)) / (ty(p.y.max) - ty(p.y.min)) * (H - T - B);
    let g = "";
    const ticks = (ax) => (ax.log ? [0.1, 0.3, 1, 3, 10, 30, 100].filter((v) => v >= ax.min && v <= ax.max)
      : (() => {
        const raw = (ax.max - ax.min) / 5, p = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw);
        const out = [];
        for (let v = Math.ceil(ax.min / step) * step; v <= ax.max + 1e-9; v += step) out.push(+v.toFixed(6));
        return out;
      })());
    for (const v of ticks(p.x)) g += `<line class="grid" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${sx(v)}" y="${H - B + 13}" text-anchor="middle">${p.x.fmt(v)}</text>`;
    for (const v of ticks(p.y)) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 4}" y="${sy(v) + 3}" text-anchor="end">${p.y.fmt(v)}</text>`;
    g += `<text class="ax t" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(p.x.label)}</text>`;
    g += `<text class="ax t" transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(p.y.label)}</text>`;
    if (p.zone) g += `<rect class="zone" x="${sx(p.zone.x1)}" y="${sy(p.zone.y2)}" width="${sx(p.zone.x2) - sx(p.zone.x1)}" height="${sy(p.zone.y1) - sy(p.zone.y2)}"/>`;
    for (const gd of p.guides || []) {
      g += gd.axis === "x" ? `<line class="guide" x1="${sx(gd.v)}" x2="${sx(gd.v)}" y1="${T}" y2="${H - B}"/>${gd.label ? `<text class="gl" x="${sx(gd.v) + 3}" y="${T + 10}">${gd.label}</text>` : ""}`
        : `<line class="guide" x1="${L}" x2="${W - R}" y1="${sy(gd.v)}" y2="${sy(gd.v)}"/>${gd.label ? `<text class="gl" x="${W - R - 3}" y="${sy(gd.v) + (gd.above ? -4 : 11)}" text-anchor="end">${gd.label}</text>` : ""}`;
    }
    if (p.iso) for (const r of [Analyse.marketK(), 0.2]) {
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const x = Math.pow(10, -1 + k / 60 * 2), y = r / x;
        if (y <= p.y.max && y >= p.y.min) pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
      }
      if (pts.length > 1) g += `<polyline class="iso" points="${pts.join(" ")}"/><text class="gl" x="${pts[pts.length - 1].split(",")[0] - 4}" y="${+pts[pts.length - 1].split(",")[1] - 4}" text-anchor="end">ROCE ${nf1.format(r * 100)} %</text>`;
    }
    const idx = p.n - 1;
    let marks = "";
    const order = { grey: 0, red: 1, orange: 2, green: 3 };
    const shown = D.filter((d) => ok(d.f[p.x.k]) && ok(d.f[p.y.k]) && (!p.y.log || d.f[p.y.k] > 0) && (!p.x.log || d.f[p.x.k] > 0) && (!only || d.all))
      .sort((a, b) => order[a.s[idx]] - order[b.s[idx]]);
    shown.forEach((d) => {
      const k = d.k ?? D.indexOf(d);
      marks += `<circle class="dp s-${d.s[idx]}${d.id === h ? " hot" : ""}" data-k="${k}" cx="${sx(d.f[p.x.k]).toFixed(1)}" cy="${sy(d.f[p.y.k]).toFixed(1)}" r="${d.id === h ? 7.5 : 4}"/>`;
    });
    const counts = { green: 0, orange: 0, red: 0 };
    shown.forEach((d) => { if (counts[d.s[idx]] !== undefined) counts[d.s[idx]]++; });
    return `<div class="card tdb-panel"><h3 title="${esc(p.note)}"><span class="num">${p.n}</span> ${p.title} <small>${p.sub}</small>
        <span class="cnt"><i class="sw s-green"></i>${counts.green} <i class="sw s-orange"></i>${counts.orange} <i class="sw s-red"></i>${counts.red}</span></h3>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.title)}">${g}${marks}</svg>
      <p class="note pnote">${p.note}</p></div>`;
  }

  // Taille réelle des graphiques, en pixels : les 4 tiennent dans l'écran (2 × 2) sur ordinateur.
  // Taille réelle des graphiques, en pixels, aux proportions d'origine (3 de large pour 2 de haut) :
  // le texte et les points gardent leur taille quel que soit l'écran.
  function fit(box) {
    const w = box.clientWidth || 900;
    const W = Math.round(window.innerWidth <= 900 ? Math.max(280, w - 24) : (w - 12) / 2 - 24);
    return { W, H: Math.round(Math.max(240, Math.min(440, W / 1.55))) };
  }
  const fitH = fit;

  function render() {
    build();
    const good = data.filter((d) => d.all).sort((a, b) => (b.f.roce || 0) - (a.f.roce || 0));
    $("tdbOut").innerHTML = `
      <div class="card tdb-intro"><h3>Le plan en 4 étapes, pour toutes les sociétés</h3>
        <p class="note">Chaque point est une société (filtres du haut appliqués, exercice ${$("year").value}). Sa couleur est le verdict de l'étape, avec les mêmes règles que la synthèse des fiches :
          <span class="cnt"><i class="sw s-green"></i>bon <i class="sw s-orange"></i>à surveiller <i class="sw s-red"></i>alerte</span>. Survoler un point montre la société dans les 4 graphiques.</p>
        <label class="check tdb-toggle"><input type="checkbox" id="tdbAll" ${onlyAll ? "checked" : ""}> N'afficher que les sociétés bonnes dans les 4 étapes (${nf0.format(good.length)} sur ${nf0.format(data.length)})</label>
        <div id="tdbHot" class="tdb-hot">${hotLine()}</div>
      </div>
      <div class="tdb-grid" id="tdbGrid"></div>
      <details class="card tdb-list"><summary><b>Bonnes dans les 4 étapes (${nf0.format(good.length)})</b> <small>— classées par ROCE après IS · ouvrir la liste</small></summary>
        <div class="tablewrap"><table><thead><tr><th class="l">Société</th><th class="l">Secteur</th><th>CA M€</th><th>Croissance</th><th>Marge d'EBE</th><th>BFR</th><th>Dette nette / EBE</th><th>ROCE</th><th>PER</th></tr></thead><tbody>
        ${good.slice(0, 100).map((d) => `<tr data-k="${data.indexOf(d)}"><td class="l">${esc(d.c.n)}<span class="flag">${esc(d.c.c)} · ${esc(d.c.t || "")}</span></td>
          <td class="l">${esc((state.meta.sectors[d.c.s] || "").split(/[,(]/)[0])}</td><td>${ok(d.f.rev) ? nf0.format(d.f.rev * (fx(d.c, Number($("year").value)) || 1)) : "—"}</td>
          <td>${ok(d.f.growth) ? P(d.f.growth) : "—"}</td><td>${ok(d.f.ebitdaMargin) ? P(d.f.ebitdaMargin) : "—"}</td><td>${ok(d.f.bfrDays) ? nf0.format(d.f.bfrDays) + " j" : "—"}</td>
          <td>${ok(d.f.netDebt) && d.f.netDebt <= 0 ? "trésorerie nette" : ok(d.f.ndEbitda) ? X(d.f.ndEbitda) : "—"}</td><td>${ok(d.f.roce) ? P(d.f.roce) : "—"}</td><td>${ok(d.f.per) ? nf1.format(d.f.per) : "—"}</td></tr>`).join("")}
        </tbody></table></div>${good.length > 100 ? `<p class="note">Les 100 premières sur ${good.length}.</p>` : ""}</details>`;
    // Taille mesurée une fois l'encadré affiché : les graphiques remplissent la place qui reste.
    const size = fit($("tdbGrid"));
    $("tdbGrid").innerHTML = PANELS.map((pn) => panel(pn, data, onlyAll, hot, size)).join("");
  }

  function hotLine() {
    const d = data.find((x) => x.c.id === hot);
    if (!d) return `<span class="note">Survoler un point pour suivre une société dans les 4 graphiques.</span>`;
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
        $("tdbHot").innerHTML = hotLine();
      });
    });
    box.addEventListener("click", (e) => {
      const c = e.target.closest("circle.dp, tr[data-k]");
      if (c) openDetail(data[Number(c.dataset.k)].c);
    });
  }

  return { mount, render, panel, fit, fitH, STATUS };
})();
