# Backtest do modelo: eleição de 2022 (1º turno)

**Método.** Replay da chegada real dos boletins de urna (`DT_BU_RECEBIDO` das seções de 2022, TSE Dados Abertos). Em cada instante o modelo só enxerga as seções já recebidas; o baseline (prior) é o **Presidente de 2018 por município**. O gabarito é o resultado final. Parâmetros: `lamUf=5000, kappaS=250, tau0=0.11, tauNat=0.04, sigmaMuni=0.12`, 200 simulações.
Reprodução: `npx tsx scripts/backtest-all.ts 3|5` e `npx tsx scripts/backtest.ts 1`.

## Governador e Senador (27 UFs; 3 maiores candidatos de cada UF)
Erro médio absoluto (MAE) do % de votos válidos projetado, largura média do IC90, cobertura real do IC90, acerto do líder e acerto "vai/não vai a 2º turno" (só governador).

| Apurado | MAE gov (pp) | IC90 gov (pp) | Cobertura gov | Líder gov | 2º turno gov | MAE sen (pp) | Cobertura sen | Líder sen |
|---|---|---|---|---|---|---|---|---|
| 5% | 1,54 | 8,1 | 91% | 100% | 93% | 1,55 | 89% | 89% |
| 10% | 1,20 | 7,6 | 94% | 100% | 93% | 1,12 | 95% | 93% |
| 25% | 0,68 | 6,1 | 99% | 100% | 96% | 0,72 | 96% | 96% |
| 50% | 0,40 | 3,9 | 99% | 100% | 100% | 0,47 | 98% | 100% |
| 75% | 0,20 | 1,8 | 99% | 100% | 100% | 0,24 | 98% | 100% |
| 90% | 0,10 | 0,7 | 98% | 100% | 100% | 0,13 | 96% | 100% |

## Presidente (Brasil, 5.710 municípios + exterior)
Na janela de 3% a 97% do eleitorado apurado: **MAE 0,36 p.p.**, IC90 médio de 1,8 p.p., **cobertura do IC90 de 97%**. O líder e o 2º turno foram acertados a partir de ~1% apurado (17h40). Com 13% apurado o erro dos três maiores candidatos já era < 0,7 p.p.; com 52%, 0,42 p.p.; com 92%, 0,10 p.p.

## Ressalvas
- 2022 e 2026 diferem: candidatos novos (o modelo é agnóstico a candidato, mas usa o campo político como prior) e **Senado com 2 votos por eleitor em 2026** (em 2022 foi 1). O backtest do Senado valida a mecânica, não a regra de 2 vagas.
- A cobertura do IC90 acima de 97% do apurado perde sentido (o intervalo colapsa, o erro é < 0,05 p.p.).
- O ritmo de apuração de 2026 pode diferir (o TSE não garante a mesma ordem de chegada).
- No ao vivo, a leitura dos municípios é limitada pelo rate limit do TSE (~60 req/s): os detalhes municipais podem ter alguns minutos de defasagem; os totais por UF são relidos a cada ciclo.
