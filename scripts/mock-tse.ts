// "TSE falso" p/ ensaio: serve os dados de 2022 (replay) no formato -u.json de 2026.
// uso: PORT=4000 SPEED=300 npx tsx scripts/mock-tse.ts   e   TSE_BASE=http://localhost:4000/oficial/ele2026 MODE=live npm run start -w @eleicao/api
import Fastify from 'fastify';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadHist, HistData, Replay } from '../apps/api/src/hist.js';
import { UFS } from '../apps/api/src/ufs.js';

const CODE: Record<string, number> = { '1': 1, '3': 3, '5': 5 };
const cands26: any[] = JSON.parse(fs.readFileSync('data/candidatos-2026.json', 'utf8'));
const speed = +(process.env.SPEED ?? 300), port = +(process.env.PORT ?? 4000);
const RATE = +(process.env.RATE_LIMIT_RPS ?? 0);       // >0: devolve 429 acima desse rps (teste de backoff)
const store = new Map<string, Promise<{ data: HistData; rp: Replay; map: Map<number, number> }>>();
const key = (cg: number, uf: string) => (cg === 1 ? 'p' : `${cg}/${uf}`);
function load(cg: number, uf: string) {
  const k = key(cg, uf);
  if (!store.has(k)) store.set(k, (async () => {
    const data = await loadHist({ ano: 2022, cargo: cg, uf: cg === 1 ? null : uf, refAno: 2018, refNrL: 13, refNrR: 17, qFallback: 0.9 });
    const rp = new Replay(data); const fin = rp.advanceTo(data.tMax + 36e5); rp.reset();
    const tot = new Map<number, number>(); for (const m of fin) for (const [n, v] of Object.entries(m.votos)) tot.set(+n, (tot.get(+n) || 0) + v);
    const rank = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const c26 = cands26.filter(c => c.cargo === cg && (cg === 1 || c.uf === uf.toUpperCase()));
    const map = new Map<number, number>();                     // nr2022 -> nr2026
    if (cg === 1) { map.set(13, 13); map.set(22, 22); const rest26 = c26.filter(c => c.nr !== 13 && c.nr !== 22).map(c => c.nr); rank.filter(n => n !== 13 && n !== 22).forEach((n, i) => { if (rest26[i] !== undefined) map.set(n, rest26[i]); }); }
    else rank.forEach((n, i) => { if (c26[i]) map.set(n, c26[i].nr); });
    return { data, rp, map };
  })());
  return store.get(k)!;
}
let tMin = 0, tMax = 0, simT = 0, last = Date.now();
setInterval(() => { const d = Date.now() - last; last = Date.now(); simT = Math.min(tMax, simT + d * speed); }, 1000);

const app = Fastify();
const hits: number[] = [];
app.addHook('onRequest', async (req, rep) => {
  if (!RATE) return; const now = Date.now(); hits.push(now); while (hits.length && hits[0] < now - 1000) hits.shift();
  if (hits.length > RATE) return rep.code(429).send({ erro: 'rate' });
});
app.post('/ctl/seek', async req => { simT = Date.parse(((req.body as any).t as string).slice(0, 19) + 'Z'); return { simT: new Date(simT).toISOString() }; });
app.get('/ctl/state', async () => ({ simT: new Date(simT).toISOString() }));

app.get<{ Params: { ele: string; uf: string; file: string } }>('/oficial/ele2026/:ele/dados/:uf/:file', async (req, rep) => {
  const m = /^([a-z]{2})(\d{5})?-c000(\d)-e\d+-u\.json$/.exec(req.params.file);
  if (!m) return rep.code(404).send();
  const uf = m[1].toUpperCase(), cd = m[2] ? +m[2] : null, cg = +m[3];
  if (!CODE[m[3]]) return rep.code(404).send();
  const { data, rp, map } = await load(cg, uf);
  let ms = rp.advanceTo(simT).filter(x => cg === 1 ? x.uf === uf : true);
  if (cd !== null) ms = ms.filter(x => x.id === cd);
  if (!ms.length) return rep.code(404).send();
  const sum = (f: (x: any) => number) => ms.reduce((a, x) => a + f(x), 0);
  const votos: Record<number, number> = {};
  for (const x of ms) for (const [n, v] of Object.entries(x.votos)) { const t = map.get(+n); if (t !== undefined) votos[t] = (votos[t] || 0) + v; }
  const nom = Object.values(votos).reduce((a, b) => a + b, 0);
  const t = new Date(simT); const hg = t.toISOString().slice(11, 19), dg = t.toISOString().slice(0, 10).split('-').reverse().join('/');
  const cand = cands26.filter(c => c.cargo === cg && (cg === 1 || c.uf === uf));
  const body = {
    ele: req.params.ele, t: '1', f: 'o', tpabr: cd === null ? 'uf' : 'mu', cdabr: cd === null ? uf.toLowerCase() : String(cd).padStart(5, '0'), dg, hg, idg: '1',
    s: { ts: String(sum(x => x.secTotal)), st: String(sum(x => x.secApur)) },
    e: { te: String(sum(x => x.te)), est: String(sum(x => x.est)), c: String(sum(x => x.c)) },
    v: { vnom: String(nom), vb: String(sum(x => x.brancos)), vn: String(sum(x => x.nulos)), vv: String(nom), tv: String(nom + sum(x => x.brancos) + sum(x => x.nulos)) },
    carg: [{ cd: String(cg), agr: [{ par: cand.map(c => ({ sg: c.partido, cand: [{ n: String(c.nr), nmu: c.nome, vap: String(votos[c.nr] || 0) }] })) }] }],
  };
  const txt = JSON.stringify(body), etag = '"' + crypto.createHash('md5').update(txt).digest('hex') + '"';
  if (req.headers['if-none-match'] === etag) return rep.code(304).send();
  return rep.header('etag', etag).header('content-type', 'application/json').send(txt);
});

const d0 = await load(1, 'BR'); tMin = d0.data.tMin; tMax = d0.data.tMax + 3e5; simT = tMin + (+(process.env.START_MIN ?? 100)) * 60000;
await app.listen({ port, host: '127.0.0.1' }); console.log(`TSE falso em :${port}, simT=${new Date(simT).toISOString()} x${speed}`);
void UFS;
