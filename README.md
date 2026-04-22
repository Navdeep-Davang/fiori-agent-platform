# Fiori Agent Platform

SAP BTP–based agent control plane: CAP backend, Fiori UIs, Python LLM executor, and MCP tooling. Detailed design lives in [`doc/Architecture/fiori-agent-platform.md`](doc/Architecture/fiori-agent-platform.md). **Hybrid** (`npm run watch`) uses **SAP HANA Cloud** and **XSUAA** via **`cds bind`** (JWT and BTP roles, prod-like identity on your machine). **Master delivery roadmap (phases, tasks):** [`doc/Action-Plan/06-architecture-aligned-e2e.md`](doc/Action-Plan/06-architecture-aligned-e2e.md). Supporting plans: [`doc/Action-Plan/05-cap-public-python-private-production-path.md`](doc/Action-Plan/05-cap-public-python-private-production-path.md), [`doc/Action-Plan/04-hybrid-hana-spectrum-1.md`](doc/Action-Plan/04-hybrid-hana-spectrum-1.md), [`doc/Action-Plan/01-application-implementation.md`](doc/Action-Plan/01-application-implementation.md), and [`doc/Action-Plan/02-btp-cockpit-setup.md`](doc/Action-Plan/02-btp-cockpit-setup.md).

---

## Local environment variables

Copy [`.env.example`](.env.example) to `.env` in the repo root and fill in values. The file is git-ignored. You **must** set **`HANA_HOST`**, **`HANA_USER`**, **`HANA_PASSWORD`**, and **`HANA_SCHEMA`** for Python (use the same HDI / service-key values as CAP). For Cloud Foundry, LLM keys are **not** taken from `.env`; set them on the Python app after deploy (see below). **Agent list gating:** users only see agents allowed by **`dept`** (and related JWT attributes) vs rows in **`ACP_AGENTGROUPCLAIMVALUE`** (seeded from `db/data/acp-AgentGroupClaimValue.csv`; redeploy with `npm run deploy:hana` after CSV changes). The JWT should carry **`xs.user.attributes.dept`** (recommended: IAS Self-defined attribute **`dept`** from **`${customAttribute1}`**, then BTP role + trust mapping). Until that is in place, CAP can map **`customAttribute1`** / **`department`** in **`xs.user.attributes`** for gating — see **`.cursor/rules/xsuaa-manual-roles.mdc`**. Values are matched case-insensitively against **`ACP_AGENTGROUPCLAIMVALUE`**. If no value resolves, the agent list is empty and the CAP log warns.

---

## HANA Cloud first (Spectrum 1 hybrid)

Before CAP or Python can run against data:

### 1. SAP BTP prerequisites

**SAP BTP:** HANA Cloud instance **Running**; Cloud Foundry **logged in** (`cf login` / `cf target`).

### 2. Bind CAP to HANA

Creates `.cdsrc-private.json`, git-ignored:

```bash
cds bind db --to <your-hana-or-hdi-service-instance-name>
```

### 3. Deploy schema and CSV seeds

Run once per fresh instance / after model changes:

```bash
npm run deploy:hana
```

### 4. Align Python `.env` with the service key

Copy **`host` / `port` / `user` / `password` / `schema`** from the **same** service key into **`.env`** as `HANA_*` so Python’s MCP SQL tools hit the same tables as CAP.

Details and verification checklist: [`doc/Action-Plan/04-hybrid-hana-spectrum-1.md`](doc/Action-Plan/04-hybrid-hana-spectrum-1.md).

---

## Run the application locally

You need **Node.js** (with `npm`) and **Python 3** with `pip`. CAP hybrid mode requires the **`@sap/hana-client`** package (declared in root `package.json`; installed via `npm install`). From the repo root:

### 1. Install Node dependencies

Workspaces include CAP, app router, and UI5 apps:

```bash
npm install
```

### 2. Configure `.env`

Set LLM vars, `PYTHON_URL=http://localhost:8000`, optional matching **`ACP_INTERNAL_TOKEN`** on both CAP and Python when you want a shared secret on the internal hop, and **all `HANA_*` fields** (see above). Export vars the CAP process can see (this repo does not auto-load `.env` into Node; use your shell or a tool of your choice).

### 3. Bind services (hybrid — XSUAA + HANA)

From the repo root, log in to Cloud Foundry and bind **HANA** and **XSUAA** so `VCAP_SERVICES` is available to **`cds watch`** (creates **`.cdsrc-private.json`**, git-ignored):

```bash
cf login
cf target -o <org> -s <space>
cds bind db --to <your-hdi-or-hana-instance>
cds bind --to <your-xsuaa-instance>
```

Update **`xs-security.json`** OAuth redirect URIs for your App Router URL if needed, then apply the XSUAA config (redeploy MTA or `cf update-service <xsuaa-instance> -c xs-security.json`). Local App Router defaults include **`http://localhost:5000/login/callback`** in-repo.

**Important — roles and role collections:** This repo’s **`xs-security.json`** intentionally **does not** define **`role-collections`** — only **scopes**, **`dept`**, **`Agent*ACP`** **role-templates**, and **oauth2-configuration**. Defining **`role-collections`** in the file and updating XSUAA creates **application-managed** read-only roles. **Workflow:** IAS **`dept`** ← **`${customAttribute1}`** → deploy XSUAA descriptor → **Create Role** on each **`Agent*ACP`** template with **`dept`** from **Identity Provider** (CLI example payload: **`scripts/xsuaa-role-attrs-dept-idp.json`**) → create **role collections** and add those **manual** roles → **Trust Configuration** attribute mappings (optional) → shadow users / **`btp assign security/role-collection`**. See **`doc/Architecture/fiori-agent-platform.md`** §11 and **`.cursor/rules/xsuaa-manual-roles.mdc`**.

### 4. Start CAP

OData, REST, chat API, static UI5 from `app/`; default **http://localhost:4004**:

```bash
npm run watch
```

This runs **`cds watch --profile hybrid`** (reloads on change). It **requires** prior **`cds bind`** for **db** and **xsuaa** (hybrid auth is **`xsuaa`** in root **`package.json`**).

### 5. Start the Python executor

FastAPI / MCP / LLM; default **http://localhost:8000**. Use a virtual environment so dependencies stay isolated:

```bash
cd python
python -m venv venv # Only run if the venv not there, else skip this and move to next command
venv\Scripts\activate
```

Then install and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 6. SAP App Router (recommended for login)

Use one terminal for CAP (**4004**) and one for the App Router so the UI and **`/api`** share the **App Router origin** (session cookie + **`Authorization: Bearer`** forwarded to CAP per destination).

**Option A — bindings injected for the router process** (VCAP includes XSUAA; matches [CAP — Running App Router](https://cap.cloud.sap/docs/node.js/authentication#running-app-router)):

```bash
npm run start:approuter
```

(`cds bind --exec` runs `npm run start` in **`approuter/`** from the repo root; ensure **`cds bind`** was run for **xsuaa** first.)

**Option B — from `approuter/`**:

```bash
cd approuter
npm run start:bind
```

Same host for `/admin`, `/chat`, `/api`, `/odata`; default **http://localhost:5000** unless **`PORT`** is set. Configure **`approuter/default-env.json`** destinations (CAP URL **`http://localhost:4004`**, **`forwardAuthToken: true`**) — template values are placeholders; **`cds bind --exec`** supplies real **`VCAP_SERVICES`**.

**Identity provider (IAS vs default BTP login screen):** `approuter/xs-app.json` sets **`identityProvider`** on each route (currently **`sap.custom`**) so the App Router sends users to your **custom IAS** trust entry instead of the generic subaccount login chooser. The value must match the **Origin** column for that IdP in **BTP Cockpit → Trust Configuration** (your XSUAA access token’s **`origin`** claim should match). If login fails or the wrong screen appears, adjust **`identityProvider`** to the Origin shown in Cockpit, or set that IdP as default in Trust Configuration.

For a dev loop **without** XSUAA (no login), use **`npm run start:local`** in **`approuter/`** (swaps in **`xs-app.local.json`** via [`approuter/scripts/run-local-router.cjs`](approuter/scripts/run-local-router.cjs)).

### Where to open the UI

- **Recommended (XSUAA):** App Router entry — **http://localhost:5000/chat/webapp/** or **http://localhost:5000/chat** (same app). Use **http**, not **https**, unless you terminate TLS locally. Fiori uses same-origin **`fetch("/api/...")`** with **`credentials: "include"`** so the App Router session forwards the OAuth access token to CAP.
- **Log out:** Use **Log out** in the chat sidebar (confirm dialog). That navigates to the Application Router **`logout`** endpoint configured in **`approuter/xs-app.json`**, which ends the **app-router session** and the **identity provider** session (XSUAA/IAS), then returns you to the chat entry URL so you can sign in again—not merely clearing `localStorage`. The **`logout`** block must exist in **`xs-app.json`** (otherwise **`/logout`** returns 404). After changing **`oauth2-configuration.post-logout-redirect-uris`** in **`xs-security.json`**, run **`cf update-service <xsuaa-instance> -c xs-security.json`** (or redeploy MTA) so the broker accepts the post-logout URL. See [Configure redirect URLs for browser logout](https://github.com/SAP-docs/btp-cloud-platform/blob/main/docs/30-development/configure-redirect-urls-for-browser-logout-690931c.md).
- **CAP only** (when CAP serves the UI5 resources from `app/`): **http://localhost:4004/chat/webapp/index.html**. If that URL does not resolve, run the chat app with the UI5 CLI instead:

```bash
cd app/chat && npx ui5 serve --port 3002
```

(proxies `/api` and OData to CAP on **4004**; see [`app/chat/ui5.yaml`](app/chat/ui5.yaml)).

### Chat UI → CAP contract (baseline)

The browser sends **only** `{ agentId, message, sessionId }` in the JSON body of **POST `/api/chat`** (no access token in the body; the App Router forwards **`Authorization: Bearer`** to CAP per destination). Implementation: [`app/chat/webapp/controller/Chat.controller.js`](app/chat/webapp/controller/Chat.controller.js). On **SSE `done`**, the server may return **`sessionId`** (and related ids); the controller persists the session id when present.

### CAP → Python (target thin JSON contract)

**Action Plan 06 — Phase 4 Task 4.1.1** defines the **target** body and headers for CAP’s private **`POST`** to the Python executor (`/chat` on the Python service). This is the **thin** contract: identifiers and message only; Python loads tool/skill metadata and session history from HANA (see architecture and [`doc/Action-Plan/06-architecture-aligned-e2e.md`](doc/Action-Plan/06-architecture-aligned-e2e.md) Phase 4).

**Target JSON body fields:** `sessionId`, `agentId`, `toolIds`, `skillIds`, `message`, `userInfo` — no access token in the JSON body; the user JWT is carried only in **`Authorization`**.

**Target HTTP headers:**

- **`Authorization: Bearer`** — end-user access token (RFC 6750), forwarded from the request CAP received (same pattern as App Router → CAP).
- **`X-Internal-Token`** — when `ACP_INTERNAL_TOKEN` is set, shared secret for the CAP → Python hop (defense in depth).
- **`X-AC-*`** — user-context mirrors per **Plan 05** ([`doc/Action-Plan/05-cap-public-python-private-production-path.md`](doc/Action-Plan/05-cap-public-python-private-production-path.md)); built in [`srv/python-trust.js`](srv/python-trust.js) (e.g. `X-AC-User-Id`, `X-AC-Dept`, `X-AC-Roles`).

**Implemented:** [`srv/server.js`](srv/server.js) POSTs the **thin** JSON to Python and forwards **`Authorization: Bearer`** plus internal-trust headers. Python owns chat persistence and emits the final SSE **`done`**.

### Observability (Langfuse)

Optional **[Langfuse](https://langfuse.com/)** (MIT) for DeepAgent / LangChain traces: set **`LANGFUSE_PUBLIC_KEY`**, **`LANGFUSE_SECRET_KEY`**, and optionally **`LANGFUSE_HOST`** in `.env` (never commit secrets). This product does **not** rely on ADK Web or LangSmith for production observability.

---

## BTP trial and Cloud Foundry (repeatable setup)

Trial subaccounts, orgs, and URLs change when you get a new trial or switch regions. The steps below are the same routine each time you stand up or re-stand up the landscape. They mirror **Action Plan 02** (Phases 2–9) in narrative form—use the action plan for granular task IDs when you want to tick items off.

### Access the cockpit and Cloud Foundry

Sign in to the [SAP BTP cockpit](https://cockpit.btp.cloud.sap) with your SAP Universal ID. Open your **subaccount** (often named like `trial` on a trial global account). If **Cloud Foundry** is not enabled yet, use **Enable Cloud Foundry**, accept the suggested org name, and let it create a space (commonly `dev`). In the subaccount overview, copy the **Cloud Foundry API endpoint** (for example `https://api.cf.eu10.hana.ondemand.com`; the region segment may differ).

On your machine, log in and target the right org and space:

```bash
cf login -a <CF_API_ENDPOINT>
cf target
```

You will repeat **`cf login`** whenever your session expires or you switch endpoints after a trial change.

### Entitlements

In the subaccount, open **Entitlements**, choose **Edit**, and ensure the account can allocate the services the MTA expects. On trial, the usual set includes: **Authorization and Trust Management** (`application`), **SAP HANA Cloud** (`hana`), **SAP HANA Schemas & HDI Containers** (`hdi-shared`), **Destination** (`lite`), **HTML5 Application Repository** (`app-host` and `app-runtime`), and **SAP Identity Authentication** (`default`). Save, then confirm those offerings appear in `cf marketplace` if you want a CLI sanity check.

### SAP HANA Cloud

Open **SAP HANA Cloud** from the cockpit (subscription or tile → **Go to Application**). Create a **SAP HANA database** instance if you do not have one. Use a clear instance name (for example `acp-hana`), set a strong admin password for your records, and under allowed connections choose **Allow all IP addresses** so Cloud Foundry cells can reach the database. Provisioning often takes several minutes; wait until the instance is **Running**.

On **BTP trial**, HANA Cloud instances are **stopped automatically at night** and can be **deleted if left stopped too long**. Before each work session, open the HANA Cloud tool and **start** the instance if it is stopped. After a trial reset or fresh database, you will deploy the application again so the HDI deployer can recreate schema and seed data.

### Identity Authentication (IAS) and the `dept` claim

The chat experience resolves which agents a user may use from a **`dept`** claim on the JWT. Subscribe to **SAP Identity Authentication** from the marketplace if needed, open the **IAS admin console** from **Instances and Subscriptions**, and create the demo users you need. On each user (except pure auditor personas), set a **custom user attribute** `dept` to values such as `it`, `procurement`, or `finance` as described in the action plan.

In the BTP subaccount, open **Security → Trust Configuration** and **Establish Trust** with your IAS tenant. Then edit that trust and add **attribute mapping**: source **Custom Attribute** / `dept` → target **`dept`** so the value flows into tokens consumed by the app.

### Service instances and deploy

Under normal workflow, **XSUAA, Destination, HTML5 repo, and the HDI container** are created or bound when you deploy the MTA from the codebase (`doc/Action-Plan/01-developer-build.md`, deploy phase). You only need manual `cf create-service` commands if a deploy fails and you are debugging; the action plan lists the exact service names and plans.

### Destination for the Python MCP service

After the **Python** application is deployed, note its public route (for example from `cf app acp-python`). In the subaccount, open **Connectivity → Destinations** and create **HTTP** destination **`PYTHON_MCP_SERVICE`** pointing to `https://<your-python-host>` with proxy type **Internet** and authentication **NoAuthentication**, plus properties such as `HTML5.DynamicDestination` and `WebIDEEnabled` as in the action plan. Use **Check Connection**; a healthy Python app should respond (for example HTTP 200 on health).

### Role collections and your admin user

**Role collection names** (e.g. `ACP Chat User ACP`, `ACP Agent Author ACP`, …) are **not** created by **`xs-security.json`** — create them in **Security → Role Collections** (or **`btp create security/role-collection`**) and attach **manually created** roles from **`Agent*ACP`** templates with **`dept`** → **Identity Provider**. Assign collections via **Trust Configuration** attribute mappings and/or **Security → Users** (`btp assign security/role-collection` or Cockpit). Pre-existing **managed** roles from an older **`xs-security.json`** that included **`role-collections`** may be *read-only*; use **ACP**-suffixed templates and new manual roles (architecture §11).

### Secrets on Cloud Foundry (LLM keys)

User-provided environment variables are set with the CF CLI, for example:

```bash
cf set-env acp-python GOOGLE_API_KEY "<your-key>"
cf restart acp-python
```

Use `LLM_API_KEY` instead if you use Anthropic or OpenAI. After **every** fresh deploy or trial rebuild where the app is recreated, confirm these variables again—they are **not** stored in git. You can inspect what the platform merged for an app with `cf env acp-python` (treat output as sensitive).

### After a trial reset or long idle period

Expect to redo: cockpit login, **`cf login`** with the current API URL, **start HANA**, **redeploy** the MTA, **reapply** destination URL if the Python route changed, **reassign** roles if users were recreated, and **reinject** `GOOGLE_API_KEY` / `LLM_API_KEY` on `acp-python` followed by **`cf restart`**.

### Guided BTP setup in Cursor

The project defines a Cursor subagent (**btp-expert**) that walks through BTP / Cloud Foundry setup **one question at a time**, verifies with **`cf` / `cds` / toolchain** when possible, and aligns with **README** and **`doc/Action-Plan/02-btp-cockpit-setup.md`**. In chat, invoke **`@btp-expert`** or ask to use the **btp-expert** agent (definition: [`.cursor/agents/btp-expert.md`](.cursor/agents/btp-expert.md)). It is written so you do **not** paste database passwords or LLM keys into the thread—use **`.env`** and **`cf set-env`** on your machine instead.

---

## Further reading

| Document | Purpose |
|----------|---------|
| [`doc/Action-Plan/02-btp-cockpit-setup.md`](doc/Action-Plan/02-btp-cockpit-setup.md) | Full cockpit checklist (including Phase 1 local tools) |
| [`doc/Action-Plan/04-hybrid-hana-spectrum-1.md`](doc/Action-Plan/04-hybrid-hana-spectrum-1.md) | Local hybrid: HANA Cloud + mock auth + `cds bind` |
| [`doc/Action-Plan/01-application-implementation.md`](doc/Action-Plan/01-application-implementation.md) | Codebase and MTA implementation |
| [`doc/Action-Plan/03-seed-data.md`](doc/Action-Plan/03-seed-data.md) | CSV seed data specification |

When you have finished a pass through the cockpit steps, you can ask for a review against **02** and the checkboxes there can be updated to match what you completed.
