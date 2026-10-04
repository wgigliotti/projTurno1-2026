// Gera apps/web/public/geo/{municipios,uf}.geojson, uf-labels.json, bbox.json a partir da malha IBGE (API v3, qualidade intermediaria) + tabela municipio.
// Uso: node scripts/03_geo.mjs   (requer npx mapshaper e psql)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const out='apps/web/public/geo'; mkdirSync(out,{recursive:true}); mkdirSync('data',{recursive:true});
const get = async (u) => { for (let i=0;i<5;i++) { try { const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(120000)}); if(r.ok) return await r.json(); } catch(e){} await new Promise(r=>setTimeout(r,3000)); } throw new Error('falha '+u); };
const malha = await get('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=intermediaria&formato=application/vnd.geo+json');
const loc = await get('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
const nomes = new Map(loc.map(l=>[String(l.id), {nome:l.nome, uf:l['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ?? l.microrregiao?.mesorregiao?.UF?.sigla}]));
const db = execFileSync('psql',[env.DATABASE_URL,'-At','-F','|','-c',"select cd_ibge,cd_tse,uf,nome from municipio where cd_ibge is not null"],{encoding:'utf8'}).trim().split('\n').map(l=>l.split('|'));
const mun = new Map(db.map(([i,t,u,n])=>[i,{cd_tse:+t,uf:u,nome:n}]));
let semTse=[]; const seen=new Set();
for (const f of malha.features) {
  const id=f.properties.codarea; seen.add(id); const m=mun.get(id), l=nomes.get(id);
  if(!m) semTse.push(id+' '+(l?.nome??'?'));
  f.properties={cd_ibge:id, cd_tse:m?.cd_tse??null, uf:m?.uf??l?.uf??null, nome:l?.nome??m?.nome??null};
}
const semGeo=[...mun].filter(([i])=>!seen.has(i)).map(([i,m])=>i+' '+m.uf+' '+m.nome);
writeFileSync('data/mun_raw.geojson',JSON.stringify(malha));
const ms=(...a)=>execFileSync('npx',['--yes','mapshaper',...a],{stdio:'inherit'});
ms('data/mun_raw.geojson','-simplify','25%','keep-shapes','-o',out+'/municipios.geojson','format=geojson','precision=0.001');
ms('data/mun_raw.geojson','-dissolve','uf','copy-fields=uf','-simplify','25%','keep-shapes','-o',out+'/uf.geojson','format=geojson','precision=0.001');
const uf=JSON.parse(readFileSync(out+'/uf.geojson'));
const labels={}, bbox={};
const poly = g => g.type==='Polygon'?[g.coordinates]:g.coordinates;
for (const f of uf.features) {
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9, best=null, ba=-1;
  for (const p of poly(f.geometry)) { let a=0,cx=0,cy=0; const r=p[0];
    for (const [x,y] of r){ mnx=Math.min(mnx,x);mxx=Math.max(mxx,x);mny=Math.min(mny,y);mxy=Math.max(mxy,y);}
    for(let i=0;i<r.length-1;i++){const [x0,y0]=r[i],[x1,y1]=r[i+1],c=x0*y1-x1*y0;a+=c;cx+=(x0+x1)*c;cy+=(y0+y1)*c;}
    a/=2; if(Math.abs(a)>ba){ba=Math.abs(a);best=[+(cx/(6*a)).toFixed(3),+(cy/(6*a)).toFixed(3)];} }
  labels[f.properties.uf]=best; bbox[f.properties.uf]=[mnx,mny,mxx,mxy].map(v=>+v.toFixed(3));
}
writeFileSync(out+'/uf-labels.json',JSON.stringify(labels)); writeFileSync(out+'/bbox.json',JSON.stringify(bbox));
const mg=JSON.parse(readFileSync(out+'/municipios.geojson'));
console.log(JSON.stringify({poligonos:mg.features.length,ufs:uf.features.length,semTse,semGeo,semUf:mg.features.filter(f=>!f.properties.uf).length},null,1));
for (const f of ['municipios','uf','uf-labels','bbox']) console.log(f, statSync(`${out}/${f}${f.includes('-')||f==='bbox'?'.json':'.geojson'}`).size);
