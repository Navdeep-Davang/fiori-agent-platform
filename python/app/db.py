import os
import sqlite3
import json
import logging
from hdbcli import dbapi
from .config import HANA_CREDENTIALS

logger = logging.getLogger(__name__)

# Persistent SQLite file for local development
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "local_dev.db")
SEED_SQL_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "seed_local.sql")

def get_hana_connection():
    """Returns a live HANA connection or None if credentials missing."""
    creds = HANA_CREDENTIALS
    if not creds.get("host") or not creds.get("user"):
        return None
    
    try:
        conn = dbapi.connect(
            address=creds["host"],
            port=int(creds["port"]),
            user=creds["user"],
            password=creds["password"],
            currentSchema=creds.get("schema")
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to HANA: {e}")
        return None

def get_sqlite_connection():
    """Returns a connection to the local SQLite database, seeding if necessary."""
    exists = os.path.exists(SQLITE_DB_PATH)
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    
    if not exists or not _check_table_exists(conn, "acp_demo_Vendor"):
        _seed_sqlite(conn)
        
    return conn

def _check_table_exists(conn, table_name):
    cursor = conn.cursor()
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
    return cursor.fetchone() is not None

def _seed_sqlite(conn):
    """Executes the seed SQL script from python/db/seed_local.sql."""
    if not os.path.exists(SEED_SQL_PATH):
        logger.warning(f"Seed SQL file not found at {SEED_SQL_PATH}")
        return
    
    with open(SEED_SQL_PATH, 'r') as f:
        seed_sql = f.read()
    
    try:
        # SQLite cannot handle multiple statements in a single execute()
        conn.executescript(seed_sql)
        conn.commit()
        logger.info("Successfully seeded local SQLite database.")
    except Exception as e:
        logger.error(f"Failed to seed SQLite: {e}")

def get_connection():
    """Universal connection getter: HANA if available, else SQLite."""
    conn = get_hana_connection()
    if conn:
        return conn
    return get_sqlite_connection()

def query_as_dicts(conn, query, params=None):
    """Executes a query and returns list of dictionaries."""
    cursor = conn.cursor()
    try:
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        
        # Determine if we're using HANA or SQLite
        if hasattr(cursor, 'description') and cursor.description:
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        return []
    finally:
        cursor.close()
