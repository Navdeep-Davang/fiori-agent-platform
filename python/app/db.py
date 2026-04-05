import json
import logging
from hdbcli import dbapi

from .config import HANA_CREDENTIALS

logger = logging.getLogger(__name__)


def _hana_connect_params(creds: dict) -> dict:
    """Normalize SAP HANA binding / .env shapes for hdbcli."""
    if not creds:
        return {}
    host = creds.get("host") or creds.get("hostname")
    port = creds.get("port") or 443
    user = creds.get("user")
    password = creds.get("password")
    schema = creds.get("schema") or creds.get("currentschema")
    try:
        port = int(port)
    except (TypeError, ValueError):
        port = 443
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "schema": schema,
    }


def get_hana_connection():
    """Open a HANA connection using VCAP_SERVICES or HANA_* env vars. No fallback DB."""
    p = _hana_connect_params(HANA_CREDENTIALS)
    if not p["host"] or not p["user"] or not p["password"]:
        logger.warning(
            "HANA credentials incomplete (need host, user, password). "
            "Use CF hana binding or set HANA_HOST, HANA_USER, HANA_PASSWORD in .env."
        )
        return None
    try:
        kwargs = {
            "address": p["host"],
            "port": p["port"],
            "user": p["user"],
            "password": p["password"],
        }
        if p["schema"]:
            kwargs["currentSchema"] = p["schema"]
        return dbapi.connect(**kwargs)
    except Exception as e:
        logger.error("Failed to connect to HANA: %s", e)
        return None


def get_connection():
    """
    Returns a live HANA connection.

    Raises RuntimeError if credentials are missing or connection fails (HANA only).
    """
    conn = get_hana_connection()
    if conn is None:
        raise RuntimeError(
            "Cannot connect to SAP HANA. For local dev: set HANA_HOST, HANA_PORT, HANA_USER, "
            "HANA_PASSWORD, HANA_SCHEMA in .env (from your HDI/service key), or run Python "
            "with VCAP_SERVICES containing a hana binding. Seed data: deploy CSVs with "
            "`npm run deploy:hana` after `cds bind`. See README and doc/Action-Plan/04-hybrid-hana-spectrum-1.md."
        )
    return conn


def query_as_dicts(conn, query, params=None):
    """Executes a query and returns list of dictionaries."""
    cursor = conn.cursor()
    try:
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)

        if hasattr(cursor, "description") and cursor.description:
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        return []
    finally:
        cursor.close()
