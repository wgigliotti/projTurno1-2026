-- Fotos periódicas (a cada 5 min) da apuração real e da projeção, p/ ver a convergência.
-- t = hora de Brasília (timestamp sem fuso), alinhada em múltiplos de 5 min. fonte: 'live' | 'replay'.
create table if not exists foto_apuracao (
  fonte text not null, t timestamp not null, cargo text not null, uf text not null,     -- uf: 'BR' (presidente nacional) ou sigla
  pct_eleitores_apurados double precision not null,    -- % do eleitorado já apurado (0-1)
  secoes_apuradas int, secoes_total int,
  comparec_apurado double precision, comparec_projetado double precision,
  prob_2turno double precision,
  ultima_tse text, defasagem_s int,                    -- hora do arquivo mais novo do TSE; idade (s) do nosso último ciclo
  primary key (fonte, t, cargo, uf)
);
create table if not exists foto_candidato (
  fonte text not null, t timestamp not null, cargo text not null, uf text not null, nr int not null,
  nome text, partido text, campo text,
  votos_apurados bigint, pct_apurado double precision,       -- % real dos votos válidos já apurados
  votos_projetados bigint, pct_projetado double precision, ic_lo double precision, ic_hi double precision,
  primary key (fonte, t, cargo, uf, nr)
);
create index if not exists foto_candidato_serie_idx on foto_candidato (fonte, cargo, uf, t);
