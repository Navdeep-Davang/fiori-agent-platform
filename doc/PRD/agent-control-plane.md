# Product requirements: Agent Control Plane (SAP BTP)

> **Living document** — we iterate here. **Audience:** anyone new to the project (including new grads). **Goal:** after reading this once, you know **what** we are building, **why** each part exists, and **how** it fits end to end.
> Last updated: 2026-03-26. Sections 4.2–4.7 expanded with UI fields, actions, and execution path.

---

## Read this first (2 minutes)

**What problem are we solving?**
Companies want AI assistants that can **call tools** (search docs, query data, run allowed actions). If there is no central place to **register those tools**, **control who can use them**, and **record what happened**, IT cannot trust the system. A plain chat app does not solve that.

**What is the product?**
A **control plane** on **SAP BTP**: teams **define agents**, **register MCP servers and tools**, **set who may do what**, and **chat** with those agents. Data and audit live in **SAP HANA Cloud**. Users sign in with **SAP identity (XSUAA)**. The app runs on **Cloud Foundry**.

**Why SAP tech here?**
So the solution looks like a **real SAP extension**: Fiori UI, CAP services, HANA data — the same building blocks customers use next to S/4HANA and other SAP systems. The AI piece (Python) still fits in, but **governance** stays in SAP's world.

---

## 1. What is this product? (one clear sentence)

**Agent Control Plane on SAP BTP** is a secure web product where the organisation **manages AI agents and tools in one place**, **enforces access rules**, and gives end users a **chat** to talk to those agents — with **history and audit** stored in the database.

---

## 2. Why does this product exist?

| Why | Explanation |
|-----|-------------|
| **For the business** | IT needs **governance**: which tools exist, who can run them, and proof of what ran. Chat alone is not enough. |
| **For the user** | One place to **configure** agents and **use** them without asking developers for every change. |
| **For us (builders)** | We show we can ship **Fiori + CAP + HANA + security**, and also **modern AI** (agents, MCP, streaming) — not only tutorials. |

**What we do not claim:** We are not replacing SAP S/4HANA or full finance automation. We are building a **credible BTP extension** that could sit beside ERP later.

---

## 3. Who is it for? (personas)

| Who | What they want |
|-----|----------------|
| **Platform admin** | Register MCP servers, turn tools on or off, set rules for the whole org. |
| **Agent author** | Create and edit agents: prompts, which tools they may use, within policy. |
| **Business user** | Pick an agent and chat; only see what they are allowed to use. |
| **Auditor / support** | Read-only: who chatted, which tools ran. |

In practice there are **two experiences**: **Admin / builder** (lists and forms) and **Chat** (conversation).

---

## 4. What the product does (features)

### 4.1 Sign-in, roles, and agent access groups

#### The problem with per-user assignment

Every company has different department names (Procurement, Sourcing, Purchasing — all the same idea). Role names differ too. If we assign tools and agents to each user one by one, the admin repeats the same work hundreds of times and it breaks whenever someone changes teams.

**Solution:** We use **agent groups** as the middle layer. A group is a named bundle of **allowed agents**. Admins map groups to JWT claims (department, role) — not to individual users.

#### How it works (three layers)

```
Company IdP / BTP role collection
        │
        ▼
  User's XSUAA JWT  ──►  carries department / role claim
        │
        ▼
  Agent Group lookup  ──►  "Procurement Group" → [Invoice Analyst, Doc Search]
        │
        ▼
  Agent's own policy  ──►  "Invoice Analyst" can call [S/4 read, PDF parse]
        │
        ▼
  Intersection runs  ──►  only tools that BOTH the group AND the agent allow
```

The user does not pick tools manually. They are in a team → team maps to a group → group defines which agents they get.

#### User-delegated vs agent-own identity

| Mode | How it works | When to use |
|------|-------------|-------------|
| **Delegated (user's JWT)** | Agent carries the user's token; can only do what the user can do directly. | Safe default for most tools. |
| **Agent machine identity** | Agent has its own short-lived service token for a specific tool. User does not need direct access. | When the tool needs a privileged technical credential (e.g. read from an S/4 OData sandbox via a service user). Only allowed if the tool has `elevated: true` AND the agent is explicitly approved. |

**Rule:** Neither the user alone nor the agent alone can override both controls. The user must be in the right group; the tool must be marked elevated; the agent must be approved for it.

#### Platform roles in XSUAA

| XSUAA role | Can do |
|------------|--------|
| `Agent.User` | Open chat, use assigned agent groups. |
| `Agent.Author` | Create and edit agents (within policy). |
| `Agent.Admin` | Manage MCP servers, tools, groups, policies. |
| `Agent.Audit` | Read-only access to all logs and tool-call records. |

Department / team membership comes from **JWT claims**. We map those claims to **agent groups** in HANA — so the admin only needs to say "claim `dept=procurement` → Procurement Group" once. Role names and department names differ by company; the mapping is data, not code.

---

### 4.2 Register MCP servers

**UI pattern:** Fiori Elements — List Report + Object Page.
**Who uses it:** `Agent.Admin` only.

#### List page columns

| Column | Notes |
|--------|-------|
| Name | Display name of the server |
| Destination / URL | BTP Destination name or base URL |
| Transport | `HTTP` or `stdio` |
| Environment | `dev` or `prod` |
| Health | Status chip: green = reachable, red = failing, grey = unchecked |
| Status | `Active` / `Disabled` toggle chip |
| Owner team | Who is responsible |
| Last health check | Timestamp, auto-updated on test |

Toolbar: **Register new**, **Test selected**, **Disable selected**.

#### Object page fields

- **Display name** — what shows throughout the UI.
- **Description** — purpose of this server in plain words.
- **Connection** — choose: `BTP Destination name` (preferred; no secret stored in app DB) or `Base URL` (dev only).
- **Auth type** — `None` / `BTP Destination` / `Credential Store ref`.
- **Transport type** — `HTTP (streamable)` or `stdio` (local dev only).
- **Environment tag** — `dev` or `prod`; prod records are write-protected for non-admins.
- **Owner team** — free text; contact if it breaks.
- **Status** — `Active` / `Disabled`. Disabled immediately blocks all agents from reaching this server.

#### Actions on object page

| Action | What it does |
|--------|-------------|
| **Test connection** | CAP action pings the server, updates health chip and last-checked timestamp. |
| **Sync tools** | CAP action calls the server's tool-list endpoint; creates `Draft` tool records for each tool found. Admin reviews them in 4.3. |
| **Disable / Enable** | Flips status; propagates instantly to all agents using this server. |

**Why:** The organisation must know which tool servers are official and be able to cut any of them off in seconds.

---

### 4.3 Register and approve tools

**UI pattern:** Fiori Elements — List Report + Object Page + freestyle "Test tool" panel (inline fragment).
**Who uses it:** `Agent.Admin` manages; `Agent.Author` can view.

#### List page columns

| Column | Notes |
|--------|-------|
| Tool name | Must match the name the MCP server exposes exactly |
| MCP server | Which server exposes this tool |
| Risk level | `Low` / `Medium` / `High` badge — admin sets this manually |
| Elevated | `Yes` / `No` — can an agent call this with machine identity? |
| Status | `Draft` / `Active` / `Disabled` badge |
| Last modified | Timestamp |

Filter bar: filter by MCP server, risk level, status (list can grow large).
Toolbar: **Register manually**, **Activate selected**, **Disable selected**.

#### Object page fields

- **Tool name** — must match the MCP server's exposed tool name exactly (used in LLM calls).
- **Description** — what the tool does; this text is sent to the LLM as-is, so clarity matters.
- **MCP server** — dropdown of registered active servers.
- **Input schema** — JSON Schema viewer/editor (the arguments the tool expects). Auto-filled on sync; editable.
- **Output schema** — optional; documents what the tool returns.
- **Risk level** — `Low` (read-only, safe) / `Medium` (writes to non-critical systems) / `High` (financial, deletes, external sends). Admin sets manually.
- **Elevated flag** — if `Yes`, agents may call this tool using a machine identity token. Only `Agent.Admin` can set this.
- **Status** — `Draft` (not usable by any agent), `Active` (agents may call it), `Disabled` (blocked).

#### Freestyle panel: Test tool

Inline fragment visible on the object page (admin only). Enter argument values as a JSON form, click **Run** → CAP action → Python invokes the real tool → response shown in a read-only code block. Shows exactly what the LLM would receive. High demo value; proves the tool works before any agent uses it.

**Why:** Only reviewed tools reach agents. Risk level and elevated flag are the governance levers that make this more than a list of URLs.

---

### 4.4 Define agents

**UI pattern:** Fiori Elements — List Report + Object Page with four sub-sections.
**Who uses it:** `Agent.Author` (create/edit), `Agent.Admin` (full control).

#### List page columns

| Column | Notes |
|--------|-------|
| Name | Agent display name |
| Description | Short purpose (truncated) |
| Model profile | `Fast` / `Quality` badge |
| Status | `Draft` / `Active` / `Archived` badge |
| Tool count | Number of tools assigned |
| Created by | Author name |

Toolbar: **Create**, **Archive selected**.

#### Object page — four sections

**Section 1: Basic info**
- Name, Description, Status (`Draft` / `Active` / `Archived`).
- Model profile — `Fast` (cheaper, lower latency) or `Quality` (better reasoning, higher cost). Passed to Python as a config hint; does not hardcode a model name.
- Identity mode — `Delegated` (user JWT for all tools) or `Mixed` (elevated tools may use machine identity if the tool's elevated flag is set and this agent is approved).

**Section 2: System prompt**
- Large text area. The instruction the LLM receives at the start of every conversation.
- Guideline: role description, scope constraint ("answer only questions about invoices and POs"), tone.
- Plain text; markdown rendering in the chat UI is optional.

**Section 3: Tool assignments (sub-table)**
- Table of tools this agent may use.
- Columns: Tool name, MCP server, Risk level, Elevated flag, Permission override (inherit / force delegated / force elevated).
- Actions: **Add tool** (search from active tools list only), **Remove**.

**Section 4: Group membership (read-only)**
- Shows which agent groups include this agent.
- Groups are edited in 4.5; this section is display-only.

#### Action on object page

**Preview agent** — opens a small freestyle chat modal using this agent's config and active tools. Authors verify behavior before activating. Uses the same Python SSE path as the real chat.

**Why:** Agent config lives in data, not code. Authors change prompts and tool lists without a deploy. `Draft` status prevents accidental exposure to end users.

---

### 4.5 Agent groups (admin UI)

> Concept introduced in 4.1. This section is the UI spec for creating and managing groups.

**UI pattern:** Fiori Elements — List Report + Object Page.
**Who uses it:** `Agent.Admin` only.

#### What a group is (one line)

A **named bundle of agents** mapped to one or more JWT claim values. Users get the bundle automatically — no per-user setup.

#### List page columns

| Column | Notes |
|--------|-------|
| Group name | e.g. "Procurement Group" |
| Claim key | JWT attribute to check, e.g. `dept` |
| Claim values | Comma-separated values that match, e.g. `procurement, sourcing` |
| Agent count | How many agents are in this group |
| Status | `Active` / `Disabled` |

#### Object page — two sections

**Section 1: Claim mapping**
- Group name, description.
- Claim key — the JWT attribute name to read (e.g. `department`, `role`, `costCenter`).
- Claim values — list of values that resolve to this group. One row per value. Example: `procurement` and `sourcing` both belong here.

**Section 2: Agent assignments (sub-table)**
- Table of agents in this group.
- Columns: Agent name, Status, Model profile.
- Actions: **Add agent** (from active agents only), **Remove**.
- Note: tools are governed by each agent's own policy (section 4.4). Groups grant access to agents, not to individual tools.

**Why:** Claim keys and values differ by company. Keeping mappings as editable rows means a new customer only needs to say "our dept claim is `costcenter` with value `SCM`" — zero code change.

---

### 4.6 Chat (main user experience)

**UI pattern:** Freestyle SAPUI5 — custom layout (not Fiori Elements).
**Who uses it:** `Agent.User` and above — business users, authors, admins.

#### Layout

```
┌─────────────────┬──────────────────────────────────────┐
│  Session list   │   Agent selector (top bar)           │
│                 ├──────────────────────────────────────┤
│  [New session]  │                                      │
│  Session A  ●   │     Message thread                   │
│  Session B      │     (user bubbles right,             │
│  Session C      │      agent bubbles left)             │
│                 │                                      │
│                 ├──────────────────────────────────────┤
│                 │  [ Type a message ...   ]  [Send]    │
└─────────────────┴──────────────────────────────────────┘
```

**Left panel — session list**
- "New session" button at top.
- Each row: auto-title (first 40 chars of first message), date, active dot for current session.
- Click to load that session's full history.

**Top bar — agent selector**
- Dropdown showing only agents the user's group allows.
- Changing agent starts a new session (or warns if current session has messages).

**Message thread**
- User messages: right-aligned bubble.
- Agent messages: left-aligned bubble with **streaming text** (renders token by token, supports markdown).
- Below each agent message: **collapsible tool trace** — which tools ran, with what arguments, short result summary. Collapsed by default; one click to expand.
- Empty state: prompt telling the user to pick an agent and start.

**Input bar**
- Multi-line text field (grows with content), **Send** button, **Stop** button while streaming is live.

**What is stored in HANA**

| Record | Key fields |
|--------|-----------|
| `ChatSession` | session ID, agent ID, user ID, title, created/updated timestamps |
| `ChatMessage` | session ID, role (`user` / `assistant`), content, timestamp |
| `ToolCallRecord` | message ID, tool name, arguments JSON, result summary, duration ms, elevated flag used |

**Why freestyle:** Streaming tokens, expandable tool traces, and custom bubbles do not fit Elements list/object patterns. SAP's own AI assistant samples use freestyle SAPUI5 for the same reason.

---

### 4.7 What happens when someone sends a message? (execution path)

Simple numbered steps:

1. User selects an **agent** and sends a **message**.
2. CAP checks: is this user in a **group** that includes this agent? If not → 403.
3. CAP loads: agent config (prompt, tool list, identity mode) + **effective tool list** = intersection of group's agents and agent's tool policy.
4. CAP's `server.js` opens an **SSE stream** back to the browser and calls the **Python service** with: message, agent config, effective tool list, user info.
5. Python calls the **LLM** with the system prompt + conversation history.
6. LLM decides to call a tool → Python checks the tool is in the effective list → calls the **MCP server** (user JWT for delegated tools; machine token for elevated tools).
7. Tool result returns to the LLM → next response chunk is streamed to the browser.
8. When done: CAP writes the **message record** and **tool-call records** to HANA.

**Key rule enforced at step 6:** Python only calls tools that CAP sent in step 4. Python does not decide its own tool list. This is the trust boundary between the policy engine and the executor.

**Why this split:** CAP is the **policy engine and record keeper**. Python is the **AI executor**. Neither can act without the other's data.

---

## 5. How the architecture fits together (one story, not three apps)

| Layer | What it does | Why it exists |
|-------|----------------|---------------|
| **Fiori (SAPUI5)** | **Elements** for admin screens (4.2–4.5). **Freestyle** for chat (4.6). | Standard SAP UI for data; custom UI where streaming needs it. |
| **App Router** | Login, routes browser traffic, passes JWT to APIs. | Single security front door. |
| **CAP (Node.js)** | OData V4 for all governed data (agents, tools, servers, groups, sessions, messages). Actions for "test connection" and "sync tools". | CAP + HANA is how Elements binds to data and how we keep one governed API. |
| **CAP `server.js`** | REST/SSE endpoint `/api/chat` for token streaming. Validates JWT, loads effective tool list, forwards to Python. | OData actions are a single HTTP response; streaming tokens needs a long-lived HTTP connection. Same Node process — no second app. |
| **Python service** | LLM calls, MCP client, streaming. Respects effective tool list from CAP. | Best runtime for AI libraries and MCP. Cannot override CAP policy. |
| **SAP HANA Cloud** | System of record: catalog, chat history, audit. | One DB on BTP. |
| **Optional later** | BTP Destination to S/4 API Hub sandbox for a read-only tool. | Proves ERP integration without owning S/4. |

**Short version:**
- CAP + HANA = "what is allowed" and "what is stored."
- Python = "how the AI runs and talks to MCP."
- CAP `server.js` SSE = "how the browser gets live tokens without fighting OData."

---

## 6. Seed data (demo-ready from day one)

After deploy the database should already have a realistic sample:

- 1–2 `McpServer` rows pointing at mock or sandbox URLs.
- 5–10 `Tool` rows with risk labels (a mix of Low and Medium).
- 2 `Agent` rows: "General assistant" (few tools) and "ERP helper" (read-only OData tools).
- 2 `AgentGroup` rows: "Default" (maps to all users) and "ERP team" (maps to a specific claim value).
- BTP role collections mapped to test users.

Anyone opening the demo sees value in minutes, not after manual setup.

---

## 7. Phasing (scope control)

| Phase | What we build |
|-------|----------------|
| **MVP** | HANA seed; Elements CRUD for MCP servers, tools, agents, groups; freestyle chat with SSE streaming; XSUAA roles; persist messages and tool-call records. |
| **Next** | Sync tools from MCP action; Test tool panel; tighten secrets with Destinations / Credential Store. |
| **Later** | Approval workflow (Draft → Pending → Active), multi-tenant, SAP AI Core swap-in, Work Zone tile. |

---

## 8. Terms (quick glossary)

| Term | Simple meaning |
|------|----------------|
| **BTP** | SAP's cloud platform — where we run the app, identity, and database. |
| **Cloud Foundry (CF)** | The runtime we deploy to (common on BTP). |
| **CAP** | Cloud Application Programming model — Node services with CDS models and OData APIs. |
| **OData** | Standard protocol for the UI to read/write rows in the database through the server. |
| **Fiori Elements** | Prebuilt SAP UI patterns (list + detail pages) driven by annotations — less custom XML. |
| **Freestyle SAPUI5** | We build the UI ourselves — needed for rich chat and streaming. |
| **XSUAA** | SAP's service for login and JWT tokens with scopes/roles. |
| **MCP** | Model Context Protocol — how the AI calls tools on a server in a structured way. |
| **MCP server** | A service that exposes tools the agent can call. |
| **SSE** | Server-Sent Events — one way to stream text from server to browser over HTTP. |
| **HANA Cloud** | SAP's managed database on BTP; our main data store. |
| **ADK** | Agent Development Kit style — Python patterns for building agentic LLM executors. |
| **Agent group** | A named bundle of agents mapped to JWT claim values. Users get the bundle automatically. |
| **Delegated identity** | Agent runs with the user's JWT — inherits the user's permissions. |
| **Machine identity** | Agent uses its own short-lived service token for an elevated tool. Only when both tool and agent are explicitly approved. |
| **ABAC** | Attribute-based access control — rules using attributes like department, amount, time. Extends RBAC. |

---

## 9. UI split (the one rule to remember)

| Area | UI style | Why |
|------|-----------|-----|
| MCP servers, tools, agents, groups | **Fiori Elements** | Structured fields and tables — Elements fits perfectly. |
| Chat | **Freestyle SAPUI5** | Streaming, bubbles, tool traces — needs custom layout. |

---

*End of PRD — for technical file layout and deployment steps, see `doc/Architecture/fiori-agent-platform.md`.*
