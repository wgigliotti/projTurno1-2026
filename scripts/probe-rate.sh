#!/bin/bash
# $1 = req/s, $2 = n
d=$(python3 -c "print(1/$1)")
ok=0; bad=0
for i in $(seq 1 $2); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -A Mozilla/5.0 "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/sp/sp$(printf %05d $((70000+i)))-c0001-e006257-u.json")
  if [ "$c" = "429" ]; then bad=$((bad+1)); else ok=$((ok+1)); fi
  sleep $d
done
echo "rate=$1 ok=$ok 429=$bad"
