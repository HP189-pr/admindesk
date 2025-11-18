"""Utility script to DROP and RECREATE the Postgres database defined in settings.

Usage (PowerShell):

  # (Optional) set env vars instead of hard-coded defaults
  # $env:PGUSER="postgres"; $env:PGPASSWORD="yourpassword"; $env:PGHOST="localhost"; $env:PGPORT="5432"; $env:PGDB="frontdesk"
  python reset_db.py

Safety: This WILL IRREVERSIBLY DELETE the target database. Use only for dev (Option A fresh reset).
"""
from __future__ import annotations
import os, sys, time
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_NAME = os.getenv("PGDB", "frontdesk")
USER = os.getenv("PGUSER", "postgres")
PASSWORD = os.getenv("PGPASSWORD", "Ksv@svkm2007")  # dev fallback; prefer setting PGPASSWORD env variable
HOST = os.getenv("PGHOST", "localhost")
PORT = int(os.getenv("PGPORT", "5432"))

CONFIRM_ENV = os.getenv("RESET_DB_CONFIRM", "YES")
if CONFIRM_ENV.upper() not in {"YES", "Y", "TRUE", "1"}:
    print("Refusing to run because RESET_DB_CONFIRM not set to YES")
    sys.exit(1)

print(f"[reset_db] Connecting to postgres server at {HOST}:{PORT} as {USER}")

try:
    conn = psycopg2.connect(dbname="postgres", user=USER, password=PASSWORD, host=HOST, port=PORT)
except Exception as e:
    print("Failed to connect to server:", e)
    sys.exit(1)

conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()

# Terminate active sessions to the target DB
print(f"[reset_db] Terminating active sessions on {DB_NAME} ...")
cur.execute(
    """
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = %s AND pid <> pg_backend_pid();
    """,
    (DB_NAME,)
)
terminated = cur.rowcount
print(f"[reset_db] Terminated {terminated} sessions (rowcount heuristic).")

# Drop database
print(f"[reset_db] Dropping database {DB_NAME} if exists ...")
cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME};")

# Recreate database
print(f"[reset_db] Creating database {DB_NAME} ...")
cur.execute(f"CREATE DATABASE {DB_NAME};")

cur.close(); conn.close()
print("[reset_db] Database recreated successfully.")
print("[reset_db] Next: run 'python manage.py migrate' then tests.")
