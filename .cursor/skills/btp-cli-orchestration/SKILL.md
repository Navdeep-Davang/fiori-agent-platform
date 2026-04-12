---
name: btp-cli-orchestration
description: Orchestrates SAP BTP subaccount security via scripts/btp-platform.ps1 (loads gitignored .env) and the btp CLI—target, list role collections/trust/users, assign collections—aligned with CAP/XSUAA. Use when the user asks about BTP role collections, IdP origin, shadow users, or wiring IAS users to app roles; pair with ias-api-orchestration for IAS SCIM.
---

# BTP CLI orchestration

## How identity “wiring” fits together (undergrad map)

1. **`xs-security.json`** (this repo) defines **scopes**, attribute **`dept`**, **`Agent*ACP`** **role-templates**, and **oauth2-configuration** — **no** **`role-collections`** (collections are created in Cockpit / **`btp`**; see **`.cursor/rules/xsuaa-manual-roles.mdc`**).  
2. The file is **deployed into the XSUAA service instance** (MTA/`cf update-service`). **Role collections** are created separately and reference **manually** created roles from those templates.  
3. **IAS** holds **real people** (email, optional **customAttribute1** = department). That is **not** where BTP role collections live.  
4. **BTP subaccount** links the IdP: **Trust Configuration** to your IAS tenant (often set up once in Cockpit or via `btp` trust commands — see Help).  
5. **`btp assign security/role-collection`** attaches a **role collection name** to a **user identity** (usually **email**) for a given **IdP origin**. The first assignment can create a **shadow user** in the subaccount.  
6. **Attribute mapping** (JWT `dept` from IAS → XSUAA) is **BTP Cockpit / role configuration**, not a `btp` one-liner; verify with a decoded token after login.

### IdP attribute → XSUAA JWT (`dept`): can `btp` set it?

**No.** The standard **`btp`** CLI is for **subaccount security** (trust *list/create*, **role collection** assignment, users, etc.). It does **not** provide a supported one-liner to configure **Trust Configuration** assertion → **`xs.user.attributes.dept`** (or SAML/OIDC attribute mapping). That mapping is done in the **BTP Cockpit** (Trust / application security), or via **XSUAA / Authorization and Trust Management** REST APIs for automation — **not** `btp assign security/role-collection`.

**How to verify (terminal-adjacent):** After login, the **access token** is authoritative. Decode it (e.g. copy `Authorization: Bearer …` from the browser Network tab for a CAP request, or use a **jwt** decoder). **Inspect `xs.user.attributes`** (and `dept` after mapping). **`btp list security/trust`** confirms **trust** and **origin** but **not** JWT claims.

**This repo:** Set **`ACP_DEBUG_IDENTITY=true`** on CAP and call **`GET /api/me`** — the JSON includes **`debug`** (claim keys, `xs.user.attributes`, `claimPairs`). In the browser, enable **`?acpIdentityDebug=1`** or **`localStorage.acpIdentityDebug=1`** so the UI logs **`/api/me`** to the console.

**Yes — role collection assignment is what the BTP CLI is for** (among other security operations). Authoritative syntax evolves; run **`btp help assign security/role-collection`** before scripting.

References: [Assigning role collections (concept)](https://help.sap.com/docs/btp/sap-business-technology-platform/assigning-role-collections-to-users-or-user-groups), [btp assign security/role-collection](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-assign-security-role-collection), [Managing users and authorizations with the btp CLI](https://github.com/SAP-docs/btp-cloud-platform/blob/main/docs/50-administration-and-ops/managing-users-and-their-authorizations-using-the-btp-cli-94bb593.md).

## Industry practice: `.env` + wrapper script (same idea as IAS)

- **Standard:** Config and secrets **not** in git (`.gitignore` **`.env`**), loaded **at runtime** by automation — matches **twelve-factor**, **Docker env files**, **CI secrets**, and this repo’s **`scripts/ias-scim.ps1`**.
- **Agent runs the script**, sees **only stdout/stderr**; **never** `Read` **`.env`** / **`.env.local`** into the chat context.
- **`btp` caveat:** **`btp login`** is **interactive**; the CLI stores the session on the OS. **Do not store your SAP/BTP account password in `.env`.** Put **`BTP_SUBACCOUNT_ID`** (UUID, not secret) and optionally **`BTP_IDP_ORIGIN`** in `.env`. **IAS `CLIENT_SECRET`** in `.env` is normal for **OAuth client credentials** (API), which is different from a human cockpit password.

## Agent tool contract (btp — no secrets in chat)

| Rule | Detail |
|------|--------|
| **Primary tool** | **`scripts/btp-platform.ps1`** — loads **`.env`** then **`.env.local`** (same parser as `ias-scim.ps1`), runs **`btp`** with **`--subaccount`** when **`BTP_SUBACCOUNT_ID`** is set. |
| **Also** | Direct **`btp …`** for **`btp help …`** or one-offs. |
| **Agent SHOULD** | `.\scripts\btp-platform.ps1 -Action CheckLogin` → **Target** → **ListRoleCollections** / **ListTrust** / **ListUsers**. |
| **Agent MAY** | **`-Action AssignRoleCollection`** only when the user explicitly asked to change assignments. |
| **Agent MUST NOT** | `Read` / `Grep` **`.env`**, **`.env.local`**, or ask for **passwords** / **client secrets** in chat. |

**Actions:** `CheckLogin`, `Target`, `ListRoleCollections`, `ListTrust`, `ListUsers`, `AssignRoleCollection` (requires **`-RoleCollection`**, **`-UserEmail`**, optional **`-IdpOrigin`**; defaults **`BTP_IDP_ORIGIN`** from `.env` or **`sap.default`**).

### `.env` variables the tool reads (no passwords)

| Variable | Required? | What it is | Where to find it in Cockpit (copy/paste) |
|----------|-------------|------------|------------------------------------------|
| **`BTP_SUBACCOUNT_ID`** | **Yes** for **`Target`** and for passing **`--subaccount`** on list/assign | Subaccount **GUID** (UUID format) | Open your **global account** → click the **subaccount** (e.g. `trial`) → **Overview**: many UIs show **Subaccount ID**. Or copy from the browser URL when the subaccount is selected (path/query often contains the UUID `…/subaccount/<THIS-GUID>/…`). |
| **`BTP_GLOBAL_ACCOUNT_SUBDOMAIN`** | Optional | Global account **subdomain** (short name, not the UUID) | **Global Account** overview: the account tile/name links to a URL like `…/globalaccount/<id>/…`; the **subdomain** is shown in global account **Overview** / **Account Explorer** (trial accounts often use a pattern like `…trial`). Also visible when running **`btp list accounts/global-account`** after login. |
| **`BTP_IDP_ORIGIN`** | Optional | **Origin** string of the **trusted IdP** (your IAS) used in **`btp assign … --of-idp`** | **Subaccount** → **Security** → **Trust Configuration** → row for your **Identity Authentication** tenant → column **Origin** (copy exactly). If you only use the default SAP IdP, you can omit this; the CLI default is **`sap.default`**. |

**Not used by `btp-platform.ps1` today:** `BTP_USERNAME`, `BTP_PASSWORD` — see **Authentication** below.

### Authentication: `btp` CLI vs “API key”

- **There is no single “BTP API key”** that replaces **`btp login`** for all platform administration. Different APIs use different OAuth clients (e.g. [API credentials for XSUAA REST APIs](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-api-credentials-for-calling-rest-apis-of-sap-authorization-and-trust-management-service) are for **XSUAA service APIs**, not for driving every `btp` subcommand).
- **Normal developer flow:** run **`btp login`** once (browser or SSO); the CLI stores the session on your machine. **`scripts/btp-platform.ps1`** only adds **subaccount / IdP parameters** from `.env`; it does **not** log in for you.
- **Putting your SAP ID password in `.env` is discouraged** (leak risk, MFA, rotation). It is **not** an official, supported pattern for `btp` the way **IAS `CLIENT_SECRET`** is for **OAuth client credentials** to a **token endpoint**.
- **Automation (CI/robots):** SAP documents patterns such as **technical user + certificate + one-time passcode** passed to **`btp login`** (see [Automation with btp and cf](https://community.sap.com/t5/technology-blog-posts-by-sap/automation-with-the-btp-and-cf-command-line-interfaces-logging-in-with/ba-p/13571444) and SAP Help [Account administration using the btp CLI](https://help.sap.com/docs/btp/sap-business-technology-platform/account-administration-using-sap-btp-command-line-interface-btp-cli)). That is **not** wired into `btp-platform.ps1` by default — extend only if your security team approves.

## Typical session (operator)

```text
btp login
# add BTP_SUBACCOUNT_ID=... to .env, then:
.\scripts\btp-platform.ps1 -Action Target
.\scripts\btp-platform.ps1 -Action ListRoleCollections
.\scripts\btp-platform.ps1 -Action ListTrust
.\scripts\btp-platform.ps1 -Action ListUsers
btp help assign security/role-collection
```

Manual equivalent:

```text
btp target --subaccount <SUBACCOUNT_ID>
btp list security/role-collection
btp list security/trust
```

**Assign:** `btp assign security/role-collection <NAME> --to-user <EMAIL> --of-idp <ORIGIN> [--subaccount <ID>]` — see **`btp help assign security/role-collection`**. Wrapper: **`.\scripts\btp-platform.ps1 -Action AssignRoleCollection -RoleCollection "ACP Chat User ACP" -UserEmail "x@y.com" -IdpOrigin "<origin>"`** (exact name from **`btp list security/role-collection`**).

**Verify:** `btp list security/user` / `btp get security/user`.

## Combined workflow with **ias-api-orchestration**

| Step | Skill / tool |
|------|----------------|
| Create user, set **customAttribute1** (dept) in IAS | `ias-api-orchestration` + `scripts/ias-scim.ps1` |
| Assign **ACP …** role collections in BTP | **This skill** + **`scripts/btp-platform.ps1`** or `btp assign security/role-collection` |
| List role collections / apps via **Authorization REST** (debug payloads) | **`btp-api-orchestration`** + **`scripts/btp-auth-api.ps1`** |
| Create **API credentials** for Authorization REST | **`btp create security/api-credential`** — see [Managing API credentials](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-api-credentials-for-calling-rest-apis-of-sap-authorization-and-trust-management-service) |
| Trust / first-time federation | Cockpit and/or `btp create security/trust` — see [Managing trust from SAP BTP to Identity Authentication](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-trust-from-sap-btp-to-identity-authentication-tenant) |
| JWT contains **`dept`** for CAP | Cockpit **Roles** / **Trust** attribute mapping — validate after login |

## This repo’s role collection names

**Not** in **`xs-security.json`**. Create collections in the subaccount (e.g. **`ACP Chat User ACP`**, …) per **`.cursor/rules/xsuaa-manual-roles.mdc`**. Exact strings must match **`btp list security/role-collection`**.

## Anti-patterns

- Defining **`role-collections`** inside **`xs-security.json`** (creates read-only managed roles).  
- Assigning role collections **before** they exist in the subaccount or **before** manual roles are attached to them.  
- Wrong **`--of-idp`** (user not found or assignment to wrong IdP).  
- Expecting **`btp`** to set IAS **custom attributes** (use **SCIM** / `ias-scim.ps1` instead).  
- Putting **`btp` / cockpit password** or tokens in **committed** files or pasting them in chat.  
- Using **`Read`** on **`.env`** to “load” config for the model (use **`btp-platform.ps1`** / **`ias-scim.ps1`** instead).

## When to read `reference.md`

Links to SAP Help and GitHub docs for trust, role collections, and CLI command reference.
