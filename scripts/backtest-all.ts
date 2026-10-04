// Backtest agregado: todas as UFs carregadas, checkpoints por % apurado do eleitorado.
// uso: npx tsx scripts/backtest-all.ts <cargo 3|5> [--p '{"lamUf":30000}'] [--draws 150]
import { project } from '../packages/model/src/index.js';
import { loadHist, Replay } from '../apps/api/src/hist.js';
import { pool } from '../apps/api/src/db.js';

const cargo = +(process.argv[2] ?? 3);
const arg = (n: string, d: string) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const params = JSON.parse(arg('p', '{}')); const draws = +arg('draws', '150');
const only = arg('uf', '');
const QF: Record<number, number> = { 1: 0.9, 3: 0.88, 5: 0.82 };
const CP = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9];
const { rows } = await pool.query('select distinct uf from secao_hist where cargo=$1 and ano=2022 order by 1', [cargo]);
const acc = CP.map(() => ({ n: 0, mae: 0, cov: 0, covN: 0, lead: 0, r2: 0, brier: 0, ic: 0 }));
for (const { uf } of rows) {
  if (uf === 'ZZ' || (only && uf !== only)) continue;
  const data = await loadHist({ ano: 2022, cargo, uf, refAno: 2018, refNrL: 13, refNrR: 17, qFallback: QF[cargo] });
  if (!data.cands.length) continue;
  const rp = new Replay(data);
  const fin = project({ cands: data.cands, munis: rp.advanceTo(data.tMax + 36e5), seats: 1, rule: 'maioria_absoluta', nationalPrior: false, qFallback: QF[cargo], params: { draws: 20 } });
  const truth = new Map(fin.cands.map(c => [c.nr, c.pctApurado])); const order = [...truth.entries()].sort((a, b) => b[1] - a[1]);
  const runoff = order[0][1] <= 0.5; const top3 = order.slice(0, 3).map(e => e[0]);
  rp.reset(); const done = CP.map(() => false);
  for (let t = Math.ceil(data.tMin / 6e5) * 6e5; t <= data.tMax + 6e5; t += 6e5) {
    const st = rp.advanceTo(t);
    let te = 0, est = 0; for (const m of st) { te += m.te; est += m.est; } const f = est / te;
    CP.forEach((cp, i) => {
      if (done[i] || f < cp) return; done[i] = true;
      const r = project({ cands: data.cands, munis: st, seats: 1, rule: 'maioria_absoluta', nationalPrior: false, qFallback: QF[cargo], params: { draws, ...params } });
      const a = acc[i]; a.n++;
      for (const n of top3) { const c = r.cands.find(x => x.nr === n)!; a.mae += Math.abs(c.pctProjetado - truth.get(n)!) * 100 / 3;
        a.covN++; if (truth.get(n)! >= c.ic90[0] && truth.get(n)! <= c.ic90[1]) a.cov++; a.ic += (c.ic90[1] - c.ic90[0]) * 100 / 3; }
      if (r.cands[0].nr === order[0][0]) a.lead++;
      a.brier += (r.probSegundoTurno - (runoff ? 1 : 0)) ** 2; if ((r.probSegundoTurno > 0.5) === runoff) a.r2++;
    });
  }
}
console.log(`cargo=${cargo} params=${JSON.stringify(params)}`);
console.log('apurado  UFs  MAE(pp)  largIC(pp)  cobIC90  líder✓  2ºT✓   Brier(2ºT)');
CP.forEach((cp, i) => { const a = acc[i]; if (!a.n) return;
  console.log(`${(cp * 100).toFixed(0).padStart(5)}%  ${String(a.n).padStart(4)}  ${(a.mae / a.n).toFixed(2).padStart(7)}  ${(a.ic / a.n).toFixed(2).padStart(9)}  ${(a.cov / a.covN * 100).toFixed(0).padStart(6)}%  ${(a.lead / a.n * 100).toFixed(0).padStart(5)}%  ${(a.r2 / a.n * 100).toFixed(0).padStart(4)}%  ${(a.brier / a.n).toFixed(3)}`); });
await pool.end();
