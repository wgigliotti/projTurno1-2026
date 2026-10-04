#!/bin/bash
# Túnel rápido do Cloudflare -> API (que também serve o site). Reinicia se cair. URL em data/tunnel.log
cd "$(dirname "$0")/.."
while true; do
  echo "$(date +%T) iniciando túnel" >> data/tunnel.log
  ~/.local/bin/cloudflared tunnel --no-autoupdate --url http://localhost:${PORT:-3001} >> data/tunnel.log 2>&1
  echo "$(date +%T) túnel caiu; reiniciando em 5s" >> data/tunnel.log; sleep 5
done
