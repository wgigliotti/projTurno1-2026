# Runbook: noite da eleição

## Subir
```bash
cd /home/willian/eleicao2026
# API ao vivo (poller do TSE, porta 3001)
MODE=live npm run start -w @eleicao/api
# Web (porta 5173; proxy /api -> 3001)
npm run dev -w @eleicao2026/web
```
Simulação com 2022: `MODE=replay SPEED=300 npm run start -w @eleicao/api` (SPEED = segundos simulados por segundo real).

## Poller (apps/api/src/live.ts)
- Ciclo de ~45 s: arquivos de UF (84) + municípios das UFs que mudaram, mais defasados primeiro (municípios grandes pesam mais), municípios 100% apurados são pulados.
- Taxa adaptativa (inicia em 20 req/s, sobe até `LIVE_MAX_RPS`=60). **429 do TSE** => pausa de 60 s (dobra a cada reincidência) e reduz a taxa. Não rode varreduras paralelas na mesma máquina/IP.
- Variáveis: `LIVE_RPS`, `LIVE_MAX_RPS`, `POLL_MS`, `CYCLE_BUDGET_MS`.
- Estado persistido em `live_muni` e `live_serie`; reiniciar a API restaura tudo.

## Verificações
- `curl localhost:3001/api/meta` => `fonte`, `pctEleitoresApurados`, `ultimaAtualizacaoTSE`.
- Log da API: linha `ciclo: N req ... fila restante=...` por ciclo; `BLOQUEADO(429)` indica pausa.

## Backtest
`npx tsx scripts/backtest-all.ts 3|5` (governador/senador por UF e % apurado), `npx tsx scripts/backtest.ts 1` (presidente, replay por horário).
