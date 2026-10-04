import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from './db.js';
import { Cargo, CARGOS, Source, apiMapa, apiProjecao, iso, run, seriePoint } from './engine.js';
import { ReplaySource } from './replay.js';
import { LiveSource } from './live.js';
import { UFS } from './ufs.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import { agendarFotos, gravarFoto, historico, SLOT_MS } from './fotos.js';

const MODE = process.env.MODE ?? 'replay';
const src: Source = MODE === 'live' ? new LiveSource() : new ReplaySource();
const app = Fastify({ logger: false });
await app.register(cors, { origin: true });
await app.register((await import('@fastify/compress')).default, { threshold: 1024, encodings: ['gzip', 'br'] });
await app.register((await import('@fastify/rate-limit')).default, {
  max: +(process.env.RATE_MAX ?? 1200), timeWindow: '1 minute',
  keyGenerator: (req: any) => String(req.headers['cf-connecting-ip'] ?? req.ip),
  allowList: (req: any) => !req.url.startsWith('/api/'),            // só limita a API, não os arquivos estáticos
});
await (src as any).init();

const AVISO = 'Projeção não oficial, gerada por modelo estatístico. Resultado oficial: TSE (resultados.tse.jus.br).';
const cache = new Map<string, { k: string; v: any }>();
const memo = async <T>(key: string, stamp: string, f: () => Promise<T>): Promise<T> => {
  const c = cache.get(key); if (c && c.k === stamp) return c.v;
  const v = await f(); cache.set(key, { k: stamp, v }); return v;
};
const stampNow = () => String(Math.floor(src.now() / 30000)) + (src as any).version;
const okCargo = (c: string): c is Cargo => (CARGOS as string[]).includes(c);
const normUf = (cargo: Cargo, uf: string) => (cargo === 'presidente' && uf.toUpperCase() === 'BR' ? 'BR' : uf.toUpperCase());

app.get('/api/meta', async () => {
  const snap = await src.get('presidente', 'BR');
  let te = 0, est = 0, sa = 0, st = 0;
  for (const m of snap?.munis ?? []) { te += m.te; est += m.est; sa += m.secApur; st += m.secTotal; }
  return {
    fonte: src.fonte, relogio: iso(src.now()), ultimaAtualizacaoTSE: src.lastTSE(),
    pctEleitoresApurados: te ? est / te : 0, secoesApuradas: sa, secoesTotal: st, ufs: UFS,
    modelo: { versao: '0.1', aviso: AVISO }, replay: src.fonte === 'replay' ? { running: (src as ReplaySource).running, velocidade: (src as ReplaySource).speed } : undefined,
  };
});

app.get<{ Params: { cargo: string; uf: string } }>('/api/projecao/:cargo/:uf', async (req, rep) => {
  const { cargo } = req.params; if (!okCargo(cargo)) return rep.code(404).send({ erro: 'cargo' });
  const uf = normUf(cargo, req.params.uf);
  return memo(`p/${cargo}/${uf}`, stampNow(), async () => {
    const snap = await src.get(cargo, uf); if (!snap) return rep.code(404).send({ erro: 'sem dados' });
    return apiProjecao(cargo, uf, snap, run(src, cargo, snap, uf), src.now());
  });
});

app.get<{ Params: { cargo: string; uf: string }; Querystring: { nivel?: string } }>('/api/mapa/:cargo/:uf', async (req, rep) => {
  const { cargo } = req.params; if (!okCargo(cargo)) return rep.code(404).send({ erro: 'cargo' });
  const uf = normUf(cargo, req.params.uf), nivel = req.query.nivel === 'municipio' ? 'municipio' : 'uf';
  return memo(`m/${cargo}/${uf}/${nivel}`, stampNow(), async () => {
    const snap = await src.get(cargo, uf); if (!snap) return rep.code(404).send({ erro: 'sem dados' });
    // mapa de UFs do presidente usa o modelo nacional; mapa de municípios usa o modelo da UF
    const r = nivel === 'uf' ? run(src, cargo, snap, 'BR') : run(src, cargo, snap, uf);
    return apiMapa(snap, r, nivel, uf);
  });
});

app.get<{ Params: { cargo: string; uf: string } }>('/api/serie/:cargo/:uf', async (req, rep) => {
  const { cargo } = req.params; if (!okCargo(cargo)) return rep.code(404).send({ erro: 'cargo' });
  const uf = normUf(cargo, req.params.uf);
  return memo(`s/${cargo}/${uf}`, stampNow(), async () => {
    if (src.recordedSerie) return { pontos: src.recordedSerie(cargo, uf) };
    const rs = src as ReplaySource;
    const pontos = await rs.serie(cargo, uf, (snap, t) => seriePoint(t, run(src, cargo, snap, uf, 120)));
    return { pontos };
  });
});

// ---- histórico (fotos a cada 5 min) ----
const INICIO_FOTOS = Date.parse((process.env.FOTO_INICIO ?? '2026-10-04T17:05:00') + 'Z');   // hora de Brasília como 'naive UTC'
app.get('/api/historico/tudo', async () => ({ ...(await historico(src.fonte)), inicio: iso(INICIO_FOTOS), atualizadoEm: iso(src.now()) }));
app.get<{ Params: { cargo: string; uf: string } }>('/api/historico/:cargo/:uf', async (req, rep) => {
  const { cargo } = req.params; if (cargo !== 'presidente' && cargo !== 'governador') return rep.code(404).send({ erro: 'cargo' });
  const uf = normUf(cargo, req.params.uf);
  const h = await historico(src.fonte, cargo, uf, 8); return { ...h, inicio: iso(INICIO_FOTOS), serie: h.series[`${cargo}/${uf}`] ?? null };
});
if (process.env.ADMIN === '1') app.post('/api/foto/agora', async () => gravarFoto(src, Math.floor(src.now() / SLOT_MS) * SLOT_MS, 0));   // manual (teste)

// ---- SSE ----
const clients = new Set<any>();
app.get('/api/stream', (req, rep) => {
  if (clients.size >= +(process.env.SSE_MAX ?? 400)) return rep.code(503).send({ erro: 'muitos clientes ao vivo; o painel usa atualização periódica' });
  rep.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  rep.raw.write('retry: 5000\n\n'); clients.add(rep.raw);
  req.raw.on('close', () => clients.delete(rep.raw));
});
const broadcast = async () => {
  const m = await (app.inject({ url: '/api/meta' }).then(r => r.json()));
  for (const c of clients) c.write(`event: update\ndata: ${JSON.stringify({ relogio: m.relogio, pctEleitoresApurados: m.pctEleitoresApurados })}\n\n`);
};
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);
(src as any).onTick = broadcast;

// ---- controles do replay (dev) ----
if (src.fonte === 'replay') {
  const rs = src as ReplaySource;
  app.post<{ Body: { velocidade?: number } }>('/api/replay/start', async req => { rs.start(req.body?.velocidade); return { ok: true }; });
  app.post<{ Body: { t: string } }>('/api/replay/seek', async req => {
    // t aceita "2022-10-02T19:30:00-03:00" -> hora local tratada como "naive UTC"
    rs.seek(Date.parse(req.body.t.slice(0, 19) + 'Z')); return { ok: true, relogio: iso(rs.simT) };
  });
  app.post('/api/replay/stop', async () => { rs.stop(); return { ok: true }; });
}
// ---- site compilado (apps/web/dist) servido pela própria API: uma porta só (ex.: p/ túnel) ----
const DIST = path.join(ROOT, 'apps/web/dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  await app.register((await import('@fastify/static')).default, {
    root: DIST, wildcard: false,
    setHeaders: (res: any, p: string) => res.setHeader('Cache-Control', /\/assets\//.test(p) ? 'public, max-age=31536000, immutable' : /\/geo\//.test(p) ? 'public, max-age=3600' : 'no-cache'),
  });
  app.setNotFoundHandler((req, rep) => {
    if (req.url.startsWith('/api/')) return rep.code(404).send({ erro: 'não encontrado' });
    return rep.header('Cache-Control', 'no-cache').type('text/html').send(fs.readFileSync(path.join(DIST, 'index.html')));
  });
  console.log('servindo o site compilado de', DIST);
}
const port = +(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API ${MODE} em http://localhost:${port}`);
if (src.fonte === 'replay') (src as ReplaySource).start(+(process.env.SPEED ?? 120));
// fotos: ao vivo sempre; replay só com FOTO_REPLAY=1 (p/ desenvolver a tela)
if (src.fonte === 'live' || process.env.FOTO_REPLAY === '1') {
  const inicio = src.fonte === 'replay' ? 0 : INICIO_FOTOS;
  agendarFotos(src, inicio, () => (src.fonte === 'live' ? Math.round((Date.now() - 3 * 3600e3 - src.now()) / 1000) : 0));
}
void pool;
