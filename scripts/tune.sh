#!/bin/bash
# variações de um parâmetro por vez em torno do default (governador e senador)
for c in 3 5; do
 for p in '{}' '{"lamUf":10000}' '{"lamUf":100000}' '{"tau0":0.05}' '{"tau0":0.12}' '{"kappaS":150}' '{"kappaS":1200}' '{"sigmaMuni":0.2}' '{"f0":0.1}' '{"f0":0.4}'; do
  npx tsx scripts/backtest-all.ts $c --p "$p" --draws 120 2>&1 | egrep "cargo=|  5%| 25%| 50%| 75%| 90%" | sed 's/^ */  /'
 done
done
