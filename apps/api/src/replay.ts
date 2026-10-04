import { loadHist, HistData, Replay } from './hist.js';
import { Cargo, CARGO_CODE, Snapshot, Source, SeriePoint } from './engine.js';

const QF: Record<Cargo, number> = { presidente: 0.9, governador: 0.88, senador: 0.82 };

/** Fonte de simulação: reproduz a chegada de seções de 2022 (prior = Presidente 2018). */
export class ReplaySource implements Source {
  fonte = 'replay' as const;
  private store = new Map<string, Promise<{ data: HistData; rp: Replay }>>();
  simT = 0; speed = 120; running = false; private timer?: NodeJS.Timeout; private lastReal = Date.now();
  tMin = 0; tMax = 0;
  seats = () => 1;
  qFallback = (c: Cargo) => QF[c];
  lastTSE = () => null;
  now() { return this.simT; }

  private key(cargo: Cargo, uf: string) { return cargo === 'presidente' ? 'presidente' : `${cargo}/${uf}`; }
  private load(cargo: Cargo, uf: string) {
    const k = this.key(cargo, uf);
    if (!this.store.has(k)) this.store.set(k, loadHist({ ano: 2022, cargo: CARGO_CODE[cargo], uf: cargo === 'presidente' ? null : uf, refAno: 2018, refNrL: 13, refNrR: 17, qFallback: QF[cargo] }).then(data => ({ data, rp: new Replay(data) })));
    return this.store.get(k)!;
  }
  async init() {
    const { data } = await this.load('presidente', 'BR');
    this.tMin = data.tMin; this.tMax = data.tMax + 5 * 60000;
    this.simT = this.tMin + 40 * 60000;
  }
  async get(cargo: Cargo, uf: string): Promise<Snapshot | null> { return this.getAt(cargo, uf, this.simT); }
  async getAt(cargo: Cargo, uf: string, t: number): Promise<Snapshot | null> {
    const { data, rp } = await this.load(cargo, uf);
    if (!data.cands.length) return null;
    return { cands: data.cands, munis: rp.advanceTo(t) };
  }
  // série: usa uma instância própria que só avança (evita resets do replay principal)
  private serieRp = new Map<string, Replay>(); private serieCache = new Map<string, Map<number, SeriePoint>>();
  async serieTimes(): Promise<number[]> {
    const out: number[] = []; for (let t = this.tMin + 15 * 60000; t <= this.simT; t += 15 * 60000) out.push(t); return out;
  }
  async serie(cargo: Cargo, uf: string, compute: (snap: Snapshot, t: number) => SeriePoint): Promise<SeriePoint[]> {
    const k = this.key(cargo, uf) + (cargo === 'presidente' ? '/' + uf : '');
    const { data } = await this.load(cargo, uf);
    let rp = this.serieRp.get(k); if (!rp) { rp = new Replay(data); this.serieRp.set(k, rp); }
    const cache = this.serieCache.get(k) ?? new Map(); this.serieCache.set(k, cache);
    for (const t of await this.serieTimes()) {
      if (cache.has(t)) continue;
      cache.set(t, compute({ cands: data.cands, munis: rp.advanceTo(t) }, t));
    }
    return [...cache.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).filter(p => p.pctApurado >= 0.002);   // sem trecho 'só prior'
  }
  start(speed?: number) {
    if (speed) this.speed = speed; this.running = true; this.lastReal = Date.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const d = Date.now() - this.lastReal; this.lastReal = Date.now();
      this.simT = Math.min(this.tMax, this.simT + d * this.speed); this.onTick?.();
      if (this.simT >= this.tMax) this.stop();
    }, 2000);
  }
  stop() { this.running = false; clearInterval(this.timer); }
  seek(t: number) { this.simT = Math.min(this.tMax, Math.max(this.tMin, t)); this.onTick?.(); }
  onTick?: () => void;
}
