# Architecture: Agentic Python Microservices, MCP Stack & Temporal Target

**Status:** Specification (targets future implementation — code aligns when you instruct).  
**Audience:** Backend and platform engineers designing the split from today’s **`python/`** monolith toward **production-grade** agent orchestration.

**Relationships**

- **`fiori-agent-platform.md`** remains the canonical **SAP BTP + CAP + Fiori + single Python executor today** narrative (folders, OData, §13 deltas).
- **This document** is the dedicated **north star** for: **`apps/`** layout, **`mcp-gateway`**, **`mcp-client`**, **`mcp-server/{domain}`**, **Temporal**, **distributed observability (Langfuse)**, governance DB boundaries, and end-to-end control-plane flows discussed for the microservice refactor.

---

## 1. Objectives & Non-goals

**Objectives**

- Deploy **Orchestrator**, **MCP Client**, **MCP Gateway**, and **MCP Servers** as **separately runnable** Python services behind **CAP / App Router** (user-plane gateway).
- Use **Temporal** for **durable** execution (retries, pause/resume, human approval, checkpoints, failure recovery).
- Keep **business data writes** confined to tools behind **MCP servers** — not arbitrary writes from the orchestrator.
- Maintain **auditability**, **tracing**, and **eval** parity via **Langfuse** (OSS/self-hosted), correlated with Temporal workflow identifiers and MCP gateway audit events.

**Non-goals (this document)**

- Concrete Cloud Foundry manifests, MTA splits, or CI jobs (reference only).
- Replacing CAP as the primary **JWT / RBAC / tenant** gateway for browsers.

---

## 2. Target repository layout (`python/apps/`)

All names match the alignment agreed for the Python side:

```
fiori-agent-platform/
├── python/
│   ├── apps/
│   │   ├── server/                # Layer 3 — API Gateway for Python apps (FastAPI)
│   │   │   ├── app/               # FastAPI: chat hop from CAP, starts Temporal workflows
│   │   │   └── requirements.txt
│   │   │
│   │   ├── orchestrator/          # Layer 4 — Temporal Engine (Worker)
│   │   │   ├── workflows/         # Temporal workflow definitions (reasoning loops)
│   │   │   ├── activities/        # Temporal activities (tool calling)
│   │   │   ├── worker.py          # Temporal worker process
│   │   │   └── requirements.txt
│   │   │
│   │   ├── mcp_client/           # Layer 5 — MCP protocol toward gateway; connection/session strategy
│   │   │   ├── app/
│   │   │   └── requirements.txt
│   │   │
│   │   ├── mcp_gateway/          # Layer 6 — policy, secrets, timeouts, audit, sandbox around tool calls
│   │   │   ├── app/
│   │   │   ├── registry/         # Warm cache: aggregated tool routing index (mirror of HANA)
│   │   │   └── requirements.txt
│   │   │
│   │   └── mcp_server/           # Layer 7 — isolated tool backends (ERP, finance, procurement, …)
│   │       ├── procurement/
│   │       └── finance/
│   │
│   ├── utils/                     # Common Python utilities (db_utils, auth_utils, schemas)
│   └── venv/                      # Shared virtual environment
│
├── srv/                           # Layer 2 — CAP: user auth, OData governance, SSE to orchestrator (today)
├── app/                           # Layer 1 — Fiori admin + chat UI
├── approuter/
├── db/                            # Layer 9 — platform + governed demo business schema
├── docker/                        # Infrastructure (Temporal, Postgres, Langfuse)
└── doc/Architecture/
    ├── fiori-agent-platform.md   # Canonical BTP + current code map
    └── agentic-microservices-python.md   # THIS FILE
```

---

## 3. Nine-layer operational model (golden rule alignment)

| # | Plane | Responsibility | Mapped component |
|---|--------|----------------|-------------------|
| 1 | **Frontend** | User chat / admin only — **never** invokes tools directly | `app/admin`, `app/chat` |
| 2 | **API gateway** | Auth (**XSUAA**), RBAC (`@requires`), tenant/dept isolation, validation, SSE hop, rate limits (where implemented) | **App Router + `srv/` (CAP)** — *not duplicated in Python apps* |
| 3 | **Python API Gateway** | Entry point for Python apps, SSE streaming, starts/monitors workflows | `python/apps/server` |
| 4 | **Temporal Engine** | Durable retries, checkpoints, reasoning loops, activities | `python/apps/orchestrator` |
| 5 | **MCP Client** | Tool schema discovery (**list**), **`tools/call`**, MCP session hygiene | `python/apps/mcp-client` |
| 6 | **MCP Gateway** | Credential injection for external systems, policy, audit | `python/apps/mcp-gateway` |
| 7 | **MCP Servers** | Real adapters to systems of record (+ demo HANA tools) | `python/apps/mcp-server/{domain}` |
| 8 | **External systems** | ERP, Zoho, CRM, files, SaaS APIs | Outside repo |
| 9 | **Database** | **Platform** governance + chat + workflows vs **business** entities | **`db/schema.cds` (acp)** |

**Golden rule**

- **Server receives.** **Orchestrator runs.** **Temporal coordinates.** **MCP Client asks.** **MCP Gateway protects.** **MCP Server executes.** **DB remembers.**

---

## 4. Responsibilities separation (prevent role creep)

### 4.1 CAP (`srv/` + App Router)

- Validates **JWT** and applies **fine-grained** `@restrict` patterns for OData and custom routes.
- Builds **thin** payload (`agentId`, `userId/sessionId`, `message`, ids for tools/skills) + forwards **`Authorization: Bearer`** plus **`ACP_INTERNAL_TOKEN`-style trust** (`X-Internal-Token`, `X-AC-*`).
- Must **not** embed tool reasoning or call MCP URLs directly for governed chat paths (delegates to Python API Gateway).

### 4.2 Python API Gateway (`python/apps/server`)

- Entry point for all Python-bound traffic from CAP.
- Owns **synchronous SSE chat** streaming (short path).
- Starts and monitors **Temporal workflows** (long path).
- Forwards **User JWT** and correlation IDs to downstream services.

### 4.3 Orchestrator Engine (`python/apps/orchestrator`)

- Owns **LLM-loop** semantics and reasoning (Temporal Worker).
- Executes **Temporal Workflows** and **Activities**.
- Reads **agents / skills / tool allowlists** from HANA via existing hydration patterns.
- Writes **chat rows** and **workflow checkpoints** on platform schema.

### 4.4 MCP Client (`python/apps/mcp-client`)

- Holds MCP-specific concerns: JSON payloads to **`mcp-gateway`**, pooling, MCP transport quirks (SSE/HTTP today), backoff.
- Optionally batches **discovery** (`tools/list`) for registered servers behind gateway — **discovery policy** stays governed (admin sync in HANA still authoritative for product catalog).

### 4.5 MCP Gateway (`python/apps/mcp-gateway`)

- Sole **internet-facing egress** choke point for MCP servers that need SaaS secrets.
- Applies **timeouts**, **per-tenant quotas**, optional **sandbox** (sanitize args, strip PII in logs according to policy).
- Emits **structured audit**: who (user id), what (tool), when, correlation id (**Langfuse trace** + Temporal **workflow run id** propagating through headers).
- **The Solution (The Mirror)**: The Gateway keeps a small, super-fast "copy" (a mirror or cache) of just the **Tool Name → MCP URL** mapping in its own memory.
    - **How it stays in sync**: When the Admin clicks "Sync Tools" in Fiori, HANA is updated first. Then, **CAP (Layer 2)** acts as the messenger and sends a "Refresh" signal (`POST /refresh`) to the Gateway to update its mirror.
    - **Result**: The Gateway can route tool calls instantly without touching the database.
- **Identity Propagation & Policy Enforcement**:
    - **JWT Validation**: The Gateway validates the incoming **User JWT** (forwarded from Orchestrator) using SAP XSUAA libraries.
    - **Independent Policy Check**: It verifies that the `userId` (from JWT) is authorized to use the requested `toolId` via the specific `agentId` by checking the **HANA Policy Tables**.
    - **Principal Propagation**: Where downstream systems support it, the Gateway forwards the user's identity. For legacy systems, it only unlocks/injects technical credentials *after* the identity-based policy check passes.

### 4.6 MCP Servers (`python/apps/mcp-server/*`)

- Domain-scoped deployments; horizontally scalable.
- **Only** components that execute **privileged** integrations (DBs, ERP APIs) aligned with RBAC modeled in governance.

---

## 5. End-to-end flows (conceptual)

### 5.1 Synchronous chat (short path)

Minimal flow before full Temporal refactor:

```
Browser → App Router → CAP (/api/chat) → Python Server /chat SSE
→ Orchestrator Engine (LLM Loop)
→ MCP Client → MCP Gateway → MCP Server → External / HANA
→ stream tokens + tool SSE back via CAP proxy
```

### 5.2 Durable workflow (skills & saga)

Recommended flow for approvals and multi-step business processes:

```
CAP → Python Server (start workflow)
Temporal Cluster (Queue)
  └── Orchestrator Engine (Worker)
      ├── Activity: discover tools snapshot
      ├── Activity: MCP call step 1
      ├── Wait: human approval signal
      ├── Activity: MCP call step 2
      └── Complete / compensate
```

**Best practice clarification:** Calling **skill = Temporal workflow** works when the workflow encodes procedural reliability; conversational **Reactive** loops may remain in the orchestrator while **transactions** spanning systems use Temporal sagas.

### 5.3 Admin governance (today + target)

Admin **does not move** MCP registration out of OData: **SOURCE OF TRUTH** remains **HANA** rows for `McpServer`, `Tool`, `Skill`, mappings. MCP Gateway may **mirror** URLs and health for runtime efficiency but cannot become the authoritative catalog unless an explicit replication contract is implemented.

---

## 6. Tool & skill discovery (how the agent knows)

**Today (implemented)**

- CAP sends **`toolIds` / `skillIds`** → orchestrator hydrates metadata from HANA.
- **`load_skill`** StructuredTool progressively loads **Skill** body from DB (**DeepAgent procedure pack**).

**Production extensions (recommended)**

| Pattern | Problem solved | Typical placement |
|---------|----------------|-------------------|
| **Allowlisted injection** | Only tools mapped to agent in DB | Hydration in orchestrator (current) |
| **Tool retrieval / Tool RAG** | Large catalogs; avoid accuracy drop from 50+ defs in-context | Lightweight **retrieve_tools** capability (DB or embeddings) gated by RBAC |
| **Gateway-side registry** | Single route for many MCP mounts | MCP Gateway aggregates static + dynamic catalogs with cache invalidation on admin sync |

**Answer to “skill search tool”:** usually **yes** via either **`load_skill`** (explicit id) plus optional **`find_skills`** (semantic retrieval over governance metadata). Keep retrieval **within allowlisted sets** derived from JWT + group + agent mappings.

**The Tool Discovery Flow:**
- **Agent:** "I need to find a tool that can match an invoice."
- **Orchestrator:** Calls `search_tools(query="match invoice")`.
- **MCP Client:** Searches the Gateway/Registry.
- **Result:** Returns **only** the schema for `match_invoice_to_po`.

*Note: The MCP Client knows about all tools (because it's the bridge), but it only shows the Orchestrator (and the Agent) exactly what they need for the current task.*

---

## 7. Langfuse & distributed observability (aligned design)

Langfuse remains the **chosen LLM + agent trace backbone** (**ADR‑13**, see `fiori-agent-platform.md` §13.4.1).

### 7.1 What exists today (`python/`)

- **Langfuse `CallbackHandler`** attached to **`graph.astream_events(..., callbacks=[langfuse])`** (`deepagent_engine.py`).
- **Environment:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` (also documented in README / `.env.example`).

### 7.2 Target placement after split

| Service | Observability responsibilities |
|---------|-------------------------------|
| **Orchestrator** | **Primary root trace** spanning LLM graph: tokens, planning, **`load_skill`**, “virtual” parenting of tool attempts. Optionally **explicit tags**: `tenant`, `sessionId`, `agentId`. |
| **Temporal** | Temporal Web UI shows workflow durability (**not** Langfuse-equivalent spans). Correlate via **shared `workflowId` / `runId`** surfaced as Langfuse trace **metadata**. |
| **MCP Client** | Child spans/events for MCP round-trip **latency** (`list`, `call`); classify errors for agent self-correction. Use Langfuse OTEL ingestion or **`@observe`-style decorators** compatible with tracing SDKs if LangChain callbacks are absent at this tier. |
| **MCP Gateway** | Persist **immutable audit logs** (`audit_logs`-style rows) suited for compliance joins; push **matching trace id** alongside each entry. Optionally emit **duplicate metrics** into Prometheus/OpenTelemetry where required. |
| **Langfuse (Docker)** | Self-hosted observability server for all microservices. |
| **Postgres (Docker)** | Internal persistence for Temporal and Langfuse. |

### 7.3 Correlation model (recommended)

Propagate **`langfuse.trace_id`** (if API-level) **or generate** a stable **`acpCorrelationId`** at orchestrator ingress (first CAP receipt). Forward as headers:

```
X-Acp-Correlation-Id: <uuid>
X-Langfuse-Trace-Id: <if available after root span creation>
```

This ties **SSE chat**, **Temporal history**, **MCP Gateway audit**, and **Langfuse** drill-down across one investigation story.

### 7.4 Red lines

- Secrets **never** enter Langfuse payload bodies (sanitize tool args defaults at gateway tier).
- **Business truth** audits remain in DB tables — Langfuse complements but does **not replace** SOC2/regulatory evidence pipelines.

---

## 8. Security & identity propagation

Per hop expectation (preserve today’s invariant — see `fiori-agent-platform.md` §11):

- **CAP → Orchestrator**: internal token + **`X-AC-*`** user derivation + **`Authorization: Bearer`** (User JWT).
- **Orchestrator → MCP Gateway / Client**: Forwarded **`Authorization: Bearer`** (User JWT) + mutual trust (cluster network + service identity).
- **MCP Gateway → MCP Server**: 
    - **Identity-First**: Gateway validates the User JWT via XSUAA libraries and performs an independent RBAC check (User + Agent + Tool) against HANA.
    - **Delegation**: Forwards the User Principal to downstream systems that support it, or injects scoped technical credentials only after successful identity validation.

---

## 9. Saga pattern & failure modes

Temporal implements **explicit compensating activities**. Example saga:

| Step | Local success | Compensation |
|------|---------------|-------------|
| Reserve budget | Holds funds | Release hold |
| Create invoice draft | Stored | Void draft |

Workflow encodes branching (human escalation, partial completion). MCP servers remain purely **workers** executing activities.

---

## 10. Evolution phases (risk-managed roadmap)

**Phase P0 — Document & contracts** *(this artifact)*  

**Phase P1 — Extract MCP domains**  

- Lift `apps/mcp-server/procurement` + `finance` from `python/app/tools/` + routers (current single HTTP MCP surface splits).

**Phase P2 — Introduce MCP Gateway**  

- Redirect existing client calls (`mcp_client.py`) toward gateway façade; unify audit.

**Phase P3 — Split MCP Client**  

- Isolate protocol/session handling; orchestrator interacts via narrow HTTP/SDK.

**Phase P4 — Temporal**  

- Move long-running approvals + multi-shot jobs to Temporal; wire signals from admin portal.

**Phase P5 — Langfuse across services**  

- Standardize propagation headers & trace metadata completeness.

*(Phases deliberately parallel-safe with continued single-MTA operation until infra tasks complete.)*

---

## 11. Open decisions / future ADRs (stubs)

- **ADR‑T1**: Single Temporal namespace vs per-tenant namespaces.
- **ADR‑T2**: Orchestrator Temporal worker affinity (same dyno/pod vs dedicated worker tier autoscale).
- **ADR‑OBS‑LF1**: MCP Client span strategy — Langfuse native vs OpenTelemetry bridging.
- **ADR‑GWY‑1**: When gateway cache may diverge from HANA MCP registry (TTL, invalidation on `syncTools`).

---

## 12. References (external orientation)

| Topic | Orientation |
|-------|--------------|
| **MCP enterprise patterns** | Gateway / proxy federation (multi-server aggregation, auth choke point) |
| **Tool RAG & scaling tool lists** | Retrieve-then-invoke pipelines for large catalogs |
| **Temporal + agents** | Durable approvals, saga compensation, retries |
| **Langfuse + DeepAgents** | LangChain callbacks for graph-level tracing |

---

### Document control

When implementation begins:

1. Tick tasks in **`doc/Action-Plan`** that reference **`doc/Architecture/agentic-microservices-python.md`** phases.
2. Update **`doc/.manifest.json`** hashes when semantics materially drift.
3. Keep **`fiori-agent-platform.md`** high-level routing section pointing here for microservice deltas.
