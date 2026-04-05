# Fiori Agent Platform

SAP BTP–based agent control plane: CAP backend, Fiori UIs, Python LLM executor, and MCP tooling. Detailed design lives in [`doc/Architecture/fiori-agent-platform.md`](doc/Architecture/fiori-agent-platform.md). Step-by-step build and cockpit work is tracked in [`doc/Action-Plan/01-application-implementation.md`](doc/Action-Plan/01-application-implementation.md) and [`doc/Action-Plan/02-btp-cockpit-setup.md`](doc/Action-Plan/02-btp-cockpit-setup.md).

---

## Local environment variables

Copy [`.env.example`](.env.example) to `.env` in the repo root and fill in values for local development. The file is git-ignored. For Cloud Foundry, LLM keys are **not** taken from `.env`; set them on the Python app after deploy (see below).

---

## Run the application locally

You need **Node.js** (with `npm`) and **Python 3** with `pip`. From the repo root:

1. **Install Node dependencies** (workspaces include CAP, app router, and UI5 apps):

   ```bash
   npm install
   ```

2. **Configure `.env`** as described in the previous section. At minimum, set `LLM_PROVIDER`, the matching API key, `LLM_MODEL`, and `PYTHON_URL=http://localhost:8000` so CAP can reach the Python service.

3. **Start CAP** (OData, REST, chat API, static UI5 from `app/`; default **http://localhost:4004**):

   ```bash
   npm run watch
   ```

   (`cds watch` — reloads on change.)

4. **Start the Python executor** (FastAPI / MCP / LLM; default **http://localhost:8000**). Use a virtual environment so dependencies stay isolated:

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

5. **Optional — SAP App Router** (same host for `/admin`, `/chat`, `/api`, `/odata`; default **http://localhost:5000** unless `PORT` is set):

   ```bash
   cd approuter
   npm start
   ```

   For a dev loop that temporarily uses `xs-app.local.json`, you can use `npm run start:local` from `approuter` instead (see [`approuter/scripts/run-local-router.cjs`](approuter/scripts/run-local-router.cjs)).

**Where to open the UI**

- With app router: **http://localhost:5000/chat/webapp/** (welcome file is the chat app; confirm the listen port in the app router console if it differs from **5000**).
- CAP only (when CAP serves the UI5 resources from `app/`): **http://localhost:4004/chat/webapp/index.html**. If that URL does not resolve, run the chat app with the UI5 CLI instead: `cd app/chat && npx ui5 serve --port 3002` (proxies `/api` and OData to CAP on **4004**; see [`app/chat/ui5.yaml`](app/chat/ui5.yaml)).

Local auth uses **dummy** users from root [`package.json`](package.json) (for example Basic auth `alice` / `alice` for a full-role test user). Deeper verification steps and alternate layouts (separate `ui5 serve` per app) are in [`doc/Action-Plan/01-application-implementation.md`](doc/Action-Plan/01-application-implementation.md) and [`doc/Architecture/fiori-agent-platform.md`](doc/Architecture/fiori-agent-platform.md) (section *Local Development Setup*).

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

After deploy, XSUAA role collections from `xs-security.json` appear under **Security → Role Collections**. Under **Security → Users**, assign the right collections to each demo shadow user (Admin, Chat User, Auditor, etc.) and assign yourself an admin collection if you need full testing access.

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
| [`doc/Action-Plan/01-application-implementation.md`](doc/Action-Plan/01-application-implementation.md) | Codebase and MTA implementation |
| [`doc/Action-Plan/03-seed-data.md`](doc/Action-Plan/03-seed-data.md) | CSV seed data specification |

When you have finished a pass through the cockpit steps, you can ask for a review against **02** and the checkboxes there can be updated to match what you completed.
