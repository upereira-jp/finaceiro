#!/bin/bash
# Monta o banco fin_sessao com as migrations, uma fixture de duas empresas e
# quatro usuarios, e roda os testes da camada de sessao.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-spike}"
PGUSER="${PGUSER:-postgres}"
P="psql -h 127.0.0.1 -U $PGUSER -q -v ON_ERROR_STOP=1"

$P -d postgres -c "DROP DATABASE IF EXISTS fin_sessao WITH (FORCE)" -c "CREATE DATABASE fin_sessao" > /dev/null
# O `vault` de mentira ANTES das migrations: a 35 confere privilegio em
# `vault.decrypted_secrets`, e `has_table_privilege` LEVANTA quando a relacao
# nao existe. Sem isto a suite morre na 35a de 36. Ver tests/vault-de-mentira.sql.
$P -d fin_sessao -f tests/vault-de-mentira.sql > /dev/null
for m in prisma/migrations/*/migration.sql; do
  if ! $P -d fin_sessao -f "$m" > /tmp/mig.log 2>&1; then
    echo "FALHA na migration $m:"; grep -vE '^(NOTICE|CREATE|ALTER|GRANT|REVOKE|COMMENT|DO|SET)' /tmp/mig.log | head -20; exit 1
  fi
done

# Role COM login para o teste. Em producao quem tem senha e o app; aqui e o teste.
$P -d fin_sessao <<'SQL' > /dev/null
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_financeiro_login') THEN
    CREATE ROLE app_financeiro_login LOGIN PASSWORD 'spike' IN ROLE app_financeiro;
  END IF;
END $$;

INSERT INTO tenant (id, razao_social, cnpj) VALUES
  ('11110000-0000-4000-8000-000000000001','Empresa Um','11111111000111'),
  ('22220000-0000-4000-8000-000000000002','Empresa Dois','22222222000122');

INSERT INTO usuario (id, auth_user_id, nome, email) VALUES
  ('aaaa0001-0000-4000-8000-000000000001','aaaa1111-0000-4000-8000-000000000001','So na Um','um@x'),
  ('aaaa0002-0000-4000-8000-000000000002','aaaa2222-0000-4000-8000-000000000002','Nas duas','duas@x'),
  ('aaaa0003-0000-4000-8000-000000000003','aaaa3333-0000-4000-8000-000000000003','Suporte','sup@x'),
  ('aaaa0004-0000-4000-8000-000000000004','aaaa4444-0000-4000-8000-000000000004','Orfao','orf@x');

INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES
  ('11110000-0000-4000-8000-000000000001','aaaa0001-0000-4000-8000-000000000001','financeiro'),
  ('11110000-0000-4000-8000-000000000001','aaaa0002-0000-4000-8000-000000000002','admin'),
  ('22220000-0000-4000-8000-000000000002','aaaa0002-0000-4000-8000-000000000002','leitura');

INSERT INTO plataforma_admin (usuario_id, tier) VALUES
  ('aaaa0003-0000-4000-8000-000000000003','plataforma_suporte');

INSERT INTO cliente (tenant_id, nome) VALUES
  ('11110000-0000-4000-8000-000000000001','Cliente da Um'),
  ('22220000-0000-4000-8000-000000000002','Cliente da Dois');
SQL

npm install --silent > /dev/null 2>&1
if [ ! -d spike-transacao/generated ]; then
  printf '#!/bin/sh\necho "{}"\n' > /tmp/stub-schema-engine && chmod +x /tmp/stub-schema-engine
  PRISMA_SCHEMA_ENGINE_BINARY=/tmp/stub-schema-engine PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    npx prisma generate --schema=spike-transacao/schema.prisma > /dev/null
fi

CONN='postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_sessao' \
  node --experimental-strip-types tests/sessao.ts
