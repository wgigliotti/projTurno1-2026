// Carrega a tabela municipio a partir da config do TSE (ele2026/6257). Uso: node scripts/01_municipio.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
mkdirSync('data',{recursive:true});
const r = await fetch('https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json',{headers:{'User-Agent':'Mozilla/5.0'}});
const j = await r.json();
const esc = s => '"' + String(s).replace(/"/g,'""') + '"';
const rows = [];
for (const u of j.abr) for (const m of u.mu) {
  rows.push([parseInt(m.cd,10), m.cdi ? parseInt(m.cdi,10) : '', u.cd.toUpperCase(), esc(m.nm), m.c==='s'?'t':'f', esc('{'+m.z.map(z=>parseInt(z,10)).join(',')+'}')].join(','));
}
writeFileSync('data/municipio.csv', rows.join('\n')+'\n');
writeFileSync('data/municipio.sql', `begin;
truncate eleitorado_2026;
delete from municipio;
\\copy municipio(cd_tse,cd_ibge,uf,nome,capital,zonas) from 'data/municipio.csv' csv
commit;
select uf='ZZ' as exterior, count(*), count(cd_ibge) from municipio group by 1;
`);
console.log(execFileSync('psql',[env.DATABASE_URL,'-v','ON_ERROR_STOP=1','-f','data/municipio.sql'],{encoding:'utf8'}));
