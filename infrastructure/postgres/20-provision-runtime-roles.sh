#!/bin/sh
set -eu

: "${AICRM_AUTH_PASSWORD:?AICRM_AUTH_PASSWORD must be set}"
: "${AICRM_APP_PASSWORD:?AICRM_APP_PASSWORD must be set}"

validate_password() {
  case "$1" in
    ''|*[!0123456789abcdef]*)
      return 1
      ;;
  esac
  [ "${#1}" -eq 64 ]
}

if ! validate_password "$AICRM_AUTH_PASSWORD" || ! validate_password "$AICRM_APP_PASSWORD"; then
  printf '%s\n' 'Runtime role secrets must be 64 lowercase hexadecimal characters.' >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_auth_runtime') THEN
    CREATE ROLE aicrm_auth_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      PASSWORD '${AICRM_AUTH_PASSWORD}';
  ELSE
    ALTER ROLE aicrm_auth_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      PASSWORD '${AICRM_AUTH_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_app_runtime') THEN
    CREATE ROLE aicrm_app_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      PASSWORD '${AICRM_APP_PASSWORD}';
  ELSE
    ALTER ROLE aicrm_app_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      PASSWORD '${AICRM_APP_PASSWORD}';
  END IF;
END
\$\$;
SQL
