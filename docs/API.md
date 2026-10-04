# Contrato da API (apps/api → apps/web)

Base: `http://localhost:3001`. JSON. Percentuais são **frações 0–1** (ex.: 0.4321), exceto onde dito. Datas ISO-8601.
Cargos: `presidente` (uf = `BR`), `governador` e `senador` (uf = sigla maiúscula, ex. `SP`).
Em dev o web (Vite, :5173) faz proxy de `/api` → :3001.

## GET /api/meta
```json
{ "fonte": "live" | "replay",
  "relogio": "2026-10-04T19:32:10-03:00",       // no replay: instante simulado
  "ultimaAtualizacaoTSE": "2026-10-04T19:31:58-03:00",
  "pctEleitoresApurados": 0.4123,                // nacional
  "secoesApuradas": 205000, "secoesTotal": 499248,
  "ufs": [ { "uf":"SP","nome":"São Paulo","regiao":"Sudeste" } ],
  "modelo": { "versao":"0.1", "aviso":"Projeção não oficial..." } }
```

## GET /api/projecao/:cargo/:uf
```json
{ "cargo":"presidente","uf":"BR","atualizadoEm":"...","pctEleitoresApurados":0.41,
  "secoesApuradas":1,"secoesTotal":2,
  "comparecimento": { "apurado":0.78, "projetado":0.79 },
  "candidatos":[
    { "nr":13,"nome":"LULA","partido":"PT","campo":"lula"|"bolsonaro"|"outros","cor":"#d62728",
      "votosApurados":1234567,"pctApurado":0.41,          // % dos votos válidos já apurados
      "pctProjetado":0.452,"ic90":[0.43,0.47],            // % dos válidos no fim
      "votosProjetados":47000000,
      "probVitoria1Turno":0.0,                            // presidente/governador: >50% dos válidos
      "probSegundoTurno":0.98,                            // chega ao 2º turno (top-2 sem maioria absoluta)
      "probEleito":null } ],                               // senador: prob de estar entre os 2 eleitos
  "decisao": { "tipo":"maioria_absoluta"|"top2",
      "probSegundoTurno":0.97,"probDecididoNo1Turno":0.03,
      "confrontosProvaveis":[{"nrs":[13,22],"prob":0.9}] } , // só pres/gov
  "branco_nulo": { "brancosApurado":0.03,"nulosApurado":0.05 } }
```
Candidatos ordenados por `pctProjetado` desc. `ic90` = intervalo de 90%.

## GET /api/serie/:cargo/:uf
Série temporal de snapshots (para gráfico de linhas com faixa de confiança):
```json
{ "pontos":[ { "t":"2026-10-04T18:10:00-03:00","pctApurado":0.12,
   "cand":{ "13":{"p":0.44,"lo":0.40,"hi":0.48,"apurado":0.47}, "22":{...} } } ] }
```

## GET /api/mapa/:cargo/:uf?nivel=uf|municipio
`presidente/BR?nivel=uf` → 27 UFs + exterior. `governador|senador/:uf?nivel=municipio` ou `presidente/:uf?nivel=municipio` → municípios da UF.
```json
{ "nivel":"uf","unidades":[
  { "id":"SP","cdIbge":null,"nome":"São Paulo","pctApurado":0.62,
    "lider":13,"liderProjetado":13,"margem":0.07,          // margem projetada do 1º sobre o 2º (fração)
    "shares":{"13":0.45,"22":0.38},                         // % projetado dos válidos por nr
    "tipo":"apurado"|"projetado" } ],                       // apurado = ≥99% das seções
  "exterior": { "id":"ZZ","nome":"Exterior","pctApurado":0.9,"lider":13,"shares":{} } }
```
`id` de município = código IBGE (7 dígitos, string) para casar com `public/geo/municipios.geojson` (`properties.cd_ibge`); UF = sigla casando com `uf.geojson`.

## GET /api/stream  (SSE)
Evento `update` com `{ "relogio":"...", "pctEleitoresApurados":0.41 }` a cada novo snapshot. O web refaz os GETs.

## Replay (simulação com 2022) — só dev
`POST /api/replay/start { "ano":2022, "velocidade":60 }`, `POST /api/replay/seek { "t":"2022-10-02T19:30:00-03:00" }`, `POST /api/replay/stop`. Em replay `meta.fonte="replay"`.

## Histórico (fotos a cada 5 min) — só Presidente e Governador
Tabelas `foto_apuracao` / `foto_candidato` (hora de Brasília). Gravadas de 5 em 5 min (alinhadas em :00, :05, :10…) a partir de `FOTO_INICIO` (padrão 2026-10-04T17:05).
Cada foto guarda, por série, a **% real apurada** (`apurado`: % dos votos válidos já contados) e a **% projetada** (`projetado` + IC90 `lo`/`hi`), além de `pctEleitoresApurados`.

### GET /api/historico/tudo
```json
{ "fonte":"live"|"replay","inicio":"2026-10-04T17:05:00-03:00","intervaloMin":5,"atualizadoEm":"...",
  "series":{
    "presidente/BR": { "cargo":"presidente","uf":"BR","nome":"Brasil",
       "candidatos":[{"nr":13,"nome":"LULA","partido":"PT","campo":"lula"}],   // top 4 pela projeção mais recente
       "pontos":[ {"t":"2026-10-04T17:05:00-03:00","pctEleitoresApurados":0.012,"secoesApuradas":123,"secoesTotal":499248,"prob2Turno":0.9,
                   "cand":{"13":{"apurado":0.47,"projetado":0.452,"lo":0.43,"hi":0.47}}} ] },
    "presidente/SP": {...}, "governador/SP": {...} } }
```
Chaves: `presidente/BR`, `presidente/<UF>`, `governador/<UF>` (27 UFs). Valores são frações 0–1. `GET /api/historico/:cargo/:uf` devolve o mesmo formato filtrado (mais `serie`, com até 8 candidatos). `POST /api/foto/agora` grava uma foto na hora (teste).
