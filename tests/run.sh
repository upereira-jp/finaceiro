#!/bin/bash
# Aplica as duas migrations num banco limpo e roda a suite de isolamento.
# SPEC-001 9. Uso: ./tests/run.sh  (espera PostgreSQL 16 em 127.0.0.1:5432)
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-spike}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-fin_test}"
P="psql -h 127.0.0.1 -U $PGUSER -q -v ON_ERROR_STOP=1"

$P -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB" > /dev/null

echo "--- migration 1: schema"
$P -d "$DB" -f prisma/migrations/20260725120000_fundacao_schema/migration.sql > /dev/null
echo "--- migration 2: isolamento"
$P -d "$DB" -f prisma/migrations/20260725120100_isolamento_rls/migration.sql > /dev/null

echo "--- suite de isolamento"
psql -h 127.0.0.1 -U "$PGUSER" -d "$DB" -f tests/isolamento.sql 2>&1 \
  | sed 's|^psql:tests/isolamento.sql:[0-9]*: ||' \
  | grep -E '^(NOTICE|WARNING|ERROR)' \
  | sed 's/^NOTICE:  //; s/^WARNING:  /FALHA: /'

echo
echo "--- catalogo: tabelas com tenant_id sem RLS+FORCE+policy (esperado: nenhuma)"
$P -d "$DB" -tA -c "
SELECT coalesce(string_agg(c.relname,', '),'nenhuma')
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND a.attnum>0
WHERE c.relkind='r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
  OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid));"

echo "--- FKs compostas (esperado: 9)"
$P -d "$DB" -tA -c "SELECT count(*) FROM pg_constraint WHERE contype='f' AND array_length(conkey,1)=2;"
