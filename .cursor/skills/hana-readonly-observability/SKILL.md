---
name: hana-readonly-observability
description: Reads SAP HANA row counts or sample data using project .env HANA_* variables for local observability. Use when debugging CAP vs DB drift, verifying seed deploy, or confirming schema after hybrid deploy; prefers Governance OData with JWT first—SQL is diagnostics only. Forbids writes.
---

# HANA read-only observability (this repo)

## Principles

1. **OData first:** For RBAC-aligned truth, call `GovernanceService` via App Router (`http://localhost:5000/odata/v4/governance/...`) with a logged-in session or Bearer token—not raw SQL.
2. **SQL second:** Use the helper script only with a **SELECT-only** technical user. Never run DDL/DML/DELETE from automation.
3. **Secrets:** Read credentials from repo-root `.env`: **`HANA_HOST`**, **`HANA_PORT`** (optional, default `443`), **`HANA_USER`**, **`HANA_PASSWORD`** are used by the helper script for TCP/TLS login. **`HANA_SCHEMA`** is for **you** when writing qualified SQL (HDI container schema); the script does not read or substitute it. Never commit secrets or paste them into chat logs.

## Helper script

From repository root (after `.env` is populated). The script connects with **TLS** (`encrypt: true`, `sslValidateCertificate: false` — typical for SAP HANA Cloud from local dev).

**Important:** Only `HANA_HOST`, `HANA_PORT`, `HANA_USER`, and `HANA_PASSWORD` are loaded for the connection. **`HANA_SCHEMA` is not injected** — embed the schema name yourself inside the `SELECT` (see examples below).

### Smoke test (no schema)

Confirms `.env` and network before running schema-qualified queries:

```bash
node scripts/hana-readonly-query.cjs "SELECT 1 AS X FROM DUMMY"
```

### Windows PowerShell

Use `;` instead of `&&`. Keep the SQL in double quotes:

```powershell
Set-Location "E:\Programs\App\fiori-agent-platform"
node scripts/hana-readonly-query.cjs "SELECT 1 AS X FROM DUMMY"
```

Row count example (replace `YOUR_HDI_SCHEMA` with the value of `HANA_SCHEMA` from `.env`):

```powershell
node scripts/hana-readonly-query.cjs "SELECT COUNT(*) AS C FROM \"YOUR_HDI_SCHEMA\".\"acp_McpServer\""
```

### bash / WSL / Git Bash

```bash
node scripts/hana-readonly-query.cjs "SELECT COUNT(*) AS C FROM \"<HANA_SCHEMA>\".\"acp_McpServer\""
```

- Replace placeholders with your HDI schema name (quoted identifiers; often uppercase with underscores).
- The script rejects statements that are not a single `SELECT` (trimmed, case-insensitive).

### `.env` format gotchas

- Use `KEY=value` lines (no `export` prefix — the loader does not understand it).
- Comment lines should start with `#` as the first non-whitespace character on that line.

See repository root [scripts/hana-readonly-query.cjs](../../../scripts/hana-readonly-query.cjs).

## When SQL names differ from CDS

CAP deploys physical tables named from entity namespace (e.g. `acp_McpServer`). If a query fails with “invalid object”, list tables with `SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = '<HANA_SCHEMA>'` (still read-only) or consult HDI in BAS.

## Stop conditions

- If hybrid bind is broken, fix `cds bind` / deploy before deep SQL.
- If unsure about destructive potential of a statement, **do not run it**.
