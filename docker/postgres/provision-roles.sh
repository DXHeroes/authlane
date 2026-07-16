#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AUTHLANE_RUNTIME_DB_PASSWORD:?AUTHLANE_RUNTIME_DB_PASSWORD is required}"
: "${AUTHLANE_WORKER_DB_PASSWORD:?AUTHLANE_WORKER_DB_PASSWORD is required}"

psql "$DATABASE_URL" \
  --set ON_ERROR_STOP=1 \
  --set runtime_password="$AUTHLANE_RUNTIME_DB_PASSWORD" \
  --set worker_password="$AUTHLANE_WORKER_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE authlane_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authlane_app') \gexec
SELECT format('ALTER ROLE authlane_app PASSWORD %L', :'runtime_password') \gexec

SELECT format('CREATE ROLE authlane_job LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS PASSWORD %L', :'worker_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authlane_job') \gexec
SELECT format('ALTER ROLE authlane_job PASSWORD %L', :'worker_password') \gexec
SQL

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file /app/packages/database/sql/roles.sql
