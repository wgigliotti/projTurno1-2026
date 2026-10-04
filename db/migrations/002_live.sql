-- Estado ao vivo persistido (sobrevive a reinício da API)
create table if not exists live_muni (
  url text primary key, p jsonb not null, at bigint not null
);
create table if not exists live_serie (
  cargo text not null, uf text not null, t timestamptz not null, ponto jsonb not null,
  primary key (cargo, uf, t)
);
