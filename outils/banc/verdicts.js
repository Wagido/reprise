// Verdicts de l'outil pour chaque société du test et chaque exercice disponible.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, url = 'http://localhost:8765/'] = process.argv.slice(2);
  const ids = JSON.parse(fs.readFileSync(process.env.IDS, 'utf8'));
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(3500);
  const res = await p.evaluate((ids) => {
    const ys = state.meta.years, r = {};
    for (const id of ids) {
      const c = state.companies.find((x) => x.id === id);
      if (!c) continue;
      r[id] = { n: c.n, s: c.s, y: {} };
      ys.forEach((y, i) => {
        const f = Analyse.figures(c, i);
        if (!Number.isFinite(f.rev)) return;
        r[id].y[y] = { ...Analyse.verdictsAt(c, i), roce: f.roce, k: f.k };
      });
    }
    return r;
  }, ids);
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(Object.keys(res).length, 'sociétés', errs.join('\n') || 'no errors');
  await b.close();
})();
