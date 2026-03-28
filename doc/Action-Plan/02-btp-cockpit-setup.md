# Action Plan 02 — BTP Cockpit & Infrastructure Setup

> **Goal:** Provision every BTP service the app needs, configure JWT claim mapping for demo users, and verify the platform is ready for deploy.
> **Audience:** The person with access to the BTP Cockpit (web UI) and a terminal. No SAP ABAP knowledge needed.
> **Prerequisite:** A BTP Trial account. Sign up free at https://www.sap.com/products/technology-platform/trial.html if not done.
> Last updated: 2026-03-28.

---

## Phase 1: Install Local Development Tools

These tools must be installed on your machine before you can build and deploy the app. Run all commands in your terminal.

- [ ] **Task 1.1:** Install Node.js LTS (v20 or v22).
  - Download from https://nodejs.org — use the LTS installer.
  - Verify: `node --version` and `npm --version`.
- [ ] **Task 1.2:** Install SAP CDS DK globally.
  - `npm install -g @sap/cds-dk`
  - Verify: `cds version` — must show version 8.x or higher.
- [ ] **Task 1.3:** Install UI5 Tooling globally.
  - `npm install -g @ui5/cli`
  - Verify: `ui5 --version`.
- [ ] **Task 1.4:** Install MBT (MTA Build Tool) globally.
  - `npm install -g mbt`
  - Verify: `mbt --version`.
- [ ] **Task 1.5:** Install Cloud Foundry CLI (CF CLI v8).
  - Download from https://github.com/cloudfoundry/cli/releases — pick the v8 installer for your OS.
  - Verify: `cf --version`.
- [ ] **Task 1.6:** Install Python 3.11 or higher.
  - Download from https://python.org/downloads — check "Add to PATH" on Windows.
  - Verify: `python --version` and `pip --version`.
- [ ] **Task 1.7:** Obtain a Google AI Studio API key (if using `google-genai` as the LLM provider).
  - Visit https://aistudio.google.com/apikey → Generate API key → copy and store it securely.
  - This key is injected into CF via `cf set-env acp-python GOOGLE_API_KEY <key>` after deploy and stored in `.env` locally. Never commit it to the repo.
- [ ] **Task 1.8:** Install SAP Business Application Studio (BAS) — optional but recommended for annotation editing.
  - Access it from your BTP Cockpit → Services → Service Marketplace → SAP Business Application Studio → Subscribe (free dev plan).

---

## Phase 2: BTP Trial Account and Cloud Foundry Space

- [ ] **Task 2.1:** Sign in to the BTP Cockpit.
  - Open https://cockpit.btp.cloud.sap and log in with your SAP universal ID.
- [ ] **Task 2.2:** Verify your trial subaccount exists.
  - You should see a tile named something like `trial` on the Global Account overview.
  - Click it to enter the subaccount.
- [ ] **Task 2.3:** Enable Cloud Foundry environment (if not already done).
  - In the subaccount overview, click **Enable Cloud Foundry** if you see that button.
  - Accept the default org name (usually `<your-trial-id>trial`) and click **Create**.
  - This creates the CF environment with one `dev` space automatically.
- [ ] **Task 2.4:** Note your CF API endpoint.
  - In the subaccount overview → Cloud Foundry Environment section → API Endpoint.
  - It looks like `https://api.cf.eu10.hana.ondemand.com` (region may differ).
- [ ] **Task 2.5:** Log in to CF from your terminal.
  - `cf login -a <CF_API_ENDPOINT>`
  - Enter your SAP Universal ID email and password.
  - Select the org and space when prompted (usually org = `<your-id>trial`, space = `dev`).
  - Verify: `cf target` shows the right org and space.

---

## Phase 3: Enable Service Entitlements

BTP trial accounts come with a set of default entitlements. Verify all required services are available; add them if missing.

- [ ] **Task 3.1:** Open entitlements page.
  - In BTP Cockpit → Subaccount → **Entitlements** → **Edit**.
- [ ] **Task 3.2:** Confirm or add the following entitlements (all free on trial):
  - [ ] **Authorization and Trust Management Service** → plan `application` (for XSUAA).
  - [ ] **SAP HANA Cloud** → plan `hana` (one instance allowed on trial).
  - [ ] **SAP HANA Schemas & HDI Containers** → plan `hdi-shared` (schemas inside the HANA instance).
  - [ ] **Destination Service** → plan `lite`.
  - [ ] **HTML5 Application Repository** → plans `app-host` and `app-runtime`.
  - [ ] **SAP Identity Authentication** → plan `default` (needed for custom JWT claims; also free on trial).
- [ ] **Task 3.3:** Save entitlements.
- [ ] **Task 3.4:** Verify in CF marketplace: `cf marketplace` in terminal — all services above should appear.

---

## Phase 4: Create SAP HANA Cloud Instance

This is the most time-consuming step. The HANA instance takes ~10 minutes to provision.

- [ ] **Task 4.1:** Open SAP HANA Cloud tool.
  - In BTP Cockpit → Subaccount → **Services** → **Instances and Subscriptions** → click the **SAP HANA Cloud** subscription (subscribe first if not done).
  - OR from the BTP Cockpit overview → **SAP HANA Cloud** tile → **Go to Application**.
- [ ] **Task 4.2:** Create a new SAP HANA Database instance.
  - Click **Create** → **SAP HANA Database**.
  - Instance name: `acp-hana` (or any name you prefer).
  - Administrator password: set a strong password and note it (you will not need it directly, but it is good to record).
  - Allowed connections: select **Allow all IP addresses** (required for CF apps to connect from any CF cell IP).
  - Click **Create**.
- [ ] **Task 4.3:** Wait for provisioning — status changes from `Creating` to `Running`. This takes 5–15 minutes.
- [ ] **Task 4.4:** Verify the instance is running.
  - In SAP HANA Cloud tool — status dot is green, instance is `Running`.
- [ ] **Task 4.5:** Note: HANA Cloud trial instances are stopped automatically every night and are deleted if not started within 30 days. Before each work session, check and start the instance here if it is stopped.

---

## Phase 5: Configure SAP Identity Authentication (IAS) for JWT Claims

> This phase sets up the `dept` JWT claim that the agent group resolution logic reads. Without this, the chat UI cannot determine which agents each user may access.

- [ ] **Task 5.1:** Subscribe to SAP Identity Authentication Service (IAS).
  - BTP Cockpit → Services → Service Marketplace → **Identity Authentication** → Subscribe (default plan, free).
  - After subscription, go to **Instances and Subscriptions** → click the **Identity Authentication** tile → **Go to Application** — this opens the IAS admin console.
- [ ] **Task 5.2:** Create demo users in IAS admin console.
  - In IAS admin console → **Users & Authorizations** → **User Management** → **Add User**.
  - Create four users:
    - Alice Admin — email: `alice@yourdomain.com` (or any email you can receive)
    - Bob Procurement — email: `bob@yourdomain.com`
    - Carol Finance — email: `carol@yourdomain.com`
    - Dave Auditor — email: `dave@yourdomain.com`
  - Set passwords for each.
- [ ] **Task 5.3:** Add `dept` custom attribute values to each user.
  - In IAS → **Users & Authorizations** → open each user → **User Attributes** tab → Add custom attribute:
    - Alice: `dept = it`
    - Bob: `dept = procurement`
    - Carol: `dept = finance`
    - Dave: (no dept — Dave uses read-only Auditor role only)
- [ ] **Task 5.4:** Configure trust between BTP XSUAA and IAS.
  - BTP Cockpit → Subaccount → **Security** → **Trust Configuration** → **Establish Trust**.
  - Select the IAS tenant you just configured (it should appear in the list).
  - Click **Establish Trust** — BTP now trusts tokens issued by IAS.
- [ ] **Task 5.5:** Configure attribute propagation in the trust configuration.
  - Open the newly established trust with IAS → **Attributes** tab.
  - Add a mapping: Source `Custom Attribute`, Source Value `dept` → Target `dept` (this passes the IAS `dept` attribute into the XSUAA JWT claim).
  - Save.
- [ ] **Task 5.6:** Verify the setup.
  - In a browser, try accessing the BTP app (after deploy) and logging in via IAS as Bob — his JWT should contain `dept: procurement`.
  - You can decode the JWT at https://jwt.io after capturing it from the browser's developer tools.

---

## Phase 6: Create CF Service Instances

> The MTA deploy (Action Plan 01, Phase 9) creates these automatically from `mta.yaml`. This phase is only needed if you want to pre-create them or if a deploy fails and you need to debug service creation manually.

- [ ] **Task 6.1:** Create XSUAA service instance manually (only if MTA deploy fails on XSUAA step).
  - From the repo root: `cf create-service xsuaa application acp-xsuaa -c xs-security.json`
  - Verify: `cf service acp-xsuaa` → status `create succeeded`.
- [ ] **Task 6.2:** Create Destination service instance.
  - `cf create-service destination lite acp-destination`
- [ ] **Task 6.3:** Create HTML5 App Repository host instance.
  - `cf create-service html5-apps-repo app-host acp-html5-host`
- [ ] **Task 6.4:** HANA HDI container (`acp-hana` service instance) is created by the `acp-db-deployer` MTA module. Do not create it manually — let MTA handle it to ensure the HDI container is properly linked to the HANA instance.

---

## Phase 7: Configure BTP Destination for Python MCP Service

> This step is done AFTER the Python app is deployed, because you need the Python app's CF URL.

- [ ] **Task 7.1:** Get the Python app URL after deploy.
  - `cf app acp-python` → look at the `routes` line. Note the full URL, e.g. `acp-python.cfapps.eu10.hana.ondemand.com`.
- [ ] **Task 7.2:** Create the `PYTHON_MCP_SERVICE` destination in BTP Cockpit.
  - BTP Cockpit → Subaccount → **Connectivity** → **Destinations** → **New Destination**.
  - Fill in:
    - **Name:** `PYTHON_MCP_SERVICE`
    - **Type:** `HTTP`
    - **URL:** `https://acp-python.cfapps.eu10.hana.ondemand.com` (use your actual URL from Task 7.1)
    - **Proxy type:** `Internet`
    - **Authentication:** `NoAuthentication` (CAP forwards the user's JWT in the Authorization header separately)
  - Additional properties (click **+ New Property** for each):
    - `HTML5.DynamicDestination` = `true`
    - `WebIDEEnabled` = `true`
  - Click **Save**.
- [ ] **Task 7.3:** Test the destination.
  - On the Destinations page, click the **Check Connection** button next to `PYTHON_MCP_SERVICE`.
  - Expected: green check, response code 200 (the Python `/health` endpoint responds).
  - If you get a 404, verify the Python app is started and the URL is correct.

---

## Phase 8: Assign Role Collections to Demo Users

> After MTA deploy, the role collections defined in `xs-security.json` will appear in BTP Cockpit. Assign them to your demo users.

- [ ] **Task 8.1:** Open Security → Users in BTP Cockpit.
  - BTP Cockpit → Subaccount → **Security** → **Users**.
- [ ] **Task 8.2:** Find or create shadow user for each demo persona.
  - If your demo users already signed in via IAS, they should appear here automatically as shadow users.
  - If not, click **Create** to add shadow users manually using their email addresses.
- [ ] **Task 8.3:** Assign role collections.
  - Open Alice's user → **Role Collections** → Assign **ACP Platform Admin**.
  - Open Bob's user → **Role Collections** → Assign **ACP Chat User**.
  - Open Carol's user → **Role Collections** → Assign **ACP Chat User**.
  - Open Dave's user → **Role Collections** → Assign **ACP Auditor**.
  - (Alice already has Admin, which inherits User and Author scopes from the role template.)
- [ ] **Task 8.4:** Assign your own user the **ACP Platform Admin** role collection so you can do end-to-end testing with full access.

---

## Phase 9: Start HANA Cloud Before Each Session

> BTP trial HANA Cloud stops nightly. Before any development or testing session:

- [ ] **Task 9.1:** Open SAP HANA Cloud tool → verify instance status.
  - If status is **Stopped**: click the `...` menu → **Start** → confirm. Wait ~3 minutes.
  - If status is **Running**: proceed.
- [ ] **Task 9.2:** After redeploy (following a trial reset): re-run seed data.
  - `cf deploy mta_archives/agent-control-plane_*.mtar` re-runs the `acp-db-deployer` module which re-applies all CSV seed files.
  - Alternatively, run `cds deploy --to hana --profile production` from the repo root after setting HANA credentials locally.
  - Also re-inject the LLM API key: `cf set-env acp-python GOOGLE_API_KEY <key>` (or `LLM_API_KEY` for Anthropic/OpenAI) then `cf restart acp-python`.

---

## Phase 10: Post-Deploy Smoke Test Checklist

Run through this checklist after every fresh deploy to confirm everything is working end to end.

- [ ] **Task 10.1:** `cf apps` — all four modules `acp-approuter`, `acp-cap`, `acp-python`, `acp-db-deployer` show state `started` (deployer will show `stopped` after it finishes, that is normal).
- [ ] **Task 10.2:** `cf services` — `acp-xsuaa`, `acp-hana`, `acp-destination`, `acp-html5-host` all show `create succeeded`.
- [ ] **Task 10.3:** Open admin URL in browser → login redirects to IAS → sign in as Alice.
  - Admin UI loads → McpServer list shows 2 rows.
- [ ] **Task 10.4:** Click "Test connection" on `Procurement Data MCP` → health turns green.
- [ ] **Task 10.5:** Open chat URL → sign in as Bob (procurement) → agent selector shows "Procurement Assistant" and "General Assistant".
- [ ] **Task 10.6:** Send "Show me all open purchase orders" → response streams with tool trace.
- [ ] **Task 10.7:** Sign in as Carol (finance) → agent selector shows "Invoice Analyst" and "General Assistant".
- [ ] **Task 10.8:** Run invoice mismatch demo (Conversation 3 from `doc/SeedData/scenario.md`) → EUR 300 discrepancy surfaced.
- [ ] **Task 10.9:** Sign in as Dave (auditor) → navigates to admin URL → read-only view shows all chat sessions.
- [ ] **Task 10.10:** Confirm Bob cannot access admin URL (gets 403).

---

*End of BTP Cockpit Setup Action Plan — for codebase implementation, see `doc/Action-Plan/01-developer-build.md`.*
