// Fotos a cada 5 min: apuração real x projeção (presidente BR + por UF, governador por UF).
import { pool } from './db.js';
import { Source, run, apiProjecao, iso } from './engine.js';
import { UFS } from './ufs.js';

export const SLOT_MS = 5 * 60000;
const naive = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

export async function gravarFoto(src: Source, slotMs: number, defasagemS: number) {
  const fonte = src.fonte, t = naive(slotMs);
  const alvos: { cargo: 'presidente' | 'governador'; uf: string }[] = [{ cargo: 'presidente', uf: 'BR' }];
  for (const { uf } of UFS) { alvos.push({ cargo: 'presidente', uf }); alvos.push({ cargo: 'governador', uf }); }
  const H: any[][] = [], C: any[][] = [];
  for (const a of alvos) {
    const snap = await src.get(a.cargo, a.uf); if (!snap) continue;
    const r = run(src, a.cargo, snap, a.uf, 200);
    const api = apiProjecao(a.cargo, a.uf, snap, r, src.now());
    H.push([fonte, t, a.cargo, a.uf, r.pctEleitoresApurados, r.secApur, r.secTotal, r.comparecApurado, r.comparecProjetado, r.probSegundoTurno, src.lastTSE(), defasagemS]);
    for (const c of api.candidatos) C.push([fonte, t, a.cargo, a.uf, c.nr, c.nome, c.partido, c.campo, Math.round(c.votosApurados), c.pctApurado, c.votosProjetados, c.pctProjetado, c.ic90[0], c.ic90[1]]);
  }
  const col = (rows: any[][], i: number) => rows.map(r => r[i]);
  await pool.query(`insert into foto_apuracao select * from unnest($1::text[],$2::timestamp[],$3::text[],$4::text[],$5::float8[],$6::int[],$7::int[],$8::float8[],$9::float8[],$10::float8[],$11::text[],$12::int[]) on conflict do nothing`,
    Array.from({ length: 12 }, (_, i) => col(H, i)));
  for (let i = 0; i < C.length; i += 2000) {
    const part = C.slice(i, i + 2000);
    await pool.query(`insert into foto_candidato select * from unnest($1::text[],$2::timestamp[],$3::text[],$4::text[],$5::int[],$6::text[],$7::text[],$8::text[],$9::bigint[],$10::float8[],$11::bigint[],$12::float8[],$13::float8[],$14::float8[]) on conflict do nothing`,
      Array.from({ length: 14 }, (_, k) => col(part, k)));
  }
  return { t, series: H.length, candidatos: C.length };
}

/** Agenda: a cada slot de 5 min (hora de Brasília) a partir de `inicioMs`, grava uma foto. */
export function agendarFotos(src: Source, inicioMs: number, defasagem: () => number) {
  let ultimo = -1;
  const tick = async () => {
    const slot = Math.floor(src.now() / SLOT_MS) * SLOT_MS;
    if (slot < inicioMs || slot <= ultimo) return;
    ultimo = slot;
    try { const r = await gravarFoto(src, slot, defasagem()); console.log(`foto ${naive(slot)}: ${r.series} séries, ${r.candidatos} candidatos`); }
    catch (e) { console.error('foto falhou', e); ultimo = slot - 1; }
  };
  const iv = setInterval(tick, 5000); void tick(); return iv;
}

const NOMES: Record<string, string> = Object.fromEntries(UFS.map(u => [u.uf, u.nome]));
export async function historico(fonte: string, cargo?: string, uf?: string, topN = 4) {
  const w = ['fonte=$1']; const a: any[] = [fonte];
  if (cargo) { a.push(cargo); w.push(`cargo=$${a.length}`); } if (uf) { a.push(uf); w.push(`uf=$${a.length}`); }
  const [h, c] = await Promise.all([
    pool.query(`select to_char(t,'YYYY-MM-DD"T"HH24:MI:SS') t, cargo, uf, pct_eleitores_apurados, secoes_apuradas, secoes_total, prob_2turno from foto_apuracao where ${w.join(' and ')} order by t`, a),
    pool.query(`select to_char(t,'YYYY-MM-DD"T"HH24:MI:SS') t, cargo, uf, nr, nome, partido, campo, pct_apurado, pct_projetado, ic_lo, ic_hi from foto_candidato where ${w.join(' and ')} order by t`, a),
  ]);
  const series: Record<string, any> = {};
  for (const r of h.rows) {
    const k = `${r.cargo}/${r.uf}`;
    (series[k] ??= { cargo: r.cargo, uf: r.uf, nome: r.uf === 'BR' ? 'Brasil' : NOMES[r.uf] ?? r.uf, candidatos: [], pontos: [] , _pt: new Map() });
    const pt = { t: r.t + '-03:00', pctEleitoresApurados: Math.round(r.pct_eleitores_apurados * 1e4) / 1e4, secoesApuradas: r.secoes_apuradas, secoesTotal: r.secoes_total, prob2Turno: r.prob_2turno, cand: {} as Record<number, any> };
    series[k].pontos.push(pt); series[k]._pt.set(r.t, pt);
  }
  const meta: Record<string, Map<number, any>> = {};
  for (const r of c.rows) {
    const k = `${r.cargo}/${r.uf}`, s = series[k]; if (!s) continue;
    const q = (x: number) => Math.round(x * 1e4) / 1e4;
    s._pt.get(r.t).cand[r.nr] = { apurado: q(r.pct_apurado), projetado: q(r.pct_projetado), lo: q(r.ic_lo), hi: q(r.ic_hi) };
    (meta[k] ??= new Map()).set(r.nr, { nr: r.nr, nome: r.nome, partido: r.partido, campo: r.campo, ultimo: r.pct_projetado });
  }
  for (const [k, s] of Object.entries(series)) {
    const top = [...(meta[k]?.values() ?? [])].sort((x, y) => y.ultimo - x.ultimo).slice(0, topN);
    s.candidatos = top.map(({ ultimo, ...m }) => m);
    const keep = new Set(top.map(t => t.nr));
    for (const p of s.pontos) for (const nr of Object.keys(p.cand)) if (!keep.has(+nr)) delete p.cand[nr as any];
    delete s._pt;
  }
  return { fonte, intervaloMin: 5, series };
}
