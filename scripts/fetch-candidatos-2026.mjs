// Baixa candidatos 2026 (Presidente, Governador, Senador) dos arquivos -u.json do TSE
import fs from 'node:fs';
const UFS='ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split(' ');
const B='https://resultados.tse.jus.br/oficial/ele2026';
const get=async u=>{const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});if(!r.ok)throw new Error(u+' '+r.status);return r.json();};
function parse(d, uf){
  const out=[];
  for(const c of d.carg){
    const cargo=+c.cd;
    for(const a of c.agr||[]) for(const p of a.par||[]) for(const k of p.cand||[]){
      out.push({cargo,uf,nr:+k.n,sqcand:k.sqcand,nome:k.nmu||k.nm,partido:p.sg,coligacao:a.com||a.nm,
        status:k.st,vice:(k.vs||[]).map(v=>v.nmu||v.nm)});
    }
  }
  return out;
}
const all=[];
all.push(...parse(await get(`${B}/6257/dados/br/br-c0001-e006257-u.json`),'BR'));
for(const uf of UFS){
  for(const [cg,code] of [['c0003',3],['c0005',5]]){
    try{ all.push(...parse(await get(`${B}/6259/dados/${uf}/${uf}-${cg}-e006259-u.json`),uf.toUpperCase())); }
    catch(e){ console.error('falhou',uf,cg,e.message); }
  }
}
fs.writeFileSync('data/candidatos-2026.json',JSON.stringify(all,null,1));
console.log(all.length,'candidatos');
