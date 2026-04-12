---
name: ias-api-orchestration
description: Orchestrates SAP Cloud Identity Services (Identity Authentication) via SCIM/APIs and scripts/ias-scim.ps1. Use when automating IAS users, custom attributes (e.g. dept), or SCIM; for BTP subaccount role collections and btp CLI session targeting use the companion skill btp-cli-orchestration.
---

# IAS API + BTP CLI orchestration

## What exists (no “IAS CLI”)

SAP does **not** ship an `ias` terminal binary. Automation is **HTTPS APIs** (SCIM 2.0 + token endpoint) plus **`btp`** for BTP-side security. The agent should combine these; do not imply a single all-in-one CLI.

## Where the operator gets tenant URL and API credentials

| Item | Where |
|------|--------|
| **IAS admin / tenant host** | BTP **Instances and Subscriptions** → **Cloud Identity Services** instance → **Go to Application** (opens admin console). The browser URL shows the tenant (e.g. `https://<tenant-id>.accounts.ondemand.com` or `…trial-accounts.ondemand.com`). |
| **SCIM / API base** | Use the **Identity Directory SCIM** base URL from [SAP Help – APIs](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/apis) for your scenario (paths evolve; do not hardcode obsolete `/scim` vs `/service/scim` without checking current doc). |
| **OAuth client credentials** | IAS admin: create a **System** (technical) administrator with **Manage Users** (and **Manage Groups** if needed) → **Secrets** → generate **Client ID** and **Client Secret**. |
| **Token URL** | Documented under [Configure the client for Identity Authentication token endpoint (client credentials)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/configure-client-to-call-identity-authentication-token-endpoint-for-client-credentials-flow). Use this to obtain a **Bearer** access token before SCIM calls. |

Store secrets in env vars or a secret manager; never commit Client Secret.

### URL construction (read this — not in Cockpit)

The BTP Cockpit link only opens the admin UI; it does **not** print the OAuth/SCIM URLs. Build them from your **tenant host** (first label in `https://<tenant-host>.trial-accounts.ondemand.com`).

**BTP trial IAS** (`*.trial-accounts.ondemand.com`), replace `<tenant>` with your subdomain (example: `aleqxxkck`):

| Purpose | URL |
|---------|-----|
| **OAuth2 token** (client credentials) | `https://<tenant>.trial-accounts.ondemand.com/oauth2/token` |
| **SCIM 2.0 base** (Identity Directory) | `https://<tenant>.trial-accounts.ondemand.com/service/scim` |

**Non-trial** production-style hosts use `https://<tenant>.accounts.ondemand.com/...` with the same path suffixes (`/oauth2/token`, `/service/scim`). If a call returns **404** on `/service/scim`, re-check [SAP Help – APIs](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/apis) for the current SCIM path (SAP has used both `/service/scim` and `/scim` in different versions).

**Authoritative steps** for the token request body and headers: [Configure the client for the Identity Authentication token endpoint (client credentials)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/configure-client-to-call-identity-authentication-token-endpoint-for-client-credentials-flow).

## Control surface: what APIs vs what `btp`

| Goal | Tool | Notes |
|------|------|--------|
| Create/update/delete **IAS users** | **SCIM 2.0** (REST) | Primary automation path. |
| Set **custom attributes** (e.g. `customAttribute1` for **dept**) | SCIM extension **`urn:sap:cloud:scim:schemas:extension:custom:2.0:User`** | Map to XSUAA `dept` in BTP role/trust config separately. |
| Manage **IAS groups** | SCIM | If using group-based rules. |
| **Establish / manage trust** between **BTP** and **IAS** | **`btp`** trust commands (e.g. `btp create security/trust`) + Help | First-time trust may still be done in Cockpit once; see [btp create security/trust](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-create-security-trust) and [Managing trust from SAP BTP to Identity Authentication](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-trust-from-sap-btp-to-identity-authentication-tenant). |
| **Assign BTP role collections** (e.g. ACP Chat User) | **`btp assign security/role-collection`** | **Not** IAS; assigns platform/app roles to a user **by email**; may create **shadow user**. |
| Map **IdP claims → XSUAA JWT** (`dept`) | **BTP Cockpit** (Trust, Roles, application security) | Attribute mapping is **configuration**, not a single IAS SCIM call. Verify with decoded JWT after login. |

### `btp` CLI vs Cockpit for attribute mapping

**Mapping IAS `customAttribute1` (or similar) into the XSUAA JWT as `dept`** is **not** done via **`btp`** subcommands. **`btp`** can list **trust** and assign **role collections**; **Cockpit** (or XSUAA Authorization APIs) is where **IdP → XSUAA attribute mapping** is configured. **IAS SCIM** (`scripts/ias-scim.ps1`) **sets** the user attribute in IAS; **BTP** **maps** it into the token.

**Verify end-to-end:** (1) **`GetUser`** via SCIM — confirm **`customAttribute1`** in IAS. (2) **Decode the access token** after login — confirm **`xs.user.attributes.dept`** (or equivalent). **This repo** exposes **`GET /api/me`** with **`debug`** when **`ACP_DEBUG_IDENTITY=true`** on CAP; browser: **`?acpIdentityDebug=1`** logs to the console.

## Recommended orchestration order (this repo)

1. **IAS**: SCIM create user + set custom attribute used as department source (e.g. **customAttribute1** aligned with `xs-security.json` / action plan).
2. **BTP**: `btp login` → `btp target` subaccount → `btp assign security/role-collection "<name>" --to-user <email> --of-idp <origin>` (origin from **Trust Configuration** if not default).
3. **Validate**: User signs in; decode access token and confirm **`xs.user.attributes.dept`** (or configured mapping).

## Minimal PowerShell pattern (outline only)

Principles: load **Client ID/Secret** from env; **POST** to token endpoint; **GET/POST/PATCH** SCIM with `Authorization: Bearer <token>` and `Content-Type: application/scim+json`. Exact URLs must match current SAP API documentation.

```powershell
# Example env: $env:IAS_TOKEN_URL, $env:IAS_SCIM_BASE, $env:IAS_CLIENT_ID, $env:IAS_CLIENT_SECRET
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($env:IAS_CLIENT_ID):$($env:IAS_CLIENT_SECRET)"))
# Request access token (grant_type=client_credentials) per SAP Help, then:
# Invoke-RestMethod -Uri "$env:IAS_SCIM_BASE/Users?filter=..." -Headers @{ Authorization = "Bearer $accessToken" }
```

Do not paste real secrets into chat or repo files.

## Companion: BTP CLI (`btp`)

Subaccount **role collection** assignment, **`btp target`**, **`btp list security/*`** → see **`.cursor/skills/btp-cli-orchestration/SKILL.md`**.

## Companion: BTP Authorization REST (`btp-auth-api.ps1`)

Role collection / app JSON via **OAuth client_credentials** → see **`.cursor/skills/btp-api-orchestration/SKILL.md`**.

## When to read `reference.md`

For curated SAP Help and community links (SCIM, custom attributes, trust, role collections).

## Agent tool contract (local IAS — secrets stay out of the model)

This skill does **not** add a Cursor MCP binary. The **approved “tool”** is the repo script:

| Item | Rule |
|------|------|
| **Executable** | `scripts/ias-scim.ps1` — loads **`IAS_CLIENT_ID`**, **`IAS_CLIENT_SECRET`**, **`IAS_TOKEN_URL`**, **`IAS_SCIM_BASE`** from **repo-root `.env`** then **`.env.local`** (same keys in `.env.local` override `.env`). Values may contain `=`; the parser splits on the **first** `=` only. |
| **Agent MUST** | Run the script via **Shell** from the **repository root** and use **only stdout/stderr** to answer (user lists, errors). |
| **Agent MUST NOT** | Use **Read**, **Grep**, or **SemanticSearch** on `.env`, `.env.local`, `.env.*`, or any file that contains those credentials. Never ask the user to paste Client Secret into chat. |

**Invocations (PowerShell, repo root):**

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action Token
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action OpenIdMetadata
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action UserOidcClaims
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action ListUsers
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action ListGroups
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ias-scim.ps1 -Action GetUser -UserName "user@example.com"
```

- **`Token`** — prints only token length and `expires_in` (sanity check; no raw token).  
- **`OpenIdMetadata`** — GET `/.well-known/openid-configuration` (OIDC discovery). Needs **`IAS_TOKEN_URL`** only (tenant host is derived); no SCIM base. Use to confirm issuer, `authorization_endpoint`, `jwks_uri`, and supported grant types.  
- **`UserOidcClaims`** — **Resource Owner Password** grant (only if enabled on the OAuth client / tenant) + prints **decoded JWT payload** JSON (no raw `id_token` / `access_token`). Requires **`IAS_ROPC_USER`** and **`IAS_ROPC_PASSWORD`** in `.env` (gitignored). If ROPC is disabled, verify claims via browser **`id_token`** after login or **`GET /api/me`** with **`ACP_DEBUG_IDENTITY=true`**.  
- **`ListUsers` / `ListGroups`** — SCIM JSON to stdout.  
- **`GetUser`** — SCIM filter `userName eq "…"` (adjust if your tenant uses a different login). **SCIM shows `customAttribute1`**, not the OIDC claim name **`dept`**; trust mapping affects tokens, not SCIM field names.

If the Shell environment cannot reach the tenant (network), have the user run the same command locally and paste **redacted** JSON if needed.

**Optional:** Add repo-root **`.cursorignore`** entries for `.env` and `.env.local` so editors do not index secrets into AI context.

## Assistant / Cursor workflow (no secrets in chat)

- **Never** paste Client Secret into the IDE chat. If exposed, **revoke the secret** in IAS admin and create a new one.
- Put `IAS_*` keys in **repo-root `.env`** and/or **`.env.local`** (both gitignored). Prefer **`.cursorignore`** on those files.
- The agent uses **`scripts/ias-scim.ps1`** per the **Agent tool contract** above — not direct file reads of env files.

## Anti-patterns

- Expecting **one** CLI to create IAS users **and** assign BTP role collections (split: **SCIM + `btp`**).
- Hardcoding SCIM paths without checking **current** SAP API documentation.
- Storing Client Secret in the skill or in committed scripts.
