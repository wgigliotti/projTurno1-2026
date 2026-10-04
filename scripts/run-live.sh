#!/bin/bash
# Supervisor: mantém a API ao vivo de pé (reinicia em 5 s se cair). Log em data/api-live.log
cd "$(dirname "$0")/.."
while true; do
  echo "$(date +%T) iniciando API live" >> data/api-live.log
  MODE=live PORT=${PORT:-3001} npx tsx apps/api/src/server.ts >> data/api-live.log 2>&1
  echo "$(date +%T) API caiu (exit $?); reiniciando em 5s" >> data/api-live.log; sleep 5
done
