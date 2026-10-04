// Carrega histórico (2022) do Postgres e reproduz a chegada das seções (replay) -> MuniObs
import { pool } from './db.js';
import { campoDe } from './campos.js';
import type { Candidato, MuniObs, MuniRef } from '@eleicao/model';

export interface HistOpts {
  ano: number; cargo: number; uf: string | null;      // uf null = todas
  refAno: number; refNrL: number; refNrR: number;     // baseline p/ prior (pres do ano anterior)
  qFallback: number; bucketMin?: number;
}
interface Bucket { t: number; mun: number; sec: number; est: number; c: number; nom: number; br: number; nu: number; votos: Record<number, number>; }
interface MuniStatic { id: number; uf: string; nome?: string; ibge?: string; te: number; secTotal: number; ref: MuniRef; }

export interface HistData { opts: HistOpts; cands: Candidato[]; munis: Map<number, MuniStatic>; buckets: Bucket[]; tMin: number; tMax: number; }

export async function loadHist(o: HistOpts): Promise<HistData> {
  o = { ...o, bucketMin: o.bucketMin ?? 5 }; const bm = o.bucketMin;
  const ufCond = o.uf ? 'and s.uf = $3' : '';
  const args: any[] = [o.ano, o.cargo]; if (o.uf) args.push(o.uf);

  const [cr, st, bk, vt, ref] = await Promise.all([
    pool.query(`select distinct on (nr_votavel) nr_votavel nr, nome, sg_partido from candidato_hist s where ano=$1 and cargo=$2 ${o.uf ? 'and uf=$3' : ''} order by nr_votavel, uf`, args),
    pool.query(`select s.uf, s.cd_mun id, sum(aptos)::int te, count(*)::int sec, m.nome, m.cd_ibge::text ibge
                from secao_hist s left join municipio m on m.cd_tse=s.cd_mun where s.ano=$1 and s.cargo=$2 and s.turno=1 ${ufCond} group by s.uf, s.cd_mun, m.nome, m.cd_ibge`, args),
    pool.query(`select s.cd_mun mun, (extract(epoch from date_trunc('hour', dt_recebido) + floor(extract(minute from dt_recebido)/${bm})*interval '${bm} min'))::bigint*1000 t,
                  count(*)::int sec, sum(aptos)::int est, sum(comparec)::int c, sum(brancos)::int br, sum(nulos)::int nu
                from secao_hist s where s.ano=$1 and s.cargo=$2 and s.turno=1 and dt_recebido is not null ${ufCond} group by 1,2`, args),
    pool.query(`select s.cd_mun mun, (extract(epoch from date_trunc('hour', s.dt_recebido) + floor(extract(minute from s.dt_recebido)/${bm})*interval '${bm} min'))::bigint*1000 t,
                  v.nr_votavel nr, sum(v.qt_votos)::int votos
                from secao_hist s join voto_secao_hist v using (ano,turno,cargo,uf,cd_mun,zona,secao)
                where s.ano=$1 and s.cargo=$2 and s.turno=1 and s.dt_recebido is not null ${ufCond} group by 1,2,3`, args),
    pool.query(`select cd_mun, nr_votavel nr, votos, aptos, comparec from resultado_mun_hist where ano=$1 and cargo=1 and turno=1`, [o.refAno]),
  ]);

  const cands: Candidato[] = cr.rows.map((r: any) => ({ nr: r.nr, nome: r.nome, partido: r.sg_partido ?? '', campo: campoDe(o.ano, o.cargo, r.nr, r.sg_partido ?? '') }));

  const refBy = new Map<number, { nom: number; L: number; R: number; aptos: number; c: number }>();
  for (const r of ref.rows) {
    const e = refBy.get(r.cd_mun) ?? { nom: 0, L: 0, R: 0, aptos: r.aptos || 0, c: r.comparec || 0 };
    e.nom += r.votos; if (r.nr === o.refNrL) e.L += r.votos; if (r.nr === o.refNrR) e.R += r.votos;
    refBy.set(r.cd_mun, e);
  }
  const munis = new Map<number, MuniStatic>();
  for (const r of st.rows) {
    const b = refBy.get(r.id);
    const rf: MuniRef = b && b.nom > 0
      ? { L: b.L / b.nom, R: b.R / b.nom, turn: b.aptos ? b.c / b.aptos : 0.8, q: o.qFallback }
      : { L: 0.4, R: 0.4, turn: 0.8, q: o.qFallback };
    munis.set(r.id, { id: r.id, uf: r.uf, nome: r.nome ?? undefined, ibge: r.ibge ?? undefined, te: r.te, secTotal: r.sec, ref: rf });
  }
  const bks = new Map<string, Bucket>();
  for (const r of bk.rows) bks.set(`${r.mun}|${r.t}`, { t: +r.t, mun: r.mun, sec: r.sec, est: r.est, c: r.c, nom: 0, br: r.br, nu: r.nu, votos: {} });
  for (const r of vt.rows) { const b = bks.get(`${r.mun}|${r.t}`); if (b) { b.votos[r.nr] = r.votos; b.nom += r.votos; } }
  const buckets = [...bks.values()].sort((a, b) => a.t - b.t);
  return { opts: o, cands, munis, buckets, tMin: buckets[0]?.t ?? 0, tMax: buckets.at(-1)?.t ?? 0 };
}

/** Reproduz a chegada: estado acumulado até o instante t (ms epoch, fim do balde). */
export class Replay {
  private acc = new Map<number, MuniObs>(); private i = 0; private cur = -Infinity;
  constructor(public data: HistData) {
    for (const m of data.munis.values()) this.acc.set(m.id, { id: m.id, uf: m.uf, nome: m.nome, ibge: m.ibge, te: m.te, est: 0, c: 0, nom: 0, brancos: 0, nulos: 0, secTotal: m.secTotal, secApur: 0, votos: {}, ref: m.ref });
  }
  reset() { this.i = 0; this.cur = -Infinity; for (const m of this.acc.values()) { m.est = m.c = m.nom = m.brancos = m.nulos = m.secApur = 0; m.votos = {}; } }
  advanceTo(t: number): MuniObs[] {
    if (t < this.cur) this.reset();
    const bks = this.data.buckets;
    while (this.i < bks.length && bks[this.i].t + this.data.opts.bucketMin! * 60000 <= t) {
      const b = bks[this.i++], m = this.acc.get(b.mun)!;
      m.est += b.est; m.c += b.c; m.nom += b.nom; m.brancos += b.br; m.nulos += b.nu; m.secApur += b.sec;
      for (const k in b.votos) m.votos[k as any] = (m.votos[k as any] || 0) + b.votos[k];
    }
    this.cur = t;
    return [...this.acc.values()].map(m => ({ ...m, votos: { ...m.votos } }));
  }
}
