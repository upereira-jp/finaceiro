#!/bin/bash
# Recria a fixture do spike e roda os 12 testes do middleware.
# O reset e obrigatorio: o proprio teste M3 grava e reverte, e um teste anterior
# que NAO revertesse deixaria lixo que quebra M1, M9 e M12 por contagem.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-spike}"
PGUSER="${PGUSER:-postgres}"
P="psql -h 127.0.0.1 -U $PGUSER -q -v ON_ERROR_STOP=1"

$P -d postgres -c "DROP DATABASE IF EXISTS spike WITH (FORCE)" -c "CREATE DATABASE spike" > /dev/null
for r in app_pool app_tenant_a app_tenant_b; do
  $P -d postgres -c "DROP OWNED BY $r" -c "DROP ROLE $r" > /dev/null 2>&1 || true
done
$P -d spike -f spike-adr0003/01-schema.sql 2>&1 | grep -v NOTICE || true

# O middleware nao conhece modelo, so ciclo de vida de transacao: o client de
# 3 modelos do spike e suficiente para provar as invariantes 10 e 11.
if [ ! -d spike-transacao/generated ]; then
  printf '#!/bin/sh\necho "{}"\n' > /tmp/stub-schema-engine && chmod +x /tmp/stub-schema-engine
  PRISMA_SCHEMA_ENGINE_BINARY=/tmp/stub-schema-engine \
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    npx prisma generate --schema=spike-transacao/schema.prisma
  mkdir -p spike-transacao/generated
  cp -r spike-transacao/generated/* spike-transacao/generated/ 2>/dev/null || true
fi

node --experimental-strip-types tests/middleware.ts
