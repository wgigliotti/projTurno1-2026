#!/bin/bash
# 1 requisição a cada 90 s até o TSE parar de devolver 429 (cada tentativa pode prolongar o bloqueio)
for i in $(seq 1 40); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -A Mozilla/5.0 https://resultados.tse.jus.br/oficial/ele2026/6257/dados/sp/sp71072-c0001-e006257-u.json)
  echo "$(date +%T) $c"; [ "$c" = "200" ] && { echo UNBLOCKED; exit 0; }; sleep 90
done
