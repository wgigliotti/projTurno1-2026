// ETL Presidente 1o turno 2018 -> resultado_mun_hist + candidato_hist. Idempotente. Uso: node scripts/etl-2018.mjs
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, rmSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const B = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const SRC = {
  vot: [`${B}/votacao_candidato_munzona/votacao_candidato_munzona_2018.zip`, 'data/vot18.zip', 'votacao_candidato_munzona_2018_BR.csv'],
  det: [`${B}/detalhe_votacao_munzona/detalhe_votacao_munzona_2018.zip`, 'data/det18.zip', 'detalhe_votacao_munzona_2018_BR.csv'],
};
mkdirSync('data', { recursive: true });
for (const [url, zip] of Object.values(SRC))
  if (!existsSync(zip)) execFileSync('curl', ['-sfL', '-A', 'Mozilla/5.0', '-o', zip, url], { stdio: 'inherit' });

async function* rows(zip, entry) {
  const unz = spawn('unzip', ['-p', zip, entry]);
  const rl = createInterface({ input: unz.stdout.setEncoding('latin1'), crlfDelay: Infinity });
  let h = null;
  for await (const line of rl) {
    const f = line.split(';').map(s => s.replace(/^"|"$/g, ''));
    if (!h) { h = Object.fromEntries(f.map((n, i) => [n, i])); continue; }
    yield new Proxy(f, { get: (t, k) => t[h[k]] });
  }
}
const n = x => parseInt(x, 10) || 0;
const votos = new Map(), cand = new Map(), det = new Map();
for await (const r of rows(...SRC.vot.slice(1))) {
  if (r.DS_CARGO !== 'Presidente' || r.NR_TURNO !== '1') continue;
  const k = `${r.SG_UF}|${n(r.CD_MUNICIPIO)}|${n(r.NR_CANDIDATO)}`;
  votos.set(k, (votos.get(k) || 0) + n(r.QT_VOTOS_NOMINAIS));
  cand.set(n(r.NR_CANDIDATO), [r.NM_URNA_CANDIDATO, r.SG_PARTIDO]);
}
for await (const r of rows(...SRC.det.slice(1))) {
  if (r.DS_CARGO !== 'Presidente' || r.NR_TURNO !== '1') continue;
  const k = `${r.SG_UF}|${n(r.CD_MUNICIPIO)}`;
  const d = det.get(k) || [0, 0, 0, 0];
  d[0] += n(r.QT_APTOS); d[1] += n(r.QT_COMPARECIMENTO); d[2] += n(r.QT_VOTOS_BRANCOS); d[3] += n(r.QT_VOTOS_NULOS);
  det.set(k, d);
}
const out = [];
let semDet = 0;
for (const [k, v] of votos) {
  const [uf, mun, nr] = k.split('|');
  const d = det.get(`${uf}|${mun}`) || (semDet++, ['', '', '', '']);
  out.push([2018, 1, 1, uf, mun, nr, v, ...d].join('\t'));
}
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const sql = `begin;
delete from resultado_mun_hist where ano=2018 and turno=1 and cargo=1;
delete from candidato_hist where ano=2018 and turno=1 and cargo=1;
${[...cand].map(([nr, [nm, p]]) => `insert into candidato_hist(ano,turno,cargo,uf,nr_votavel,nome,sg_partido) values (2018,1,1,'BR',${nr},${q(nm)},${q(p)});`).join('\n')}
copy resultado_mun_hist(ano,turno,cargo,uf,cd_mun,nr_votavel,votos,aptos,comparec,brancos,nulos) from stdin;
${out.join('\n')}
\\.
commit;
`;
const p = spawn('psql', [env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q'], { stdio: ['pipe', 'inherit', 'inherit'] });
p.stdin.end(sql);
await new Promise((res, rej) => p.on('close', c => c ? rej(new Error('psql ' + c)) : res()));
console.log(`linhas=${out.length} candidatos=${cand.size} municipios_sem_detalhe=${semDet}`);
if (!process.env.KEEP) for (const [, zip] of Object.values(SRC)) rmSync(zip, { force: true });
