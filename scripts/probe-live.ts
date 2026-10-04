import { pool } from '../apps/api/src/db.js';
const { rows } = await pool.query('select cd_tse id, uf from municipio');
const st: Record<string, number> = {}; let ts = 0, i = 0;
const conc = +(process.argv[2] ?? 48);
const w = async () => { while (i < rows.length) { const m = rows[i++]; const l = m.uf.toLowerCase();
  const u = `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/${l}/${l}${String(m.id).padStart(5, '0')}-c0001-e006257-u.json`;
  try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); st[r.status] = (st[r.status] || 0) + 1; if (r.ok) { const d: any = await r.json(); ts += +d.s.ts; } else await r.arrayBuffer(); } catch (e) { st['err'] = (st['err'] || 0) + 1; } } };
rows.length = +(process.argv[3] ?? rows.length); const t0 = Date.now(); await Promise.all(Array.from({ length: conc }, w));
console.log(st, 'secoes', ts, Date.now() - t0, 'ms'); await pool.end();
