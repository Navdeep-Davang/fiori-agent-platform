# MCP Server Registration Guide

This document describes the required fields and configuration for registering an MCP Server in the Governance database.

## 1. Required Fields

| Field | Description | Example |
| :--- | :--- | :--- |
| **Name** | Display name for the server. | `Procurement Python MCP` |
| **Destination** | BTP Destination name (Cloud) or unique ID. | `PYTHON_MCP_SERVICE` |
| **Base URL** | Fallback HTTP URL (Local/Hybrid). | `http://localhost:8000` |
| **Transport** | Protocol used. | `HTTP` |
| **Environment** | Deployment stage. | `dev`, `prod` |

## 2. URL Resolution Logic (`resolveMcpBaseUrl`)

The system follows this priority order to find the server URL:

1.  **Destination Service**: If `destinationName` is provided, the system attempts to fetch the URL from the SAP BTP Destination Service.
2.  **Base URL**: If the destination is not found or fails (common in local dev), it falls back to the `baseUrl` field.
3.  **Failure**: If neither are resolvable, the connection fails with an error.

## 3. Environment Specifics

### Hybrid / Local Dev
*   Set `baseUrl` to `http://localhost:8000`.
*   Ensure the Python service is running and listening on that port.

### Cloud Foundry (CF)
*   Register a **BTP Destination** named `PYTHON_MCP_SERVICE` pointing to the internal/external URL of your Python app.
*   Leave `baseUrl` as an optional fallback or set it to the public route.

## 4. Troubleshooting — when MCP does not connect

Use this **order** (Plan **07** / B.2 runbook):

1. **Python `/health`**: From the machine running CAP, confirm the resolved base URL’s `/health` responds (e.g. hybrid: `http://127.0.0.1:8000/health`). If this fails, start or fix the Python MCP service.
2. **BTP Destination** (if `destinationName` is set): In the BTP subaccount, verify the destination exists, credentials are valid, and the URL matches the intended MCP.
3. **HANA row** (`McpServer`): In governance data, confirm `baseUrl` / `destinationName` are correct for the environment (no typo; trailing slashes are normalized by code).
4. **App Router + session**: Open the admin app via the App Router (e.g. `http://localhost:5000/...` in hybrid). If OData returns **401**, refresh the page or sign in again—**`testConnection`** needs a valid user session and roles (`Agent.Author` / `Agent.Admin` per CDS).

**Additional checks** if **Test connection** still fails after the above:
- Confirm the `baseUrl` has no trailing-slash issues and matches where the process is actually listening.
- For localhost vs Node resolution issues, the CAP handler may resolve `localhost` to `127.0.0.1` for outbound HTTP.
