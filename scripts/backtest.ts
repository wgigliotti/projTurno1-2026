// Backtest: replay da chegada das seções de 2022 (prior = Presidente 2018) vs resultado final.
// uso: npx tsx scripts/backtest.ts <cargo:1|3|5> [UF] [--step 15] [--draws 300]
import { project, Candidato } from '../packages/model/src/index.js';
import { loadHist, Replay } from '../apps/api/src/hist.js';
import { pool } from '../apps/api/src/db.js';

const args = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && arr[i - 1].startsWith('--')));
const flag = (n: string, d: number) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const cargo = +args[0] || 1, uf = args[1] ?? null, stepMin = flag('step', 15), draws = flag('draws', 300);
const QF: Record<number, number> = { 1: 0.9, 3: 0.88, 5: 0.82 };
const lam = flag('lam', 30000), tau = flag('tau', 0.08), tauNat = flag('taunat', 0.04), kappa = flag('kappa', 400), sigma = flag('sigma', 0.12);

const data = await loadHist({ ano: 2022, cargo, uf: cargo === 1 ? uf : (uf ?? 'AC'), refAno: 2018, refNrL: 13, refNrR: 17, qFallback: QF[cargo] });
const rp = new Replay(data);
const final = rp.advanceTo(data.tMax + 3600e3);
const T = project({ cands: data.cands, munis: final, seats: 1, rule: 'maioria_absoluta', nationalPrior: cargo === 1, qFallback: QF[cargo], params: { draws: 50 } });
const truth = new Map(T.cands.map(c => [c.nr, c.pctApurado]));
const winner = [...truth.entries()].sort((a, b) => b[1] - a[1]);
console.log(`cargo=${cargo} uf=${uf ?? 'BR'} cands=${data.cands.length} munis=${data.munis.size} t=[${new Date(data.tMin).toISOString()} .. ${new Date(data.tMax).toISOString()}]`);
console.log('verdade (top3):', winner.slice(0, 3).map(([n, p]) => `${n}:${(p * 100).toFixed(2)}%`).join('  '));
const win1 = winner[0][1] > 0.5;

console.log('\nhora(UTC)  apurado  MAE(pp,top3)  maxErr  cobIC90(top3)  líder✓  2ºturno-call');
let wSum = 0, wN = 0, maeSum = 0, rows = 0, covHit = 0, covN = 0, stableFrom: number | null = null, lastBad = -1;
const out: string[] = [];
for (let t = Math.ceil(data.tMin / (stepMin * 60e3)) * stepMin * 60e3 + stepMin * 60e3; t <= data.tMax + stepMin * 60e3; t += stepMin * 60e3) {
  const st = rp.advanceTo(t);
  const r = project({ cands: data.cands, munis: st, seats: 1, rule: 'maioria_absoluta', nationalPrior: cargo === 1, qFallback: QF[cargo], params: { draws, lamUf: lam, tau0: tau, tauNat, kappaS: kappa, sigmaMuni: sigma } });
  const top = winner.slice(0, 3).map(([n]) => n);
  const errs = top.map(n => { const c = r.cands.find(x => x.nr === n)!; return (c.pctProjetado - truth.get(n)!) * 100; });
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length, mx = Math.max(...errs.map(Math.abs));
  const cov = top.map(n => { const c = r.cands.find(x => x.nr === n)!; return truth.get(n)! >= c.ic90[0] && truth.get(n)! <= c.ic90[1]; });
  if (r.pctEleitoresApurados >= 0.03 && r.pctEleitoresApurados <= 0.97) { covHit += cov.filter(Boolean).length; covN += cov.length; wSum += r.cands.slice(0, 3).reduce((a, c) => a + (c.ic90[1] - c.ic90[0]) * 100, 0) / 3; wN++; maeSum += mae; }
  const lead = r.cands[0].nr === winner[0][0];
  const callSecond = r.probSegundoTurno > 0.5;
  const ok = lead && callSecond === !win1;
  if (!ok) lastBad = t;
  rows++;
  out.push(`${new Date(t).toISOString().slice(11, 16)}   ${(r.pctEleitoresApurados * 100).toFixed(1).padStart(5)}%   ${mae.toFixed(2).padStart(6)}      ${mx.toFixed(2).padStart(5)}    ${cov.map(c => c ? '✓' : '✗').join('')}          ${lead ? '✓' : '✗'}      P(2ºT)=${(r.probSegundoTurno * 100).toFixed(0)}%`);
}
if (!process.argv.includes('--quiet')) console.log(out.join('\n'));
console.log(`\njanela 3–97%: MAE=${(maeSum / wN).toFixed(2)}pp largIC=${(wSum / wN).toFixed(2)}pp`);
console.log(`cobertura IC90 média = ${(covHit / covN * 100).toFixed(0)}%  | último passo com erro de líder/2ºturno: ${lastBad > 0 ? new Date(lastBad).toISOString().slice(11, 16) : 'nenhum'}`);
await pool.end();
