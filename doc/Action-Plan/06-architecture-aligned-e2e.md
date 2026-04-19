---
id: architecture-aligned-e2e
title: Architecture-aligned end-to-end delivery
architecture_refs:
  - doc/Architecture/fiori-agent-platform.md
sync_status: synced
created: 2026-04-18
last_updated: 2026-04-19
current_phase: phase-0
---

# Action Plan 06 — Architecture-aligned end-to-end delivery

> **Goal:** Ship the complete target described in `doc/Architecture/fiori-agent-platform.md` §1.1 and §13 — a production-ready, enterprise-grade agent platform where **CAP governs who may do what**, **DeepAgent orchestrates how the agent runs**, **MCP executes the tools**, and **HANA is the single source of truth**. Completing every phase in order produces a fully working application.
>
> **This plan sequences all other plans.** It does not replace the detailed checklists in Plans 01–05 — it maps them to phases and adds net-new work not spelled out elsewhere.

### Tool governance: Admin UI → MCP URL → chat allowlist (reference)

| Stage | Where | What |
|-------|--------|------|
| Register MCP | **McpServer** OP (Plan **01** Phase 4) | `destinationName` / `baseUrl`, test connection, **sync tools** → **Draft `Tool`** rows linked to this server |
| Activate & risk | **Tool** LR/OP | **Activate** tool, set risk / elevated; MCP endpoint comes from **Tool → McpServer** (destination or base URL) — see architecture **§2 Admin UI** |
| Map tools to agent | **Agent** OP → **Tool Assignments** (`AgentTool`) | Which **tools** this **agent** may use + `permissionOverride` — **tool-level RBAC for the agent** |
| Map users to agents | **AgentGroup** + JWT claim (e.g. `dept`) | Which **agents** the **user** may use in chat — **user-level RBAC** |
| Chat allowlist | **CAP** `POST /api/chat` | Computes **`toolIds`** = tools assigned via **`AgentTool`** for this **`agentId`**, user may use agent, **`Tool`** / **`Agent`** **Active** |
| Execute | **Python** (Phase **5–6**) | Hydrates by **`toolIds`**; **before each MCP call** asserts tool name ∈ allowlist — **defense in depth** (architecture **§13.5.2**) |

Full detail: **`doc/Architecture/fiori-agent-platform.md` §2 (Admin UI), §13.5.1–13.5.2**.

---

## Legacy plan mapping

| Plan | Role in this delivery |
|------|-----------------------|
| [01-application-implementation.md](01-application-implementation.md) | **Codebase checklist** — Phases 1–9 code complete; open manual tests → **Phase 0 here** |
| [02-btp-cockpit-setup.md](02-btp-cockpit-setup.md) / [02-btp-infrastructure.md](02-btp-infrastructure.md) | **Infra gates** — BTP services, destinations → **Phase 2** |
| [03-data-and-security.md](03-data-and-security.md) | **Seed data** — extend with Skill CSVs at **Phase 3** |
| [04-hybrid-hana-spectrum-1.md](04-hybrid-hana-spectrum-1.md) | **HANA hybrid dev baseline** → **Phase 0**; Spectrum 2/3 superseded by Plan 05 |
| [05-cap-public-python-private-production-path.md](05-cap-public-python-private-production-path.md) | **Identity + trust model** (XSUAA, private Python) → **Phase 1** |

## Decisions: not pursued / discarded

| Item | Status |
|------|--------|
| Parallel App Router → Python route | **Never** — `xs-app.json` routes only to CAP |
| Per-tool OAuth scopes inside MCP server alone | **Insufficient** — per-tool RBAC lives in CAP + HANA + executor allowlist (§13.5.1) |
| DeepAgent as "optional" enhancement | **Corrected** — DeepAgent is the **sole production orchestrator** (Phase 6, required) |
| **Google ADK** (`adk_engine.py`, `google-adk`) as a parallel engine | **Deprecated** — remove after DeepAgent parity (**§13.4**); Gemini runs via LangChain inside DeepAgent |
| **Hand-rolled** Anthropic/OpenAI loops in `executor.py` | **Deprecated** — same removal milestone as ADK |
| JWT verification in Python for v1 | Optional hardening only (Plan 05 Phase 6); not a gate for MVP |
| Separate end-to-end architecture doc | Removed — merged into `fiori-agent-platform.md §1.1` |

---

## Why DeepAgent is core, not optional

The current Python stack is **legacy** and **scheduled for removal**:
1. **Hand-rolled loops** (Anthropic / OpenAI) — no planning, no context offload.
2. **Google ADK** (`adk_engine.py`) — strong for Gemini + ADK Web, but **not** the single harness for all providers; maintaining it alongside DeepAgent duplicates security and ops surface (**architecture §13.4**).

The target architecture (**§1.1** runtime objects, **§13.4**) specifies a **provider-agnostic orchestration harness** that gives every agent, regardless of LLM, three capabilities the current code cannot provide:

| Capability | Why it matters | Provided by |
|---|---|---|
| **Planning** (`write_todos`) | Agent decomposes long tasks into trackable steps; recovers from partial failures | `deepagents` built-in |
| **Virtual filesystem** | Large tool outputs (PO dumps, invoice lists) are offloaded to in-memory files instead of the context window; agent references them by name | `deepagents` built-in |
| **Skills + `AgentTool` governance** | Enterprise procedures and **per-agent tool allowlists** (HANA); primary modularization — see **§13.1** / **§13.5.2** | CAP + Admin UI + Python allowlist |
| **SubAgent** (optional) | Not a foundation requirement — **Skill-driven** only if ever added (**Phase 7.4**) | `deepagents` |

Without Phase 6, the "enterprise-grade AI agent" is a glorified chatbot: it cannot plan, it fills its context window with raw tool outputs, and tool governance stays harder to reason about. **Phase 6 is required.**

---

## Delivery sequence overview

```
Phase 0  Baseline verification (current fat-payload path works)
Phase 1  Identity & trust (real XSUAA, private Python)
Phase 2  CF deploy (MTA, internal Python URL, smoke)
Phase 3  Schema: Skill, AgentSkill, ChatSession summary/watermark (optional `engine` — see Phase 3)
Phase 4  CAP thin JSON + **forward `Authorization: Bearer`** to Python; **no** env feature flag
Phase 5  Python hydration by id + **Python-owned chat persistence** (session ownership, allowlist, append-only writes)
Phase 6  DeepAgent-only + **delete ADK (`adk_engine.py`) + remove legacy loops**  ◄── CORE
Phase 6b **Langfuse** (OSS) — trace + eval (**§13.4.1**); run in parallel with Phase 6 in dev
Phase 7  Admin UI: Skills (no engine selector — DeepAgent-only runtime)
Phase 8  Chat UI: planning panel + contract verification
Phase 9  Summarization (bounded LLM context)
Phase 10 MCP pool microservice  ◄── optional (scale trigger)
Phase 11 MCP governance hardening  ◄── continuous (not a gate)
```

---

## Phase 0: Baseline verification

### Status: PENDING

**Objective:** Prove the existing fat-payload path works end-to-end before any feature work branches off it.

**What you have at the end:** Current app (no Skills, no thin payload, no DeepAgent) verified working in at least one environment.

- [ ] **Task 0.1:** Developer environment setup
  - [ ] **0.1.1:** Copy `.env.example` → `.env`; set `LLM_*`, `PYTHON_URL=http://localhost:8000`, `HANA_*` (Plan **01** Task 1.7).
  - [ ] **0.1.2:** `cf login`; `cds bind db --to <hdi-instance>`; `npm run deploy:hana`; `npm run watch` (Plan **04**).
  - [ ] **0.1.3:** Python venv per `python-venv-policy.mdc`; `.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
  - [ ] **0.1.4:** App Router: `cd approuter && npm start`.

- [ ] **Task 0.2:** OData smoke
  - [ ] **0.2.1:** `/odata/v4/governance/$metadata` loads.
  - [ ] **0.2.2:** `/odata/v4/chat/$metadata` loads.
  - [X] **0.2.3:** `GET /health` on Python returns `{ status: "ok" }`.

- [ ] **Task 0.3:** Admin UI (Plan **01** Task 4.5)
  - **Scope:** Covers **McpServer → Tool → Agent / AgentTool** screens shipped in Plan **01** (Phase 4). **Governance `Skill` / `AgentSkill`** (markdown bodies, Agent OP Skills facet) is **out of scope** for Phase 0 — schema and UI are **Phase 3** + **Phase 7** here; see architecture §13.1. *(This is unrelated to Cursor editor “skills” under `.cursor/skills/`.)*
  - [X] **0.3.1:** McpServer list loads 2 seed rows.
  - [ ] **0.3.2:** Test connection → health chip updates.
  - [ ] **0.3.3:** Sync tools → Draft Tool rows appear.
  - [ ] **0.3.4:** Activate a tool; set risk level.
  - [ ] **0.3.5:** Run test on a tool → result JSON renders.
  - [ ] **0.3.6:** Agent OP shows **Tool Assignments** sub-table (tool name, risk, elevated, permission override — Plan **01** 4.3.6).
  - [ ] **0.3.7:** AgentGroups list loads 3 seed rows; AgentGroup OP shows **claim values** and **agent assignment** sub-tables (Plan **01** 4.5.6).
  - [ ] **0.3.8:** Tools list and Agents list show expected **seed** row counts and columns (Plan **01** 4.5.4–4.5.5 — e.g. Tools with risk badges; Agents list before opening OP).

- [ ] **Task 0.4:** Chat UI (Plan **01** Task 5.9)
  - [ ] **0.4.1:** Agent selector shows only dept-matched agents.
  - [ ] **0.4.2:** Send message → SSE tokens stream live.
  - [ ] **0.4.3:** Tool trace panel expands with tool name, duration, result.
  - [ ] **0.4.4:** Session appears in left panel; reload restores history from HANA.

- [X] **Task 0.5:** Role enforcement (Plan **01** Phase 8)
  - [X] **0.5.1:** `Agent.User` gets 403 on governance write endpoints.
  - [X] **0.5.2:** User with wrong `dept` gets 403 on `/api/chat` for out-of-scope agent.
  - [X] **0.5.3:** `Agent.Audit` sees all sessions.

**Exit criteria:** Phase 0 passes without blocking defects on at least one environment (local hybrid or CF).

---

## Phase 1: Identity & trust

### Status: PENDING

**Objective:** Real XSUAA JWT at CAP; Python private; internal hop authenticated. Aligns with **§1.1** security boundaries.

**What you have at the end:** Production-like identity on developer machine; no Basic-auth bypass; Python only reachable from CAP.

- [ ] **Task 1.1:** BTP / IAS / role collections (Plan **05** Phase 1)
  - [ ] **1.1.1:** Confirm IAS trust to BTP subaccount.
  - [ ] **1.1.2:** Confirm role collections `AgentUserACP`, `AgentAdminACP`, `AgentAuthorACP`, `AgentAuditACP` exist and are assigned to test users.
  - [X] **1.1.3:** XSUAA redirect URIs include `http://localhost:5000/login/callback`.

- [ ] **Task 1.2:** Hybrid: real XSUAA + App Router (Plan **05** Phase 2)
  - [ ] **1.2.1:** `cds bind` XSUAA + HANA; `cds watch --profile hybrid` with `auth.kind = "xsuaa"`.
  - [ ] **1.2.2:** App Router started via `cds bind --exec`; Fiori entry only through App Router URL.
  - [ ] **1.2.3:** No Basic-auth or `DevAuth.js` bypass active in normal runs.

- [ ] **Task 1.3:** CAP → Python trust contract (Plan **05** Phase 3 / `srv/python-trust.js`)
  - [ ] **1.3.1:** CAP injects `X-Internal-Token` (from `ACP_INTERNAL_TOKEN` env) + `X-AC-User-Id`, `X-AC-Dept`, `X-AC-Roles` headers on every Python call.
  - [ ] **1.3.2:** Python rejects requests missing the token or headers.
  - [ ] **1.3.3:** No browser-origin request ever reaches Python directly.

- [ ] **Task 1.4:** Verification (Plan **05** Phase 5)
  - [ ] **1.4.1:** JWT decoded once at CAP; scopes match role collections.
  - [ ] **1.4.2:** Python logs show only internal calls from CAP.

**Exit criteria:** Plan **05** Phases 1–3 and 5 marked done; hybrid behavior matches production trust model.

---

## Phase 2: Cloud Foundry production cutover

### Status: PENDING

**Objective:** MTA deploy, private Python route, post-deploy destinations and smoke. Aligns with Plan **01** Phase 9 + Plan **02** + Plan **05** Phase 4.

**What you have at the end:** Pilot users on `https://…` with correct governance, no public Python route.

- [ ] **Task 2.1:** Pre-deploy checks
  - [ ] **2.1.1:** `mbt build` succeeds (install `make` on Windows PATH if needed — Plan **01** Task 9.2).
  - [X] **2.1.2:** `python/Procfile` present; Python `requirements.txt` complete.
  - [X] **2.1.3:** `mta.yaml`: `acp-python` lists `acp-hana` in `requires`; `acp-cap` has `PYTHON_URL` injected from `acp-python-api/url`.

- [ ] **Task 2.2:** Deploy
  - [ ] **2.2.1:** `cf login`; `cf target -o <org> -s dev`.
  - [ ] **2.2.2:** `cf deploy mta_archives/agent-control-plane_*.mtar --strategy rolling`.
  - [ ] **2.2.3:** All modules reach `Started`; no module fails.

- [ ] **Task 2.3:** Post-deploy configuration
  - [ ] **2.3.1:** `cf set-env acp-python LLM_API_KEY <key>` (and `GOOGLE_API_KEY` if using Gemini); `cf restart acp-python`.
  - [ ] **2.3.2:** Create BTP Destination `PYTHON_MCP_SERVICE` → Python internal URL.
  - [ ] **2.3.3:** XSUAA redirect URIs include the production App Router URL; `cf update-service acp-xsuaa`.
  - [ ] **2.3.4:** `cf set-env acp-cap ACP_INTERNAL_TOKEN <secret>`; same on `acp-python`; restart both.

- [ ] **Task 2.4:** Smoke on CF URL (Plan **01** Task 9.6)
  - [ ] **2.4.1:** Login as Admin → McpServer list loads.
  - [ ] **2.4.2:** Chat as User (`dept=procurement`) → agent selector, SSE stream, tool trace.
  - [ ] **2.4.3:** Direct curl to Python public URL → no route (or 403).

**Exit criteria:** Pilot users can run Admin + Chat on `https://…`; Python is unreachable from the internet.

---

## Phase 3: Schema — Skill, AgentSkill, summary watermark

### Status: IN_PROGRESS *(Tasks 3.1–3.2 implemented in repo; **3.3** requires `npm run deploy:hana` + OData smoke on your HDI instance.)*

**Objective:** Schema additions for §13.1 + §13.6 in one HDI migration. Aligns with **§13.4 — target is DeepAgent-only**; **do not** add a long-lived `Agent.engine` column with `Loop` / `ADK` / `DeepAgent` unless you need a short migration window (prefer **no** `engine` column: code routes all chat through DeepAgent once Phase 6 lands).

**What you have at the end:** HANA tables for Skills and summarization; fat path still works until Phase 6 deletes ADK.

- [X] **Task 3.1:** `db/schema.cds` additions
  - [X] **3.1.1:** Add `Skill` entity: `ID`, `name (100)`, `description (500)`, `body (LargeString)`, `status enum { Draft; Active; Disabled }`, `modifiedAt`.
  - [X] **3.1.2:** Add `AgentSkill` join entity: `ID`, `agent → Agent`, `skill → Skill`.
  - [X] **3.1.3:** Add `summary (LargeString)` and `summaryWatermark (Timestamp)` to `ChatSession` — nullable; backward compatible.
  - [ ] **3.1.4:** *(Optional migration only)* If you must flag agents during cutover, add `engine` enum **only** `{ DeepAgent }` or a single default — **do not** model deprecated ADK/Loop in HANA long term (**architecture §13.4**). *(Not added — prefer no `engine` column.)*

- [X] **Task 3.2:** CAP service layer
  - [X] **3.2.1:** Expose `Skills`, `AgentSkills` in `srv/governance-service.cds` with `@restrict` mirroring `Tool` patterns (Admin writes; Author/Audit reads).
  - [X] **3.2.2:** Seed data: `db/data/acp-Skill.csv` (≥ 2 demo rows), `db/data/acp-AgentSkill.csv` mapping.

- [ ] **Task 3.3:** Deploy + verify
  - [ ] **3.3.1:** `npm run deploy:hana` — HDI migration clean; no data loss on existing tables.
  - [ ] **3.3.2:** `GET /odata/v4/governance/Skills` as Admin → returns seed rows.
  - [ ] **3.3.3:** Existing chat flow still works (legacy ADK/loop path unchanged until Phase 6).

**Exit criteria:** HANA has `Skill`, `AgentSkill`, `ChatSession.summary/summaryWatermark`; fat-payload chat still works.

---

## Phase 4: CAP — thin payload to Python

### Status: PENDING

**Objective:** CAP sends **§13.2** thin JSON to Python (**`agentId` / `toolIds` / `skillIds` / `sessionId` / `message` / `userInfo`** — **no** access token in the body). CAP **forwards** the browser’s **`Authorization: Bearer <jwt>`** to Python ([RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)). **`X-Internal-Token`** (and `X-AC-*`) proves the hop is **CAP → Python**, not a public client. **No `ACP_THIN_PYTHON_PAYLOAD` flag** — migrate `server.js` off the legacy fat payload in the same phase family as Phase 5.

**What you have at the end:** CAP no longer builds `effectiveTools` / `history` blobs for Python; it **stops persisting** `ChatMessage`/`ToolCallRecord` on `done` once Phase 5 owns writes (remove duplicate inserts in `server.js`).

- [X] **Task 4.1:** Define and document payload contract
  - [X] **4.1.1:** Document in `README.md` or code comments:
    ```json
    {
      "sessionId": "uuid-or-null",
      "agentId": "uuid",
      "toolIds": ["uuid"],
      "skillIds": ["uuid"],
      "message": "...",
      "userInfo": { "userId": "...", "dept": "...", "roles": ["..."] }
    }
    ```
    **Headers:** `Authorization: Bearer <access_token>` (forward from browser → CAP), `X-Internal-Token`, `X-AC-*` per Plan **05**.
  - [X] **4.1.2:** Confirm **`ACP_INTERNAL_TOKEN`** / header contract in `.env.example` (Plan **05**); **do not** add a thin-payload feature flag.

- [ ] **Task 4.2:** `srv/server.js` — implement thin POST to Python
  - [ ] **4.2.1:** After agent-access verification, collect `toolIds[]` from `AgentTool` join (status `Active`) + `skillIds[]` from `AgentSkill` join (status `Active`).
  - [ ] **4.2.2:** POST thin JSON; set **`Authorization: Bearer`** to the same user JWT CAP received; **omit** `effectiveTools`, `history`, `userToken` body field, and legacy `agentConfig` blob (Python loads agent row by id).
  - [ ] **4.2.3:** Proxy Python SSE to the browser unchanged; **remove** CAP-side INSERTs on `done` when Phase 5 Python persistence is live (avoid double writes).

- [ ] **Task 4.3:** Update architecture doc §5 API contract (§13.2 already defines the target).

**Exit criteria:** CAP sends thin JSON + **`Authorization: Bearer`** + internal-trust headers (**no** token in JSON body); no env flag for payload shape.

---

## Phase 5: Python — hydration, session ownership, allowlist

### Status: PENDING

**Objective:** Python loads everything by id from HANA (§13.3); enforces session owner; rejects out-of-allowlist tool calls.

**What you have at the end:** Python is read-HANA / append-only; thin payload end-to-end working for all existing test scenarios.

- [ ] **Task 5.1:** `python/app/hydrator.py`
  - [ ] **5.1.1:** `hydrate_agent(agent_id)` → `Agent` row (system prompt, model profile; omit `engine` once DeepAgent-only).
  - [ ] **5.1.2:** `hydrate_tools(tool_ids[])` → list of Tool rows with `name`, `inputSchema`, `mcpServerUrl`, `elevated`; reject any `status != 'Active'`.
  - [ ] **5.1.3:** `hydrate_skill_metadata(skill_ids[])` → list of `{id, name, description}` only (no body); body loaded lazily via `load_skill_body(skill_id)`.
  - [ ] **5.1.4:** `hydrate_session(session_id, user_id)` → ownership check (`ChatSession.userId == user_id`); return messages from `summaryWatermark` onward (or all if no watermark); include `summary` string.

- [ ] **Task 5.2:** `python/app/session_store.py`
  - [ ] **5.2.1:** `create_session(user_id, agent_id, title)` → insert `ChatSession`, return new `session_id`.
  - [ ] **5.2.2:** `append_messages(session_id, user_content, assistant_content, tool_records[])` → INSERT `ChatMessage` (user), `ChatMessage` (assistant), `ToolCallRecord` rows; UPDATE `ChatSession.updatedAt`.

- [ ] **Task 5.3:** Update `/chat` handler in `python/app/main.py`
  - [ ] **5.3.1:** When thin payload (`toolIds` present): call hydrator; build `RunContext` with `allowed_tool_names = {t.name for t in hydrated_tools}`; use the **`Authorization: Bearer`** value for delegated MCP per existing tooling rules.
  - [ ] **5.3.2:** Before every MCP call: assert `tool_name in allowed_tool_names`; raise `403` if not (defense in depth).
  - [ ] **5.3.3:** On completion: call `session_store.append_messages()` — **Python** is the sole writer of `ChatSession` / `ChatMessage` / `ToolCallRecord` for `/chat`; CAP **only proxies** SSE and forwards `done` (with `sessionId`, `messageId` from Python).

- [ ] **Task 5.4:** Integration test
  - [ ] **5.4.1:** Tampered `toolId` in thin payload → Python rejects with 403.
  - [ ] **5.4.2:** Golden scenarios (procurement chat, invoice chat) match pre-migration behavior.
  - [ ] **5.4.3:** Session reload (second message) correctly loads history from watermark.

**Exit criteria:** Thin payload + Python hydration + Python persistence + SSE proxy; allowlist enforced; **no** duplicate persistence in CAP.

---

## Phase 6: DeepAgent-only orchestrator + remove Google ADK and legacy loops

### Status: PENDING

**Objective:** **§13.4** — **All** chat traffic goes through **DeepAgent** (`deepagents` / LangGraph) with LangChain chat models for **Anthropic, OpenAI, and Gemini**. **Delete** `adk_engine.py`, remove **`google-adk`** from `requirements.txt`, and remove hand-rolled tool loops from `executor.py` after golden-scenario parity.

**What you have at the end:** No ADK path; no parallel `Loop` path; one orchestrator; Gemini uses `ChatGoogleGenerativeAI` inside DeepAgent, not ADK.

- [ ] **Task 6.1:** Dependencies
  - [ ] **6.1.1:** Add `deepagents`, `langchain-google-genai`, `langchain-anthropic`, `langchain-openai` to `python/requirements.txt`.
  - [ ] **6.1.2:** *(Cutover)* Temporarily keep `google-adk` only until **Task 6.6** deletes ADK — then remove from `requirements.txt`.

- [ ] **Task 6.2:** `python/app/deepagent_engine.py` — core module
  - [ ] **6.2.1:** Import `create_deep_agent`, `SubAgent` from `deepagents`.
  - [ ] **6.2.2:** `build_mcp_tool_bridge(hydrated_tools, run_context)` → returns list of LangChain-compatible `BaseTool` wrappers that:
    - Call `mcp_client.call_tool(base_url, name, args, token)` under the hood.
    - Use **`Authorization: Bearer`** (forwarded user access token) for delegated tools; `machineToken` for elevated tools (`chat_tooling.py` logic).
    - Assert `name in run_context.allowed_tool_names` before every call.
  - [ ] **6.2.3:** `build_load_skill_tool(skill_ids, db_conn)` → a `BaseTool` named `load_skill` that:
    - Takes `skill_id` as argument.
    - Asserts `skill_id in run_context.allowed_skill_ids`.
    - Fetches `Skill.body` from HANA on demand (progressive disclosure — §13.1).
    - Returns the markdown body.
  - [ ] **6.2.4:** `build_system_prompt(agent_cfg, skill_metadata)` → renders system prompt with:
    - Agent's `systemPrompt` base.
    - Appended section: `## Available skills\n` + `- **{name}**: {description}` for each skill (metadata only; instructs agent to call `load_skill(id)` for full body).
  - [ ] **6.2.5:** `run_deep_agent(model, tools, system_prompt, history, message)` → calls `create_deep_agent(model=model, tools=tools, system_prompt=system_prompt, subagents=[])` (or omit `subagents` if the API default is empty) and streams with `agent.astream_events({"messages": [*history, HumanMessage(message)]})`. **Foundation does not register `SubAgent` instances** — enterprise procedure + tool usage is expressed via **Skills** (§13.1) and governed **Tool** allowlists, not hardcoded sub-agents (see architecture §13.4).
  - [ ] **6.2.6:** SSE event mapping from LangGraph stream events:
    - `on_chat_model_stream` → emit `{ type: "token", content: chunk.content }`.
    - `on_tool_start` → emit `{ type: "tool_call", toolName: name, args: args }`.
    - `on_tool_end` → emit `{ type: "tool_result", toolName: name, summary: str(output)[:300], durationMs: elapsed }`.
    - Write-todos events (planning) → emit `{ type: "planning", todos: [...] }` (new event type; chat UI may display or ignore — see Phase 8).
    - Stream ends → emit `{ type: "done" }`.

  - **Deferred (not foundation):** **`SubAgent`** graphs — if ever introduced, **bind to Skill** (procedure + related tools in HANA), not a platform-default `tool-researcher`. Track as optional increment after Skills are stable (Phase 7+).

- [ ] **Task 6.3:** `python/app/executor.py` — single entry path
  - [ ] **6.3.1:** `/chat` always calls `deepagent_engine.run_deep_agent(...)` after hydration (no `if ADK` / `if Loop` branches).
  - [ ] **6.3.2:** Branch **only** on `LLM_PROVIDER` to pick the LangChain `BaseChatModel` (Gemini / Anthropic / OpenAI).

- [ ] **Task 6.4:** Model instantiation
  - [ ] **6.4.1:** `LLM_PROVIDER=google-genai` → `ChatGoogleGenerativeAI(model=LLM_MODEL)` (langchain-google-genai).
  - [ ] **6.4.2:** `LLM_PROVIDER=anthropic` → `ChatAnthropic(model=LLM_MODEL)`.
  - [ ] **6.4.3:** `LLM_PROVIDER=openai` → `ChatOpenAI(model=LLM_MODEL)`.
  - [ ] **6.4.4:** Add `langchain-google-genai`, `langchain-anthropic`, `langchain-openai` to `requirements.txt`.

- [ ] **Task 6.5:** Integration tests (all providers via DeepAgent)
  - [ ] **6.5.1:** **Gemini:** `LLM_PROVIDER=google-genai` — multi-step procurement prompt; planning todos in SSE; tools + virtual FS behavior coherent vs previous ADK golden transcript (allow small wording drift).
  - [ ] **6.5.2:** **Anthropic or OpenAI:** same style scenario on a second agent — parity vs previous loop-based golden transcript.
  - [ ] **6.5.3:** Multi-step data fetch **without** a default `SubAgent` — Skills + MCP tools + planning only.
  - [ ] **6.5.4:** `load_skill` — only allowlisted skill bodies load.

- [ ] **Task 6.6:** Remove deprecated code (**§13.4** removal checklist)
  - [ ] **6.6.1:** Delete `python/app/adk_engine.py`.
  - [ ] **6.6.2:** Remove `google-adk` from `requirements.txt`.
  - [ ] **6.6.3:** Delete dead branches / hand-rolled loops from `executor.py`; keep only routing + `deepagent_engine` invocation + `tool-test` helper paths.
  - [ ] **6.6.4:** If `Agent.engine` column was added for migration, drop it from CDS + HANA or fix to a no-op.

- [ ] **Task 6.7:** Update architecture docs
  - [ ] **6.7.1:** `fiori-agent-platform.md §5` — target-only DeepAgent; legacy ADK diagram marked removed.
  - [ ] **6.7.2:** Mark **ADR-11** (DeepAgent-only; deprecate ADK) as implemented in §13.7.

**Exit criteria:** Golden scenarios pass on **DeepAgent + Gemini** and **DeepAgent + Anthropic/OpenAI**; `adk_engine.py` and `google-adk` **gone** from repo; CI or manual checklist green.

---

## Phase 6b: Observability — Langfuse (open source) for trace + eval

### Status: PENDING

**Objective:** Match the **ADK Web** developer experience (trace UI, eval sessions) without keeping ADK in production — **§13.4.1**. Use **[Langfuse](https://langfuse.com/)** (MIT, **[self-host](https://langfuse.com/self-hosting)** or cloud) — **not** LangSmith (proprietary).

**What you have at the end:** Engineers debug DeepAgent runs in Langfuse; optional LangGraph Studio locally for graph replay.

- [ ] **Task 6b.1:** Add `langfuse` to `python/requirements.txt`; wire **`langfuse.langchain.CallbackHandler`** on DeepAgent `invoke` / stream (see [Langfuse + DeepAgents](https://langfuse.com/integrations/frameworks/langchain-deepagents)).
- [ ] **Task 6b.2:** Configure **`LANGFUSE_PUBLIC_KEY`**, **`LANGFUSE_SECRET_KEY`**, **`LANGFUSE_HOST`** in **dev/staging** `.env` / CF (never commit secrets).
- [ ] **Task 6b.3:** Confirm traces appear in Langfuse for `create_deep_agent` (planning, tools, latency, tokens; optional sub-agent spans if enabled later).
- [ ] **Task 6b.4:** (Optional) Run a small **dataset / score** experiment in Langfuse to validate eval path.
- [ ] **Task 6b.5:** (Optional production) Deploy **self-hosted** Langfuse on your infra or document approved **Langfuse Cloud** project + data policy.
- [ ] **Task 6b.6:** Document in `README.md`: observability = **Langfuse**; product does **not** use ADK Web or LangSmith; throwaway ADK-only experiments **outside** this repo if needed during migration.

**Exit criteria:** Failed chat turn debuggable from Langfuse UI without `adk_engine.py`.

---

## Phase 7: Admin UI — Skills

### Status: PENDING

**Objective:** Admin can create, edit, and assign Skills. **No** Fiori field for `Loop` / `ADK` / `DeepAgent` — runtime is DeepAgent-only after Phase 6 (**architecture §13.4**).

**What you have at the end:** Admin manages Skills + existing agent/tool/server/group screens; no multi-engine confusion in UI.

- [ ] **Task 7.1:** Skill List Report + Object Page (`app/admin/annotations/annotations.cds`)
  - [ ] **7.1.1:** `@UI.LineItem` for Skills: name, description (truncated), status, modifiedAt.
  - [ ] **7.1.2:** Skill OP: field groups — Metadata (name, description, status), Body (full markdown `LargeString` as `@UI.MultiLineText`).
  - [ ] **7.1.3:** `manifest.json` route: `SkillsList` → `Skills` entity set.
  - [ ] **7.1.4:** i18n strings for all Skill labels.

- [ ] **Task 7.2:** Agent OP — Skills facet
  - [ ] **7.2.1:** Add `AgentSkills` sub-table facet to Agent OP (mirror `AgentTools` pattern): columns skill name, description, status.

- [ ] **Task 7.3:** Manual test
  - [ ] **7.3.1:** Create Skill "Procurement SOP" with body, attach to Procurement Assistant agent; chat verifies skill `load_skill` path.

- [ ] **Task 7.4 (optional — not required for MVP):** **`SubAgent` only via Skill**
  - [ ] **7.4.1:** If delegation to a **`SubAgent`** is ever required, **do not** hardcode sub-agents in `deepagent_engine.py`. Extend **Skill** (metadata and/or body convention) + **AgentSkill** + tool associations so governance defines **which** procedure may spawn **which** isolated worker and **which** tools it may use — then map to `deepagents.SubAgent` at runtime. Skip until there is a concrete enterprise use case.

**Exit criteria:** Admin can CRUD Skills and assign to agents via Fiori UI.

---

## Phase 8: Chat UI — planning panel + contract verification

### Status: PENDING

**Objective:** Surface DeepAgent's planning events (`write_todos`) in the chat UI; confirm browser→CAP contract unchanged.

**What you have at the end:** Users see the agent's live todo list while it plans; SSE contract verified at both ends.

- [X] **Task 8.1:** Browser → CAP contract check
  - [X] **8.1.1:** Confirm `Chat.controller.js` sends only `{ agentId, message, sessionId }` — no changes needed if true; document in README.
  - [X] **8.1.2:** Confirm `done` event still carries `{ sessionId, messageId }` for session tracking.

- [ ] **Task 8.2:** Planning panel in `Chat.view.xml`
  - [ ] **8.2.1:** Add collapsible `Panel` above the tool trace titled "Agent plan" — visible only while streaming and when `planning` SSE events have arrived.
  - [ ] **8.2.2:** Display a live `List` of todo items (text, status: pending / in-progress / done) updated as `planning` events arrive.
  - [ ] **8.2.3:** Auto-collapse when stream ends; keep visible if user expanded it.

- [ ] **Task 8.3:** Controller handling of `planning` event
  - [ ] **8.3.1:** In `_openChatStream` handler: `planning` event → update planning panel model.
  - [ ] **8.3.2:** Unknown future event types → silently ignore (forward-compatibility).

- [ ] **Task 8.4:** Manual test
  - [ ] **8.4.1:** Send a multi-step question to DeepAgent agent — planning panel appears, todos update in real time, collapses on done.
  - [ ] **8.4.2:** *(If any legacy build remains)* — after Phase 6, planning panel is the norm for all agents; no separate "non-DeepAgent" chat path.

**Exit criteria:** Planning panel renders for DeepAgent-driven chat (sole runtime after Phase 6).

---

## Phase 9: Summarization

### Status: PENDING

**Objective:** Bound LLM context on long sessions; UI shows full history; model only sees summary + tail (§13.6).

**What you have at the end:** Sessions can run indefinitely without context overflow; users see all messages; model context is trimmed.

- [ ] **Task 9.1:** Define threshold
  - [ ] **9.1.1:** Choose trigger: token count threshold (preferred) or message count (simpler). Document in `config.py`.
  - [ ] **9.1.2:** Add `SUMMARY_TOKEN_THRESHOLD` (default 6000) to `.env.example` and `config.py`.

- [ ] **Task 9.2:** Summarization function in `python/app/session_store.py`
  - [ ] **9.2.1:** `summarize_if_needed(session_id, messages_since_watermark)` — check total token count of messages; if above threshold, call LLM with summarization prompt on the oldest 50% of messages; return summary text.
  - [ ] **9.2.2:** Write `ChatSession.summary` + `ChatSession.summaryWatermark = last_summarized_message.timestamp`.
  - [ ] **9.2.3:** Trigger: called inline at end of each `/chat` response (before `done`) — simple; no background job needed for v1.

- [ ] **Task 9.3:** History loader (update `hydrator.py` Task 5.1.4)
  - [ ] **9.3.1:** Prepend `[system] Previous conversation summary:\n{summary}` to LLM message history when `summary` is non-null.
  - [ ] **9.3.2:** Load only `ChatMessage` rows where `timestamp > summaryWatermark`.

- [ ] **Task 9.4:** UI — full history still visible
  - [ ] **9.4.1:** `Chat.controller.js` loads all `ChatMessage` rows via OData on session select — no filter on watermark (UI shows everything; only model context is trimmed).

- [ ] **Task 9.5:** Test
  - [ ] **9.5.1:** Run a session to > threshold; confirm `summary` + `summaryWatermark` updated in HANA.
  - [ ] **9.5.2:** Send a follow-up message; confirm model does not see messages before watermark but does see summary.
  - [ ] **9.5.3:** UI session reload shows all messages including pre-watermark ones.

**Exit criteria:** 20+ message session does not exceed context limit; user sees full history; model sees summary + tail.

---

## Phase 10: MCP pool microservice (optional — scale trigger)

### Status: PENDING (defer until MCP tool count or team split justifies it)

**Objective:** Extract `python/app/mcp_server.py` + `tools/` to `services/mcp-pool/` when tool count or load demands separation (§13.5). Not required for the target architecture to be considered "done."

**Trigger:** > 20 tools, or tool-team is separate from executor-team, or MCP load warrants independent scaling.

- [ ] **Task 10.1:** Create `services/mcp-pool/` CF module (Dockerfile + manifest).
- [ ] **Task 10.2:** Move `tools/` and `mcp_server.py` into pool; expose `POST /mcp/tools/list` + `POST /mcp/tools/call`.
- [ ] **Task 10.3:** Update `McpServer.baseUrl` / BTP Destination to point to pool URL.
- [ ] **Task 10.4:** Executor unchanged at MCP client level (only URL changes).
- [ ] **Task 10.5:** Load test; document rollback plan.

**Exit criteria:** Chat + tools work with pool deployed separately; governance (AgentTool allow-list) unchanged.

---

## Phase 11: MCP governance hardening (continuous — not a gate)

### Status: PENDING (run as part of each release cycle)

**Objective:** Ensure MCP authorization matches **§13.5.1–13.5.2**: per-tool RBAC (**JWT → agent** via `AgentGroup`, **agent → tool** via **`AgentTool`**) in CAP + HANA + Python allowlist; audience-bound tokens; central audit complete.

- [ ] **Task 11.1:** Token review — confirm `chat_tooling.py` uses audience-bound tokens for delegated vs elevated tools; user JWT never passed raw to MCP.
- [X] **Task 11.2:** Audit completeness — `ToolCallRecord` captures: tool name, args summary, result summary, `elevatedUsed`, `durationMs`, `messageId`.
- [ ] **Task 11.3:** Allowlist smoke — per each release: curl `/mcp/tools/call` with a tool name NOT in the agent's `AgentTool` list → executor returns 403 (allowlist check in hydrator).
- [ ] **Task 11.4:** Optional MCP gateway — add `services/mcp-gateway/` **only** if multiple external MCPs require central federation (§13.5.1 rule 5).

**Exit criteria:** No tool call succeeds outside CAP-authorized allowlist; all tool calls logged in HANA; no raw user JWT reaches MCP server.

---

## Definition of done

### MVP target (Phases 0–9)

- [ ] Phase **0** — current fat-payload app verified working (legacy ADK/loops still in repo).
- [ ] Phase **1** — real XSUAA identity; Python private.
- [ ] Phase **2** — deployed to CF; pilot users on `https://…`.
- [ ] Phase **3** — Skills + `ChatSession` summary/watermark in HANA (**no** long-lived Loop/ADK/DeepAgent `engine` enum in schema — prefer DeepAgent-only in code).
- [ ] Phase **4** — CAP sends thin JSON + **forwarded `Authorization: Bearer`** (no feature flag); CAP stops duplicate chat writes once Phase 5 lands.
- [ ] Phase **5** — Python hydrates by id; **Python writes chat rows**; session ownership enforced.
- [ ] Phase **6** — DeepAgent-only; **ADK + hand-rolled loops removed** from repo.
- [ ] Phase **6b** — Langfuse tracing + eval for dev/staging (self-host or cloud per policy).
- [ ] Phase **7** — Admin can manage Skills via Fiori UI.
- [ ] Phase **8** — Planning panel in chat UI.
- [ ] Phase **9** — Summarization prevents context overflow.

### Full target (adds Phases 10–11)

- [ ] Phase **10** — MCP pool as separate service (when load requires).
- [ ] Phase **11** — Governance hardening verified per release.

---

## Revision log

| Date | Change |
|------|--------|
| 2026-04-18 | Initial plan — maps Plans 01–05; architecture §1.1 / §13. |
| 2026-04-18 | DeepAgent promoted from optional (Phase 9) to **required core (Phase 6)**; fleshed out with 6 tasks and detailed subtasks. Planning panel added as Phase 8. Definition of done split into MVP vs full target. |
| 2026-04-19 | **Architecture alignment:** DeepAgent-only; **deprecate/remove Google ADK** and legacy loops (**§13.4**). Phase 6b **Langfuse** for trace/eval vs ADK Web. Phase 7 drops engine selector. |
| 2026-04-19 | Phase 6b **Langfuse** (MIT, self-host) replaces LangSmith; **§13.4.1** + ADR-13 updated. |
| 2026-04-18 | **Task 0.3:** Clarified Skills = Phase 7 (not Phase 0); added **0.3.7–0.3.8** (AgentGroups + Tools/Agents list) to align with Plan **01** Task 4.5. |
| 2026-04-21 | **§13.2 / §13.3 / Phases 4–5:** Thin JSON + **`X-Internal-Token`** = CAP-only; **no `ACP_THIN_PYTHON_PAYLOAD`**; **Python owns chat persistence**, CAP proxies SSE. *(Superseded 2026-04-22: Bearer in header, not body.)* |
| 2026-04-22 | **§13.2 / Phase 4:** User access token via **`Authorization: Bearer`** only — **removed `userToken` from JSON**; aligns with RFC 6750. |
| 2026-04-22 | **Phase 6:** Removed foundation **`SubAgent` / `tool-researcher`** tasks; **Skills** are the enterprise procedure layer; optional **`SubAgent`** only if Skill-driven later (§13.4). |
| 2026-04-23 | **§13.1 / Phase 6–7:** **Skills** = enterprise procedure standard; **`SubAgent`** deferred — optional **Task 7.4** Skill-driven only; architecture + Langfuse wording aligned. |
| 2026-04-24 | **§2 + §13.5.2 + 06:** Admin **McpServer → Tool → AgentTool** mapping and **tool-level RBAC** (JWT + agent + Python allowlist) documented; Phase 6 intro table aligned. |
| 2026-04-19 | **Repo audit (06):** Checkboxes set to `[X]` only where committed code/config proves the deliverable (see subtask lines); manual/BTP-only items remain `[ ]`. |
| 2026-04-19 | **Parallel orchestration:** Three read-only audits (Phase 0–2, 3–5, 6–9) saved as `.cursor/worker-reports/06-audit-phase0-2.md`, `06-audit-phase3-5.md`, `06-audit-phase6-9.md`. README: “Chat UI → CAP contract” subsection documents **8.1.1** / **8.1.2** body + `done` session id. |
| 2026-04-19 | **Phase 3 (code):** `Skill`, `AgentSkill`, `ChatSession.summary` / `summaryWatermark` in `db/schema.cds`; `Skills` / `AgentSkills` in `srv/governance-service.cds`; `acp-Skill.csv` + `acp-AgentSkill.csv`. **`cds build --production`** verified locally. **3.3** (deploy + OData + chat smoke) still on developer. **Phase 4.1.1:** README subsection “CAP → Python (target thin JSON contract)” + `srv/server.js` pointer comment. |
