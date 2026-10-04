#!/bin/bash
for tn in 0.04 0.08 0.12; do for lam in 5000 30000; do
  echo "taunat=$tn lam=$lam"; npx tsx scripts/backtest.ts 1 --step 20 --draws 200 --taunat $tn --lam $lam --tau 0.11 --quiet 2>&1 | tail -2
done; done
