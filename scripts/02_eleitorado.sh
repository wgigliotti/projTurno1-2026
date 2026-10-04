#!/usr/bin/env bash
# Eleitorado apto 2026 por municipio (TSE perfil_eleitorado_2026, CSV BRASIL em streaming). Requer 01_municipio.mjs antes.
set -euo pipefail
cd "$(dirname "$0")/.."; set -a; . ./.env; set +a
mkdir -p data
[ -f data/perfil_eleitorado_2026.zip ] || curl -A 'Mozilla/5.0' -o data/perfil_eleitorado_2026.zip https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip
unzip -p data/perfil_eleitorado_2026.zip perfil_eleitorado_2026_BRASIL.csv | awk -F'";"|;' 'NR>1{gsub(/"/,"",$5); s[$5]+=$24} END{for(k in s) print k","s[k]}' > data/eleitorado_2026.csv
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
create temp table t(cd_tse int, aptos bigint);
\copy t from 'data/eleitorado_2026.csv' csv
truncate eleitorado_2026;
insert into eleitorado_2026 select t.cd_tse, t.aptos from t join municipio m using(cd_tse);
select (select count(*) from t) csv_mun, (select count(*) from t where cd_tse not in (select cd_tse from municipio)) csv_sem_municipio,
 (select count(*) from municipio where cd_tse not in (select cd_tse from t)) mun_sem_csv,
 (select sum(aptos) from eleitorado_2026) total, (select sum(aptos) from eleitorado_2026 e join municipio m using(cd_tse) where uf='ZZ') exterior;
SQL
