// Fonte ao vivo: lê os JSON -u.json do TSE (BR/UF/município) e monta MuniObs.
import fs from 'node:fs';
import path from 'node:path';
import { pool, ROOT } from './db.js';
import { campoDe } from './campos.js';
import { Cargo, CARGO_CODE, CARGOS, Snapshot, Source, SeriePoint, run, seriePoint } from './engine.js';
import { UFS } from './ufs.js';
import type { Candidato, MuniObs, MuniRef } from '@eleicao/model';

const BASE = process.env.TSE_BASE ?? 'https://resultados.tse.jus.br/oficial/ele2026';
const ELE: Record<Cargo, string> = { presidente: '6257', governador: '6259', senador: '6259' };
const UA = { 'User-Agent': 'Mozilla/5.0 (eleicao2026-projecao; uso academico)' };
const QF: Record<Cargo, number> = { presidente: 0.9, governador: 0.88, senador: 1.6 };   // senado 2026: 2 votos/eleitor
const num = (x: any) => (x === undefined || x === null || x === '' ? 0 : +String(x).replace(/\./g, '').replace(',', '.'));

export interface Parsed { secTotal: number; secApur: number; te: number; est: number; c: number; nom: number; br: number; nu: number; votos: Record<number, number>; dg?: string; hg?: string; }
export function parseU(d: any): Parsed {
  const votos: Record<number, number> = {};
  for (const c of d.carg ?? []) for (const a of c.agr ?? []) for (const p of a.par ?? []) for (const k of p.cand ?? []) votos[+k.n] = num(k.vap);
  return {
    secTotal: num(d.s?.ts), secApur: num(d.s?.st), te: num(d.e?.te), est: num(d.e?.est), c: num(d.e?.c),
    nom: Object.values(votos).reduce((a, b) => a + b, 0) || num(d.v?.vnom), br: num(d.v?.vb), nu: num(d.v?.vn), votos, dg: d.dg, hg: d.hg,
  };
}
export function parseCands(d: any, cargoCode: number, ano = 2026): Candidato[] {
  const out: Candidato[] = [];
  for (const c of d.carg ?? []) for (const a of c.agr ?? []) for (const p of a.par ?? []) for (const k of p.cand ?? [])
    out.push({ nr: +k.n, nome: k.nmu || k.nm, partido: p.sg, campo: campoDe(ano, cargoCode, +k.n, p.sg) });
  return out;
}

interface MuniInfo { id: number; uf: string; nome: string; ibge?: string; te: number; ref: MuniRef; }

export class LiveSource implements Source {
  fonte = 'live' as const;
  version = 0; onTick?: () => void;
  seats = (c: Cargo) => (c === 'senador' ? 2 : 1);
  qFallback = (c: Cargo) => QF[c];
  private munis: MuniInfo[] = [];
  private cands = new Map<string, Candidato[]>();            // 'presidente' | 'governador/SP'
  private snaps = new Map<string, Snapshot>();
  private etags = new Map<string, { etag: string; p: Parsed }>();
  private series = new Map<string, SeriePoint[]>();
  private tse: string | null = null; private t = Date.now();
  now() { return this.t; }
  lastTSE() { return this.tse; }
  recordedSerie(cargo: Cargo, uf: string) { return this.series.get(`${cargo}/${uf}`) ?? []; }

  async init() {
    const { rows } = await pool.query(`select m.cd_tse id, m.uf, m.nome, m.cd_ibge::text ibge, coalesce(e.aptos,0) te from municipio m left join eleitorado_2026 e using (cd_tse)`);
    const ref = await pool.query(`select cd_mun, nr_votavel nr, votos, aptos, comparec from resultado_mun_hist where ano=2022 and turno=1 and cargo=1`);
    const rb = new Map<number, { nom: number; L: number; R: number; aptos: number; c: number }>();
    for (const r of ref.rows) {
      const e = rb.get(r.cd_mun) ?? { nom: 0, L: 0, R: 0, aptos: r.aptos || 0, c: r.comparec || 0 };
      e.nom += r.votos; if (r.nr === 13) e.L += r.votos; if (r.nr === 22) e.R += r.votos; rb.set(r.cd_mun, e);
    }
    this.munis = rows.map((r: any) => {
      const b = rb.get(r.id);
      const rf: MuniRef = b && b.nom > 0 ? { L: b.L / b.nom, R: b.R / b.nom, turn: b.aptos ? b.c / b.aptos : 0.8, q: 0.9 } : { L: 0.4, R: 0.4, turn: 0.8, q: 0.9 };
      return { id: r.id, uf: r.uf, nome: r.nome, ibge: r.ibge ?? undefined, te: r.te, ref: rf };
    });
    await this.loadCands();
    await this.restore();
    await this.sweep();
    this.loop();
  }

  private async getJson(url: string): Promise<any> {
    const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json();
  }
  private async loadCands() {
    // candidatos vêm do cache local (scripts/fetch-candidatos-2026.mjs) p/ não gastar requisições do TSE
    const f = path.join(ROOT, 'data/candidatos-2026.json');
    if (!fs.existsSync(f)) throw new Error('rode: node scripts/fetch-candidatos-2026.mjs');
    const all: any[] = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const k of all) {
      const key = k.cargo === 1 ? 'presidente' : `${k.cargo === 3 ? 'governador' : 'senador'}/${k.uf}`;
      const arr = this.cands.get(key) ?? []; this.cands.set(key, arr);
      arr.push({ nr: k.nr, nome: k.nome, partido: k.partido, campo: campoDe(2026, k.cargo, k.nr, k.partido) });
    }
  }
  private url(cargo: Cargo, m: MuniInfo) {
    const l = m.uf.toLowerCase(), cd = String(m.id).padStart(5, '0');
    return `${BASE}/${ELE[cargo]}/dados/${l}/${l}${cd}-c000${CARGO_CODE[cargo]}-e00${ELE[cargo]}-u.json`;
  }
  // ---------- cliente educado: taxa adaptativa + backoff em 429 ----------
  private rps = +(process.env.LIVE_RPS ?? 20); private maxRps = +(process.env.LIVE_MAX_RPS ?? 60);
  private blockedUntil = 0; private nextSlot = 0; private okStreak = 0; n429 = 0;
  private async gate() {
    const now = Date.now();
    const wait = Math.max(this.blockedUntil - now, this.nextSlot - now, 0);
    this.nextSlot = Math.max(now, this.nextSlot) + 1000 / this.rps + (wait > 0 && this.blockedUntil > now ? 0 : 0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  private on429() {
    this.n429++; this.okStreak = 0;
    const pause = Math.min(600000, 60000 * Math.pow(2, Math.min(this.n429, 4) - 1));   // 60s, 120s, 240s, 480s...
    this.blockedUntil = Date.now() + pause; this.rps = Math.max(5, this.rps * 0.5);
    console.warn(`429 do TSE: pausa ${pause / 1000}s, rps -> ${this.rps.toFixed(1)}`);
  }
  private onOk() { if (++this.okStreak % 200 === 0) { this.rps = Math.min(this.maxRps, this.rps * 1.25); if (this.n429 > 0 && this.okStreak > 2000) this.n429 = 0; } }

  private async fetchOne(url: string): Promise<Parsed | null | 'blocked'> {
    if (Date.now() < this.blockedUntil && !this.allowDuringBlock) return 'blocked';
    await this.gate();
    if (Date.now() < this.blockedUntil) return 'blocked';
    const prev = this.etags.get(url);
    try {
      const r = await fetch(url, { headers: prev ? { ...UA, 'If-None-Match': prev.etag } : UA });
      if (r.status === 429) { this.on429(); await r.arrayBuffer(); return 'blocked'; }
      if (r.status === 304 && prev) { this.onOk(); return prev.p; }
      if (!r.ok) { await r.arrayBuffer(); return prev?.p ?? null; }
      const p = parseU(await r.json()); this.onOk();
      const et = r.headers.get('etag'); if (et) this.etags.set(url, { etag: et, p });
      return p;
    } catch { return prev?.p ?? null; }
  }
  private allowDuringBlock = false;

  // estado por município (último arquivo lido) e por UF/cargo (arquivo agregado)
  private muniP = new Map<string, { p: Parsed; at: number }>();
  private ufSt = new Map<string, { st: number; changedAt: number }>();
  private ufUrl(cargo: Cargo, uf: string) { const l = uf.toLowerCase(); return `${BASE}/${ELE[cargo]}/dados/${l}/${l}-c000${CARGO_CODE[cargo]}-e00${ELE[cargo]}-u.json`; }
  private newest = '';
  private note(p: Parsed | null | 'blocked') { if (p && p !== 'blocked' && p.hg && p.dg) { const s = `${p.dg.split('/').reverse().join('-')}T${p.hg}`; if (s > this.newest) this.newest = s; } }

  /** Um ciclo: (1) arquivos de UF (poucos); (2) municípios das UFs que mudaram, mais antigos primeiro, dentro de um orçamento de tempo. */
  async sweep() {
    const t0 = Date.now(), budget = +(process.env.CYCLE_BUDGET_MS ?? 35000);
    let reqs = 0, blocked = false;
    // 1) UF
    const ufJobs: { cargo: Cargo; uf: string }[] = [];
    for (const cargo of CARGOS) for (const { uf } of UFS) ufJobs.push({ cargo, uf });
    ufJobs.push({ cargo: 'presidente', uf: 'ZZ' });
    for (const j of ufJobs) {
      const p = await this.fetchOne(this.ufUrl(j.cargo, j.uf)); reqs++;
      if (p === 'blocked') { blocked = true; break; }
      if (!p) continue; this.note(p);
      const k = `${j.cargo}/${j.uf}`, prev = this.ufSt.get(k);
      if (!prev || prev.st !== p.secApur) this.ufSt.set(k, { st: p.secApur, changedAt: Date.now() });
    }
    // 2) municípios
    if (!blocked) {
      const queue: { cargo: Cargo; m: MuniInfo; url: string; at: number }[] = [];
      for (const cargo of CARGOS) for (const m of this.munis) {
        if (cargo !== 'presidente' && m.uf === 'ZZ') continue;
        const url = this.url(cargo, m), cur = this.muniP.get(url), uc = this.ufSt.get(`${cargo}/${m.uf}`);
        if (cur && cur.p.secTotal > 0 && cur.p.secApur >= cur.p.secTotal) continue;       // município fechado
        if (cur && uc && cur.at >= uc.changedAt) continue;                                 // nada novo na UF desde a última leitura
        queue.push({ cargo, m, url, at: cur?.at ?? 0 });
      }
      const now = Date.now(), score = (j: { at: number; m: MuniInfo }) => (now - j.at + 30000) * Math.sqrt(j.m.te + 1000);
      queue.sort((a, b) => score(b) - score(a));   // mais defasados primeiro, municípios grandes pesam mais
      let i = 0;
      const worker = async () => {
        while (i < queue.length && !blocked && Date.now() - t0 < budget) {
          const j = queue[i++]; const p = await this.fetchOne(j.url); reqs++;
          if (p === 'blocked') { blocked = true; return; }
          if (p) { this.muniP.set(j.url, { p, at: Date.now() }); this.dirty.add(j.url); this.note(p); }
        }
      };
      await Promise.all(Array.from({ length: 12 }, worker));
      if (i < queue.length) this.pending = queue.length - i; else this.pending = 0;
    }
    // snapshot a partir do que temos
    const out = new Map<string, MuniObs[]>();
    for (const cargo of CARGOS) for (const m of this.munis) {
      if (cargo !== 'presidente' && m.uf === 'ZZ') continue;
      const p = this.muniP.get(this.url(cargo, m))?.p;
      const key = cargo === 'presidente' ? 'presidente' : `${cargo}/${m.uf}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push({ id: m.id, uf: m.uf, nome: m.nome, ibge: m.ibge, te: p?.te || m.te, est: p?.est ?? 0, c: p?.c ?? 0, nom: p?.nom ?? 0,
        brancos: p?.br ?? 0, nulos: p?.nu ?? 0, secTotal: p?.secTotal ?? 0, secApur: p?.secApur ?? 0, votos: p?.votos ?? {}, ref: { ...m.ref, q: QF[cargo] } });
    }
    for (const [key, munis] of out) { const cands = this.cands.get(key); if (cands) this.snaps.set(key, { cands, munis }); }
    this.t = Date.now(); this.tse = this.newest ? `${this.newest}-03:00` : null; this.version++;
    this.recordSeries();
    void this.persist();
    console.log(`ciclo: ${reqs} req em ${Date.now() - t0}ms | rps=${this.rps.toFixed(0)} | fila restante=${this.pending} | ${blocked ? 'BLOQUEADO(429) ' : ''}TSE=${this.tse}`);
    this.onTick?.();
  }

  // ---------- persistência ----------
  private dirty = new Set<string>(); private serieSaved = new Map<string, number>();
  private async restore() {
    try {
      const m = await pool.query('select url, p, at from live_muni');
      for (const r of m.rows) this.muniP.set(r.url, { p: r.p, at: +r.at });
      const s = await pool.query('select cargo, uf, t, ponto from live_serie order by t');
      for (const r of s.rows) { const k = `${r.cargo}/${r.uf}`; const a = this.series.get(k) ?? []; this.series.set(k, a); a.push(r.ponto); this.serieSaved.set(k, a.length); }
      console.log(`restaurado: ${m.rowCount} municípios, ${s.rowCount} pontos de série`);
    } catch (e) { console.error('restore', String(e)); }
  }
  private async persist() {
    try {
      const urls = [...this.dirty]; this.dirty.clear();
      for (let i = 0; i < urls.length; i += 500) {
        const part = urls.slice(i, i + 500).filter(u => this.muniP.has(u));
        if (!part.length) continue;
        await pool.query(`insert into live_muni(url,p,at) select * from unnest($1::text[],$2::jsonb[],$3::bigint[]) on conflict (url) do update set p=excluded.p, at=excluded.at`,
          [part, part.map(u => JSON.stringify(this.muniP.get(u)!.p)), part.map(u => this.muniP.get(u)!.at)]);
      }
      for (const [k, arr] of this.series) {
        const from = this.serieSaved.get(k) ?? 0; if (arr.length <= from) continue;
        const [cargo, uf] = k.split('/');
        for (const pt of arr.slice(from)) await pool.query('insert into live_serie(cargo,uf,t,ponto) values ($1,$2,$3,$4) on conflict do nothing', [cargo, uf, pt.t, pt]);
        this.serieSaved.set(k, arr.length);
      }
    } catch (e) { console.error('persist', String(e)); }
  }
  pending = 0;
  private recordSeries() {
    const add = (cargo: Cargo, uf: string, snap: Snapshot) => {
      const k = `${cargo}/${uf}`, arr = this.series.get(k) ?? []; this.series.set(k, arr);
      const r = run(this, cargo, snap, uf, 150);
      if (r.pctEleitoresApurados <= 0) return;
      arr.push(seriePoint(this.t, r));
    };
    const p = this.snaps.get('presidente'); if (p) add('presidente', 'BR', p);
    for (const { uf } of UFS) for (const cg of ['governador', 'senador'] as const) { const s = this.snaps.get(`${cg}/${uf}`); if (s) add(cg, uf, s); }
  }
  private loop() {
    const every = +(process.env.POLL_MS ?? 45000);
    const tick = async () => { const t = Date.now(); try { await this.sweep(); } catch (e) { console.error('ciclo', e); } setTimeout(tick, Math.max(2000, every - (Date.now() - t))); };
    setTimeout(tick, every);
  }
  async get(cargo: Cargo, uf: string): Promise<Snapshot | null> { return this.snaps.get(cargo === 'presidente' ? 'presidente' : `${cargo}/${uf}`) ?? null; }
}
