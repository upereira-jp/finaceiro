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
AUTHADM='0a0a0001-0000-4000-8000-00000000000a'
AUTHLEI='0a0a0002-0000-4000-8000-00000000000b'
# Os quatro papeis do PRD 3 existem na fixture para que a matriz seja testavel
# INTEIRA. Sem `financeiro` e `cobranca` aqui, metade da tabela nao tem sujeito.
UFIN='aaaa0003-0000-4000-8000-00000000000c'
UCOB='aaaa0004-0000-4000-8000-00000000000d'
CLI='cccc0001-0000-4000-8000-00000000000c'
# crm_tenant_id, NUNCA tenant_id (regra 6). E o do CRM da G3.
CRMT='d4640f4b-0000-4000-8000-00000000000f'
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

# HEREDOC NAO CITADO de proposito: ele PRECISA expandir \$A, \$CLI e os demais
# uuid da fixture. O preco e que bash tambem expande crase e \$(...) aqui dentro,
# e uma crase de comentario SQL vira execucao de comando - "financeiro: command
# not found" no CI, por causa de um `financeiro` entre crases num comentario.
# Aspas em vez de crase dentro deste bloco, sempre.
$P -d fin_repos > /dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_financeiro_login') THEN
    CREATE ROLE app_financeiro_login LOGIN PASSWORD 'spike' IN ROLE app_financeiro;
  END IF;
END \$\$;

INSERT INTO tenant (id, razao_social, cnpj) VALUES
  ('$A','Empresa A','11111111000111'), ('$B','Empresa B','22222222000122');
-- auth_user_id FIXO: a suite de HTTP entra por ele (e o que o Autenticador
-- devolve) e gen_random_uuid() aqui tornaria o login impossivel de escrever.
INSERT INTO usuario (id, auth_user_id, nome, email) VALUES
  ('$UADM', '$AUTHADM', 'Admin',      'adm@x'),
  ('$ULEI', '$AUTHLEI', 'Leitura',    'lei@x'),
  ('$UFIN', gen_random_uuid(), 'Financeiro', 'fin@x'),
  ('$UCOB', gen_random_uuid(), 'Cobranca',   'cob@x');
INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES
  ('$A','$UADM','admin'), ('$A','$ULEI','leitura'),
  ('$A','$UFIN','financeiro'), ('$A','$UCOB','cobranca'),
  ('$B','$UADM','admin');
INSERT INTO cliente (id, tenant_id, nome, documento, documento_tipo, documento_validado, documento_origem)
  VALUES ('$CLI','$A','Cliente da fixture','11144477735','cpf',true,'coleta_local');
INSERT INTO usina (id, tenant_id, codigo_geradora, distribuidora)
  VALUES ('$USI','$A','GER-FIXTURE','Equatorial');
INSERT INTO unidade_consumidora (id, tenant_id, cliente_id, numero_uc, distribuidora)
  VALUES ('$UC','$A','$CLI','UC-FIXTURE','Equatorial');
-- Conector do tenant A. Nasce aqui, como postgres, e nao pela suite: a policy de
-- conector_crm exige contexto + vinculo, e montar fixture pelo client externo e
-- exatamente o erro que este projeto persegue (escrita fora de transacao nao tem
-- SET LOCAL e a WITH CHECK recusa).
INSERT INTO conector_crm (tenant_id, tipo, crm_tenant_id, credencial_ref, ativo)
  VALUES ('$A','intreply','$CRMT','vault://crm/g3',true);

-- Schema "financeiro" FALSO, com a forma real das views do CRM. Serve para
-- exercitar src/crm/leitura.ts de verdade - o SQL constante, o LIMIT ligado e a
-- validacao por linha da invariante 9 - sem depender de credencial do CRM.
-- Uma linha certa e uma DIVERGENTE, que e o que o teste precisa provocar.
CREATE SCHEMA financeiro;
CREATE TABLE financeiro._vg (
  codigo text, lead_id uuid, nome text, telefone text, email text, funil text,
  etapa text, ganho_em timestamptz, valor_venda numeric, valor_posicao numeric,
  parceria_tipo text, comissionamento text, partner_id uuid, parceiro_nome text,
  vendedor_origem text, responsavel_atual text, consumo_kwh numeric,
  consumo_reais numeric, created_at timestamptz, comissionamento_n_opcoes bigint,
  crm_tenant_id uuid);
INSERT INTO financeiro._vg VALUES
  ('V-1','aaaa1111-0000-4000-8000-00000000cc01','Certo',NULL,NULL,'Vendas - Assinatura',
   'GANHO',now(),1000,NULL,NULL,'PADRAO',NULL,NULL,NULL,NULL,850,NULL,now(),1,'$CRMT'),
  ('V-2','aaaa2222-0000-4000-8000-00000000cc02','De outra empresa',NULL,NULL,'Vendas - Assinatura',
   'GANHO',now(),1000,NULL,NULL,'PADRAO',NULL,NULL,NULL,NULL,850,NULL,now(),1,
   'ffffffff-0000-4000-8000-0000000000ff');
CREATE VIEW financeiro.vendas_ganhas AS SELECT * FROM financeiro._vg;

-- Role de leitura do CRM falso: so SELECT, so no schema financeiro. E o perfil
-- que conferirRoleDeLeitura() tem que ACEITAR.
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='crm_ro_teste') THEN
    CREATE ROLE crm_ro_teste LOGIN PASSWORD 'spike' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;
GRANT USAGE ON SCHEMA financeiro TO crm_ro_teste;
GRANT SELECT ON financeiro.vendas_ganhas TO crm_ro_teste;
SQL

npm install --silent > /dev/null 2>&1
# O generate precisa do schema-engine. Em ambiente sem acesso a binaries.prisma.sh
# o stub resolve: generate nao consulta banco, so precisa do binario existir.
#
# RODA SEMPRE, e a versao anterior tinha `if [ ! -d src/generated/prisma ]`. A
# condicao gerava quando o diretorio NAO existia e portanto NUNCA atualizava um
# obsoleto - que e exatamente o estado perigoso, e o mesmo que derrubou a aba
# Documento em producao em 30/07: client de 28/07 contra banco com as migrations
# 19 e 20. Meio segundo por execucao e barato; a suite A9 de tests/app.ts confere
# a correspondencia, e ela so pode confiar num client fresco.
printf '#!/bin/sh\necho "{}"\n' > /tmp/stub-schema-engine && chmod +x /tmp/stub-schema-engine
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/stub-schema-engine PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
  npx prisma generate > /dev/null

export TEST_DATABASE_URL="postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos"
# Usada SO pela suite do composition root, para provar que ela recusa a role
# errada. Nenhuma outra suite conecta por aqui: por `postgres` (rolbypassrls) a
# RLS fica desligada e o verde nao significa nada.
export TEST_DATABASE_URL_SUPERUSER="postgresql://$PGUSER:$PGPASSWORD@127.0.0.1:5432/fin_repos"
export TEST_TENANT_A="$A" TEST_TENANT_B="$B"
export TEST_USUARIO_ADMIN="$UADM" TEST_USUARIO_LEITURA="$ULEI"
export TEST_USUARIO_FINANCEIRO="$UFIN" TEST_USUARIO_COBRANCA="$UCOB"
export TEST_AUTH_ADMIN="$AUTHADM" TEST_AUTH_LEITURA="$AUTHLEI"
export TEST_CLIENTE="$CLI" TEST_UC="$UC" TEST_USINA="$USI"
export TEST_CRM_TENANT="$CRMT"
# Conexao ao schema `financeiro` falso, pela role somente-leitura.
export TEST_CRM_URL="postgresql://crm_ro_teste:spike@127.0.0.1:5432/fin_repos"

echo "=== matriz de papeis do PRD 3, celula a celula"
node --experimental-strip-types tests/matriz-papeis.ts
echo
echo "=== composition root: a role de runtime e os dois pools"
node --experimental-strip-types tests/app.ts
echo
echo "=== repositorio de cliente"
node --experimental-strip-types tests/repos-cliente.ts
echo
echo "=== repositorio de contrato: R14 e a ordem da renovacao"
node --experimental-strip-types tests/repos-contrato.ts
echo
echo "=== repositorio de unidade consumidora"
node --experimental-strip-types tests/repos-uc.ts
echo
echo "=== repositorios de usina e originador"
node --experimental-strip-types tests/repos-usina.ts
echo
echo "=== rateio: R11, o teto por usina"
node --experimental-strip-types tests/repos-rateio.ts
echo
echo "=== carteira ponta a ponta: compor, emitir, boleto, baixa e split"
node --experimental-strip-types tests/repos-carteira.ts
echo
# O que so se verifica com banco: o mime pela ASSINATURA do arquivo, o sha256
# derivado pelo GATILHO e a lista de campos fechada pelo ENUM. Sem banco, as tres
# passariam verdes quebradas - eram a pendencia (b) da Q-DOCFATURA-01.
echo "=== documento de cobranca: identidade, logo pelo gatilho, campos pelo enum e o QR"
node --experimental-strip-types tests/repos-documento.ts
echo
# Os dois processos periodicos do PRD 6. O que so se ve com banco: o carimbo
# chegando a coluna, o predicado da fila em SQL, o EXCLUDE recusando a segunda
# rodada e a idempotencia vindo do `liquidacao_fatura_unica` e nao da chave.
echo "=== agenda de cobranca: fila de emissao com retry e consulta ativa"
node --experimental-strip-types tests/repos-agenda.ts
echo
# Q-TARIFA-CONC-01. O casamento e por `numero_uc` (a distribuidora nao conhece id
# nosso), o total e coluna GERADA, e "ausente nao e zero" precisa ser observavel.
echo "=== tarifas da concessionaria: lancamento em lote por numero de UC"
node --experimental-strip-types tests/repos-tarifas.ts
echo
echo "=== HTTP: rotas, matriz de papeis e traducao de erro"
node --experimental-strip-types tests/http.ts
echo
echo "=== auth proprio: JWT do Supabase e os ataques que o modulo impede"
node --experimental-strip-types tests/auth-jwt.ts
echo
echo "=== conector do CRM: dedup, idempotencia, recusas e reconciliacao"
node --experimental-strip-types tests/conector.ts
