"use strict";
// Onglet « Ratios » (nuages) : une société = un point, pour voir les familles de
// sociétés se dégager. Couleur = pays (France bleu, USA orange), remplissage
// = grand indice (CAC 40, ≈ S&P 500 = point plein ; autres = cercle).
// Dépend de app.js : $, ok, esc, nf0, nf1, state, compute, openDetail, fx.

const Nuages = (() => {
  // Composition du CAC 40 (sociétés dont les comptes sont déposés en France), par code LEI.
  // À mettre à jour lors des révisions trimestrielles de l'indice. Airbus, ArcelorMittal,
  // Eurofins, Stellantis et STMicroelectronics publient hors de France : absents des données.
  const CAC40 = new Set([
    "969500QZC2Q0TK11NV07", "969500MMPQVHK671GT54", "F5WCUMTUM4RKZ1MAIE39", "R0MUWSFPU8MPRO8K5P83",
    "969500MOCLNQFNZN0D63", "969500TPU5T3HA5D1F11", "96950077L0TN7BAROX36", "549300B8P6MUJ1YWTS08",
    "969500TJ5KRTCJQWXH05", "969500KMUQ2B6CBAF162", "96950065LBWY0APQIM86", "LAXUQCHT4FH58LRZDY46",
    "549300M3VH1A3ER1TB49", "969500Y4IJGHJE2MTJ13", "549300VGEJKB7SVUZR78", "529900JI1GG6F7RKVI53",
    "969500XXRPGD7HCAFA90", "IOG4E947OATN0KJYSD45", "549300SOSI58J6VIW052", "969500MCOONR8990S771",
    "52990097YFPX9J0H5D87", "2138004KW8BV57III342", "969500F7JLTX36OUI695", "969500UIC89GT3UL7L24",
    "NFONVGN05Z0FMN5PEC35", "549300E9PC51EN656011", "969500A1YF1XUYYXS284", "O2RNE8IBXP4R0TD8PU41",
    "529900FNDVTQJOVVPZ19", "529900S21EQ1BO4ESM68", "969500SHQITWXSIS7N89", "969500LENY69X51OOT31",
    "213800WFQ334R8UXUG83",
  ]);

  // Couleur = zone (trois teintes validées entre elles), plein = grand indice, cercle = autres.
  const GROUPS = [
    { k: "cac", label: "CAC 40", c: "--fr", fill: true },
    { k: "eu", label: "Europe (autres, dont France et R.-U.)", c: "--fr", fill: false },
    { k: "sp", label: "≈ S&P 500 (500 plus grosses capitalisations US)", c: "--us", fill: true },
    { k: "us", label: "Autres sociétés américaines", c: "--us", fill: false },
    { k: "as", label: "Asie, Amériques et reste du monde", c: "--as", fill: true },
  ];

  const symlog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v));
  const fmtM = (v) => (Math.abs(v) >= 1000 ? nf0.format(v / 1000) + " Md" : nf0.format(v) + " M");

  // Axes : type « log » (> 0), « symlog » (accepte les négatifs), « lin ».
  const PRESETS = {
    taille: { name: "CA × résultat net", desc: "Les géants en haut à droite, les sociétés en perte sous la ligne zéro. Les diagonales relient les points de même marge nette.",
      x: { key: "rev", label: "Chiffre d'affaires (M€, échelle log)", type: "log", min: 10, max: 1e6, fmt: fmtM },
      y: { key: "ni", label: "Résultat net (M€, échelle log symétrique)", type: "symlog", min: -1e4, max: 2e5, fmt: fmtM },
      iso: { kind: "ratio", values: [0.05, 0.1, 0.2], label: (r) => `marge nette ${nf0.format(r * 100)} %` } },
    valo: { name: "Résultat net × capitalisation", desc: "Les diagonales relient les points de même PER : au-dessus de la ligne 40, le marché paie cher les bénéfices actuels.",
      x: { key: "ni", label: "Résultat net (M€, échelle log)", type: "log", min: 1, max: 2e5, fmt: fmtM },
      y: { key: "mcapE", label: "Capitalisation (M€, échelle log)", type: "log", min: 10, max: 5e6, fmt: fmtM },
      iso: { kind: "ratio", values: [10, 20, 40], label: (r) => `PER ${r}` } },
    qualite: { name: "Rentabilité × prix", desc: "En bas à droite : rentables et peu chères. En haut à gauche : chères et peu rentables.",
      x: { key: "roce", label: "ROCE après IS", type: "lin", min: -0.2, max: 0.6, fmt: (v) => nf0.format(v * 100) + " %" },
      y: { key: "evEbitda", label: "VE / EBE (échelle log)", type: "log", min: 1, max: 60, fmt: (v) => nf1.format(v) + "×" } },
    croissance: { name: "Croissance × marge", desc: "En haut à droite : croissance rapide et forte marge, souvent les sociétés les mieux valorisées.",
      x: { key: "growth", label: "Croissance annuelle du CA sur 3 ans", type: "lin", min: -0.2, max: 0.6, fmt: (v) => nf0.format(v * 100) + " %" },
      y: { key: "ebitdaMargin", label: "Marge d'EBE", type: "lin", min: -0.2, max: 0.7, fmt: (v) => nf0.format(v * 100) + " %" } },
    dette: { name: "Endettement × rentabilité", desc: "À gauche du zéro : trésorerie nette. À droite de 3× : endettement lourd, à surveiller si la rentabilité est faible.",
      x: { key: "ndEbitda", label: "Dette nette / EBE", type: "lin", min: -4, max: 8, fmt: (v) => nf1.format(v) + "×" },
      y: { key: "roce", label: "ROCE après IS", type: "lin", min: -0.2, max: 0.6, fmt: (v) => nf0.format(v * 100) + " %" } },
    rotation: { name: "Marge × rotation (ROCE)", desc: "ROCE après IS = marge × rotation. À gauche, les métiers capitalistiques (énergie, télécoms) ont besoin de fortes marges ; à droite, la distribution tourne vite son actif avec des marges faibles. Les courbes relient les points de même ROCE.",
      x: { key: "rotation", label: "Rotation de l'actif économique (CA / actif économique, échelle log)", type: "log", min: 0.1, max: 10, fmt: (v) => nf1.format(v).replace(",0", "") + "×" },
      y: { key: "margin", label: "Marge d'exploitation après impôt", type: "lin", min: -0.1, max: 0.4, fmt: (v) => nf0.format(v * 100) + " %" },
      iso: { kind: "inverse", values: [0.05, 0.1, 0.15, 0.2], label: (r) => `ROCE ${nf0.format(r * 100)} %` } },
  };

  const st = { preset: "taille", hidden: new Set(["us"]), focus: "" };   // focus : secteur mis en avant   // les 3 000 « autres US » masquées par défaut
  try { Object.assign(st, { preset: localStorage.getItem("reprise.nuage") || "taille" }); } catch (e) { /* ignoré */ }

  function points() {
    const i = state.meta.years.indexOf(Number($("year").value));
    const y = state.meta.years[i];
    const rows = compute(true);
    // ≈ S&P 500 : les 500 plus grosses capitalisations américaines disponibles.
    const us = rows.filter((r) => (r.c.z || r.c.c) === "US").map((r) => ({ r, m: Analyse.figures(r.c, i).mcap })).filter((x) => ok(x.m))
      .sort((a, b) => b.m - a.m).slice(0, 500);
    const sp = new Set(us.map((x) => x.r.c.id));
    return rows.map((r) => {
      const f = Analyse.figures(r.c, i);
      const rate = fx(r.c, y) || 1;
      const z = r.c.z || r.c.c;
      const g = z === "US" ? (sp.has(r.c.id) ? "sp" : "us") : z === "FR" && CAC40.has(r.c.id.slice(3)) ? "cac"
        : ["FR", "EU", "GB"].includes(z) ? "eu" : "as";
      return { c: r.c, g, rev: r.m.rev, ni: r.m.ni, mcapE: ok(f.mcap) ? f.mcap * rate : null,
        roce: f.roce, evEbitda: f.evEbitda, growth: f.growth, ebitdaMargin: f.ebitdaMargin, ndEbitda: f.ndEbitda,
        rotation: ok(f.rotation) && f.ae > 0 ? f.rotation : null, margin: f.margin };
    });
  }

  function scale(ax, a, b) {
    const t = ax.type === "log" ? Math.log10 : ax.type === "symlog" ? symlog : (v) => v;
    const t0 = t(ax.min), t1 = t(ax.max);
    return (v) => a + (t(Math.min(ax.max, Math.max(ax.min, v))) - t0) / (t1 - t0) * (b - a);
  }
  function ticks(ax) {
    if (ax.type === "lin") {
      const step = (ax.max - ax.min) / 8, p = Math.pow(10, Math.floor(Math.log10(step))), s = [1, 2, 5, 10].map((m) => m * p).find((m) => m >= step);
      const out = []; for (let v = Math.ceil(ax.min / s) * s; v <= ax.max + 1e-9; v += s) out.push(+v.toFixed(6)); return out;
    }
    const out = [];
    for (let e = 0; e <= 7; e++) {
      const v = Math.pow(10, e);
      if (v >= ax.min && v <= ax.max) out.push(v);
      if (ax.type === "symlog" && -v >= ax.min) out.push(-v);
    }
    if (ax.type === "symlog") out.push(0);
    if (ax.type === "log" && ax.max <= 100) [2, 5, 20, 50].forEach((v) => { if (v >= ax.min && v <= ax.max) out.push(v); });
    return out.sort((p, q) => p - q);
  }

  function render() {
    const pr = PRESETS[st.preset];
    const pts = points().filter((p) => ok(p[pr.x.key]) && ok(p[pr.y.key]) &&
      (pr.x.type !== "log" || p[pr.x.key] > 0) && (pr.y.type !== "log" || p[pr.y.key] > 0));
    const W = 820, H = 520, L = 64, R = 18, T = 14, B = 46;
    const sx = scale(pr.x, L, W - R), sy = scale(pr.y, H - B, T);
    let g = "";
    for (const v of ticks(pr.x)) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${sx(v)}" y="${H - B + 16}" text-anchor="middle">${pr.x.fmt(v)}</text>`;
    for (const v of ticks(pr.y)) g += `<line class="grid${v === 0 ? " zero" : ""}" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${pr.y.fmt(v)}</text>`;
    g += `<text class="ax t" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(pr.x.label)}</text>`;
    g += `<text class="ax t" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(pr.y.label)}</text>`;
    // Lignes de rapport constant (y = r × x) sur axes logarithmiques.
    if (pr.iso) for (const r of pr.iso.values) {
      const seg = [];
      for (let k = 0; k <= 80; k++) {
        const x = Math.pow(10, Math.log10(pr.x.min) + k / 80 * (Math.log10(pr.x.max) - Math.log10(pr.x.min)));
        const y = pr.iso.kind === "inverse" ? r / x : r * x;
        if (y >= Math.max(pr.y.min, pr.y.type === "symlog" ? 1 : pr.y.min) && y <= pr.y.max) seg.push([sx(x), sy(y)]);
      }
      if (seg.length > 1) {
        g += `<polyline class="iso" points="${seg.map((s) => s.join(",")).join(" ")}"/>`;
        const lp = seg[Math.floor(seg.length * 0.3)];
        g += `<text class="iso-l" x="${lp[0] + 4}" y="${lp[1] - 4}">${esc(pr.iso.label(r))}</text>`;
      }
    }
    // Points : d'abord les « autres » (cercles), puis les grands indices par-dessus.
    const order = { us: 0, eu: 1, as: 2, sp: 3, cac: 4 };
    const vis = pts.filter((p) => !st.hidden.has(p.g)).sort((a, b) =>
      ((st.focus ? (a.c.s === st.focus) - (b.c.s === st.focus) : 0)) || order[a.g] - order[b.g]);
    const size = (p) => (ok(p.mcapE) && p.mcapE > 0 ? 2.5 + Math.min(9, Math.sqrt(p.mcapE / 2000)) : 3);
    let marks = "";
    state.nuageTips = [];
    vis.forEach((p, k) => {
      const gr = GROUPS.find((x) => x.k === p.g);
      state.nuageTips.push(p);
      const x = sx(p[pr.x.key]), y = sy(p[pr.y.key]), r = size(p);
      const dim = st.focus && p.c.s !== st.focus;
      marks += `<circle class="pt ${dim ? "dim" : `${gr.fill ? "full" : "ring"} g-${p.g}`}" data-k="${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
    });
    // Étiquettes directes : les plus grosses capitalisations visibles des grands indices (sans chevauchement).
    const placed = [];
    const big = vis.filter((p) => (st.focus ? p.c.s === st.focus : p.g === "cac" || p.g === "sp" || p.g === "as")).sort((a, b) => (b.mcapE || 0) - (a.mcapE || 0)).slice(0, 14);
    for (const p of big) {
      const x = sx(p[pr.x.key]) + size(p) + 3, y = sy(p[pr.y.key]) + 4, name = p.c.t || p.c.n.split(" ")[0];
      const box = [x, y - 11, x + name.length * 6.5, y + 2];
      if (box[2] > W - R || placed.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
      placed.push(box);
      marks += `<text class="lbl" x="${x}" y="${y}">${esc(name)}</text>`;
    }
    const counts = Object.fromEntries(GROUPS.map((gr) => [gr.k, pts.filter((p) => p.g === gr.k).length]));
    const excluded = points().length - pts.length;
    $("nuageOut").innerHTML = `
      <div class="card">
        <div class="chips">${Object.entries(PRESETS).map(([k, v]) => `<button class="chip" data-preset="${k}" aria-pressed="${k === st.preset}">${v.name}</button>`).join("")}</div>
        <p class="note">${esc(pr.desc)}</p>
        <div class="chips sector-chips"><span class="note">Mettre en avant un secteur :</span>
          <button class="chip" data-focus="" aria-pressed="${!st.focus}">aucun</button>
          ${Object.entries(state.meta.sectors).filter(([k]) => k !== "autre").map(([k, v]) => `<button class="chip" data-focus="${k}" aria-pressed="${st.focus === k}">${esc(v.split(/[,(&]/)[0].trim())}</button>`).join("")}</div>
        <div class="legend nlegend">${GROUPS.map((gr) => `<button class="lg" data-group="${gr.k}" aria-pressed="${!st.hidden.has(gr.k)}">
          <svg width="14" height="14"><circle cx="7" cy="7" r="5" class="${gr.fill ? "full" : "ring"} g-${gr.k}"/></svg>${esc(gr.label)} (${nf0.format(counts[gr.k])})</button>`).join("")}</div>
        <div class="scatter-wrap"><svg id="nuage" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(pr.name)}">${g}${marks}</svg><div id="ntip" class="tip" hidden></div></div>
        <p class="note">Exercice ${$("year").value}, filtres du haut appliqués. Taille du point : capitalisation boursière. Valeurs hors cadre ramenées au bord${excluded ? ` ; ${nf0.format(excluded)} sociétés sans donnée (ou négative sur un axe logarithmique) non affichées` : ""}.
          Cliquer la légende pour masquer un groupe, un point pour ouvrir la fiche. CAC 40 : composition récente des sociétés publiant en France ; ≈ S&P 500 : approximation par la capitalisation.</p>
      </div>`;
  }

  let bound = false;
  function mount() {
    render();
    if (bound) return;
    bound = true;
    const box = $("nuageOut");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]");
      if (b) { st.preset = b.dataset.preset; try { localStorage.setItem("reprise.nuage", st.preset); } catch (er) { /* ignoré */ } render(); return; }
      const fc = e.target.closest("[data-focus]");
      if (fc) { st.focus = fc.dataset.focus; render(); return; }
      const lg = e.target.closest("[data-group]");
      if (lg) { const k = lg.dataset.group; if (st.hidden.has(k)) st.hidden.delete(k); else st.hidden.add(k); render(); return; }
      const pt = e.target.closest("circle.pt");
      if (pt) openDetail(state.nuageTips[Number(pt.dataset.k)].c);
    });
    box.addEventListener("pointermove", (e) => {
      const tip = $("ntip"), pt = e.target.closest && e.target.closest("circle.pt");
      if (!tip) return;
      if (!pt) { tip.hidden = true; return; }
      const p = state.nuageTips[Number(pt.dataset.k)], pr = PRESETS[st.preset];
      tip.innerHTML = `<b>${esc(p.c.n)}</b> ${esc(p.c.t || "")}<br>${esc(GROUPS.find((x) => x.k === p.g).label)}<br>${esc(pr.x.label.split(" (")[0])} : ${pr.x.fmt(p[pr.x.key])}<br>${esc(pr.y.label.split(" (")[0])} : ${pr.y.fmt(p[pr.y.key])}${ok(p.mcapE) ? `<br>Capitalisation : ${fmtM(p.mcapE)} €` : ""}`;
      const bx = tip.parentElement.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX - bx.left + 12, bx.width - tip.offsetWidth - 4) + "px";
      tip.style.top = Math.max(0, e.clientY - bx.top - tip.offsetHeight - 10) + "px";
    });
    box.addEventListener("pointerleave", () => { const t = $("ntip"); if (t) t.hidden = true; });
  }

  return { mount, render };
})();
