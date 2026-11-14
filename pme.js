"use strict";
// Onglet PME : carte de France des PME (comptes publics), filtres, classement,
// et fiche d'analyse selon le plan en 4 étapes avec les ratios publiés
// (base « Ratios financiers BCE / INPI » + annuaire des entreprises).
// Dépend de app.js : $, ok, esc, nf0, nf1, money, pct.

const PME = (() => {
  let data = null, rows = [], map = null, layer = null, loaded = false, loading = false;
  const st = { sort: { key: "score", dir: -1 }, shown: 100, focus: null };

  const DEPTS = {"01":"Ain","02":"Aisne","03":"Allier","04":"Alpes-de-Haute-Provence","05":"Hautes-Alpes","06":"Alpes-Maritimes","07":"Ardèche","08":"Ardennes","09":"Ariège","10":"Aube","11":"Aude","12":"Aveyron","13":"Bouches-du-Rhône","14":"Calvados","15":"Cantal","16":"Charente","17":"Charente-Maritime","18":"Cher","19":"Corrèze","2A":"Corse-du-Sud","2B":"Haute-Corse","21":"Côte-d'Or","22":"Côtes-d'Armor","23":"Creuse","24":"Dordogne","25":"Doubs","26":"Drôme","27":"Eure","28":"Eure-et-Loir","29":"Finistère","30":"Gard","31":"Haute-Garonne","32":"Gers","33":"Gironde","34":"Hérault","35":"Ille-et-Vilaine","36":"Indre","37":"Indre-et-Loire","38":"Isère","39":"Jura","40":"Landes","41":"Loir-et-Cher","42":"Loire","43":"Haute-Loire","44":"Loire-Atlantique","45":"Loiret","46":"Lot","47":"Lot-et-Garonne","48":"Lozère","49":"Maine-et-Loire","50":"Manche","51":"Marne","52":"Haute-Marne","53":"Mayenne","54":"Meurthe-et-Moselle","55":"Meuse","56":"Morbihan","57":"Moselle","58":"Nièvre","59":"Nord","60":"Oise","61":"Orne","62":"Pas-de-Calais","63":"Puy-de-Dôme","64":"Pyrénées-Atlantiques","65":"Hautes-Pyrénées","66":"Pyrénées-Orientales","67":"Bas-Rhin","68":"Haut-Rhin","69":"Rhône","70":"Haute-Saône","71":"Saône-et-Loire","72":"Sarthe","73":"Savoie","74":"Haute-Savoie","75":"Paris","76":"Seine-Maritime","77":"Seine-et-Marne","78":"Yvelines","79":"Deux-Sèvres","80":"Somme","81":"Tarn","82":"Tarn-et-Garonne","83":"Var","84":"Vaucluse","85":"Vendée","86":"Vienne","87":"Haute-Vienne","88":"Vosges","89":"Yonne","90":"Territoire de Belfort","91":"Essonne","92":"Hauts-de-Seine","93":"Seine-Saint-Denis","94":"Val-de-Marne","95":"Val-d'Oise","971":"Guadeloupe","972":"Martinique","973":"Guyane","974":"La Réunion","976":"Mayotte"};

  const P1 = (v) => (ok(v) ? nf1.format(v) + " %" : "—");
  const J = (v) => (ok(v) ? nf0.format(v) + " j" : "—");
  const K = (v) => (ok(v) ? (Math.abs(v) >= 1000 ? nf1.format(v / 1000) + " M€" : nf0.format(v) + " k€") : "—");
  const Y = (v) => (ok(v) ? nf1.format(v) + " ans" : "—");

  // ---------- Chargement ----------
  async function load() {
    if (loaded || loading) return;
    loading = true;
    $("pmeInfo").textContent = "Chargement des PME…";
    try {
      const r = await fetch("data/pme.json");
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const c = d.cols, n = c.siren.length;
      const list = new Array(n);
      for (let k = 0; k < n; k++) {
        const o = {};
        for (const key in c) o[key] = c[key][k];
        // Croissance annuelle moyenne du CA sur l'historique disponible.
        const h = o.hist[0], idx = h.map((v, j) => (ok(v) && v > 0 ? j : -1)).filter((j) => j >= 0);
        o.g = idx.length >= 2 ? Math.pow(h[idx[idx.length - 1]] / h[idx[0]], 1 / (idx[idx.length - 1] - idx[0])) - 1 : null;
        o.nm = (o.rn != null && o.ca) ? o.rn / o.ca * 100 : null;
        o.hay = `${o.n} ${o.com} ${o.naf} ${o.siren}`.toLowerCase();
        list[k] = o;
      }
      data = { meta: d.meta, list };
      loaded = true;
      fillSelects();
      bindPme();
      render();
    } catch (e) {
      $("pmeInfo").textContent = "Données PME introuvables : lancer collect/pme.py (voir README).";
    }
    loading = false;
  }

  function fillSelects() {
    $("pDep").innerHTML = `<option value="">Toute la France</option>` +
      Object.entries(DEPTS).map(([k, v]) => `<option value="${k}">${k} — ${esc(v)}</option>`).join("");
    $("pSec").innerHTML = `<option value="">Toutes activités</option>` +
      Object.entries(data.meta.sections).map(([k, v]) => `<option value="${k}">${k} — ${esc(v)}</option>`).join("");
  }

  // ---------- Filtres et score ----------
  function filters() {
    const num = (id) => { const v = $(id).value.trim(); return v === "" ? null : Number(v.replace(",", ".")); };
    return { q: $("pQ").value.trim().toLowerCase(), dep: $("pDep").value, sec: $("pSec").value,
      caMin: num("pCaMin"), caMax: num("pCaMax"), meMin: num("pMeMin"), rembMax: num("pRembMax"), profit: $("pProfit").checked };
  }

  function rankFn(vals, hib) {
    const s = vals.filter(ok).sort((a, b) => a - b);
    return (v) => {
      if (!ok(v) || !s.length) return null;
      let lo = 0, hi = s.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
      const r = s.length > 1 ? lo / (s.length - 1) : 0.5;
      return hib ? r : 1 - r;
    };
  }

  function score(list) {
    const cl = (x, a, b) => (ok(x) ? Math.max(a, Math.min(b, x)) : null);
    const parts = [
      [0.3, (o) => cl(o.me, -50, 60), true],
      [0.2, (o) => cl(o.g, -0.5, 1), true],
      [0.2, (o) => (ok(o.remb) ? (o.remb < 0 ? 0 : Math.min(o.remb, 20)) : null), false],
      [0.15, (o) => cl(o.auto, -100, 100), true],
      [0.15, (o) => cl(o.vet, 0, 100), true],
    ].map(([w, f, h]) => [w, f, rankFn(list.map(f), h)]);
    for (const o of list) {
      let s = 0, w = 0;
      for (const [wt, f, rk] of parts) { const x = rk(f(o)); if (x !== null) { s += wt * x; w += wt; } }
      o.score = w >= 0.5 ? Math.round(s / w * 100) : null;
    }
  }

  function compute() {
    const f = filters();
    const out = [];
    for (const o of data.list) {
      if (f.dep && o.dep !== f.dep) continue;
      if (f.sec && o.sec !== f.sec) continue;
      if (f.q && !o.hay.includes(f.q)) continue;
      const caM = o.ca / 1000;
      if (f.caMin !== null && caM < f.caMin) continue;
      if (f.caMax !== null && caM > f.caMax) continue;
      if (f.meMin !== null && !(ok(o.me) && o.me >= f.meMin)) continue;
      if (f.rembMax !== null && !(ok(o.remb) && o.remb <= f.rembMax)) continue;
      if (f.profit && !(o.rn > 0)) continue;
      out.push(o);
    }
    score(out);
    return out;
  }

  // ---------- Tableau ----------
  const COLS = [
    { key: "n", label: "Société", cls: "l", get: (o) => o.n, fmt: (o) => `${esc(o.n)}<span class="flag">${esc(o.com || "")} (${esc(o.dep || "")})</span>` },
    { key: "naf", label: "NAF", cls: "l hide-sm", get: (o) => o.naf, fmt: (o) => `<span title="${esc(data.meta.sections[o.sec] || "")}">${esc(o.naf || "")}</span>` },
    { key: "score", label: "Score", get: (o) => o.score, fmt: (o) => (ok(o.score) ? `<span class="score">${o.score}</span>` : "—") },
    { key: "ca", label: "CA", get: (o) => o.ca, fmt: (o) => K(o.ca) },
    { key: "g", label: "Crois./an", get: (o) => o.g, fmt: (o) => pct(o.g, true) },
    { key: "me", label: "Marge EBE", get: (o) => o.me, fmt: (o) => P1(o.me) },
    { key: "nm", label: "Marge nette", get: (o) => o.nm, fmt: (o) => P1(o.nm) },
    { key: "remb", label: "Remb. (ans)", get: (o) => o.remb, fmt: (o) => (ok(o.remb) ? nf1.format(o.remb) : "—") },
    { key: "auto", label: "Autonomie fin.", get: (o) => o.auto, fmt: (o) => P1(o.auto) },
    { key: "bfrj", label: "BFR", get: (o) => o.bfrj, fmt: (o) => J(o.bfrj) },
    { key: "eff", label: "Effectif", cls: "hide-sm", get: (o) => o.eff, fmt: (o) => esc(o.eff || "—") },
    { key: "y", label: "Exercice", cls: "hide-sm", get: (o) => o.y, fmt: (o) => o.y },
  ];

  function render() {
    if (!loaded) return;
    rows = compute();
    const { key, dir } = st.sort;
    const col = COLS.find((c) => c.key === key);
    rows.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (!ok(x) && typeof x !== "string") return 1;
      if (!ok(y) && typeof y !== "string") return -1;
      return typeof x === "string" ? dir * x.localeCompare(y, "fr") : dir * (x - y);
    });
    $("pmeInfo").textContent = `${nf0.format(rows.length)} PME sur ${nf0.format(data.list.length)} (CA de ${data.meta.ca_min / 1e6} à ${data.meta.ca_max / 1e6} M€, comptes publics) · données du ${new Date(data.meta.generated).toLocaleDateString("fr-FR")}`;
    $("pThead").innerHTML = COLS.map((c) => `<th data-key="${c.key}" class="${c.cls || ""} ${c.key === key ? "sorted" : ""}">${c.label}${c.key === key ? (dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("");
    $("pTbody").innerHTML = rows.slice(0, st.shown).map((o, k) => `<tr data-k="${k}">${COLS.map((c) => `<td class="${c.cls || ""}">${c.fmt(o)}</td>`).join("")}</tr>`).join("");
    $("pMore").hidden = rows.length <= st.shown;
    drawMap();
  }

  // ---------- Carte ----------
  function drawMap() {
    if (!window.L) { $("pmeMap").innerHTML = '<p class="note">Carte indisponible.</p>'; return; }
    if (!map) {
      map = L.map("pmeMap", { preferCanvas: true, zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 5);
      L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        { maxZoom: 18, attribution: "© IGN – Plan IGN" }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    const css = getComputedStyle(document.documentElement);
    const color = css.getPropertyValue("--bar1").trim() || "#2b6f86";
    const shown = rows.slice(0, 20000);
    const pts = [];
    for (const o of shown) {
      if (!ok(o.lat) || !ok(o.lon)) continue;
      const r = 3 + Math.sqrt(o.ca / 50000) * 7;
      const m = L.circleMarker([o.lat, o.lon], { radius: r, color: "#fff", weight: 1, fillColor: color, fillOpacity: 0.7 });
      m.bindTooltip(`<b>${esc(o.n)}</b><br>${esc(o.com || "")} · ${esc(o.naf || "")}<br>CA ${K(o.ca)} · marge EBE ${P1(o.me)}`);
      m.on("click", () => openPme(o));
      layer.addLayer(m);
      pts.push([o.lat, o.lon]);
    }
    const f = filters();
    if ((f.dep || f.q) && pts.length) map.fitBounds(pts, { maxZoom: 12, padding: [20, 20] });
    else if (!f.dep && !f.q) map.setView([46.6, 2.4], 5);
    setTimeout(() => map.invalidateSize(), 50);
  }

  // ---------- Fiche PME ----------
  function sectionStats(o) {
    // Comparaison avec les PME du même code NAF (au moins 20), sinon de la même section.
    const same = data.list.filter((x) => x.naf === o.naf);
    const pool = same.length >= 20 ? same : data.list.filter((x) => x.sec === o.sec);
    const label = same.length >= 20 ? `du code NAF ${o.naf} (${same.length} PME)` : `de la section ${o.sec} — ${data.meta.sections[o.sec] || ""} (${pool.length} PME)`;
    const med = (k) => {
      const s = pool.map((x) => x[k]).filter(ok).sort((a, b) => a - b);
      return s.length ? s[s.length >> 1] : null;
    };
    const pctl = (k, v) => {
      const s = pool.map((x) => x[k]).filter(ok);
      return ok(v) && s.length ? Math.round(s.filter((x) => x < v).length / s.length * 100) : null;
    };
    return { label, med, pctl };
  }

  function light(s) { return `<i class="light ${s}"></i>`; }
  function kpi(label, value, extra = "") { return `<div class="kpi"><b>${value}</b><span>${label}</span>${extra}</div>`; }
  function bench(ss, k, v, fmt, hib = true) {
    const m = ss.med(k);
    if (!ok(m)) return "";
    const p = ss.pctl(k, v);
    const good = ok(p) ? (hib ? p >= 50 : p <= 50) : null;
    return `<small class="bench">secteur ${fmt(m)}${ok(p) ? ` · <span class="${good ? "pos" : "neg"}">${p}e centile</span>` : ""}</small>`;
  }
  function step(n, title, sub, body) {
    return `<section class="step"><h2 class="step-h"><span class="num">${n}</span>${title}<small>${sub}</small></h2>${body}</section>`;
  }

  function histChart(o) {
    const ys = data.meta.years, [ca, ebe, rn] = o.hist;
    const idx = ys.map((_, j) => j).filter((j) => ok(ca[j]));
    if (idx.length < 2) return "";
    const all = [...idx.map((j) => ca[j]), ...idx.map((j) => ebe[j]).filter(ok), ...idx.map((j) => rn[j]).filter(ok)];
    const max = Math.max(0, ...all), min = Math.min(0, ...all);
    const W = 640, H = 180, pad = 18, gw = (W - 10) / idx.length, bw = Math.min(26, (gw - 12) / 3);
    const y = (v) => pad + (max - v) / (max - min || 1) * (H - 2 * pad);
    let bars = "";
    idx.forEach((j, k) => {
      const x0 = 10 + k * gw + (gw - bw * 3) / 2;
      [[ca[j], "--bar1", "CA"], [ebe[j], "--bar2", "EBE"], [rn[j], "--bar3", "Résultat net"]].forEach(([v, col, lab], s) => {
        if (!ok(v)) return;
        const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
        bars += `<rect x="${x0 + s * bw}" y="${top}" width="${bw - 2}" height="${h}" rx="2" fill="var(${col})"><title>${lab} ${ys[j]} : ${K(v)}</title></rect>`;
      });
      bars += `<text x="${x0 + bw * 1.5}" y="${H - 3}" text-anchor="middle">${ys[j]}</text>`;
    });
    return `<div class="card"><h3>Évolution (k€)</h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="CA, EBE et résultat net par année">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>${bars}</svg>
      <div class="legend"><span><i style="background:var(--bar1)"></i>CA</span><span><i style="background:var(--bar2)"></i>EBE</span><span><i style="background:var(--bar3)"></i>Résultat net</span></div></div>`;
  }

  const params = { mult: 5, lev: 3.5 };
  try { Object.assign(params, JSON.parse(localStorage.getItem("reprise.pmeParams") || "{}")); } catch (e) { /* ignoré */ }

  function openPme(o) {
    const ss = sectionStats(o);
    const caf = ok(o.cafca) ? o.cafca / 100 * o.ca : null;           // k€
    const debt = ok(o.remb) && ok(caf) && caf > 0 ? Math.max(0, o.remb * caf) : null; // dettes financières estimées, k€
    // Verdicts.
    const v1 = !ok(o.me) ? "grey" : o.ebit < 0 || o.me < 0 ? "red" : ok(ss.med("me")) && o.me >= ss.med("me") ? "green" : "orange";
    const v2 = !ok(o.bfrj) && !ok(o.vet) ? "grey" : (ok(o.vet) && o.vet < 30) || (ok(o.bfrj) && ok(ss.med("bfrj")) && o.bfrj > ss.med("bfrj") * 1.5 && o.bfrj > 30) ? "orange" : "green";
    const v3 = !ok(o.remb) ? "grey" : o.remb < 0 ? (o.ebe < 0 ? "red" : "green") : o.remb <= 3 ? "green" : o.remb <= 5 ? "orange" : "red";
    const v4 = !ok(o.nm) ? "grey" : o.nm >= 5 ? "green" : o.nm >= 0 ? "orange" : "red";
    const verdicts = [
      [1, "Marges", v1, `CA ${K(o.ca)}${ok(o.g) ? `, croissance ${pct(o.g, true)} par an` : ""} ; marge d'EBE ${P1(o.me)} (secteur ${P1(ss.med("me"))}).`],
      [2, "Investissements", v2, `État de l'outil ${P1(o.vet)} (immobilisations nettes / brutes) ; BFR ${J(o.bfrj)} de CA.`],
      [3, "Financement", v3, `Capacité de remboursement ${ok(o.remb) ? (o.remb < 0 ? "trésorerie supérieure aux dettes" : Y(o.remb) + " de CAF") : "—"} ; autonomie financière ${P1(o.auto)}.`],
      [4, "Rentabilité", v4, `Marge nette ${P1(o.nm)} ; résultat courant avant impôt ${P1(o.rcai)} du CA.`],
    ];
    const ev = ok(o.ebe) && o.ebe > 0 ? params.mult * o.ebe : null;
    const acq = ok(o.ebe) && o.ebe > 0 ? Math.min(params.lev * o.ebe, (ev || 0) * 0.75) : null;
    const years = ok(acq) && ok(caf) && caf > 0 ? acq / (caf * 0.7) : null;  // ≈ 70 % de la CAF disponible pour la dette
    $("detailBody").innerHTML = `
      <h2>${esc(o.n)}</h2>
      <p class="meta">${esc(o.com || "")} (${esc(o.dep || "")}) · NAF ${esc(o.naf || "")} — ${esc(data.meta.sections[o.sec] || "")} · effectif ${esc(o.eff || "—")} · créée en ${esc(o.cr || "—")} · exercice ${o.y}
        · SIREN ${esc(o.siren)} · <a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${esc(o.siren)}" target="_blank" rel="noopener">fiche officielle</a></p>
      <div class="card synth"><h3>Synthèse ${o.y} <small>— plan d'analyse en 4 étapes</small></h3>
        <div class="synth-grid">${verdicts.map(([n, k, s, t]) => `<div class="synth-row"><span class="num">${n}</span>${light(s)}<div><b>${k}</b><span>${t}</span></div></div>`).join("")}</div>
        <div class="synth-concl">
          <div>${light(v4 === "green" && v1 !== "red" ? "green" : v4 === "red" ? "red" : "orange")}<b>Du point de vue des actionnaires</b> <span>Rentabilité ${v4 === "green" ? "satisfaisante" : v4 === "red" ? "négative" : "faible"} ; la rentabilité des capitaux propres n'est pas publiée dans cette base.</span></div>
          <div>${light(v3)}<b>Du point de vue des prêteurs</b> <span>${v3 === "green" ? "Dette remboursable en moins de 3 ans de CAF." : v3 === "orange" ? "Remboursement en 3 à 5 ans de CAF : à surveiller." : v3 === "red" ? "Endettement lourd au regard de la CAF." : "Non évaluable."} Liquidité ${P1(o.liq)}.</span></div>
        </div>
        <p class="note">Comparaison avec les PME ${esc(ss.label)}. Comptes sociaux déposés au greffe ; ratios calculés par la base publique BCE / INPI.</p></div>
      ${histChart(o)}
      ${step(1, "Les marges", "la création de richesse", `<div class="kpis">
        ${kpi("Chiffre d'affaires", K(o.ca))}
        ${kpi("Croissance annuelle moyenne", pct(o.g, true), bench(ss, "g", o.g, (v) => pct(v)))}
        ${kpi("Marge brute / CA", ok(o.mb) && o.ca ? P1(o.mb / o.ca * 100) : "—")}
        ${kpi("Marge d'EBE", P1(o.me), bench(ss, "me", o.me, P1))}
        ${kpi("Résultat d'exploitation", K(o.ebit))}
        ${kpi("Résultat courant avant impôt / CA", P1(o.rcai), bench(ss, "rcai", o.rcai, P1))}
        ${kpi("Résultat net", K(o.rn))}</div>`)}
      ${step(2, "Les investissements", "outil industriel et BFR", `<div class="kpis">
        ${kpi("État de l'outil (immo. nettes / brutes)", P1(o.vet), `<small class="bench">${!ok(o.vet) ? "" : o.vet > 60 ? "outil récent" : o.vet >= 40 ? "outil à mi-vie" : "outil vieillissant"}</small>${bench(ss, "vet", o.vet, P1)}`)}
        ${kpi("BFR d'exploitation", J(o.bfrj), bench(ss, "bfrj", o.bfrj, J, false))}
        ${kpi("Rotation des stocks", J(o.stj), bench(ss, "stj", o.stj, J, false))}
        ${kpi("Crédit clients (TTC)", J(o.clj), bench(ss, "clj", o.clj, J, false) + (o.clj > 180 ? `<small class="bench neg">valeur atypique : à vérifier dans les comptes (créances hors clients ?)</small>` : ""))}
        ${kpi("Crédit fournisseurs (TTC)", J(o.foj), bench(ss, "foj", o.foj, J))}</div>`)}
      ${step(3, "Le financement", "capacité de remboursement et liquidité", `<div class="kpis">
        ${kpi("Capacité de remboursement", ok(o.remb) ? (o.remb < 0 ? "trésorerie nette" : Y(o.remb)) : "—", `<small class="bench">dettes financières / CAF ; repère ≤ 3 à 4 ans</small>`)}
        ${kpi("Taux d'endettement", P1(o.endet), `<small class="bench">dettes financières / capitaux propres</small>${bench(ss, "endet", o.endet, P1, false)}`)}
        ${kpi("Autonomie financière", P1(o.auto), `<small class="bench">capitaux propres / total du bilan</small>${bench(ss, "auto", o.auto, P1)}`)}
        ${kpi("Charges financières / EBE", P1(o.couv), bench(ss, "couv", o.couv, P1, false))}
        ${kpi("Liquidité", P1(o.liq), `<small class="bench">actif circulant / dettes à court terme</small>`)}
        ${kpi("CAF / CA", P1(o.cafca), bench(ss, "cafca", o.cafca, P1))}</div>`)}
      ${step(4, "La rentabilité", "ce que la base publie", `<div class="kpis">
        ${kpi("Marge nette", P1(o.nm), bench(ss, "nm", o.nm, P1))}
        ${kpi("Résultat courant avant impôt / CA", P1(o.rcai))}</div>
        <p class="note">Les capitaux propres et l'actif économique ne sont pas publiés en montant dans cette base : ROCE et rentabilité des capitaux propres se calculent à partir des comptes complets (fiche officielle).</p>`)}
      ${step("€", "Valorisation et reprise", "multiple d'EBE et montage LBO", `<div class="kpis">
        ${kpi("Multiple VE / EBE", `<input class="param" type="number" step="0.5" min="0" max="20" data-pparam="mult" value="${params.mult}">×`, `<small class="bench">PME françaises : souvent 4 à 7×</small>`)}
        ${kpi("Valeur d'entreprise", K(ev))}
        ${kpi("− dettes financières estimées", K(debt), `<small class="bench">capacité de remboursement × CAF</small>`)}
        ${kpi("= valeur des titres (indicative)", ok(ev) && ok(debt) ? K(ev - debt) : "—")}
        ${kpi("Dette d'acquisition (× EBE)", `<input class="param" type="number" step="0.5" min="0" max="6" data-pparam="lev" value="${params.lev}">×`)}
        ${kpi("Dette levée", K(acq))}
        ${kpi("Apport en fonds propres", ok(ev) && ok(acq) ? K(ev - acq) : "—")}
        ${kpi("Années pour rembourser", `${light(!ok(years) ? "red" : years <= 7 ? "green" : years <= 10 ? "orange" : "red")} ${ok(years) ? nf1.format(years) + " ans" : "impossible"}`, `<small class="bench">avec 70 % de la CAF actuelle</small>`)}</div>
        <p class="note">Ordre de grandeur : la trésorerie, les investissements à venir et la fiscalité de la holding de reprise ne sont pas pris en compte.</p>`)}`;
    $("detailBody").onclick = null;
    $("detailBody").onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.pparam;
      if (!k) return;
      const v = Number(String(e.target.value).replace(",", "."));
      if (Number.isFinite(v) && v > 0) params[k] = v;
      try { localStorage.setItem("reprise.pmeParams", JSON.stringify(params)); } catch (err) { /* ignoré */ }
      const s = $("detail").querySelector(".detail-inner").scrollTop;
      openPme(o);
      $("detail").querySelector(".detail-inner").scrollTop = s;
    };
    if ($("detail").hidden) { $("detail").hidden = false; $("detail").querySelector(".detail-inner").scrollTop = 0; }
  }

  // ---------- Événements ----------
  let bound = false, timer;
  function bindPme() {
    if (bound) return;
    bound = true;
    for (const id of ["pQ", "pDep", "pSec", "pCaMin", "pCaMax", "pMeMin", "pRembMax", "pProfit"]) {
      $(id).addEventListener(id === "pDep" || id === "pSec" || id === "pProfit" ? "change" : "input", () => {
        clearTimeout(timer); timer = setTimeout(() => { st.shown = 100; render(); }, 200);
      });
    }
    $("pThead").onclick = (e) => {
      const th = e.target.closest("th"); if (!th) return;
      const key = th.dataset.key;
      st.sort = st.sort.key === key ? { key, dir: -st.sort.dir } : { key, dir: key === "n" || key === "naf" ? 1 : -1 };
      render();
    };
    $("pTbody").onclick = (e) => { const tr = e.target.closest("tr"); if (tr) openPme(rows[Number(tr.dataset.k)]); };
    $("pMore").onclick = () => { st.shown += 100; render(); };
  }

  return { load, render, show: () => { load(); if (map) setTimeout(() => map.invalidateSize(), 50); } };
})();
