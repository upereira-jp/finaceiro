#!/bin/bash
set -e
export PGPASSWORD=spike
P="psql -h 127.0.0.1 -U postgres -q -v ON_ERROR_STOP=1"
$P -d postgres -c "DROP DATABASE IF EXISTS spike WITH (FORCE)" -c "CREATE DATABASE spike" > /dev/null
for r in app_pool app_tenant_a app_tenant_b; do
  $P -d postgres -c "DROP OWNED BY $r" -c "DROP ROLE $r" > /dev/null 2>&1 || true
done
$P -d spike -f 01-schema.sql 2>&1 | grep -v NOTICE || true
$P -d spike -f 02-variantes.sql 2>&1 | grep -v NOTICE || true
node spike.mjs
