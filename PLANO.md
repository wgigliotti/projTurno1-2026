# Plano de Ação: Projeção das Eleições 2026 em tempo real

> **Status (04/10 ~11h40): fases 0 a 5 concluídas; sistema rodando.** Decisões do usuário: tentar Presidente, Governador e Senador antes das 17h; mapear candidatos a campos; Node/TS inteiro; MapLibre; Exterior em caixa separada; sem deputados; usuário de banco dedicado `eleicoes` (credenciais no `.env`).
> Resultados e como operar: `docs/backtest.md`, `docs/RUNBOOK.md`, contrato em `docs/API.md`. Pendente: ao vivo depende de confirmar o formato dos arquivos de votação com dados reais (parser validado só com 2024 e com um TSE falso).
> Data: 04/10/2026 (1º turno). Urnas fecham às 17h (Brasília); o TSE começa a divulgar logo depois.

## 0. Objetivo

App web que:
1. Lê os resultados do TSE conforme saem (polling em `resultados.tse.jus.br`).
2. Projeta o resultado final com intervalo de confiança, corrigindo o viés de ordem de chegada das urnas.
3. Mostra tudo numa interface muito boa, com **mapa do Brasil** (UF e município) e **páginas separadas** para **Presidente**, **Governador** e **Senador**.

Resultado projetado é **não oficial**; a interface deve dizer isso.

## 1. Fatos verificados (base do plano)

| Item | Estado |
|---|---|
| Postgres 18.1 | OK. Database `eleicoes2026` **criado** (user `root`). |
| Node 24 / npm 11 / Java | Disponíveis. Kotlin não instalado. |
| Fonte ao vivo | JSON estáticos em CDN, sem auth. Cache de 50 s, limite de 2000 req/s. |
| Config 2026 | Ciclo `ele2026`, pleito `3220`. Presidente=`6257`, Estaduais (Gov/Sen/DepF/DepE/DepD)=`6259`. |
| Arquivos de votação 2026 | **Só existem após as 17h.** Formato exato **não confirmado**. |
| Histórico 2022 | Boletim de urna por seção em CSV, com `DT_BU_RECEBIDO` (horário em que cada seção chegou). Permite replay fiel. |
| Tamanho do histórico | SP sozinho = 404 MB zip. Brasil todo = vários GB descompactado. |
| **Disco livre** | **~8,3 GB (96% usado).** Não dá para extrair tudo. |
| Geometrias do mapa | API do IBGE (malhas) deu timeout no teste. Há fontes alternativas (ver Fase 1). |

**Consequência do disco:** o pipeline de 2022 será **streaming** (baixar zip → ler CSV sem extrair → agregar → descartar). Só os agregados vão para o Postgres.

## 2. Stack proposta

**Tudo em Node/TypeScript**, num monorepo simples. Não vejo ganho em Kotlin: a estatística necessária (regressão regularizada, Monte Carlo) é leve e roda bem em TS, e um runtime só reduz o risco com prazo curto.

| Camada | Escolha |
|---|---|
| Backend | Node 24 + TypeScript + **Fastify** |
| Banco | PostgreSQL (`pg` + SQL puro/`postgres.js`) |
| Tempo real | **SSE** (Server-Sent Events) do back para o front |
| Frontend | **React + Vite + TypeScript** |
| Mapa | **MapLibre GL** ou **D3-geo + SVG** (decisão na Fase 1, ver dúvida 6) |
| Gráficos | Recharts ou D3 (séries temporais, barras, faixas de confiança) |
| Modelo | Módulo TS puro, o mesmo código no backtest e ao vivo |

Estrutura:
```
eleicao2026/
  apps/api      (Fastify, poller, modelo, SSE)
  apps/web      (React/Vite)
  packages/model (projeção; usado pelo backtest e pelo ao vivo)
  scripts/      (ETL 2022, backtest)
  db/migrations
```

## 3. Modelo de projeção (visão geral)

**Problema:** a ordem de chegada das urnas é enviesada (pequenos municípios e regiões de transmissão mais fácil chegam antes). Somar o apurado engana.

**Unidade:** município (5.570), com a seção (~470 mil) como base de ponderação.

1. **Votos esperados por município** = aptos × comparecimento esperado. O comparecimento esperado parte de 2022 e é ajustado pelo comparecimento observado nas seções já apuradas, em relação ao que elas tinham em 2022.
2. **Municípios fechados:** valor real.
3. **Parcialmente apurados:** extrapolação pela fração de seções apuradas, com encolhimento (shrinkage) quando a amostra é pequena.
4. **Sem dados:** previsão por regressão regularizada *dentro de cada UF*, com preditores como voto de 2022 no município, porte, % urbano e vizinhança geográfica. O modelo é **agnóstico ao candidato**: aprende a relação entre o voto de 2022 e o voto atual nos municípios já apurados e aplica nos que faltam. Isso resolve Governador e Senador, em que os candidatos mudaram.
5. **Incerteza:** Monte Carlo com resíduos do modelo, gerando intervalo de confiança e probabilidades como "2º turno", "vence no 1º turno" ou "eleito".
6. **Regras de decisão:** Presidente e Governador exigem maioria absoluta dos válidos (senão há 2º turno). Senado é **por maioria simples**, voto duplo (2 vagas por UF em 2026), então os dois mais votados são eleitos e o ranking é top-2.

Métricas do backtest: erro (MAE) do % final de cada candidato ao longo do tempo, cobertura real do intervalo de 90%, acerto de "vai a 2º turno" e "quem lidera/quem é eleito", e **em que minuto o modelo passa a acertar de forma estável**.

## 4. Fases

### Fase 0: Fundação (≈ 30 min)
- Monorepo Node/TS, lint, scripts de dev, `.env`.
- Migrações iniciais do Postgres: `eleicao`, `cargo`, `candidato`, `municipio`, `secao_apurada`, `snapshot_apuracao`, `projecao`, `serie_projecao`.
- **Entrega:** `npm run dev` sobe API e web vazios, com o banco conectado.

### Fase 1: Dados-base e geometrias (≈ 1 a 1,5 h)
- Importar municípios/zonas do `mun-e006257-cm.json` (cód. TSE ↔ IBGE).
- Eleitorado 2026 por município (aptos) do Dados Abertos do TSE.
- Geometrias: IBGE malhas (UF e município) simplificadas, convertidas para TopoJSON/GeoJSON leve e salvas no repositório.
- **Entrega:** mapa estático do Brasil por UF e por município, vindo do banco.

### Fase 2: ETL histórico 2022 (≈ 1,5 a 2 h, em paralelo à Fase 1)
- Download streaming dos BUs de 2022 (1º turno), UF a UF, **sem extrair em disco**.
- Agregar por seção e por candidato (Presidente, Governador, Senador) para o Postgres, mantendo `DT_BU_RECEBIDO`.
- Derivar: votação 2022 por município e cargo, comparecimento 2022 e ordem de chegada por seção.
- **Entrega:** banco com 2022 pronto para o replay e como base do modelo.
- Risco: tempo e disco. Mitigação: começar por poucas UFs (ex.: AC, SP, BA) e escalar.

### Fase 3: Modelo + backtest (≈ 2 h)
- Implementar o modelo da seção 3 em `packages/model`.
- Replay de 2022, minuto a minuto, para Presidente, Governador (todas as UFs) e Senador.
- Relatório do backtest (cobertura, erro × tempo, tempo até o acerto estável) e ajuste de hiperparâmetros.
- **Entrega:** relatório em `docs/backtest.md` + decisão de go/no-go do modelo.

### Fase 4: Ingestão ao vivo (≈ 1 h, **aberta às 17h**)
- Poller (30 a 60 s) com ETag e `dg/hg`, respeitando o cache de 50 s.
- Parser **tolerante** dos JSON de 2026, ajustado ao primeiro arquivo real.
- Snapshots versionados no Postgres, que permitem replay do dia e debug.
- Modo **simulação**: reproduz 2022 como se fosse ao vivo, para ensaiar até as 17h.
- **Entrega:** dados reais entrando e sendo persistidos.

### Fase 5: API e interface (≈ 3 h, em paralelo às Fases 3 e 4)
- API REST e SSE: `/presidente`, `/governador/:uf`, `/senador/:uf`, `/serie`, `/mapa`.
- Páginas:
  - **Presidente:** cartões dos candidatos (apurado × projetado, com intervalo), probabilidade de 2º turno, curva da projeção ao longo do tempo, **mapa do Brasil por UF** (cor = candidato líder, intensidade = margem) com drill-down por município, tabela por UF.
  - **Governador:** filtro de UF, o mesmo padrão em escala estadual, e mapa de municípios da UF.
  - **Senador:** filtro de UF, ranking top-2 com probabilidade de eleição e disputa por vaga.
- Elementos comuns: % apurado, última atualização (`hg`), indicador "ao vivo", comparação apurado × projetado, filtros (UF/região), tema claro/escuro e responsivo.
- **Entrega:** UI completa rodando sobre o replay de 2022 e depois sobre dados ao vivo.

### Fase 6: Go-live e operação (17h em diante)
- Ligar na fonte real, validar o parser, acompanhar.
- Painel de saúde (último `hg`, atraso, erros) e alerta se os dados pararem.
- Banner "projeção não oficial".
- **Entrega:** sistema acompanhando a apuração.

## 5. Priorização realista para hoje (prazo: 17h)

Com ~6,5 h de janela, **recomendo este corte**:
1. **Obrigatório até 17h:** Fases 0, 1, 4 e uma versão enxuta da 5 (**Presidente** com mapa por UF). Parser + banco + UI.
2. **Se der tempo:** 2 e 3 para Presidente em todas as UFs, o que dá confiança estatística.
3. **Depois das 17h (iterando ao vivo):** Governador e Senador, e o mapa por município.

Governador e Senador envolvem 27 modelos independentes (um por UF) cada um e exigem o ETL de 2022 completo. É o que mais arrisca o prazo.

Se o 1º turno de hoje terminar antes de tudo ficar pronto, a base fica reutilizável para o **2º turno (25/10)**, quando só há 2 candidatos (Presidente e os governadores que forem a 2º turno), e o problema é bem mais simples e preciso.

## 6. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Formato dos JSON de 2026 diferente do esperado | Alto | Parser tolerante, ajuste no primeiro arquivo real, replay de 2022 como contingência |
| Disco (8,3 GB livres) | Alto | ETL streaming, só agregados no banco |
| Prazo (17h) | Alto | Corte da seção 5 |
| Comparecimento esperado errado | Médio | Intervalos largos no início, ajuste com seções apuradas |
| Mudança de candidatos 2022→2026 | Médio | Modelo agnóstico a candidato (seção 3, item 4) |
| Voto exterior e em trânsito (tempos e padrão próprios) | Médio | Tratar como "município" separado |
| Rate limit/bloqueio do TSE | Baixo | Polling ≤ 1/min por arquivo, ETag, User-Agent identificado |

## 7. Dúvidas para você (responda antes de eu começar)

1. **Prazo e corte:** concorda com o corte da seção 5 (Presidente até 17h; Governador e Senador depois, ao vivo)? Ou prefere tentar os três antes das 17h e aceitar menos qualidade?
2. **Candidatos:** quer que eu **mapeie os candidatos de 2026 aos blocos de 2022** (ex.: Lula/PT, Bolsonaro/PL) para a narrativa ("quem herda o voto de quem"), ou o modelo agnóstico basta (sem mapa manual)?
3. **Deploy:** só **localhost** (`npm run dev`) ou quer publicar (VPS/túnel)? Se publicar, há acesso público e limite de usuários?
4. **Stack:** confirma **Node/TS inteiro** (minha recomendação) ou prefere Kotlin no back?
5. **Frontend:** React + Vite está ok, ou prefere outro (Vue, Svelte, vanilla)?
6. **Mapa:** prefiro **MapLibre GL** (zoom e pan suaves, municípios fluidos) com geometrias locais, sem tile de fundo. Aceita, ou prefere SVG (D3), mais leve e simples, mas menos fluido nos 5.570 municípios?
7. **Disco:** só há ~8 GB livres. Posso **usar ~4 GB** para os dados de 2022 em disco temporário e liberar depois? Ou você libera espaço antes?
8. **Dados externos:** tudo bem baixar (a) geometrias do IBGE, (b) eleitorado do TSE e (c) 2022 do CDN do TSE? Algum desses é restrito na sua rede?
9. **Cargos:** além de Presidente, Governador e Senador, quer Deputados no futuro? (Eu não recomendo hoje: quociente eleitoral e sobras são complexos.)
10. **Exterior:** mostro "Exterior" como uma unidade separada no mapa (um ponto/caixa ao lado), ou só na tabela?
11. **Senado:** confirma que em 2026 são **2 vagas por UF** (54 no total, renovação de 2/3) e que você quer o top-2 com probabilidade de eleição por candidato?
12. **Publicação:** o resultado será divulgado para terceiros (redes, imprensa)? Se sim, sugiro deixar o aviso "projeção não oficial" bem visível e documentar a metodologia numa página.
13. **Credenciais:** posso gravar `root/root` do Postgres no `.env` local (fora de qualquer repositório público)? Prefere que eu crie um usuário dedicado `eleicoes` no banco?
14. **Git:** o diretório não é repositório. Inicio um `git init` local?

---
**Para aprovar:** responda às dúvidas (ou diga "siga as recomendações") e eu começo pela Fase 0.
