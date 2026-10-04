-- Municípios (códigos TSE e IBGE). UF 'ZZ' = exterior (cada país vira um "município").
create table if not exists municipio (
  cd_tse   int primary key,          -- código TSE (ex.: 1392 = Rio Branco/AC)
  cd_ibge  int,                      -- 7 dígitos; null para exterior
  uf       char(2) not null,
  nome     text not null,
  capital  boolean default false,
  zonas    smallint[]
);
create index if not exists municipio_uf_idx on municipio(uf);
create unique index if not exists municipio_ibge_uq on municipio(cd_ibge) where cd_ibge is not null;

-- Eleitorado apto 2026 por município
create table if not exists eleitorado_2026 (
  cd_tse int primary key references municipio(cd_tse),
  aptos  int not null
);

-- ===== Histórico 2022, 1º turno (cargos: 1=Presidente, 3=Governador, 5=Senador) =====
-- Uma linha por seção x cargo: chegada à totalização e totais
create table if not exists secao_hist (
  ano smallint not null, turno smallint not null, cargo smallint not null,
  uf char(2) not null, cd_mun int not null, zona smallint not null, secao smallint not null,
  dt_recebido timestamp,            -- DT_BU_RECEBIDO (hora de Brasília como no CSV)
  aptos int, comparec int, brancos int, nulos int,
  primary key (ano, turno, cargo, uf, cd_mun, zona, secao)
);
create index if not exists secao_hist_chegada_idx on secao_hist(ano, turno, cargo, dt_recebido);

-- Votos nominais por seção x cargo x candidato
create table if not exists voto_secao_hist (
  ano smallint not null, turno smallint not null, cargo smallint not null,
  uf char(2) not null, cd_mun int not null, zona smallint not null, secao smallint not null,
  nr_votavel int not null, qt_votos int not null,
  primary key (ano, turno, cargo, uf, cd_mun, zona, secao, nr_votavel)
);

-- Candidatos 2022 por cargo/UF (uf='BR' para presidente)
create table if not exists candidato_hist (
  ano smallint not null, turno smallint not null, cargo smallint not null,
  uf char(2) not null, nr_votavel int not null, nome text, sg_partido text,
  primary key (ano, turno, cargo, uf, nr_votavel)
);

-- Resultado final 2022 por município (agregado de voto_secao_hist) - preenchido pelo ETL
create table if not exists resultado_mun_hist (
  ano smallint not null, turno smallint not null, cargo smallint not null,
  uf char(2) not null, cd_mun int not null, nr_votavel int not null,
  votos int not null, aptos int, comparec int, brancos int, nulos int,
  primary key (ano, turno, cargo, uf, cd_mun, nr_votavel)
);
