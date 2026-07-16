-- Run once as a PostgreSQL administrator. Login roles should inherit these group roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authlane_runtime') THEN
    CREATE ROLE authlane_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authlane_worker') THEN
    CREATE ROLE authlane_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT authlane_runtime TO authlane_app;
GRANT authlane_worker TO authlane_job;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authlane_runtime, authlane_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authlane_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authlane_runtime;

GRANT SELECT ON organization, services, organization_services TO authlane_worker;
GRANT SELECT, UPDATE ON connections TO authlane_worker;
GRANT SELECT, INSERT, UPDATE ON outbox_events TO authlane_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON secret_records TO authlane_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authlane_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authlane_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authlane_runtime, authlane_worker;
