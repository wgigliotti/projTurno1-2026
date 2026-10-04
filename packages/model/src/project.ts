import { Candidato, CandProj, DEFAULT_PARAMS, MuniObs, ProjectInput, ProjectResult, UnitProj } from './types.js';
import { ridge, rng } from './linalg.js';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const NF = 4;                                  // features: 1, L, R, z(porte)
const feats = (m: MuniObs) => [1, m.ref.L, m.ref.R, clamp((Math.log(Math.max(m.te, 50)) - 8.5) / 1.5, -2.5, 2.5)];

/** Predição a priori do share nominal de cada candidato no município, pelo campo (baseline anterior). */
function priorShares(cands: Candidato[], m: MuniObs): number[] {
  const n = { lula: 0, bolsonaro: 0, outros: 0 };
  for (const c of cands) n[c.campo]++;
  const O = Math.max(0, 1 - m.ref.L - m.ref.R);
  const p = cands.map(c => (c.campo === 'lula' ? m.ref.L / n.lula : c.campo === 'bolsonaro' ? m.ref.R / n.bolsonaro : O / n.outros));
  const s = p.reduce((a, b) => a + b, 0) || 1;
  return p.map(x => Math.max(x / s, 0.0005));
}

interface Fit { beta: number[][]; }   // beta[k] (NF)

function fitBetas(rows: MuniObs[], cands: Candidato[], lam: number[], beta0: number[][]): number[][] {
  const X = rows.map(feats), w = rows.map(m => m.nom);
  return cands.map((c, k) => {
    const y = rows.map(m => (m.votos[c.nr] || 0) / m.nom - priorShares(cands, m)[k]);
    return ridge(X, y, w, lam, beta0[k]);
  });
}

export function project(inp: ProjectInput): ProjectResult {
  const P = { ...DEFAULT_PARAMS, ...inp.params };
  const cands = inp.cands, K = cands.length, munis = inp.munis;
  const byUf = new Map<string, MuniObs[]>();
  for (const m of munis) { if (!byUf.has(m.uf)) byUf.set(m.uf, []); byUf.get(m.uf)!.push(m); }

  // ---- razões de comparecimento (U) e votos nominais por comparecimento (q), com encolhimento ----
  const agg = (ms: MuniObs[]) => {
    let c = 0, est = 0, nom = 0, den = 0;
    for (const m of ms) if (m.est > 0) { c += m.c; est += m.est; nom += m.nom; den += m.est * m.ref.turn; }
    return { c, est, nom, den };
  };
  const nat = agg(munis);
  const Unat = clamp((nat.c + P.m0) / (nat.den + P.m0), 0.8, 1.2);
  const qNat = (nat.nom + P.m0 * inp.qFallback) / (nat.c + P.m0);
  const Uuf = new Map<string, number>(), quf = new Map<string, number>();
  for (const [uf, ms] of byUf) {
    const a = agg(ms);
    Uuf.set(uf, clamp((a.c + P.m0 * Unat) / (a.den + P.m0), 0.8, 1.2));
    quf.set(uf, (a.nom + P.m0 * qNat) / (a.c + P.m0));
  }

  // ---- volume restante por município ----
  const rem = new Map<number, { N: number; cRem: number }>();
  for (const m of munis) {
    const f = m.te > 0 ? m.est / m.te : 0;
    const w = f / (f + P.f0);
    const tp = clamp(m.ref.turn * Uuf.get(m.uf)!, 0.3, 0.97);
    const tObs = m.est > 0 ? m.c / m.est : tp;
    const T = w * tObs + (1 - w) * tp;
    const qp = quf.get(m.uf)!;
    const qObs = m.c > 0 ? m.nom / m.c : qp;
    const q = w * qObs + (1 - w) * qp;
    const left = Math.max(0, m.te - m.est);
    rem.set(m.id, { N: left * T * q, cRem: left * T });
  }

  // ---- regressão (nacional → UF) p/ share dos que faltam ----
  const fitRows = (ms: MuniObs[]) => ms.filter(m => m.nom >= P.minVotesFit);
  const zero = cands.map(() => new Array(NF).fill(0));
  const lamNat = [P.lamNat * 0.3, P.lamNat, P.lamNat, P.lamNat];
  const betaNat = inp.nationalPrior && fitRows(munis).length >= 5 ? fitBetas(fitRows(munis), cands, lamNat, zero) : zero;
  const betaUf = new Map<string, number[][]>();
  const lamUf = [P.lamUf * 0.3, P.lamUf, P.lamUf, P.lamUf];
  for (const [uf, ms] of byUf) {
    const rows = fitRows(ms);
    betaUf.set(uf, rows.length ? fitBetas(rows, cands, lamUf, betaNat) : betaNat);
  }

  // ---- projeção por município ----
  const obsU = new Map<string, number[]>(), remU = new Map<string, number[]>(), varU = new Map<string, number[]>();
  const NremU = new Map<string, number>();
  const muniUnits: UnitProj[] = [];
  const ufAgg = new Map<string, { te: number; est: number; c: number; cRem: number }>();
  for (const [uf, ms] of byUf) {
    obsU.set(uf, new Array(K).fill(0)); remU.set(uf, new Array(K).fill(0)); varU.set(uf, new Array(K).fill(0));
    NremU.set(uf, 0); ufAgg.set(uf, { te: 0, est: 0, c: 0, cRem: 0 });
    const beta = betaUf.get(uf)!;
    for (const m of ms) {
      const pr = priorShares(cands, m), x = feats(m);
      let pred = cands.map((_, k) => Math.max(0.0005, pr[k] + x.reduce((s, xi, j) => s + xi * beta[k][j], 0)));
      const sp = pred.reduce((a, b) => a + b, 0); pred = pred.map(v => v / sp);
      const ws = m.nom / (m.nom + P.kappaS);
      const { N, cRem } = rem.get(m.id)!;
      const obsV = obsU.get(uf)!, remV = remU.get(uf)!, vr = varU.get(uf)!;
      const fin: number[] = [], ap: number[] = [];
      const shares: Record<number, number> = {}, apurado: Record<number, number> = {};
      let tot = 0;
      cands.forEach((c, k) => {
        const v = m.votos[c.nr] || 0;
        const sRem = m.nom > 0 ? ws * (v / m.nom) + (1 - ws) * pred[k] : pred[k];
        obsV[k] += v; remV[k] += N * sRem; vr[k] += (N * sRem * P.sigmaMuni) ** 2;
        fin.push(v + N * sRem); tot += v + N * sRem;
      });
      NremU.set(uf, NremU.get(uf)! + N);
      cands.forEach((c, k) => { shares[c.nr] = tot > 0 ? fin[k] / tot : 0; apurado[c.nr] = m.nom > 0 ? (m.votos[c.nr] || 0) / m.nom : 0; });
      muniUnits.push({ id: m.ibge ?? String(m.id), nome: m.nome, uf, pctApurado: m.te ? m.est / m.te : 0, shares, apurado, nominaisProj: tot });
      const a = ufAgg.get(uf)!; a.te += m.te; a.est += m.est; a.c += m.c; a.cRem += cRem;
    }
  }

  // ---- ponto central e UFs ----
  const natV = new Array(K).fill(0), natObs = new Array(K).fill(0);
  const ufUnits: UnitProj[] = [];
  for (const [uf] of byUf) {
    const o = obsU.get(uf)!, r = remU.get(uf)!;
    const fin = o.map((v, k) => v + r[k]), tot = fin.reduce((a, b) => a + b, 0) || 1;
    const ot = o.reduce((a, b) => a + b, 0) || 1;
    const shares: Record<number, number> = {}, apurado: Record<number, number> = {};
    cands.forEach((c, k) => { shares[c.nr] = fin[k] / tot; apurado[c.nr] = o[k] / ot; natV[k] += fin[k]; natObs[k] += o[k]; });
    const a = ufAgg.get(uf)!;
    ufUnits.push({ id: uf, uf, pctApurado: a.te ? a.est / a.te : 0, shares, apurado, nominaisProj: tot });
  }
  const totNat = natV.reduce((a, b) => a + b, 0) || 1, totObs = natObs.reduce((a, b) => a + b, 0) || 1;

  // ---- Monte Carlo ----
  const R = rng(inp.seed ?? 12345);
  const D = P.draws;
  const share = new Float64Array(D * K);
  const top2Count = new Map<string, number>();
  const topCount = new Array(K).fill(0), win1 = new Array(K).fill(0), elected = new Array(K).fill(0);
  let noWinner = 0;
  for (let d = 0; d < D; d++) {
    const aNat = cands.map(() => R.n() * P.tauNat);
    const V = new Array(K).fill(0);
    for (const [uf] of byUf) {
      const o = obsU.get(uf)!, r = remU.get(uf)!, vr = varU.get(uf)!, N = NremU.get(uf)!;
      const Rp = r.map((v, k) => Math.max(0, v * Math.exp(aNat[k] + R.n() * P.tau0) + Math.sqrt(vr[k]) * R.n()));
      const sR = Rp.reduce((a, b) => a + b, 0) || 1;
      const sc = (N * Math.exp(P.rho * R.n())) / sR;
      for (let k = 0; k < K; k++) V[k] += o[k] + Rp[k] * sc;
    }
    const tot = V.reduce((a, b) => a + b, 0) || 1;
    for (let k = 0; k < K; k++) share[d * K + k] = V[k] / tot;
    const order = V.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < Math.min(inp.seats, K); i++) elected[order[i][1]]++;
    topCount[order[0][1]]++; if (order[0][0] / tot > 0.5) win1[order[0][1]]++; else noWinner++;
    for (let i = 0; i < Math.min(2, K); i++) topCount[order[i][1]] += 0;
    if (K > 1) { const key = [order[0][1], order[1][1]].sort().join('-'); top2Count.set(key, (top2Count.get(key) || 0) + 1); }
  }
  const q = (k: number, p: number) => {
    const a: number[] = []; for (let d = 0; d < D; d++) a.push(share[d * K + k]);
    a.sort((x, y) => x - y); return a[clamp(Math.round(p * (D - 1)), 0, D - 1)];
  };
  const top2Prob = new Array(K).fill(0);
  for (const [key, n] of top2Count) for (const s of key.split('-')) top2Prob[+s] += n / D;

  const candProj: CandProj[] = cands.map((c, k) => ({
    nr: c.nr, votosApurados: natObs[k], pctApurado: natObs[k] / totObs,
    votosProjetados: natV[k], pctProjetado: natV[k] / totNat, ic90: [q(k, 0.05), q(k, 0.95)] as [number, number],
    probVitoria1Turno: win1[k] / D, probTop2: top2Prob[k], probEleito: elected[k] / D,
  })).sort((a, b) => b.pctProjetado - a.pctProjetado);

  const confrontos = [...top2Count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, n]) => {
    const [i, j] = key.split('-').map(Number);
    return { nrs: [cands[i].nr, cands[j].nr] as [number, number], prob: n / D };
  });

  let te = 0, est = 0, c = 0, cRem = 0, br = 0, nu = 0, sA = 0, sT = 0;
  for (const m of munis) { te += m.te; est += m.est; c += m.c; br += m.brancos; nu += m.nulos; sA += m.secApur; sT += m.secTotal; cRem += rem.get(m.id)!.cRem; }
  return {
    cands: candProj, ufs: ufUnits, munis: muniUnits,
    pctEleitoresApurados: te ? est / te : 0, secApur: sA, secTotal: sT,
    comparecApurado: est ? c / est : 0, comparecProjetado: te ? (c + cRem) / te : 0,
    confrontos, probSegundoTurno: noWinner / D,
    brancosApurado: c ? br / c : 0, nulosApurado: c ? nu / c : 0,
  };
}
