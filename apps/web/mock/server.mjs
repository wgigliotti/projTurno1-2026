// Mock da API (contrato em docs/API.md). Sem dependências. `npm run mock` (porta 3001).
// Dados FICTÍCIOS. A cada ~5s o % apurado sobe e as projeções variam; emite SSE em /api/stream.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3001);
const TICK_MS = Number(process.env.TICK_MS || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO_DIR = path.join(__dirname, '..', 'public', 'geo');

// uf, nome, região, código IBGE, eleitorado (milhões, aprox.)
const UFS = [
  ['AC','Acre','Norte',12,0.60],['AL','Alagoas','Nordeste',27,2.3],['AP','Amapá','Norte',16,0.55],
  ['AM','Amazonas','Norte',13,2.7],['BA','Bahia','Nordeste',29,11.0],['CE','Ceará','Nordeste',23,6.7],
  ['DF','Distrito Federal','Centro-Oeste',53,2.2],['ES','Espírito Santo','Sudeste',32,3.0],
  ['GO','Goiás','Centro-Oeste',52,4.9],['MA','Maranhão','Nordeste',21,5.0],['MT','Mato Grosso','Centro-Oeste',51,2.6],
  ['MS','Mato Grosso do Sul','Centro-Oeste',50,2.0],['MG','Minas Gerais','Sudeste',31,16.3],['PA','Pará','Norte',15,6.1],
  ['PB','Paraíba','Nordeste',25,3.1],['PR','Paraná','Sul',41,8.5],['PE','Pernambuco','Nordeste',26,6.9],
  ['PI','Piauí','Nordeste',22,2.5],['RJ','Rio de Janeiro','Sudeste',33,12.5],['RN','Rio Grande do Norte','Nordeste',24,2.5],
  ['RS','Rio Grande do Sul','Sul',43,8.5],['RO','Rondônia','Norte',11,1.2],['RR','Roraima','Norte',14,0.38],
  ['SC','Santa Catarina','Sul',42,5.5],['SP','São Paulo','Sudeste',35,34.6],['SE','Sergipe','Nordeste',28,1.7],
  ['TO','Tocantins','Norte',17,1.1],
].map(([uf, nome, regiao, cod, eleitorado]) => ({ uf, nome, regiao, cod, eleitorado }));
const UF_BY = Object.fromEntries(UFS.map((u) => [u.uf, u]));
const TOTAL_ELEITORES = UFS.reduce((a, u) => a + u.eleitorado, 0);

// ---------- util ----------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function rng(seed) { let s = Math.floor(seed * 4294967296) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function iso(d) { // ISO com offset -03:00
  const t = new Date(d.getTime() - 3 * 3600e3);
  return t.toISOString().replace('Z', '-03:00').replace(/\.\d+/, '');
}

// ---------- candidatos ----------
const PRES = [
  { nr: 13, nome: 'ANA RIBEIRO', partido: 'PT', campo: 'lula', cor: '#e0443a' },
  { nr: 22, nome: 'CARLOS MENDONÇA', partido: 'PL', campo: 'bolsonaro', cor: '#3b82f6' },
  { nr: 12, nome: 'HELENA DUARTE', partido: 'PDT', campo: 'outros', cor: '#b58cf0' },
  { nr: 45, nome: 'ROBERTO FARIAS', partido: 'PSDB', campo: 'outros', cor: '#35c2a8' },
  { nr: 30, nome: 'PAULO NEVES', partido: 'NOVO', campo: 'outros', cor: '#e08ab4' },
];
const NOMES = ['MARCELO TAVARES','JULIANA PRADO','FERNANDO LIMA','CAMILA ROCHA','ANTÔNIO BRAGA','LUCIANA SOARES','RICARDO PIRES','TEREZA ANDRADE','EDUARDO CAMPOS','BEATRIZ NOGUEIRA','OSVALDO REIS','PATRÍCIA MOURA','GILBERTO SANTANA','VERA LÚCIA FREITAS'];
const PARTIDOS = [['PT',13],['PL',22],['MDB',15],['PSD',55],['UNIÃO',44],['PP',11],['PSB',40],['REPUBLICANOS',10],['PSOL',50],['PODE',20]];
function candsFor(cargo, uf) {
  if (cargo === 'presidente') return PRES;
  const r = rng(hash(cargo + uf));
  const n = cargo === 'governador' ? 4 : 5;
  const used = new Set(); const out = [];
  const camp = ['lula', 'bolsonaro'];
  while (out.length < n) {
    const pi = Math.floor(r() * PARTIDOS.length); if (used.has(pi)) continue; used.add(pi);
    const [p, nrBase] = PARTIDOS[pi]; const i = out.length;
    const nome = NOMES[Math.floor(r() * NOMES.length)];
    if (out.some((c) => c.nome === nome)) continue;
    const campo = i < 2 ? camp[i] : 'outros';
    const cor = i === 0 ? '#e0443a' : i === 1 ? '#3b82f6' : ['#b58cf0', '#35c2a8', '#e08ab4'][i - 2];
    const nr = cargo === 'governador' ? nrBase * 1000 / 1000 * 1 + 0 : nrBase * 100 + Math.floor(r() * 90 + 10);
    out.push({ nr: cargo === 'governador' ? nrBase : nr, nome, partido: p, campo, cor });
  }
  return out;
}

// ---------- verdade (resultado final fictício) ----------
const truthCache = new Map();
function truth(cargo, uf) {
  const key = cargo + uf; if (truthCache.has(key)) return truthCache.get(key);
  const cands = candsFor(cargo, uf);
  let w;
  if (cargo === 'presidente' && uf === 'BR') {
    const acc = cands.map(() => 0);
    for (const u of UFS) { const t = truth('presidente', u.uf); t.w.forEach((x, i) => (acc[i] += x * u.eleitorado)); }
    w = acc.map((x) => x / TOTAL_ELEITORES);
  } else {
    const r = rng(hash('t' + key));
    if (cargo === 'presidente') {
      const base = { Nordeste: 0.58, Norte: 0.47, Sudeste: 0.41, Sul: 0.33, 'Centro-Oeste': 0.34 }[UF_BY[uf].regiao];
      const others = [0.09 + r() * 0.04, 0.04 + r() * 0.02, 0.02 + r() * 0.015];
      const so = others.reduce((a, b) => a + b, 0);
      const lula = clamp(base + (r() - 0.5) * 0.10, 0.2, 0.75) * (1 - so) / 0.95;
      w = [lula, 1 - so - lula, ...others];
    } else {
      const raw = cands.map((_, i) => (i < 2 ? 1.6 : 0.7) * (0.4 + r()));
      const s = raw.reduce((a, b) => a + b, 0); w = raw.map((x) => x / s);
      if (cargo === 'senador') { /* ok */ }
    }
  }
  const bias = w.map((_, i) => (hash(key + 'b' + i) - 0.5) * 0.20);
  const mb = bias.reduce((a, b) => a + b, 0) / bias.length; const b2 = bias.map((b) => b - mb);
  const t = { cands, w, bias: b2 }; truthCache.set(key, t); return t;
}

// ---------- estado global ----------
let P = 0.30, hold = 0, mode = process.env.MOCK_FONTE === 'replay' ? 'replay' : 'live';
let lastTick = new Date(), tickN = 0;
let history = [];
function resetHistory(p0) { history = []; const n = 22; for (let i = 0; i <= n; i++) history.push({ t: new Date(Date.now() - (n - i) * 180e3), p: p0 * (i / n) * (0.5 + 0.5 * i / n) + 0.015 * (i / n) }); P = history[history.length - 1].p; }
resetHistory(0.30);
function tick() {
  if (P >= 0.999) { if (++hold > 6) { resetHistory(0.06); hold = 0; } else P = 1; }
  else P = Math.min(1, P + 0.010 + Math.random() * 0.014);
  tickN++; lastTick = new Date(); history.push({ t: lastTick, p: P }); if (history.length > 400) history.shift();
  for (const res of clients) res.write(`event: update\ndata: ${JSON.stringify({ relogio: iso(new Date()), pctEleitoresApurados: P })}\n\n`);
  cache.clear();
}
const pUf = (uf, p) => (uf === 'BR' ? p : clamp(p * (0.72 + 0.5 * hash('p' + uf)) + (p > 0.9 ? (p - 0.9) * 2 : 0), 0, 1));
const sigma = (p) => 0.05 * Math.pow(1 - p, 0.9) + 0.0015;

// projeção dos shares (válidos) no progresso p
function shares(cargo, uf, p, tweak = 0) {
  const t = truth(cargo, uf);
  const f = Math.pow(1 - p, 1.4) * 1.4;
  const proj = t.w.map((x, i) => Math.max(0.005, x + t.bias[i] * f + tweak * (hash(uf + i + "w") - 0.5) * 0.0004 * Math.sin(tweak)));
  const s = proj.reduce((a, b) => a + b, 0); const sp = proj.map((x) => x / s);
  const ap = t.w.map((x, i) => Math.max(0.003, x + t.bias[i] * (1 - p) * 2.4)); const sa = ap.reduce((a, b) => a + b, 0);
  return { cands: t.cands, proj: sp, apur: ap.map((x) => x / sa), sig: sigma(p) };
}
function mc(cargo, uf, S, n = 500) {
  const r = rng(hash(cargo + uf) + Math.round(S.proj[0] * 1e4) / 1e5);
  const k = S.proj.length; const win = Array(k).fill(0), top2 = Array(k).fill(0), seg = Array(k).fill(0); let segTot = 0;
  for (let it = 0; it < n; it++) {
    const common = gauss(r);
    let v = S.proj.map((x, i) => Math.max(0.001, x + S.sig * (0.8 * gauss(r) + (i === 0 ? 0.6 : i === 1 ? -0.6 : 0) * common)));
    const s = v.reduce((a, b) => a + b, 0); v = v.map((x) => x / s);
    const order = v.map((x, i) => i).sort((a, b) => v[b] - v[a]);
    if (v[order[0]] > 0.5) win[order[0]]++; else { segTot++; seg[order[0]]++; seg[order[1]]++; }
    top2[order[0]]++; top2[order[1]]++;
  }
  return { win: win.map((x) => x / n), seg: seg.map((x) => x / n), top2: top2.map((x) => x / n), segTot: segTot / n };
}

const cache = new Map();
function projecao(cargo, uf) {
  const key = `p:${cargo}:${uf}`; if (cache.has(key)) return cache.get(key);
  const p = pUf(uf, P); const S = shares(cargo, uf, p, (tickN % 997));
  const M = mc(cargo, uf, S);
  const eleitores = uf === 'BR' ? TOTAL_ELEITORES : UF_BY[uf].eleitorado;
  const validos = eleitores * 1e6 * 0.79 * 0.91;
  const secTotal = uf === 'BR' ? 499248 : Math.round(eleitores * 1e6 / 300);
  const order = S.proj.map((_, i) => i).sort((a, b) => S.proj[b] - S.proj[a]);
  const candidatos = order.map((i) => {
    const c = S.cands[i]; const sg = S.sig;
    return {
      nr: c.nr, nome: c.nome, partido: c.partido, campo: c.campo, cor: c.cor,
      votosApurados: Math.round(S.apur[i] * validos * p), pctApurado: S.apur[i],
      pctProjetado: S.proj[i], ic90: [Math.max(0, S.proj[i] - 1.645 * sg), Math.min(1, S.proj[i] + 1.645 * sg)],
      votosProjetados: Math.round(S.proj[i] * validos),
      probVitoria1Turno: cargo === 'senador' ? 0 : M.win[i],
      probSegundoTurno: cargo === 'senador' ? 0 : M.seg[i],
      probEleito: cargo === 'senador' ? M.top2[i] : null,
    };
  });
  let decisao = null;
  if (cargo !== 'senador') {
    const pairs = new Map(); const r = rng(hash('pr' + cargo + uf + Math.round(p * 100)));
    const a = order[0], b = order[1], c = order[2];
    const pab = Math.min(0.97, M.seg[a] * M.seg[b] + 0.02);
    const pac = Math.max(0, M.seg[a] * M.seg[c] * 0.9), pbc = Math.max(0, M.seg[b] * M.seg[c] * 0.9);
    const tot = pab + pac + pbc || 1;
    pairs.set([S.cands[a].nr, S.cands[b].nr], pab / tot); pairs.set([S.cands[a].nr, S.cands[c].nr], pac / tot); pairs.set([S.cands[b].nr, S.cands[c].nr], pbc / tot);
    void r;
    decisao = {
      tipo: cargo === 'presidente' ? 'maioria_absoluta' : 'maioria_absoluta',
      probSegundoTurno: M.segTot, probDecididoNo1Turno: 1 - M.segTot,
      confrontosProvaveis: [...pairs.entries()].filter(([, v]) => v > 0.005).sort((x, y) => y[1] - x[1]).map(([nrs, v]) => ({ nrs, prob: v * M.segTot })),
    };
  }
  const out = {
    cargo, uf, atualizadoEm: iso(lastTick), pctEleitoresApurados: p,
    secoesApuradas: Math.round(secTotal * p), secoesTotal: secTotal,
    comparecimento: { apurado: 0.775 + (hash(uf) - 0.5) * 0.04, projetado: 0.789 + (hash(uf) - 0.5) * 0.03 },
    candidatos, decisao, branco_nulo: { brancosApurado: 0.021 + hash(uf) * 0.01, nulosApurado: 0.043 + hash(uf + 'n') * 0.015 },
  };
  cache.set(key, out); return out;
}

function serie(cargo, uf) {
  const pontos = history.map(({ t, p }) => {
    const pp = pUf(uf, p); const S = shares(cargo, uf, pp, 0);
    const cand = {};
    S.cands.forEach((c, i) => { cand[c.nr] = { p: S.proj[i], lo: Math.max(0, S.proj[i] - 1.645 * S.sig), hi: Math.min(1, S.proj[i] + 1.645 * S.sig), apurado: S.apur[i] }; });
    return { t: iso(t), pctApurado: pp, cand };
  });
  return { pontos };
}

// ---------- geografia ----------
let muniCache = { mtime: 0, byUf: null };
function municipios() {
  const f = path.join(GEO_DIR, 'municipios.geojson');
  try {
    const st = fs.statSync(f);
    if (muniCache.mtime !== st.mtimeMs) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); const byUf = {};
      for (const ft of j.features) { const p = ft.properties; (byUf[p.uf] ||= []).push({ id: String(p.cd_ibge), nome: p.nome }); }
      muniCache = { mtime: st.mtimeMs, byUf };
    }
    return muniCache.byUf;
  } catch {
    if (!muniCache.fake) {
      muniCache.fake = {};
      for (const u of UFS) muniCache.fake[u.uf] = Array.from({ length: 40 }, (_, i) => ({ id: String(u.cod * 100000 + 1000 + i * 37).padEnd(7, '0').slice(0, 7), nome: `${u.nome} ${i + 1}` }));
    }
    return muniCache.fake;
  }
}
function unidade(cargo, id, nome, cands, w, p, noiseKey) {
  const t = truth(cargo, cargo === 'presidente' ? 'BR' : 'BR');
  void t;
  return { id, nome, w, p, noiseKey, cands };
}
function mapa(cargo, uf, nivel) {
  const key = `m:${cargo}:${uf}:${nivel}`; if (cache.has(key)) return cache.get(key);
  let out;
  const build = (id, nome, cdIbge, S, p) => {
    const order = S.proj.map((_, i) => i).sort((a, b) => S.proj[b] - S.proj[a]);
    const shs = {}; S.cands.forEach((c, i) => (shs[c.nr] = S.proj[i]));
    return { id, cdIbge, nome, pctApurado: p, lider: S.cands[order[0]].nr, liderProjetado: S.cands[order[0]].nr, margem: S.proj[order[0]] - S.proj[order[1]], shares: shs, tipo: p >= 0.99 ? 'apurado' : 'projetado' };
  };
  if (nivel === 'uf') {
    const unidades = UFS.map((u) => { const p = pUf(u.uf, P); return build(u.uf, u.nome, null, shares('presidente', u.uf, p, (tickN % 997)), p); });
    const p = clamp(P * 0.9, 0, 1); const S = shares('presidente', 'BR', p);
    // exterior pende para um dos lados
    const ext = { ...S, proj: S.proj.map((x, i) => (i === 0 ? x * 0.75 : i === 1 ? x * 1.35 : x)) }; const s = ext.proj.reduce((a, b) => a + b, 0); ext.proj = ext.proj.map((x) => x / s);
    const e = build('ZZ', 'Exterior', null, ext, p); delete e.cdIbge; delete e.tipo;
    out = { nivel: 'uf', unidades, exterior: { id: 'ZZ', nome: 'Exterior', pctApurado: e.pctApurado, lider: e.lider, margem: e.margem, shares: e.shares } };
  } else {
    const T = truth(cargo, uf); const base = pUf(uf, P);
    const list = (municipios()[uf] || []);
    const unidades = list.map((m) => {
      const r = rng(hash(m.id)); const tilt = T.w.map((_, i) => (r() - 0.5) * 0.30 * (i < 2 ? 1 : 0.4));
      const p = clamp(base + (hash(m.id + 'p') - 0.5) * 0.6, 0, 1);
      const f = Math.pow(1 - p, 1.4) * 1.4;
      let v = T.w.map((x, i) => Math.max(0.004, x + tilt[i] * x + T.bias[i] * f * 1.5));
      const s = v.reduce((a, b) => a + b, 0); v = v.map((x) => x / s);
      return build(m.id, m.nome, m.id, { cands: T.cands, proj: v }, p);
    });
    out = { nivel: 'municipio', unidades };
  }
  cache.set(key, out); return out;
}

function meta() {
  return {
    fonte: mode, relogio: iso(new Date()), ultimaAtualizacaoTSE: iso(new Date(lastTick.getTime() - 9000)),
    pctEleitoresApurados: P, secoesApuradas: Math.round(499248 * P), secoesTotal: 499248,
    ufs: UFS.map(({ uf, nome, regiao }) => ({ uf, nome, regiao })),
    modelo: { versao: 'mock-0.1', aviso: 'Projeção não oficial. Resultado oficial: TSE (DADOS FICTÍCIOS DO MOCK)' },
  };
}

// ---------- servidor ----------
const clients = new Set();
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
const CARGOS = ['presidente', 'governador', 'senador'];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
  if (parts[0] !== 'api') return send(res, 404, { erro: 'não encontrado' });
  if (process.env.MOCK_DELAY) { /* latência opcional */ }
  const [, ep, a, b] = parts;
  if (ep === 'stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write(`event: update\ndata: ${JSON.stringify({ relogio: iso(new Date()), pctEleitoresApurados: P })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (ep === 'meta') return send(res, 200, meta());
  if (ep === 'replay' && req.method === 'POST') { mode = a === 'stop' ? 'live' : 'replay'; if (a === 'seek') { P = 0.5; } return send(res, 200, { ok: true, fonte: mode }); }
  if (['projecao', 'serie', 'mapa'].includes(ep)) {
    const cargo = a, uf = (b || '').toUpperCase();
    if (!CARGOS.includes(cargo)) return send(res, 400, { erro: 'cargo inválido' });
    if (cargo === 'presidente' ? !(uf === 'BR' || UF_BY[uf]) : !UF_BY[uf]) return send(res, 400, { erro: 'uf inválida' });
    if (ep === 'projecao') return send(res, 200, projecao(cargo, uf));
    if (ep === 'serie') return send(res, 200, serie(cargo, uf));
    const nivel = url.searchParams.get('nivel') || (uf === 'BR' ? 'uf' : 'municipio');
    return send(res, 200, mapa(cargo, uf, nivel));
  }
  send(res, 404, { erro: 'não encontrado' });
});
setInterval(tick, TICK_MS);
setInterval(() => { for (const r of clients) r.write(': ka\n\n'); }, 15000);
server.listen(PORT, () => console.log(`mock API em http://localhost:${PORT} (tick ${TICK_MS}ms)`));
