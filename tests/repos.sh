#!/bin/bash
# Monta o banco fin_repos com as migrations e uma fixture de duas empresas, e roda
# as suites dos repositorios de cliente e contrato.
#
# Roda pela role app_financeiro_login, SEM BYPASSRLS. Isso nao e detalhe de teste:
# e a unica configuracao em que as 24 policies sao avaliadas. Testar por `postgres`
# (rolbypassrls = true) daria verde com a RLS desligada.
#
# Uso: bash tests/repos.sh   (espera PostgreSQL em 127.0.0.1:5432)
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-spike}"
PGUSER="${PGUSER:-postgres}"
P="psql -h 127.0.0.1 -U $PGUSER -q -v ON_ERROR_STOP=1"

A='11110000-0000-4000-8000-00000000000a'
B='22220000-0000-4000-8000-00000000000b'
UADM='aaaa0001-0000-4000-8000-00000000000a'
ULEI='aaaa0002-0000-4000-8000-00000000000b'
CLI='cccc0001-0000-4000-8000-00000000000c'
UC='eeee0001-0000-4000-8000-00000000000e'
USI='dddd0001-0000-4000-8000-00000000000d'

$P -d postgres -c "DROP DATABASE IF EXISTS fin_repos WITH (FORCE)" -c "CREATE DATABASE fin_repos" > /dev/null
for m in prisma/migrations/*/migration.sql; do
  # Sem pipe para grep: em pipeline o status de saida e do grep e a migration
  # falha em silencio. Foi assim que metade da migration 10 nao entrou em 26/07.
  if ! $P -d fin_repos -f "$m" > /tmp/mig.log 2>&1; then
    echo "FALHA na migration $m:"; grep -vE '^(NOTICE|CREATE|ALTER|GRANT|REVOKE|COMMENT|DO|SET|INSERT|DROP)' /tmp/mig.log | head -20; exit 1
  fi
done

$P -d fin_repos > /dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_financeiro_login') THEN
    CREATE ROLE app_financeiro_login LOGIN PASSWORD 'spike' IN ROLE app_financeiro;
  END IF;
END \$\$;

INSERT INTO tenant (id, razao_social, cnpj) VALUES
  ('$A','Empresa A','11111111000111'), ('$B','Empresa B','22222222000122');
INSERT INTO usuario (id, auth_user_id, nome, email) VALUES
  ('$UADM', gen_random_uuid(), 'Admin',   'adm@x'),
  ('$ULEI', gen_random_uuid(), 'Leitura', 'lei@x');
INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES
  ('$A','$UADM','admin'), ('$A','$ULEI','leitura'), ('$B','$UADM','admin');
INSERT INTO cliente (id, tenant_id, nome, documento, documento_tipo, documento_validado, documento_origem)
  VALUES ('$CLI','$A','Cliente da fixture','11144477735','cpf',true,'coleta_local');
INSERT INTO usina (id, tenant_id, codigo_geradora, distribuidora)
  VALUES ('$USI','$A','GER-FIXTURE','Equatorial');
INSERT INTO unidade_consumidora (id, tenant_id, cliente_id, numero_uc, distribuidora)
  VALUES ('$UC','$A','$CLI','UC-FIXTURE','Equatorial');
SQL

npm install --silent > /dev/null 2>&1
# O generate precisa do schema-engine. Em ambiente sem acesso a binaries.prisma.sh
# o stub resolve: generate nao consulta banco, so precisa do binario existir.
if [ ! -d src/generated/prisma ]; then
  printf '#!/bin/sh\necho "{}"\n' > /tmp/stub-schema-engine && chmod +x /tmp/stub-schema-engine
  PRISMA_SCHEMA_ENGINE_BINARY=/tmp/stub-schema-engine PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    npx prisma generate > /dev/null
fi

export TEST_DATABASE_URL="postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos"
export TEST_TENANT_A="$A" TEST_TENANT_B="$B"
export TEST_USUARIO_ADMIN="$UADM" TEST_USUARIO_LEITURA="$ULEI"
export TEST_CLIENTE="$CLI" TEST_UC="$UC" TEST_USINA="$USI"

echo "=== repositorio de cliente"
node --experimental-strip-types tests/repos-cliente.ts
echo
echo "=== repositorio de contrato: R14 e a ordem da renovacao"
node --experimental-strip-types tests/repos-contrato.ts
