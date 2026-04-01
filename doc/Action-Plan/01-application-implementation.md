# Action Plan 01 — Developer Build

> **Goal:** Implement the full Agent Control Plane codebase so the app runs locally and deploys to BTP Cloud Foundry out of the box.
> **Reference:** `doc/Architecture/fiori-agent-platform.md` is the authoritative spec for every file's content.
> **Prerequisite:** BTP cockpit setup (Action Plan 02) must be complete before Phase 9 (deploy).
> Last updated: 2026-04-01 (task checkboxes synced to in-repo implementation).

---

## Phase 1: Project Scaffold

- [x] **Task 1.1:** Create root `package.json` with npm workspaces pointing to `app/admin`, `app/chat`, `approuter`.
  - [x] Subtask 1.1.1: Add `@sap/cds`, `@sap/xssec`, and `@sap-cloud-sdk/connectivity` as root dependencies. (`@sap-cloud-sdk/connectivity` is required by the `testConnection` handler to resolve BTP Destination names at runtime.)
  - [x] Subtask 1.1.2: Add dev scripts: `"watch": "cds watch"`, `"build:cap": "npx cds build --production"`. *(Repo uses `"build:cap": "cds build --production"` — equivalent.)*
- [ ] **Task 1.2:** Create folder skeleton matching architecture section 7.
  - [ ] Subtask 1.2.1: `mkdir app/admin/webapp app/admin/annotations app/chat/webapp/controller app/chat/webapp/view app/chat/webapp/fragment app/chat/webapp/css app/chat/webapp/i18n srv db/data python/app python/db approuter` *(Only `srv`, `db/data`, `python/app`, workspace `package.json` files exist; UI5 `webapp/` trees not created yet.)*
- [ ] **Task 1.3:** Create `.cdsrc.json` for local development.
  - [ ] Subtask 1.3.1: Set `db.kind = "sqlite"` with `credentials.database = ":memory:"`. *(Implemented in root `package.json` under `cds.requires.db` with **`sqlite.db`** file for persistent local seed — not `:memory:`.)*
  - [x] Subtask 1.3.2: Set `auth.kind = "dummy"`. *(In `package.json` `[development]` auth.)*
  - [x] Subtask 1.3.3: Add mock users under `auth.users` for each XSUAA role (Agent.Admin, Agent.Author, Agent.User, Agent.Audit) so you can test role enforcement locally without XSUAA. **Critically, include `jwt: { dept: "..." }` on each user** (e.g. alice → `dept: it`, bob → `dept: procurement`, carol → `dept: finance`). The `GET /api/agents` group-resolution SQL filters by this claim — without it every user gets an empty agent list locally. *(Uses top-level **`attr.dept`** per current CDS mock-user shape; `jwt.email` etc. preserved.)*
- [x] **Task 1.4:** Create `.env.example` listing all environment variables the Python service needs.
  - [x] Subtask 1.4.1: `LLM_PROVIDER` — one of `anthropic` / `openai` / `google-genai`.
  - [x] Subtask 1.4.2: `LLM_API_KEY` — Anthropic or OpenAI secret key (leave blank when using Google).
  - [x] Subtask 1.4.3: `GOOGLE_API_KEY` — Gemini API key (used when `LLM_PROVIDER=google-genai`; alternative to `LLM_API_KEY`).
  - [x] Subtask 1.4.4: `LLM_MODEL` — model name string, e.g. `claude-3-5-sonnet-20241022` / `gpt-4o` / `gemini-2.0-flash`.
  - [x] Subtask 1.4.5: `PYTHON_URL` — the Python app's own base URL (used by CAP to reach `/chat` and `/tool-test`).
  - [x] Subtask 1.4.6: `HANA_HOST`, `HANA_PORT`, `HANA_USER`, `HANA_PASSWORD`, `HANA_SCHEMA` — HANA connection vars for the Python SQL tools (injected automatically via `VCAP_SERVICES` on CF; needed manually for local dev with a remote HANA).
- [x] **Task 1.5:** Run `npm install` at repo root; verify `cds version` prints a version number.
- [x] **Task 1.6:** Create `.gitignore` at repo root.
  - Include: `node_modules/`, `gen/`, `mta_archives/`, `.env`, `python/local_dev.db`, `**/__pycache__/`, `*.pyc`, `dist/`. *(Also `sqlite.db` / `gen/` added in-repo.)*
- [ ] **Task 1.7:** Copy `.env.example` to `.env` (git-ignored) and fill in values for local development.
  - Set `LLM_PROVIDER`, the matching API key (`LLM_API_KEY` or `GOOGLE_API_KEY`), `LLM_MODEL`, and `PYTHON_URL=http://localhost:8000`. This file is read by both the Python service and by `cds watch` (CAP picks it up from the project root). *(Per-developer machine; not tracked.)*

---

## Phase 2: Database Layer

> All entity content is specified in architecture section 3. Reference `doc/SeedData/scenario.md` for seed data values.

- [x] **Task 2.1:** Write `db/schema.cds` — full `acp` namespace.
  - [x] Subtask 2.1.1: `McpServer` entity (ID, name, description, destinationName, baseUrl, authType, transportType, environment, ownerTeam, status, health, lastHealthCheck, tools composition).
  - [x] Subtask 2.1.2: `Tool` entity (ID, name, description, server association, inputSchema, outputSchema, riskLevel, elevated, status, modifiedAt).
  - [x] Subtask 2.1.3: `Agent` entity (ID, name, description, systemPrompt, modelProfile, identityMode, status, createdBy, tools composition).
  - [x] Subtask 2.1.4: `AgentTool` join entity (ID, agent, tool, permissionOverride).
  - [x] Subtask 2.1.5: `AgentGroup` entity (ID, name, description, claimKey, status, claimValues composition, agents composition).
  - [x] Subtask 2.1.6: `AgentGroupClaimValue` entity (ID, group, value).
  - [x] Subtask 2.1.7: `AgentGroupAgent` join entity (ID, group, agent).
  - [x] Subtask 2.1.8: `ChatSession` entity (ID, agentId, userId, title, createdAt, updatedAt, messages composition).
  - [x] Subtask 2.1.9: `ChatMessage` entity (ID, session, role, content, timestamp, toolCalls composition).
  - [x] Subtask 2.1.10: `ToolCallRecord` entity (ID, message, toolName, arguments, resultSummary, durationMs, elevatedUsed, timestamp).
- [x] **Task 2.2:** Write `db/demo-schema.cds` — `acp.demo` namespace (ERP-like tables).
  - [x] Subtask 2.2.1: `Vendor` entity (ID, name, category, country, rating).
  - [x] Subtask 2.2.2: `PurchaseOrder` entity (ID, vendor_ID association, amount, currency, status, orderDate, buyer, description).
  - [x] Subtask 2.2.3: `POItem` entity (ID, po_ID association, lineNo, description, quantity, unit, unitPrice, currency).
  - [x] Subtask 2.2.4: `InvoiceHeader` entity (ID, po_ID association, amount, currency, status, invoiceDate, dueDate, invoiceRef).
  - [x] Subtask 2.2.5: `InvoiceItem` entity (ID, invoice_ID association, lineNo, description, quantity, unit, unitPrice, currency).
- [x] **Task 2.3:** Create platform catalog seed CSV files in `db/data/` (see Action Plan 03 for exact rows).
  - [x] `acp-McpServer.csv`
  - [x] `acp-Tool.csv`
  - [x] `acp-Agent.csv`
  - [x] `acp-AgentTool.csv`
  - [x] `acp-AgentGroup.csv`
  - [x] `acp-AgentGroupClaimValue.csv`
  - [x] `acp-AgentGroupAgent.csv`
- [x] **Task 2.4:** Create ERP demo data CSV files in `db/data/` (see Action Plan 03 for exact rows).
  - [x] `acp.demo-Vendor.csv`
  - [x] `acp.demo-PurchaseOrder.csv`
  - [x] `acp.demo-POItem.csv`
  - [x] `acp.demo-InvoiceHeader.csv`
  - [x] `acp.demo-InvoiceItem.csv`
- [x] **Task 2.5:** Run `cds compile db/schema.cds db/demo-schema.cds` — verify zero errors.
- [x] **Task 2.6:** Run `cds deploy --to sqlite` — verify all tables created and seed rows visible in the CDS REPL (`cds repl` → `SELECT * from acp.McpServer`). *(Verified via `cds deploy --to sqlite:sqlite.db` + OData; UUID/string IDs differ from older plan snippets but match `schema.cds`.)*

---

## Phase 3: CAP Service Layer

> Full CDS and handler code is specified in architecture sections 4 and 5.

- [x] **Task 3.1:** Write `srv/governance-service.cds`.
  - [x] Subtask 3.1.1: Expose `McpServers` projection with `@restrict` for Admin/Author/Audit roles.
  - [x] Subtask 3.1.2: Declare `testConnection()` and `syncTools()` bound actions on `McpServers`.
  - [x] Subtask 3.1.3: Expose `Tools` projection with `@restrict`; declare `runTest(args)` action requiring `Agent.Admin`.
  - [x] Subtask 3.1.4: Expose `Agents`, `AgentTools`, `AgentGroups`, `AgentGroupClaimValues`, `AgentGroupAgents` projections with correct `@restrict` annotations.
- [x] **Task 3.2:** Write `srv/governance-service.js` handlers.
  - [x] Subtask 3.2.1: `testConnection` handler — resolve the server's base URL (if `destinationName` is set, look it up via the BTP Destination Service using `@sap-cloud-sdk/connectivity` `getDestination()`; otherwise use `baseUrl` directly); call `GET <resolvedBaseUrl>/health` using `node-fetch` or `axios`; treat HTTP 200 as `OK`, any connection error or non-2xx response as `FAIL`; write the result string to `health` and the current timestamp to `lastHealthCheck`.
  - [x] Subtask 3.2.2: `syncTools` handler — call MCP server's `POST /mcp/tools/list`, upsert `Tool` records with `status = 'Draft'` (INSERT if new, UPDATE if same name already exists for this server).
  - [x] Subtask 3.2.3: `runTest` handler — call `POST <PYTHON_URL>/tool-test` with `{ mcpServerUrl, toolName, args }`, return raw result string.
  - [x] Subtask 3.2.4: `before UPDATE Tools` guard — reject changes to the `elevated` field unless `req.user.is('Agent.Admin')`.
  - [x] Subtask 3.2.5: `before CREATE Agents` handler — set `req.data.createdBy = req.user.id` so the field is auto-populated from the JWT subject instead of requiring manual entry in the Admin UI.
- [x] **Task 3.3:** Write `srv/chat-service.cds`.
  - [x] Subtask 3.3.1: Expose `ChatSessions` with user-scoped `where: 'userId = $user'` for `Agent.User` reads.
  - [x] Subtask 3.3.2: Expose `ChatMessages` (read + create for `Agent.User`).
  - [x] Subtask 3.3.3: Expose `ToolCallRecords` as read-only (no `CREATE` grant for any client role — server.js inserts directly).
- [ ] **Task 3.4:** Write `srv/chat-service.js` — only needed if custom validation beyond CDS `@restrict` is required (session-user mismatch guard on CREATE).
- [x] **Task 3.5:** Write `srv/server.js` — custom HTTP routes (most critical file).
  - [x] Subtask 3.5.1: Register routes inside `cds.on('bootstrap', app => { ... })`.
  - [x] Subtask 3.5.2: `GET /api/agents` — validate JWT (`createSecurityContext`), check `Agent.User` scope, extract JWT claims, query HANA for allowed agents via the group-resolution SQL (architecture section 5), return JSON array. *(Uses `req.user` + SQLite table names; same logic as HANA.)*
  - [x] Subtask 3.5.3: `POST /api/chat` — validate JWT + scope, parse `{ agentId, message, sessionId }`, verify agent access (same group SQL), load `Agent` + `AgentTool` rows (status `Active` only).
  - [x] Subtask 3.5.3a: Apply `permissionOverride` logic per `AgentTool` row: `Inherit` → use tool's own `elevated` flag; `ForceDelegated` → mark elevated as false; `ForceElevated` → only allowed if agent `identityMode = 'Mixed'` AND tool `elevated = true`, otherwise reject with 400.
  - [x] Subtask 3.5.3b: Load conversation history — if `sessionId` is not null, query `SELECT ID, role, content FROM acp_ChatMessage WHERE session_ID = '<sessionId>' ORDER BY timestamp ASC`; map rows to `{ role, content }` objects for the `history` array. If `sessionId` is null, `history` is an empty array.
  - [x] Subtask 3.5.3c: Extract the user's Bearer token from `req.headers.authorization`; include it as `userToken` in the Python payload. Also extract `userId` and `email` from the `SecurityContext` for `userInfo`.
  - [x] Subtask 3.5.3d: Set `Content-Type: text/event-stream`; POST to `<PYTHON_URL>/chat` with the full payload: `{ agentConfig, effectiveTools, message, history, userInfo, userToken }`. Pipe the Python SSE response back to the browser line-by-line using `response.pipe(res)` or manual stream forwarding.
  - [x] Subtask 3.5.4: On `done` SSE event from Python: create `ChatSession` if `sessionId` was null (`INSERT` with `agentId`, `userId`, `title = first 40 chars of user message`, `createdAt`, `updatedAt`); `INSERT ChatMessage` rows — one `user` role row with the original message and one `assistant` role row with the accumulated token content; `INSERT` all `ToolCallRecord` rows collected during the stream; update `ChatSession.updatedAt`; include `sessionId` and `messageId` in the forwarded `done` event to the browser. *(Persists on `done`; forwarded `done` event not enriched with DB IDs yet.)*
  - [ ] Subtask 3.5.5: Error handling — on Python connection failure emit `{ type: "error", message: "..." }` event to browser; close stream cleanly. *(Returns JSON 502 if Python rejects; no in-stream SSE error line.)*
- [x] **Task 3.6:** Verify CAP layer in isolation.
  - [x] Subtask 3.6.1: Run `cds watch` — confirm OData metadata loads at `http://localhost:4004/odata/v4/governance/$metadata` and `http://localhost:4004/odata/v4/chat/$metadata`.
  - [ ] Subtask 3.6.2: Use dummy-auth mock user with `Agent.Admin` role; call `GET /odata/v4/governance/McpServers` — expect 2 rows from seed.
  - [x] Subtask 3.6.3: Call `GET /api/agents` with a mock JWT claim `dept=procurement` — expect Procurement Assistant and General Assistant in response.

---

## Phase 4: Admin UI — Fiori Elements

> The Admin UI is entirely annotation-driven. No custom controller logic needed for CRUD. All annotation spec is described in PRD section 4.2–4.5.

- [ ] **Task 4.1:** Scaffold `app/admin/` as a UI5 Tooling project.
  - [ ] Subtask 4.1.1: Create `app/admin/package.json` — required for npm workspaces. Minimum content: `{ "name": "@acp/admin", "version": "1.0.0", "private": true }`. Add `@ui5/cli` and `@sap/ux-specification` as devDependencies.
  - [ ] Subtask 4.1.2: Write `app/admin/ui5.yaml` — declare `@ui5/webcomponents-fiori` framework, `@sap/ux-specification` library, and a local server config pointing to CAP at port 4004.
  - [ ] Subtask 4.1.3: Write `app/admin/webapp/index.html` — standard Fiori Elements bootstrap.
  - [ ] Subtask 4.1.4: Run `npm install` inside `app/admin`.
- [ ] **Task 4.2:** Write `app/admin/webapp/manifest.json`.
  - [ ] Subtask 4.2.1: Data source `mainService` binding to `GovernanceService` OData V4 at `/odata/v4/governance`.
  - [ ] Subtask 4.2.2: Declare 4 FE application routes: `McpServersList`, `ToolsList`, `AgentsList`, `AgentGroupsList` (each `ListReport` with `entitySet` and `contextPath`).
  - [ ] Subtask 4.2.3: Add `crossNavigation` targets for Object Page navigation.
- [ ] **Task 4.3:** Write `app/admin/annotations/annotations.cds` — all List Report and Object Page annotations.
  - [ ] Subtask 4.3.1: **McpServer LR** — `@UI.LineItem` with columns: Name, Destination/URL (`destinationName`), Transport, Environment, Health (status chip with criticality), Status, OwnerTeam, LastHealthCheck.
  - [ ] Subtask 4.3.2: **McpServer OP** — `@UI.FieldGroup` sections: Connection (destinationName, baseUrl, authType, transportType), Settings (environment, ownerTeam), Status (health with criticality, lastHealthCheck). `@UI.Identification` actions for `testConnection` and `syncTools` bound actions. Make the `status` field an editable `@UI.DataField` with `@Common.ValueListWithFixedValues` so the admin can toggle `Active` / `Disabled` inline — this is the Disable/Enable toggle (no separate action needed; a PATCH on `status` is sufficient).
  - [ ] Subtask 4.3.3: **Tool LR** — `@UI.LineItem` with columns: Name, McpServer (nav link), RiskLevel (criticality chip: Low=3, Medium=2, High=1), Elevated, Status, ModifiedAt. `@UI.SelectionFields` for server, risk level, and status.
  - [ ] Subtask 4.3.4: **Tool OP** — field groups: Details, Schema (inputSchema code editor area), Governance (riskLevel + elevated). `@UI.Identification` action for `runTest`.
  - [ ] Subtask 4.3.5: **Agent LR** — columns: Name, Description, ModelProfile, Status, tool count (via `$count` of tools navigaton), CreatedBy.
  - [ ] Subtask 4.3.6: **Agent OP** — four sections: Basic Info, System Prompt (full-width text area via `@UI.MultiLineText`), Tool Assignments (`@UI.Facet` referencing `AgentTools` sub-table with columns: Tool name, Risk, Elevated, PermissionOverride), Group Membership (read-only facet referencing `AgentGroupAgents`).
  - [ ] Subtask 4.3.7: **AgentGroup LR** — columns: Name, ClaimKey, claim values (count), Agent count, Status.
  - [ ] Subtask 4.3.8: **AgentGroup OP** — two sections: Claim Mapping (name, description, claimKey + `AgentGroupClaimValues` sub-table), Agent Assignments (`AgentGroupAgents` sub-table with agent name, status, model profile).
- [ ] **Task 4.4:** Add `app/admin/` to the approuter's static file serving route (configured in Phase 7).
- [ ] **Task 4.5:** Test Admin UI.
  - [ ] Subtask 4.5.1: `cd app/admin && ui5 serve --port 3001` + `cds watch` in parallel.
  - [ ] Subtask 4.5.2: Open `http://localhost:3001` — McpServer list should show 2 seed rows.
  - [ ] Subtask 4.5.3: Open a McpServer Object Page — all field groups render; test connection button visible.
  - [ ] Subtask 4.5.4: Navigate to Tools list — 7 rows with risk-level badges.
  - [ ] Subtask 4.5.5: Navigate to Agents list — 3 rows; open Agent OP, verify Tool Assignments sub-table shows assigned tools.
  - [ ] Subtask 4.5.6: Navigate to AgentGroups list — 3 rows; open group OP, verify claim value rows and agent sub-table.

---

## Phase 5: Chat UI — Freestyle SAPUI5

> Three-panel layout: session list (left), message thread (centre), input bar (bottom). Spec in PRD section 4.6.

- [ ] **Task 5.1:** Scaffold `app/chat/` as a UI5 Tooling project.
  - [ ] Subtask 5.1.1: Create `app/chat/package.json` — required for npm workspaces. Minimum content: `{ "name": "@acp/chat", "version": "1.0.0", "private": true }`. Add `@ui5/cli` as a devDependency.
  - [ ] Subtask 5.1.2: Write `app/chat/ui5.yaml` — standard UI5 framework, local dev server at port 3002 proxied to CAP at 4004.
  - [ ] Subtask 5.1.3: Write `app/chat/webapp/index.html` — bootstrap `Component.js`.
  - [ ] Subtask 5.1.4: Write `app/chat/webapp/Component.js` — `UIComponent` with metadata and `init`.
  - [ ] Subtask 5.1.5: Run `npm install` inside `app/chat`.
- [ ] **Task 5.2:** Write `app/chat/webapp/manifest.json`.
  - [ ] Subtask 5.2.1: Data source `chatService` pointing to `/odata/v4/chat`.
  - [ ] Subtask 5.2.2: Custom URL binding for REST endpoints `/api/agents` and `/api/chat`.
  - [ ] Subtask 5.2.3: Root route → `App` view.
- [ ] **Task 5.3:** Write `app/chat/webapp/view/App.view.xml` and `App.controller.js`.
  - [ ] Subtask 5.3.1: Shell layout with nav items.
  - [ ] Subtask 5.3.2: `App.controller.js` — `onInit`: nothing beyond routing for now.
- [ ] **Task 5.4:** Write `app/chat/webapp/view/Chat.view.xml` — three-panel layout.
  - [ ] Subtask 5.4.1: `SplitContainer` or `FlexBox` with session list panel (left, fixed width ~250px) and main panel (flex-grow).
  - [ ] Subtask 5.4.2: Session list panel: "New session" `Button` at top; `List` control with custom `StandardListItem` for each session (title, date, active indicator).
  - [ ] Subtask 5.4.3: Main panel top bar: `Select` dropdown for agent selector; display current agent name.
  - [ ] Subtask 5.4.4: Message thread: `ScrollContainer` holding a `VBox` of message bubbles. User messages right-aligned (`FlexBox justifyContent="End"`); agent messages left-aligned with agent avatar/icon.
  - [ ] Subtask 5.4.5: Below each agent message bubble: `Panel` collapsed by default containing the `ToolTrace` fragment.
  - [ ] Subtask 5.4.6: Input bar: `TextArea` (grows with content, max 4 rows) + `Button Send` + `Button Stop` (visible only while streaming).
- [ ] **Task 5.5:** Write `app/chat/webapp/controller/Chat.controller.js` — all chat logic.
  - [ ] Subtask 5.5.1: `onInit` — call `GET /api/agents`, populate agent `Select` model; load saved sessions from `GET /odata/v4/chat/ChatSessions?$orderby=updatedAt desc`.
  - [ ] Subtask 5.5.2: `onAgentChange` — if current session has messages, show `MessageBox.confirm` before switching; start new session if confirmed.
  - [ ] Subtask 5.5.3: `onNewSession` — clear message thread, set `sessionId = null`, update session list to show new item at top.
  - [ ] Subtask 5.5.4: `onSessionSelect` — load full message history via `GET /odata/v4/chat/ChatMessages?$filter=session_ID eq '<id>'&$orderby=timestamp`, render all bubbles with tool traces.
  - [ ] Subtask 5.5.5: `onSendMessage` — append user bubble to model, clear input field, call `_openChatStream`.
  - [ ] Subtask 5.5.6: `_openChatStream` — use `fetch` with method POST, `Content-Type: application/json` to `/api/chat`; read `response.body` as `ReadableStream`; parse line-by-line SSE (`data: {...}` lines).
  - [ ] Subtask 5.5.7: SSE event handlers:
    - `token` → append content to the current assistant bubble text (live update model).
    - `tool_call` → add tool call row to the ToolTrace panel for the current message.
    - `tool_result` → update the matching tool row with duration and result summary.
    - `done` → set `sessionId` from event if was null; mark streaming ended; show Stop button → disabled; update session list title (first 40 chars of user message).
    - `error` → show `MessageToast` with error text; end stream.
  - [ ] Subtask 5.5.8: `onStop` — abort the fetch via `AbortController`; emit partial message to HANA (write current assistant content as a ChatMessage with a `[stopped]` suffix).
- [ ] **Task 5.6:** Write `app/chat/webapp/fragment/ToolTrace.fragment.xml`.
  - [ ] Subtask 5.6.1: `Panel` with header title "Tool calls" (collapsed by default, `expandable: true`).
  - [ ] Subtask 5.6.2: Inside: `Table` with columns: Tool name, Duration (ms), Result summary. One row per `ToolCallRecord`.
- [ ] **Task 5.7:** Write `app/chat/webapp/css/style.css`.
  - [ ] Subtask 5.7.1: User bubble styles: right float, `background: var(--sapHighlightColor)`, white text, border-radius.
  - [ ] Subtask 5.7.2: Agent bubble styles: left float, `background: var(--sapTile_Background)`, border-radius.
  - [ ] Subtask 5.7.3: Streaming cursor animation: a blinking `::after` pseudo-element added while a bubble has the `streaming` CSS class.
- [ ] **Task 5.8:** Write `app/chat/webapp/i18n/i18n.properties` — all display strings (no hardcoded text in XML views).
- [ ] **Task 5.9:** Test Chat UI.
  - [ ] Subtask 5.9.1: `cd app/chat && ui5 serve --port 3002` + `cds watch` + Python `uvicorn app.main:app --reload --port 8000`.
  - [ ] Subtask 5.9.2: Agent selector loads with seed agents.
  - [ ] Subtask 5.9.3: Send a message — streaming tokens render live in bubble.
  - [ ] Subtask 5.9.4: Tool trace panel expands; shows tool call and result.
  - [ ] Subtask 5.9.5: Session appears in the left panel; click a session loads history.

---

## Phase 6: Python Executor and MCP Server

> The Python app plays dual roles: AI executor (called by CAP) and MCP server (called by itself or external orchestrators). Both live in the same FastAPI process.

- [ ] **Task 6.1:** Write `python/app/config.py`.
  - [ ] Subtask 6.1.1: Load `LLM_PROVIDER` (anthropic / openai / google-genai), `LLM_API_KEY`, `LLM_MODEL`.
  - [ ] Subtask 6.1.2: Load `PYTHON_INTERNAL_BASE_URL` (the Python app's own URL — used by executor to call its own `/mcp` endpoints).
  - [ ] Subtask 6.1.3: Load HANA credentials from `VCAP_SERVICES` env var (Cloud Foundry injects this); parse `hana` service binding for host, port, user, password, schema.
- [ ] **Task 6.2:** Write `python/app/db.py` — HANA connection helper.
  - [ ] Subtask 6.2.1: Use `hdbcli` (`pip install hdbcli`) to open a connection using config from 6.1.3.
  - [ ] Subtask 6.2.2: Expose a `get_connection()` function that returns a live `dbapi.connect(...)` object. For local dev (no HANA), fall back to an in-memory SQLite using `sqlite3` so tests run without HANA.
- [ ] **Task 6.3:** Write `python/app/tools/` — actual SQL tool handlers.
  - [ ] Subtask 6.3.1: Create `python/app/tools/__init__.py`.
  - [ ] Subtask 6.3.2: `python/app/tools/procurement.py`:
    - `get_vendors(category=None, country=None)` — `SELECT * FROM acp_demo_Vendor WHERE ...`
    - `get_purchase_orders(status=None, vendor_id=None, buyer=None)` — JOIN Vendor for name.
    - `get_po_detail(po_id)` — PurchaseOrder + POItem rows.
  - [ ] Subtask 6.3.3: `python/app/tools/finance.py`:
    - `get_invoices(status=None, due_before=None)` — InvoiceHeader with status filter.
    - `get_invoice_detail(invoice_id)` — InvoiceHeader + InvoiceItem rows.
    - `match_invoice_to_po(invoice_id)` — compare InvoiceHeader.amount vs PurchaseOrder.amount; return diff and line-item comparison.
    - `get_spend_summary(group_by, period=None)` — aggregate PO amounts GROUP BY vendor or category.
  - [ ] Subtask 6.3.4: `python/app/tools/registry.py` — dict mapping tool name to handler function and JSON Schema; this is the single source of truth for tool definitions.
- [ ] **Task 6.4:** Write `python/app/mcp_server.py` — FastAPI router exposing MCP HTTP endpoints.
  - [ ] Subtask 6.4.1: `POST /mcp/tools/list` — returns list of tool objects `{ name, description, inputSchema }` from `tools/registry.py`.
  - [ ] Subtask 6.4.2: `POST /mcp/tools/call` — receives `{ name, arguments }`; looks up handler in registry; calls it; returns `{ result: <JSON string> }`.
  - [ ] Subtask 6.4.3: Error handling — unknown tool name returns `{ error: "Tool not found" }`.
- [ ] **Task 6.5:** Write `python/app/mcp_client.py` — HTTP client that calls MCP server endpoints.
  - [ ] Subtask 6.5.1: `async def list_tools(base_url: str, token: str) -> list` — GET/POST `<base_url>/mcp/tools/list` with `Authorization: Bearer <token>`.
  - [ ] Subtask 6.5.2: `async def call_tool(base_url: str, tool_name: str, arguments: dict, token: str) -> str` — POST `<base_url>/mcp/tools/call`; return result JSON string.
  - [ ] Subtask 6.5.3: For elevated tools (`elevated=true`): receive a machine token (passed by CAP in the `effectiveTools` payload per tool — `machineToken` field) and use that instead of `userToken`.
- [ ] **Task 6.6:** Write `python/app/executor.py` — LLM orchestration loop.
  - [ ] Subtask 6.6.1: Build messages list: `[{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }]`.
  - [ ] Subtask 6.6.2: Convert `effectiveTools` list from CAP into LLM tool schemas (Anthropic `tools` format or OpenAI `functions`).
  - [ ] Subtask 6.6.3: Call LLM API — branch on `LLM_PROVIDER`:
    - `anthropic`: use `anthropic.Anthropic(api_key=LLM_API_KEY).messages.stream(...)` with `tools=` list in Anthropic format; handle `tool_use` content blocks.
    - `openai`: use `openai.OpenAI(api_key=LLM_API_KEY).chat.completions.create(stream=True, tools=...)` in OpenAI format; handle `tool_calls` delta.
    - `google-genai`: use `google.genai.Client(api_key=GOOGLE_API_KEY)` with `generate_content_stream()`; convert tools to Gemini `FunctionDeclaration` format; handle `function_call` parts. **Alternatively** use `google-adk`: define tools as `@adk.tool`-decorated functions registered in a `google.adk.agents.Agent`; use `google.adk.runners.InMemoryRunner` to execute the agent loop and yield SSE events from its `run_async()` output. Prefer `google-adk` if the team wants to avoid writing the tool-call loop manually.
  - [ ] Subtask 6.6.4: If LLM returns a `tool_use` block: yield `{ type: "tool_call", toolName, args }` SSE event; call `mcp_client.call_tool` with the correct base URL and token (from `effectiveTools[tool.name].mcpServerUrl` and appropriate token); yield `{ type: "tool_result", toolName, summary, durationMs }` SSE event; append result to messages; loop back to LLM.
  - [ ] Subtask 6.6.5: If LLM returns text tokens: yield each as `{ type: "token", content: chunk }` SSE event.
  - [ ] Subtask 6.6.6: On completion: yield `{ type: "done" }` SSE event.
  - [ ] Subtask 6.6.7: On any exception: yield `{ type: "error", message: str(e) }` SSE event.
- [x] **Task 6.7:** Write `python/app/main.py` — FastAPI application.
  - [ ] Subtask 6.7.1: Include routers: executor routes + mcp_server router. *(Stub: all routes in one module; no separate `executor` / `mcp_server` routers.)*
  - [x] Subtask 6.7.2: `POST /chat` — accepts the full payload from CAP (see architecture section 5); returns `StreamingResponse` with `media_type="text/event-stream"` backed by the `executor.run(...)` async generator. *(Stub SSE only — no real LLM loop.)*
  - [x] Subtask 6.7.3: `POST /tool-test` — sync endpoint; call the named tool handler directly; return `{ result: <string> }`. Does not go through the LLM loop. *(Stub response.)*
  - [x] Subtask 6.7.4: Health check `GET /health` — returns `{ status: "ok" }` (CAP's `testConnection` action calls this).
- [x] **Task 6.8:** Write `python/requirements.txt`.
  - [x] `fastapi`, `uvicorn[standard]`, `httpx`, `python-dotenv`
  - [ ] `anthropic` — Anthropic Claude SDK
  - [ ] `openai` — OpenAI SDK (optional fallback)
  - [ ] `google-generativeai` — raw Gemini API client (used when `LLM_PROVIDER=google-genai` without ADK)
  - [ ] `google-adk` — Google Agent Development Kit (higher-level; replaces the manual tool-call loop in `executor.py` when preferred; see Subtask 6.6.3)
  - [x] `hdbcli` — SAP HANA Python client (connects Python SQL tools to HANA on CF)
  - [x] `@sap-cloud-sdk/connectivity` is Node-only; Python accesses HANA via `hdbcli` using credentials from `VCAP_SERVICES` (parsed in `config.py`).
- [x] **Task 6.9:** Write `python/Procfile` — required by the CF Python buildpack.
  - [x] Single line: `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - [x] Note: `$PORT` is injected by Cloud Foundry at runtime. Without this file `cf push` (and `mbt build`) will fail with "no start command found".
- [ ] **Task 6.10:** Write `python/manifest.yml` for CF push.
  - [ ] App name: `acp-python`, memory: `512M`, buildpack: `python_buildpack`.
  - [ ] Env vars: `LLM_PROVIDER`, `LLM_MODEL` (key injected separately via `cf set-env` or Credential Store — do not commit `LLM_API_KEY` / `GOOGLE_API_KEY` here).
- [ ] **Task 6.11:** Implement local SQLite seeding in `python/app/db.py` for local development.
  - [ ] Subtask 6.11.1: When `VCAP_SERVICES` is absent (local dev), fall back to a local SQLite file `python/local_dev.db` (not `:memory:` — use a file so it survives hot-reloads).
  - [ ] Subtask 6.11.2: On first connection, check if the `acp_demo_Vendor` table exists; if not, run a one-time DDL + INSERT sequence that creates all 5 ERP demo tables using **HANA-compatible names** (`acp_demo_Vendor`, `acp_demo_PurchaseOrder`, `acp_demo_POItem`, `acp_demo_InvoiceHeader`, `acp_demo_InvoiceItem`) and inserts the exact rows from Action Plan 03 Phase 3. Store this SQL in `python/db/seed_local.sql` and execute it at startup. Using the same names as HANA (where CDS deploys `acp.demo.Vendor` as `acp_demo_Vendor`) means the tool handler SQL in `procurement.py` and `finance.py` works unchanged against both SQLite and HANA.
  - [ ] Subtask 6.11.3: Add `python/local_dev.db` and `python/db/seed_local.sql` to the repo. Add `python/local_dev.db` to `.gitignore` (it will be auto-created; do not commit the binary).
- [ ] **Task 6.12:** Test Python service locally.
  - [ ] Subtask 6.12.1: `cd python && uvicorn app.main:app --reload --port 8000`.
  - [x] Subtask 6.12.2: `GET http://localhost:8000/health` → `{ status: "ok" }`.
  - [x] Subtask 6.12.3: `POST http://localhost:8000/mcp/tools/list` → returns 7 tool definitions.
  - [ ] Subtask 6.12.4: `POST http://localhost:8000/mcp/tools/call` `{ name: "get_vendors", arguments: {} }` → returns 5 vendor rows from SQLite seed. *(Stub does not query DB.)*
  - [x] Subtask 6.12.5: `POST http://localhost:8000/chat` with a minimal payload → returns SSE stream with tokens.

---

## Phase 7: App Router and Security Files

- [ ] **Task 7.1:** Write `approuter/xs-app.json`.
  - [ ] Subtask 7.1.1: Route `^/admin/(.*)` → destination `cap` (CAP serves `app/admin/webapp/` as static files); `authenticationType: "xsuaa"`.
  - [ ] Subtask 7.1.2: Route `^/chat/(.*)` → destination `cap` (CAP serves `app/chat/webapp/` as static files); `authenticationType: "xsuaa"`.
  - [ ] Subtask 7.1.3: Route `^/api/(.*)` → destination `cap`; `authenticationType: "xsuaa"`.
  - [ ] Subtask 7.1.4: Route `^/odata/(.*)` → destination `cap`; `authenticationType: "xsuaa"`.
  - [ ] Subtask 7.1.5: The destination name `cap` in all routes must match the destination name injected via `mta.yaml` (see Task 7.6). For local dev it resolves from `default-env.json` destinations.
- [x] **Task 7.2:** Write `approuter/package.json` with `@sap/approuter: "^21.x"` dependency. *(Uses **`~20.1.0`** for Node 20 compatibility; upgrade to ^21 when on Node 22+.)*
- [ ] **Task 7.3:** Write `approuter/default-env.json` for local dev.
  - [ ] Subtask 7.3.1: Mock `VCAP_SERVICES.xsuaa` credentials shape (clientid, clientsecret, url, uaadomain, verificationkey).
  - [ ] Subtask 7.3.2: Add `destinations` array with entries for all local services:
    - `{ "name": "cap", "url": "http://localhost:4004", "forwardAuthToken": true }` — used for all routes (`/admin`, `/chat`, `/api`, `/odata`; CAP serves the UI5 static files and handles OData/API routes).
- [x] **Task 7.4:** Run `npm install` inside `approuter/`.
- [ ] **Task 7.5:** Write `xs-security.json` — exactly as architecture section 11.
  - [x] 4 scopes: `Agent.User`, `Agent.Author`, `Agent.Admin`, `Agent.Audit`.
  - [ ] 4 role-templates: `AgentUser`, `AgentAuthor`, `AgentAdmin`, `AgentAudit`. *(Root `xs-security.json` exists with **`AgentUserV2`** / **`AgentAuthorV2`** / etc. — reconcile naming with architecture section 11 if required.)*
  - [ ] 4 role-collections: `ACP Chat User`, `ACP Agent Author`, `ACP Platform Admin`, `ACP Auditor`.
- [ ] **Task 7.6:** Write `mta.yaml` — based on architecture section 10 with the following required corrections.
  - [ ] Modules: `acp-approuter`, `acp-cap`, `acp-python`, `acp-db-deployer`.
  - [ ] Resources: `acp-xsuaa` (xsuaa/application), `acp-hana` (hana/hdi-shared), `acp-destination` (destination/lite), `acp-html5-host` (html5-apps-repo/app-host).
  - [ ] **Critical fix:** Add `acp-hana` to the `requires` list of the `acp-python` module. The Python SQL tools (`procurement.py`, `finance.py`) query HANA directly via `hdbcli`; without this binding, `VCAP_SERVICES` will contain no HANA credentials and all tool calls will fail at runtime.
  - [ ] **Critical fix — Python URL to CAP:** Add a `provides` block to the `acp-python` module exposing its CF URL: `provides: [{name: acp-python-api, properties: {url: "${default-url}"}}]`. Then add `acp-python-api` to `acp-cap`'s `requires` list and inject it as `properties: {PYTHON_URL: "~{acp-python-api/url}"}`. Without this, `server.js` has no Python URL on CF and all chat and tool-test calls fail.
  - [ ] **Critical fix — Approuter to CAP destination:** Add `acp-cap-api` to `acp-approuter`'s `requires` list as a destination group entry: `{name: acp-cap-api, group: destinations, properties: {name: cap, url: "~{url}", forwardAuthToken: true}}`. This injects the CAP URL as the `cap` destination that every `xs-app.json` route uses. Without this, the approuter cannot reach CAP on CF.
  - [ ] **Remove `CAP_INTERNAL_URL`** from `acp-python` properties. Python does not call CAP — it calls MCP servers using the `mcpServerUrl` values that CAP already resolves and passes in the `effectiveTools` payload.
  - [ ] Make `LLM_PROVIDER` and `LLM_MODEL` configurable properties (keep them in `mta.yaml` as defaults), but do **not** hardcode a vendor-specific model name as the permanent value. Use `LLM_MODEL: gemini-2.0-flash` if Google is the chosen provider, or `LLM_MODEL: claude-3-5-sonnet-20241022` for Anthropic — document the choice clearly.

---

## Phase 8: End-to-End Local Integration Test

- [ ] **Task 8.1:** Start services in separate terminals.
  - [ ] Terminal 1: `cds watch` (CAP on port 4004 — serves OData, REST, and UI5 static files from `app/`)
  - [ ] Terminal 2: `cd approuter && npm start` (App Router on port 5001 — routes all traffic to CAP via `cap` destination)
  - [ ] Terminal 3: `cd python && uvicorn app.main:app --reload --port 8000`
  - Note: `ui5 serve` on separate ports is optional for standalone UI development; for the integration test below, all traffic flows through the approuter → CAP.
- [ ] **Task 8.2:** Admin UI tests (using dummy-auth `Agent.Admin` user).
  - [ ] Subtask 8.2.1: Browse to `http://localhost:5001/admin/webapp/` (or the CDS launchpad at `http://localhost:4004/` to find the registered app link) — McpServer list loads.
  - [ ] Subtask 8.2.2: Click "Test connection" on mcp-001 — health chip turns green.
  - [ ] Subtask 8.2.3: Click "Sync tools" — new Draft tool rows appear in Tools list.
  - [ ] Subtask 8.2.4: Open a tool, set risk level to `Medium`, activate it — status flips to `Active`.
  - [ ] Subtask 8.2.5: Open a tool, click "Run test" — JSON result renders in the panel.
  - [ ] Subtask 8.2.6: Create a new Agent, add a tool, save — Agent appears in list as `Draft`.
  - [ ] Subtask 8.2.7: Open AgentGroup — add a claim value row, save.
- [ ] **Task 8.3:** Chat UI tests (using dummy-auth `Agent.User` user with `dept=procurement`).
  - [ ] Subtask 8.3.1: Browse to `http://localhost:5001/chat/webapp/` — agent selector shows Procurement Assistant and General Assistant only.
  - [ ] Subtask 8.3.2: Select Procurement Assistant, send "Show me all open purchase orders" — tokens stream in; tool trace shows `get_purchase_orders` call.
  - [ ] Subtask 8.3.3: Expand tool trace — arguments and result summary visible.
  - [ ] Subtask 8.3.4: Session appears in left panel with auto-title.
  - [ ] Subtask 8.3.5: Reload page — session history reloads from HANA (SQLite in local dev).
  - [ ] Subtask 8.3.6: Use `dept=finance` dummy user — agent selector shows Invoice Analyst and General Assistant.
- [ ] **Task 8.4:** Role enforcement tests.
  - [ ] Subtask 8.4.1: `Agent.User` cannot call `POST /odata/v4/governance/McpServers` (should get 403).
  - [ ] Subtask 8.4.2: `Agent.User` with `dept=procurement` calling `/api/chat` with an agent from the Finance group returns 403.
  - [ ] Subtask 8.4.3: `Agent.Audit` can `GET /odata/v4/chat/ChatSessions` and see all sessions (not just own).

---

## Phase 9: MTA Build and BTP Cloud Foundry Deploy

> Requires Action Plan 02 (BTP Cockpit) to be complete and all BTP services provisioned.

- [ ] **Task 9.1:** Set the LLM API key as a CF environment variable (do NOT put it in `mta.yaml` or `manifest.yml`).
  - [ ] After deploy: `cf set-env acp-python LLM_API_KEY <your-key>` then `cf restart acp-python`.
- [ ] **Task 9.2:** Build the MTA archive.
  - [x] Verify `python/Procfile` exists (created in Phase 6, Task 6.9) before building.
  - [ ] Run `mbt build` from repo root — verify `mta_archives/agent-control-plane_1.0.0.mtar` is created.
  - [ ] Fix any `mbt build` errors (usually missing `package-lock.json` or unsupported Node version).
- [ ] **Task 9.3:** Log in to Cloud Foundry and target the correct space.
  - [ ] `cf login -a <CF_API_ENDPOINT>` using BTP credentials.
  - [ ] `cf target -o <ORG> -s dev`.
- [ ] **Task 9.4:** Deploy.
  - [ ] `cf deploy mta_archives/agent-control-plane_*.mtar --strategy rolling`.
  - [ ] Monitor: `cf mta agent-control-plane` — wait for all modules to reach `Started`.
  - [ ] Check logs if any module fails: `cf logs acp-cap --recent`, `cf logs acp-python --recent`.
- [ ] **Task 9.5:** Post-deploy configuration.
  - [ ] `cf app acp-python` — note the route URL; create BTP Destination `PYTHON_MCP_SERVICE` pointing to it (see Action Plan 02, Phase 6).
  - [ ] `cf set-env acp-python LLM_API_KEY <key>` then `cf restart acp-python`.
- [ ] **Task 9.6:** Smoke test on BTP.
  - [ ] Open `https://acp-approuter.<cf-domain>/admin` — redirects to XSUAA login; sign in as Alice (admin role).
  - [ ] McpServer list loads with seed data.
  - [ ] Open `https://acp-approuter.<cf-domain>/chat` as Bob (Chat User role, `dept=procurement` claim).
  - [ ] Agent selector shows Procurement Assistant.
  - [ ] Send "Show me all open purchase orders" — response streams; tool trace visible.
  - [ ] Carol (Finance, `dept=finance`) sees Invoice Analyst.
  - [ ] Run demo Conversation 3 (invoice mismatch) from `doc/SeedData/scenario.md` — verify EUR 300 discrepancy is surfaced.

---

*End of Developer Build Action Plan — for BTP service provisioning steps, see `doc/Action-Plan/02-btp-cockpit-setup.md`.*
