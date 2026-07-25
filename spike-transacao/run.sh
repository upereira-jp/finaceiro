#!/bin/bash
# ADR-0003 r2 — reproduz os 12 testes de $transaction/$extends.
# Requer: PostgreSQL 16 local e o schema do spike-adr0003 carregado.
set -e
SCHEMA_SQL="${1:-../spike-adr0003/01-schema.sql}"
[ -f "$SCHEMA_SQL" ] || SCHEMA_SQL="./01-schema.sql"
[ -f "$SCHEMA_SQL" ] || { echo "01-schema.sql nao encontrado. Passe o caminho: ./run.sh /caminho/01-schema.sql"; exit 1; }

export PGPASSWORD=spike
P="psql -h 127.0.0.1 -U postgres -q -v ON_ERROR_STOP=1"
$P -d postgres -c "DROP DATABASE IF EXISTS spike WITH (FORCE)" -c "CREATE DATABASE spike" > /dev/null
for r in app_pool app_tenant_a app_tenant_b; do
  $P -d postgres -c "DROP OWNED BY $r" -c "DROP ROLE $r" > /dev/null 2>&1 || true
done
$P -d spike -f "$SCHEMA_SQL" 2>&1 | grep -v NOTICE || true

npm install --silent

# O engine Rust do Prisma vem de binaries.prisma.sh, fora da allowlist deste ambiente.
# O Prisma 7 nao precisa dele em runtime (roda sobre driver adapter), mas a CLI ainda
# tenta baixar o schema-engine ao gerar. Os dois stubs abaixo contornam isso.
printf '#!/bin/sh\necho "{}"\n' > /tmp/stub-schema-engine && chmod +x /tmp/stub-schema-engine
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/stub-schema-engine \
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
  npx prisma generate --schema=schema.prisma

node --experimental-strip-types transacao.ts
