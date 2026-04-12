---
name: btp-api-orchestration
description: Calls the SAP Authorization and Trust Management REST API (OAuth client credentials from apiaccess or BTP security api-credential) via scripts/btp-auth-api.ps1 for role collections and apps discovery. Use when automating BTP security artifacts, debugging role collection attribute mappings, or pairing with ias-api-orchestration; not a substitute for the btp CLI or full platform APIs.
---

# BTP Authorization API orchestration

## What this is (and is not)

| Topic | Detail |
|--------|--------|
| **Purpose** | **OAuth2 `client_credentials`** + **GET** calls to **`/sap/rest/authorization/v2/...`** (role collections, apps) — same family as [Authorization API](https://api.sap.com/api/AuthorizationAPI/overview). |
| **Not included** | **Entire BTP platform** access. This token does **not** authorize Cloud Foundry `cf`, destinations, HANA, or unrelated services. |
| **Credentials** | **`apiaccess`** XSUAA instance service key **or** credentials from **`btp create security/api-credential`** (SAP’s preferred path for new automation — see [Managing API credentials](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-api-credentials-for-calling-rest-apis-of-sap-authorization-and-trust-management-service)). |
| **Privileges** | You do **not** add extra “privileges” in Cockpit on top of the client id/secret. The **broker** ties **scopes** to that client. **`btp create security/api-credential --read-only true`** creates a **read-only** credential when you want least privilege. Creating credentials requires **administrator** on global account, directory, or subaccount (see `btp help create security/api-credential`). |

## Mental model: two layers

1. **Who can create the credential** — your user needs **BTP admin / Security Administrator** (or equivalent) to run **`btp create security/api-credential`** or to create an **`apiaccess`** instance + service key.
2. **What the credential can do** — only **Authorization and Trust Management REST** operations allowed for that client (create/update role collections, attribute mappings, etc., per API and read-only flag). **IAS user attributes** remain **`ias-scim.ps1`** / SCIM; **JWT `dept`** still requires **IdP + BTP** mapping to be correct.

## Env vars (repo-root `.env` / `.env.local`, gitignored)

| Variable | Required? | Meaning |
|----------|------------|---------|
| **`BTP_AUTH_API_CLIENT_ID`** | Yes | `clientid` from service key or api-credential |
| **`BTP_AUTH_API_CLIENT_SECRET`** | Yes | `clientsecret` |
| **`BTP_AUTH_API_TOKEN_URL`** | Yes | Usually **`<uaa.url>/oauth/token`** from the key |
| **`BTP_AUTH_API_BASE_URL`** | Yes | **`apiurl`** (or equivalent host base for Authorization API — **no** trailing slash) |
| **`BTP_AUTH_API_TOKEN_RESOURCE`** | No | If token POST fails, some setups need **`&resource=…`** (trial tenant base URL) |

Never commit secrets. Do not ask the user to paste **clientsecret** in chat.

## Agent tool contract

| Rule | Detail |
|------|--------|
| **Executable** | **`scripts/btp-auth-api.ps1`** — loads **`.env`** then **`.env.local`**. |
| **Agent MUST** | Run via **Shell** from **repository root**; use **stdout/stderr** only. |
| **Agent MUST NOT** | **`Read` / `Grep` `.env`**, **`.env.local`**, or ask for **client secret** in chat. |

**Invocations (PowerShell, repo root):**

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/btp-auth-api.ps1 -Action Token
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/btp-auth-api.ps1 -Action ListRoleCollections
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/btp-auth-api.ps1 -Action GetRoleCollection -RoleCollectionName "ACP Chat User"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/btp-auth-api.ps1 -Action ListApps
```

- **`Token`** — prints token **length** and **`expires_in`** only (no raw token).  
- **`ListRoleCollections`** / **`GetRoleCollection`** — JSON to stdout (inspect attribute-related fields for automation design).  
- **`ListApps`** — lists XSUAA app ids (useful with role templates).

## Write operations (attribute mapping automation)

The script ships **read-only** GETs. **POST/PUT** for role collections (e.g. SAML / attribute mappings) varies by **API version** and payload shape — implement **after** confirming the OpenAPI on [SAP Business Accelerator Hub](https://api.sap.com/api/AuthorizationAPI/overview) for your landscape. Extend **`btp-auth-api.ps1`** with new **`-Action`** values only when you have a **tested JSON body** (do not guess).

## Companion skills

| Skill | Role |
|-------|------|
| **`btp-cli-orchestration`** | **`btp`**: trust, role-collection **assignment**, `api-credential` lifecycle. |
| **`ias-api-orchestration`** | **IAS SCIM**: users, `customAttribute1`. |
| **This skill** | **Authorization REST**: list/get **role collections** and **apps** for automation and debugging. |

## Anti-patterns

- Expecting one OAuth client to administer **all** BTP APIs.  
- Confusing **role collection JSON** editing with **IAS** directory data.  
- Pasting **client secret** into issues or chat.  

## When to read `reference.md`

Curated SAP Help and API hub links: [reference.md](reference.md).
