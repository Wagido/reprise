// Verdict de prix « à l'époque » : on remplace le cours actuel par le cours de fin avril suivant l'exercice,
// puis on lit le verdict Marché, la VE / capitaux employés observée et justifiée, et l'écart à la valeur estimée.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [histoPath, out, url = 'http://localhost:8765/'] = process.argv.slice(2);
  const H = JSON.parse(fs.readFileSync(histoPath, 'utf8')).series;
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(3500);
  const res = await p.evaluate((H) => {
    const ys = state.meta.years, r = [];
    const px = (m, ym) => { let v = null; for (const [d, x] of m) if (d <= ym) v = x; return v; };
    for (const [id, s] of Object.entries(H)) {
      const c = state.companies.find((x) => x.id === id);
      if (!c || !c.px) continue;
      const keep = c.px.slice();
      ys.forEach((y, i) => {
        const f0 = Analyse.figures(c, i);
        if (!Number.isFinite(f0.rev)) return;
        const buy = `${y + 1}-04`, sell = `${y + 2}-04`;
        const last = s.m[s.m.length - 1][0];
        if (buy > last) return;
        const p0 = px(s.m, buy), p1 = px(s.m, sell < last ? sell : last);
        if (!p0 || !p1) return;
        c.px = [p0, keep[1]];
        const { f, mv, fv } = Analyse.market(c, i);
        const vals = [fv.sector, fv.dcf].filter(Number.isFinite);
        r.push({ n: c.n, y, ret: p1 / p0 - 1, mv: mv[0], vae: f.vae, vaeTh: f.vaeTh, roce: f.roce, k: f.k,
          gap: vals.length && Number.isFinite(f.mcap) ? f.mcap / (vals.reduce((a, b) => a + b, 0) / vals.length) - 1 : null,
          gapDcf: Number.isFinite(fv.dcf) && Number.isFinite(f.mcap) ? f.mcap / fv.dcf - 1 : null, per: f.per });
      });
      c.px = keep;
    }
    return r;
  }, H);
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(res.length, 'observations', errs.join('\n') || 'no errors');
  await b.close();
})();
