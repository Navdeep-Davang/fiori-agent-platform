# Action Plan 02 — BTP Infrastructure Setup

> **Goal:** Provision every BTP service the app needs and verify each gate before advancing.
> **Prerequisite:** Action Plan 01 Phases 1–8 (local code + mta.yaml) should be ready
> before Phase 7 (deploy) of this plan. Phases 1–6 here are pure infrastructure and can
> run in parallel with code development.
>
> **⚠ Chronology warning:** Do NOT set up IAS users, trust mappings, or role collections
> (Phases 8–9) before Phase 7 (deploy). There is no way to end-to-end verify them without
> a live approuter URL. Doing so wastes significant time (lesson learned).
>
> Last updated: 2026-04-01.

---

## Phase 1: Install Local Development Tools

> Run all commands in your terminal. Verify each before proceeding.

- [x] **Task 1.1:** Node.js LTS (v20 or v22) — `node --version`
- [x] **Task 1.2:** SAP CDS DK — `npm install -g @sap/cds-dk` → `cds version` (must be ≥ 8.x)
- [x] **Task 1.3:** UI5 Tooling — `npm install -g @ui5/cli` → `ui5 --version`
- [x] **Task 1.4:** MBT — `npm install -g mbt` → `mbt --version`
- [x] **Task 1.5:** CF CLI v8 — `winget install CloudFoundry.CLI.v8` → `cf --version`
- [x] **Task 1.6:** Python 3.11+ — `python --version`
- [ ] **Task 1.7:** LLM API key (Google AI Studio or Anthropic/OpenAI). Store in `.env` only.

> **Windows PATH tip:** If `cds` or `mbt` are not found after install, add `npm prefix -g`
> output directory to user PATH and restart terminal.

---

## Phase 2: BTP Trial Account and Cloud Foundry Space

- [x] **Task 2.1:** Sign in to trial cockpit at **`https://cockpit.hanatrial.ondemand.com/trial/`**
  > Do NOT use `cockpit.btp.cloud.sap` — trial users get an empty APAC cockpit with
  > "no global accounts". Always use the trial-specific URL above.
- [x] **Task 2.2:** Verify `trial` subaccount exists; click into it.
- [x] **Task 2.3:** Enable Cloud Foundry (if not already): Subaccount → Enable Cloud Foundry.
- [x] **Task 2.4:** Note CF API endpoint from subaccount overview.
- [x] **Task 2.5:** Log in from terminal: `cf login -a <CF_API_ENDPOINT>` → paste `cf target`.

**Gate:** `cf target` shows org, space `dev`, and your user email.

---

## Phase 3: Enable Service Entitlements

- [x] **Task 3.1:** BTP Cockpit → Subaccount → Entitlements → Edit.
- [x] **Task 3.2:** Confirm or add all required plans:
  - [x] Authorization and Trust Management (`xsuaa`) → plan `application`
  - [x] SAP HANA Cloud → plan `hana`
  - [x] SAP HANA Schemas & HDI Containers → plan `hdi-shared`
  - [x] Destination Service → plan `lite`
  - [x] HTML5 Application Repository → plans `app-host` and `app-runtime`
  - [x] Cloud Identity Services → plan `default`
- [x] **Task 3.3:** Save entitlements.
- [x] **Task 3.4:** Verify: `cf marketplace | grep -E "xsuaa|hana|destination|html5|identity"`

**Gate:** All 6 service families visible in `cf marketplace`.

---

## Phase 4: Create SAP HANA Cloud Instance

> This phase takes 5–15 min and can run in parallel with Phase 5–6.

- [x] **Task 4.1:** Assign role before accessing HANA tool.
  - BTP Cockpit → Security → Users → your user → Assign Role Collection →
    **`SAP HANA Cloud Administrator`**. Sign out and reopen Cockpit after assignment.
    > Without this role, "Go to Application" shows *Not authorized* (SAP KBA 3428857).
- [x] **Task 4.2:** Open HANA Cloud Central.
  - Instances and Subscriptions → SAP HANA Cloud (`tools`) → Go to Application.
  - If not subscribed: Service Marketplace → SAP HANA Cloud → Subscribe (plan `tools`).
- [x] **Task 4.3:** Create instance.
  - Create → **SAP HANA Database** (choose "Configure manually", NOT "Cloned").
  - Instance name: `acp-hana`. Strong password. Allowed connections: **Allow all IP addresses**.
  - Click Create; wait for **Running** status (5–15 min).
- [x] **Task 4.4:** Verify: status dot is green, instance is **Running**.

**Gate:** HANA instance status = **Running**.

---

## Phase 5: Create XSUAA Service Instance

> The `xs-security.json` at repo root must exist first (it defines scopes, role templates,
> and the `dept` attribute).

- [x] **Task 5.1:** From repo root:
  ```bash
  cf create-service xsuaa application acp-xsuaa -c xs-security.json
  ```
- [x] **Task 5.2:** Verify: `cf service acp-xsuaa` → last operation: **create succeeded**.

**Gate:** `cf service acp-xsuaa` shows `create succeeded`.

> **Do NOT** create roles or role collections in the Cockpit at this stage. Creating them
> before the app is deployed leads to locked "Managed by Application" roles that cannot
> be edited or deleted (no Source dropdown, no trash icon). Configure roles AFTER deploy
> in Phase 9.

---

## Phase 6: Create Destination and HTML5 Service Instances

- [x] **Task 6.1:**
  ```bash
  cf create-service destination lite acp-destination
  cf create-service html5-apps-repo app-host acp-html5-host
  ```
- [x] **Task 6.2:** Verify: `cf services` → both show **create succeeded**.

**Gate:** `cf services` shows `acp-xsuaa`, `acp-destination`, `acp-html5-host` all created.

---

## Phase 7: Build and Deploy the MTA

> **Prerequisite:** Action Plan 01 Phases 1–9 must be complete (mta.yaml, codebase,
> seed CSVs exist). HANA must be Running (Phase 4 gate).

- [ ] **Task 7.1:** Build MTA archive.
  ```bash
  mbt build
  ```
  Expected: `mta_archives/agent-control-plane_<version>.mtar` created.

- [ ] **Task 7.2:** Deploy to Cloud Foundry.
  ```bash
  cf deploy mta_archives/agent-control-plane_*.mtar
  ```
  Expected: all modules succeed; deployer lifecycle apps finish and stop.

- [ ] **Task 7.3:** Verify all apps are running.
  ```bash
  cf apps
  # Expected: acp-approuter, acp-cap, acp-python all show "running"
  cf services
  # Expected: acp-xsuaa, acp-hana, acp-destination all "create succeeded" and bound
  ```

- [ ] **Task 7.4:** Note the approuter URL.
  ```bash
  cf app acp-approuter | grep routes
  # e.g. https://xxx.cfapps.eu10.hana.ondemand.com
  ```
  **Save this URL** — it is required for Phase 8 (IAS trust redirect URI) and Phase 9
  (testing user login).

**Gate:** All 3 CF apps running, approuter URL noted.

---

## Phase 8: IAS Trust and `dept` JWT Claim

> **Only start this phase after Phase 7 gate is green.**
>
> Reason: IAS trust is meaningless to test without a live approuter URL. The redirect
> URI that XSUAA registers in IAS requires the deployed app. Setting up IAS users and
> trust before deploy is the #1 time-wasting mistake in this project.

### 8.1 — Provision IAS tenant

- [ ] **Task 8.1:** Check if already provisioned: `cf service acp-ias` (OK to skip if
  status is already `create succeeded`).
- [ ] **Task 8.2:** If not provisioned:
  - BTP Cockpit → Service Marketplace → **Cloud Identity Services** (NOT "SAP Identity
    Authentication" — it was renamed).
  - Create → Application plan **`default`** → name `acp-ias`.
  - > **Wrong plan warning:** `Service plan application` ≠ IAS tenant. It registers an
    > app client. Using it gives "OIDC Trust missing". Use plan `default` only.

### 8.2 — Establish trust

- [ ] **Task 8.3:** BTP Cockpit → Security → Trust Configuration → **Establish Trust** →
  select your IAS tenant (`*.trial-accounts.ondemand.com`) → Finish.
- [ ] **Task 8.4:** Check email and spam for activation/invitation from SAP. Complete it.
  > Without activation, IAS Administration Console login gives "Sorry, we could not
  > authenticate you" or "incorrect password" regardless of what password you use.

### 8.3 — Configure `dept` attribute to flow from IAS to XSUAA JWT

- [ ] **Task 8.5:** Open IAS Administration Console (`<tenant>.accounts.ondemand.com`).
- [ ] **Task 8.6:** Applications & Resources → Applications → **SAP BTP subaccount trial** →
  Trust → **Attributes** → Add:
  - **Name:** `dept`
  - **Source:** Identity Directory
  - **Value:** Application Custom Attribute 1
  - Save.

### 8.4 — Create BTP roles with IdP attribute mapping

> **Root cause of the "Source not editable" trap:** When `xs-security.json` defines
> `role-collections`, BTP creates "Managed by Application" placeholder roles. These cannot
> be edited (no Source dropdown) or deleted (no trash icon) from the Cockpit. The fix:

- [ ] **Task 8.7:** Temporarily remove `role-collections` from `xs-security.json`, rename
  role templates to `AgentUserV2`, `AgentAuthorV2`, `AgentAdminV2`, `AgentAuditV2`.
  ```bash
  cf update-service acp-xsuaa -c xs-security.json
  ```

- [ ] **Task 8.8:** In BTP Cockpit → Security → Roles, use **Create Role** on each `V2`
  template:
  - Role Name: `AgentAdmin` (same name as old template for clarity)
  - Source: **Identity Provider**
  - Values: **`dept`**
  - Repeat for `AgentAuthor`, `AgentUser` (all templates with `attribute-references: [dept]`).
  - `AgentAudit` has no `dept` attribute — BTP auto-creates it; skip.

- [ ] **Task 8.9:** In BTP Cockpit → Security → Role Collections, create manually:
  - `ACP Platform Admin` → add role `AgentAdmin`
  - `ACP Agent Author` → add role `AgentAuthor`
  - `ACP Chat User` → add role `AgentUser`
  - `ACP Auditor` → add role `AgentAuditV2`

**Gate:** All 4 role collections exist with roles assigned and `+` icon is active (not blurry).

---

## Phase 9: Role Collection Mappings and User Verification

> Trust attribute mappings automatically assign role collections to users on login based on
> their `dept` claim. No per-user manual assignment needed.

- [ ] **Task 9.1:** BTP Cockpit → Security → Trust Configuration → your IAS trust →
  open it → **Attribute Mappings** tab → add rows:

  | Role Collection | Attribute | Operator | Value |
  |----------------|-----------|----------|-------|
  | ACP Platform Admin | `dept` | equals | `it` |
  | ACP Agent Author | `dept` | equals | `procurement` |
  | ACP Chat User | `dept` | equals | `finance` |
  | ACP Chat User | `dept` | equals | `it` |
  | ACP Chat User | `dept` | equals | `procurement` |

  > Value = actual department code (e.g. `it`), NOT the word `dept`.

- [ ] **Task 9.2:** Create IAS demo users (only after Phase 8 gate is green).
  - IAS Administration Console → Users & Authorizations → User Management → Add:
  
  | User | Email | Custom Attribute 1 |
  |------|-------|-------------------|
  | Alice Admin | alice@yourdomain.com | `it` |
  | Bob Procurement | bob@yourdomain.com | `procurement` |
  | Carol Finance | carol@yourdomain.com | `finance` |
  | Dave Auditor | dave@yourdomain.com | (empty) |

  > Set a password via Authentication → Password Details → Set Initial.

- [ ] **Task 9.3:** Test login as Alice using the **approuter URL** (NOT the BTP Cockpit).
  > The BTP Cockpit login always uses SAP ID service (`accounts.sap.com`). IAS users
  > are NOT on `accounts.sap.com`. To test IAS users you MUST use the approuter URL.
  - Open approuter URL in Incognito.
  - On the XSUAA login page, select the **custom identity provider / business users** option.
  - Log in as alice@yourdomain.com.

- [ ] **Task 9.4:** Verify Alice appears in BTP Cockpit → Security → Users with IAS origin
  and `ACP Platform Admin` role collection assigned (auto-assigned by trust mapping).

- [ ] **Task 9.5:** Verify JWT.
  - Decode the XSUAA access token (from browser DevTools → Network → Authorization header).
  - Paste at https://jwt.io.
  - Confirm: `xs.user.attributes.dept` = `["it"]` for Alice.

**Gate:** Alice JWT contains `xs.user.attributes.dept = ["it"]` and `ACP Platform Admin`
role collection is visible in BTP Cockpit under her user.

---

## Phase 10: Configure BTP Destination for Python Service

> After deploy, the Python app has a public CF URL. Register it as a BTP Destination so
> CAP can resolve it via the Destination Service (required by `testConnection` handler).

- [ ] **Task 10.1:** Get Python app URL: `cf app acp-python | grep routes`
- [ ] **Task 10.2:** BTP Cockpit → Connectivity → Destinations → New Destination:
  - **Name:** `PYTHON_MCP_SERVICE`
  - **Type:** HTTP
  - **URL:** `https://<python-app-url>`
  - **Authentication:** NoAuthentication
  - **Properties:** `HTML5.DynamicDestination = true`, `WebIDEEnabled = true`
- [ ] **Task 10.3:** Check Connection in Cockpit → expect HTTP 200 from `/health`.

---

## Phase 11: LLM API Keys and Smoke Test

- [ ] **Task 11.1:** Set LLM environment variables on CF.
  ```bash
  cf set-env acp-python LLM_PROVIDER google-genai
  cf set-env acp-python GOOGLE_API_KEY <your-key>
  cf set-env acp-python LLM_MODEL gemini-2.0-flash
  cf restart acp-python
  ```

- [ ] **Task 11.2:** Smoke test.
  1. Log in as Bob (IAS, `dept=procurement`) via approuter URL in Incognito.
  2. Open Chat UI → select Procurement Assistant.
  3. Send: "List open purchase orders."
  4. Expected: streamed response with PO data from HANA.

- [ ] **Task 11.3:** Verify RBAC: log in as Dave (no `dept`) → Auditor should see all
  sessions but cannot start a new chat (no `Agent.User` scope).

**Gate:** End-to-end chat works for Bob; Dave is read-only.

---

## Trial Maintenance Reference

> BTP trial HANA instances stop nightly. After every restart:

1. Start HANA instance in HANA Cloud Central.
2. Re-deploy MTA if needed: `cf deploy mta_archives/agent-control-plane_*.mtar`
3. Re-set LLM key: `cf set-env acp-python GOOGLE_API_KEY <key> && cf restart acp-python`
4. IAS users and trust configuration survive trial restarts (they live in the IAS tenant).

---

## Lessons Learned (do not repeat)

| Mistake | What happened | Rule |
|---------|--------------|------|
| IAS setup before deploy | Spent a week on dummy users that could not be verified end-to-end | **Deploy first (Phase 7), then IAS (Phase 8)** |
| Wrong cockpit URL | "No global accounts" on `btp.cloud.sap` for trial | **Always use `cockpit.hanatrial.ondemand.com/trial/`** |
| IAS plan `application` | "OIDC Trust missing" error | **Always use Application plan `default`** |
| Skipped activation email | "Sorry, we could not authenticate" in IAS console | **Complete activation email after Establish Trust** |
| Created roles before deploy | Source field locked, no delete icon, blurry `+` | **Create roles AFTER deploy using `V2` template workaround** |
| Testing IAS login on BTP Cockpit | Redirected to `accounts.sap.com`, wrong IdP | **Use approuter URL, not Cockpit, to test IAS users** |
