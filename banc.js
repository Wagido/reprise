"use strict";
// Onglet « Banc d'essai » : l'analyse de l'outil (méthode Vernimmen) confrontée au consensus des analystes
// publié par les grands sites de Bourse, pour les valeurs du CAC 40. Les chiffres de l'outil sont recalculés
// en direct ; le consensus vient de consensus.json (relevé à la main, daté et sourcé).
// Dépend de app.js ($, ok, esc, nf0, nf1, state, fx, openDetail) et d'analyse.js.

const Banc = (() => {
  let cons = null, loading = false, rows = [];
  const P = (v, d = 1) => (ok(v) ? (v * 100).toFixed(d).replace(".", ",") + " %" : "—");
  const X = (v) => (ok(v) ? nf1.format(v) + "×" : "—");
  const N = (v) => (ok(v) ? nf1.format(v) : "—");
  const NS = "http://www.w3.org/2000/svg";
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function el(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }

  async function load() {
    if (cons || loading) return;
    loading = true;
    try {
      const r = await fetch("consensus.json", { cache: "no-cache" });
      cons = await r.json();
    } catch (e) { cons = { companies: [], error: true }; }
    loading = false;
    render();
  }

  // Une ligne par valeur du CAC 40 : chiffres de l'outil (dernier exercice publié) + consensus.
  function build() {
    const yrs = state.meta.years;
    const byLei = new Map();
    for (const c of state.companies) {
      const lei = c.id.split("-").slice(1).join("-");
      if (!byLei.has(lei) || c.c === "FR") byLei.set(lei, c);
    }
    return cons.companies.map((k) => {
      const c = byLei.get(k.lei);
      const r = { k, c, n: k.n };
      if (!c) return r;
      let j = yrs.length - 1;
      while (j > 0 && !(c.v.revenue && ok(c.v.revenue[j]))) j--;
      const f = Analyse.figures(c, j);
      const fin = c.s === "finance";
      Object.assign(r, {
        y: yrs[j], fin, f,
        cap: ok(f.mcap) ? f.mcap * (fx(c, yrs[j]) || 1) / 1000 : null,
        // Banques et assurances : rentabilité des capitaux propres face au coût des fonds propres.
        ret: fin ? f.roe : f.roce, cost: fin ? f.kE : f.k,
        prem: !fin && ok(f.vae) && ok(f.vaeTh) && f.vaeTh > 0 ? f.vae / f.vaeTh : null,
      });
      return r;
    });
  }

  function tipOn(box, svg) {
    const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; box.appendChild(tip);
    svg.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tip.hidden = true; return; }
      tip.innerHTML = t.getAttribute("data-tip"); tip.hidden = false;
      const b = box.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(e.clientX - b.left + 12, b.width - tip.offsetWidth - 4)) + "px";
      tip.style.top = Math.max(0, e.clientY - b.top - tip.offsetHeight - 12) + "px";
    });
    svg.addEventListener("pointerleave", () => (tip.hidden = true));
  }

  // 1. Rentabilité face au coût du capital.
  function chart1(box) {
    const rs = rows.filter((r) => ok(r.cost)).sort((a, b) => ((ok(b.ret) ? b.ret : -1) - b.cost) - ((ok(a.ret) ? a.ret : -1) - a.cost));
    const W = 900, L = 170, R = 70, T = 14, row = 24, H = T + rs.length * row + 30, MAX = 0.25;
    const sx = (v) => L + Math.max(0, Math.min(MAX, v)) / MAX * (W - L - R);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Rentabilité et coût du capital par société" });
    for (let v = 0; v <= MAX + 1e-9; v += 0.05) {
      svg.appendChild(el("line", { class: "grid", x1: sx(v), x2: sx(v), y1: T - 6, y2: H - 26 }));
      svg.appendChild(el("text", { class: "ax", x: sx(v), y: H - 8, "text-anchor": "middle" }, P(v, 0)));
    }
    rs.forEach((r, i) => {
      const y = T + i * row + row / 2;
      svg.appendChild(el("text", { class: "nm", x: L - 10, y: y + 4, "text-anchor": "end", "data-open": r.k.lei }, r.n + (r.fin ? " (ROE)" : "")));
      if (ok(r.ret)) svg.appendChild(el("line", { x1: sx(r.cost), x2: sx(r.ret), y1: y, y2: y, stroke: css(r.ret >= r.cost ? "--good" : "--bad"), "stroke-width": 2, "stroke-opacity": 0.55 }));
      svg.appendChild(el("rect", { x: sx(r.cost) - 1.5, y: y - 8, width: 3, height: 16, rx: 1, fill: css("--muted") }));
      if (ok(r.k.roce_pub)) svg.appendChild(el("rect", { x: sx(r.k.roce_pub) - 5, y: y - 5, width: 10, height: 10, rx: 1.5, fill: css("--us"), stroke: css("--panel"), "stroke-width": 2, transform: `rotate(45 ${sx(r.k.roce_pub)} ${y})` }));
      if (ok(r.ret)) {
        svg.appendChild(el("circle", { cx: sx(r.ret), cy: y, r: 6, fill: css("--fr"), stroke: css("--panel"), "stroke-width": 2 }));
        if (r.ret > MAX) svg.appendChild(el("text", { class: "ax", x: sx(MAX) + 10, y: y + 4 }, P(r.ret, 0) + " →"));
      } else svg.appendChild(el("text", { class: "ax", x: sx(r.cost) + 10, y: y + 4 }, "non calculé"));
      const lab = r.fin ? ["ROE", "Coût des fonds propres"] : ["ROCE courant après IS", "Coût du capital (CMPC)"];
      svg.appendChild(el("rect", { x: 0, y: y - row / 2, width: W, height: row, fill: "transparent", "data-open": r.k.lei,
        "data-tip": `<b>${esc(r.n)}</b> · exercice ${r.y}<br>${lab[0]} ${P(r.ret)}<br>${lab[1]} ${P(r.cost)}${ok(r.k.roce_pub) ? `<br>ROCE publié par la société ${P(r.k.roce_pub)}` : ""}<br><i>Cliquer pour ouvrir la fiche</i>` }));
    });
    box.innerHTML = ""; box.appendChild(svg); tipOn(box, svg);
  }

  // 2. Prime payée par le marché face au potentiel annoncé par les analystes.
  function chart2(box) {
    const pts = rows.filter((r) => ok(r.prem) && ok(r.k.up));
    const W = 900, H = 420, L = 56, R = 24, T = 16, B = 46;
    const X0 = 0.6, X1 = Math.max(4, ...pts.map((p) => p.prem * 1.1)), Y0 = Math.min(-0.1, ...pts.map((p) => p.k.up - 0.05)), Y1 = Math.max(0.5, ...pts.map((p) => p.k.up + 0.05));
    const sx = (v) => L + (Math.log(Math.max(X0, Math.min(X1, v))) - Math.log(X0)) / (Math.log(X1) - Math.log(X0)) * (W - L - R);
    const sy = (v) => T + (Y1 - v) / (Y1 - Y0) * (H - T - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Prime payée par le marché et potentiel des analystes" });
    for (const v of [1, 1.5, 2, 3, 4, 6].filter((v) => v <= X1)) {
      svg.appendChild(el("line", { class: "grid", x1: sx(v), x2: sx(v), y1: T, y2: H - B }));
      svg.appendChild(el("text", { class: "ax", x: sx(v), y: H - B + 18, "text-anchor": "middle" }, X(v)));
    }
    for (let v = Math.ceil(Y0 * 10) / 10; v <= Y1 + 1e-9; v += 0.1) {
      svg.appendChild(el("line", { class: Math.abs(v) < 1e-9 ? "zero" : "grid", x1: L, x2: W - R, y1: sy(v), y2: sy(v) }));
      svg.appendChild(el("text", { class: "ax", x: L - 8, y: sy(v) + 4, "text-anchor": "end" }, (v > 0 ? "+" : "") + Math.round(v * 100) + " %"));
    }
    svg.appendChild(el("line", { class: "ref", x1: sx(1), x2: sx(1), y1: T, y2: H - B }));
    svg.appendChild(el("text", { class: "ax", x: sx(1) + 6, y: T + 12 }, "le cours ne paie que la rentabilité actuelle"));
    svg.appendChild(el("text", { class: "ax", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle" }, "Prime payée par le marché : (VE / capitaux employés) ÷ (ROCE / CMPC), échelle log"));
    svg.appendChild(el("text", { class: "ax", x: 14, y: (T + H - B) / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${(T + H - B) / 2})` }, "Potentiel selon les analystes"));
    const placed = [];
    pts.forEach((r) => {
      const x = sx(r.prem), y = sy(r.k.up);
      svg.appendChild(el("circle", { cx: x, cy: y, r: 7, fill: css("--fr"), stroke: css("--panel"), "stroke-width": 2, "data-open": r.k.lei,
        "data-tip": `<b>${esc(r.n)}</b><br>Prime payée ${X(r.prem)} (VE / capitaux employés ${X(r.f.vae)}, justifié sans croissance ${X(r.f.vaeTh)})<br>Potentiel analystes ${P(r.k.up, 0)} · ${esc(r.k.src)}, ${esc(r.k.date)}` }));
      let ly = y + 4; const lx = x + 11;
      for (let q = 0; q < 6 && placed.some((p) => Math.abs(p[1] - ly) < 13 && Math.abs(p[0] - lx) < 120); q++) ly += 13;
      placed.push([lx, ly]);
      svg.appendChild(el("text", { class: "nm", x: lx, y: ly }, r.n));
    });
    box.innerHTML = ""; box.appendChild(svg); tipOn(box, svg);
  }

  // 3. PER de l'outil (exercice publié, cours actuel) face au PER 2026 attendu.
  function chart3(box) {
    const rs = rows.filter((r) => ok(r.f && r.f.per) && ok(r.k.per26)).sort((a, b) => b.f.per - a.f.per);
    const W = 900, L = 170, R = 40, T = 14, row = 24, H = T + rs.length * row + 30, MAX = Math.min(60, Math.max(30, ...rs.map((r) => Math.max(r.f.per, r.k.per26) + 2)));
    const sx = (v) => L + Math.min(MAX, v) / MAX * (W - L - R);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "PER calculé par l'outil et PER 2026 attendu" });
    for (let v = 0; v <= MAX; v += 5) {
      svg.appendChild(el("line", { class: "grid", x1: sx(v), x2: sx(v), y1: T - 6, y2: H - 26 }));
      svg.appendChild(el("text", { class: "ax", x: sx(v), y: H - 8, "text-anchor": "middle" }, v));
    }
    rs.forEach((r, i) => {
      const y = T + i * row + row / 2;
      svg.appendChild(el("text", { class: "nm", x: L - 10, y: y + 4, "text-anchor": "end", "data-open": r.k.lei }, r.n));
      svg.appendChild(el("line", { x1: sx(r.f.per), x2: sx(r.k.per26), y1: y, y2: y, stroke: css("--muted"), "stroke-width": 2, "stroke-opacity": 0.5 }));
      svg.appendChild(el("circle", { cx: sx(r.k.per26), cy: y, r: 6, fill: css("--us"), stroke: css("--panel"), "stroke-width": 2 }));
      svg.appendChild(el("circle", { cx: sx(r.f.per), cy: y, r: 6, fill: css("--fr"), stroke: css("--panel"), "stroke-width": 2 }));
      svg.appendChild(el("rect", { x: 0, y: y - row / 2, width: W, height: row, fill: "transparent", "data-open": r.k.lei,
        "data-tip": `<b>${esc(r.n)}</b><br>PER de l'outil ${N(r.f.per)} (exercice ${r.y})<br>PER 2026 attendu ${N(r.k.per26)} · ${esc(r.k.src)}, ${esc(r.k.date)}` }));
    });
    box.innerHTML = ""; box.appendChild(svg); tipOn(box, svg);
  }

  // Constats calculés à partir des données du moment.
  function findings() {
    const nowY = new Date().getFullYear();
    const meas = rows.filter((r) => ok(r.ret) && ok(r.cost));
    const creat = meas.filter((r) => r.ret >= r.cost), destr = meas.filter((r) => r.ret < r.cost);
    const prem = rows.filter((r) => ok(r.prem));
    const per = rows.filter((r) => ok(r.f && r.f.per) && ok(r.k.per26));
    const lower = per.filter((r) => r.k.per26 < r.f.per);
    const stale = rows.filter((r) => r.c && nowY - r.y >= 2).map((r) => r.n);
    const noPx = rows.filter((r) => r.c && !ok(r.f.mcap)).map((r) => r.n);
    const noAcc = rows.filter((r) => !r.c).map((r) => r.n);
    const tot = rows.find((r) => ok(r.k.roce_pub));
    const li = (cls, html) => `<li><i class="dot ${cls}"></i><div>${html}</div></li>`;
    return `<ul class="banc-find">
      ${li("good", `<b>Crée-t-elle de la valeur ?</b> ${creat.length} valeurs sur ${meas.length} ont une rentabilité supérieure à leur coût du capital.${destr.length ? ` En dessous : ${destr.map((r) => esc(r.n)).join(", ")}.` : ""}${tot && ok(tot.ret) ? ` Seule ${esc(tot.n)} publie sa propre rentabilité : ${P(tot.k.roce_pub)} contre ${P(tot.ret)} pour l'outil (écart : effet stocks pétrolier et ajustements propres au groupe).` : ""}`)}
      ${li("warn", `<b>Le marché la paie-t-il déjà ?</b> ${prem.filter((r) => r.prem > 1).length} valeurs sur ${prem.length} cotent au-dessus de ce que justifie leur rentabilité actuelle : le cours intègre de la croissance. Le potentiel des analystes est une prévision à 12 mois et ne mesure pas la même chose ; quand les deux divergent fortement, c'est là qu'il faut creuser.`)}
      ${li("warn", `<b>PER.</b> Pour ${lower.length} valeurs sur ${per.length}, le PER attendu pour 2026 est plus bas que celui de l'outil : les analystes prévoient des bénéfices en hausse.`)}
      ${li("bad", `<b>Limites de l'outil à ce jour.</b> ${stale.length ? `Comptes de plus d'un an : ${stale.map(esc).join(", ")}. ` : ""}${noPx.length ? `Pas encore de cours : ${noPx.map(esc).join(", ")}. ` : ""}${noAcc.length ? `Comptes absents de la base ESEF : ${noAcc.map(esc).join(", ")}.` : ""}`)}
    </ul>`;
  }

  function table() {
    const nowY = new Date().getFullYear();
    const sg = (v) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")} pts</span>` : "—");
    return `<div class="tablewrap"><table class="banc-tbl"><thead><tr><th class="l">Société</th><th>Exercice</th><th>Capitalisation (Md€)</th>
      <th class="grp">Rentabilité</th><th>Coût du capital</th><th>Écart</th><th>Dette nette / EBE</th>
      <th class="grp">VE / cap. employés</th><th>Justifié sans croissance</th><th>PER outil</th>
      <th class="grp">PER 2026 attendu</th><th>Potentiel analystes</th><th class="l">Source, date</th></tr></thead><tbody>
      ${rows.slice().sort((a, b) => (b.cap || 0) - (a.cap || 0)).map((r) => `<tr data-open="${r.k.lei}">
        <td class="l">${esc(r.n)}${r.fin ? ' <span class="flag">ROE</span>' : ""}</td>
        <td class="${r.c && nowY - r.y >= 2 ? "stale" : ""}">${r.c ? r.y : '<span class="na">—</span>'}</td>
        <td>${ok(r.cap) ? N(r.cap) : `<span class="na">${r.c ? "pas de cours" : "pas de comptes"}</span>`}</td>
        <td class="grp">${P(r.ret)}</td><td>${P(r.cost)}</td><td>${ok(r.ret) && ok(r.cost) ? sg(r.ret - r.cost) : "—"}</td><td>${r.f ? X(r.f.ndEbitda) : "—"}</td>
        <td class="grp">${r.f ? X(r.f.vae) : "—"}</td><td>${r.f ? X(r.f.vaeTh) : "—"}</td><td>${r.f ? N(r.f.per) : "—"}</td>
        <td class="grp">${N(r.k.per26)}</td><td>${ok(r.k.up) ? (r.k.up >= 0 ? "+" : "") + Math.round(r.k.up * 100) + " %" : "—"}</td>
        <td class="l"><a href="${esc(r.k.url)}" target="_blank" rel="noopener">${esc(r.k.src)}</a>, ${esc(r.k.date)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function render() {
    const out = $("bancOut");
    if (!out) return;
    if (!cons) { out.innerHTML = `<p class="count">Chargement du consensus…</p>`; load(); return; }
    if (cons.error) { out.innerHTML = `<p class="count">Consensus introuvable (consensus.json).</p>`; return; }
    rows = build();
    out.innerHTML = `
      <div class="card banc-intro">
        <h3>L'analyse de l'outil confrontée au consensus des analystes <small>— ${esc(cons.universe)}, consensus relevé le ${new Date(cons.updated).toLocaleDateString("fr-FR")}</small></h3>
        <p class="note">L'outil répond aux deux questions du cours (méthode Vernimmen) à partir des comptes publiés : l'entreprise crée-t-elle de la valeur, et le marché la paie-t-il déjà ? Les grands sites de Bourse publient l'avis des analystes : bénéfice attendu et objectif de cours. Les confronter montre où les deux lectures se rejoignent et où elles divergent. Cliquer une société pour ouvrir sa fiche.</p>
      </div>
      <div class="banc-grid">
        <div class="card"><h3><span class="part-n">1</span> Crée-t-elle de la valeur ?</h3>
          <p class="note">Rentabilité après impôt (ROCE courant ; ROE pour les banques et assurances) face au coût du capital (taux d'État à 10 ans + bêta × prime de risque du pays). À droite du trait gris : création de valeur. Les sites ne publient pas ce chiffre ; quand la société publie le sien, il apparaît en losange.</p>
          <div class="banc-legend"><span><i class="sw2" style="background:var(--fr)"></i>Calcul de l'outil</span><span><i class="sw2 tick"></i>Coût du capital</span><span><i class="sw2 dia"></i>Chiffre publié par la société</span></div>
          <div class="banc-chart" id="bc1"></div></div>
        <div class="card"><h3><span class="part-n">2</span> Le marché la paie-t-il déjà ?</h3>
          <p class="note">Horizontalement : ce que le cours paie au-delà de la valeur justifiée sans croissance. À 1×, il ne paie que la rentabilité actuelle ; au-delà, de la croissance future. Verticalement : le potentiel vu par les analystes (objectif de cours / cours, à la date de la source). Sociétés qui ont un cours dans l'outil.</p>
          <div class="banc-chart" id="bc2"></div></div>
        <div class="card"><h3><span class="part-n">3</span> PER : publié contre attendu</h3>
          <p class="note">L'outil calcule le PER sur le dernier exercice publié et le cours actuel ; les sites donnent le PER attendu pour 2026. Un écart fort signale une variation attendue du bénéfice, ou des comptes en retard dans l'outil.</p>
          <div class="banc-legend"><span><i class="sw2" style="background:var(--fr)"></i>PER de l'outil</span><span><i class="sw2" style="background:var(--us)"></i>PER 2026 attendu (consensus)</span></div>
          <div class="banc-chart" id="bc3"></div></div>
      </div>
      <div class="card"><h3>Ce que montre la confrontation</h3>${findings()}</div>
      <div class="card"><h3>Toutes les données</h3>${table()}
        <p class="note">${esc(cons.note)} Exercice en orange : comptes de plus d'un an (rapport plus récent pas encore dans la base ESEF). Rentabilité des banques et assurances : ROE face au coût des fonds propres.</p></div>`;
    chart1($("bc1")); chart2($("bc2")); chart3($("bc3"));
  }

  let bound = false;
  function mount() {
    render();
    if (bound) return;
    bound = true;
    $("bancOut").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const t = e.target.closest("[data-open]");
      if (!t) return;
      const r = rows.find((x) => x.k.lei === t.getAttribute("data-open"));
      if (r && r.c) openDetail(r.c);
    });
  }

  return { mount, render };
})();
