#!/bin/bash
# Aplica TODAS as migrations num banco limpo, roda o seed e as quatro suites SQL.
# SPEC-001 9. Uso: bash tests/run.sh   (espera PostgreSQL 16 em 127.0.0.1:5432)
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-spike}"
PGUSER="${PGUSER:-postgres}"
P="psql -h 127.0.0.1 -U $PGUSER -q -v ON_ERROR_STOP=1"
TENANT_SEED='aaaaaaaa-1111-4000-8000-000000000001'

aplicar () {   # $1 = nome do banco
  $P -d postgres -c "DROP DATABASE IF EXISTS $1 WITH (FORCE)" -c "CREATE DATABASE $1" > /dev/null
  # O `vault` de mentira ANTES das migrations: a 35 confere privilegio em
  # `vault.decrypted_secrets`, e `has_table_privilege` LEVANTA quando a relacao
  # nao existe. Sem isto a suite morre na 35a de 36. Ver tests/vault-de-mentira.sql.
  $P -d "$1" -f tests/vault-de-mentira.sql > /dev/null
  for m in prisma/migrations/*/migration.sql; do
    # Sem pipe para grep: em pipeline o status de saida e do grep, e uma
    # migration que falha passa em SILENCIO. Foi o que aconteceu em 26/07 - o
    # mesmo modo de falha que este projeto persegue nas policies, dentro do
    # proprio runner. Erro vai para arquivo e o script morre.
    if ! $P -d "$1" -f "$m" > /tmp/mig.log 2>&1; then
      echo "FALHA na migration $m:"; grep -vE '^(NOTICE|CREATE|ALTER|GRANT|REVOKE|COMMENT|DO|SET)' /tmp/mig.log | head -20
      exit 1
    fi
  done
}

suite () {     # $1 = banco, $2 = arquivo .sql
  psql -h 127.0.0.1 -U "$PGUSER" -d "$1" -f "$2" 2>&1 \
    | sed "s|^psql:$2:[0-9]*: ||" \
    | grep -E '^(NOTICE|WARNING|ERROR)' \
    | sed 's/^NOTICE:  //; s/^WARNING:  /FALHA: /'
}

echo "=== migrations + suite de isolamento (banco fin_test)"
aplicar fin_test
suite fin_test tests/isolamento.sql

echo
echo "=== RBAC e trilha (banco fin_rbac, fixture propria)"
aplicar fin_rbac
suite fin_rbac tests/rbac.sql

echo
echo "=== regras de negocio: rateio, contrato unico, tarifa e comissao (banco fin_regras)"
aplicar fin_regras
suite fin_regras tests/regras.sql

echo
echo "=== auditoria, repasse versionado e os quatro furos de 26/07 (banco fin_auditoria)"
aplicar fin_auditoria
suite fin_auditoria tests/auditoria.sql

echo
echo "=== carteira: fatura, boleto, liquidacao e a invariante do centavo (banco fin_carteira)"
aplicar fin_carteira
suite fin_carteira tests/carteira.sql

echo
echo "=== seed, duas passadas para provar idempotencia (banco fin_seed)"
aplicar fin_seed
$P -d fin_seed -c "INSERT INTO tenant (id,razao_social,cnpj) VALUES ('$TENANT_SEED','Seed','99999999000199')" > /dev/null
for i in 1 2; do
  psql -h 127.0.0.1 -U "$PGUSER" -d fin_seed -q -v ON_ERROR_STOP=1 -v tenant="'$TENANT_SEED'" \
    -f prisma/seed/regra_comissao.sql 2>&1 \
    | grep -E 'NOTICE' | sed "s|^psql:[^ ]* ||; s/NOTICE:  /passada $i: /"
done
$P -d fin_seed -tA -c "
SELECT 'recalculo de 2026-03-15 acha '||count(*)||' regra(s) de comissao'
FROM regra_comissao WHERE daterange(vigencia_inicio,vigencia_fim,'[)') @> '2026-03-15'::date;"

echo
echo "=== catalogo (fin_test): CLAUDE.md 1, 2, 3 e 11 por consulta ao catalogo"
# Era um SELECT que IMPRIMIA o nome da tabela em falta e devolvia exit 0: o CI
# passava verde com a falha na tela. `distribuidora` esteve nessa lista desde a
# migration 10 sem quebrar nada. Agora e suite com RAISE WARNING, como as outras.
suite fin_test tests/catalogo.sql
