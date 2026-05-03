# Action Plan: Enterprise Agent Microservices & Temporal Refactor

This plan tracks the transformation of the monolithic Python executor into a distributed, durable, and identity-aware microservice architecture as specified in `doc/Architecture/agentic-microservices-python.md`.

**Architecture Reference:** [agentic-microservices-python.md](../Architecture/agentic-microservices-python.md) - Status: SYNCED

---

## Phase 1: Infrastructure & Shared Foundation
**Objective:** Establish the containerized environment for microservices and the Temporal orchestration engine.

- [X] **Task 1.1: Shared Utilities & Models (Utils)**
    - [X] Create `python/utils/` for common logic (MCP protocol helpers, SAP XSUAA validation wrappers).
    - [X] Move shared DB connection logic to `python/utils/db_utils.py`.
- [X] **Task 1.2: Infrastructure Cluster Setup**
    - [X] Create `docker/docker-compose.yml` with:
        - **Temporal** (Server, UI)
        - **Postgres** (Backend for Temporal & Langfuse)
        - **Langfuse** (Self-hosted for local observability)
    - [ ] *USER ACTION REQUIRED:* Verify Temporal UI at `http://localhost:8080` and Langfuse UI at `http://localhost:3000`.
- [X] **Task 1.3: Service Skeleton Generation**
    - [X] Initialize `python/apps/orchestrator`, `python/apps/mcp_client`, `python/apps/mcp_gateway`, and `python/apps/mcp_server/procurement` with base FastAPI skeletons and `requirements.txt`.

## Phase 2: MCP Domain Extraction (Layer 7)
**Objective:** Decompose the current tool pool into independent, domain-specific MCP servers.

- [X] **Task 2.1: Procurement MCP Server**
    - [X] Move `python/app/tools/procurement.py` to `python/apps/mcp_server/procurement/tools/`.
    - [X] Implement standalone FastAPI router for tool discovery (`/mcp/tools/list`) and execution (`/mcp/tools/call`).
- [X] **Task 2.2: Finance MCP Server (Invoices)**
    - [X] Move `python/app/tools/finance.py` to `python/apps/mcp_server/finance/tools/`.
    - [X] Implement standalone router for invoice-specific tools.
- [X] **Task 2.3: Governance Sync Verification**
    - [X] Update CAP `GovernanceService` to allow registering multiple MCP servers.
    - [X] Verify Fiori Admin UI "Sync Tools" works against new split servers.

## Phase 3: Identity-Aware MCP Gateway (Layer 6)
**Objective:** Implement the security choke point and "Warm Cache" routing.

- [X] **Task 3.1: In-Memory Warm Cache (The Mirror)**
    - [X] Implement `python/apps/mcp_gateway/registry` to hold the `Tool Name -> MCP URL` map.
    - [X] Implement `POST /refresh` endpoint for **CAP (Layer 2)** to signal HANA updates.
- [X] **Task 3.2: XSUAA Identity Validation**
    - [X] Implement JWT validation middleware using SAP XSUAA libraries.
    - [X] Implement Policy Enforcement: Verify `userId` + `agentId` + `toolId` against HANA rows.
- [X] **Task 3.3: Audit Logging**
    - [X] Implement structured audit emission to HANA `AuditLog` table on every tool call.

## Phase 4: MCP Client & Protocol Handler (Layer 5)
**Objective:** Standardize the "Runner" that manages JSON-RPC sessions.

- [X] **Task 4.1: MCP Client Implementation**
    - [X] Create the standalone `python/apps/mcp_client` service.
    - [X] Implement the `call_tool` logic that routes via the `mcp_gateway`.
- [X] **Task 4.2: Tool RAG / Semantic Search (Optional)**
    - [X] Implement keyword-based search over the tool catalog to allow agents to "find" tools by capability.

## Phase 5: Temporal Engine (Layer 4) & API Server (Layer 3)
**Objective:** Implement durable execution and separate the API entry point from the worker engine.

- [X] **Task 5.1: API Server (The Door)**
    - [X] Create `python/apps/server` as the entry point for CAP.
    - [X] Implement `/chat` SSE streaming and `/workflow/start` Temporal starter.
- [X] **Task 5.2: Orchestrator Engine (The Brain)**
    - [X] Move `deepagent_engine.py` logic to `python/apps/orchestrator`.
    - [X] Implement Temporal Worker in `python/apps/orchestrator/worker.py`.
- [X] **Task 5.3: Skill Workflows & Activities**
    - [X] Implement `AgentWorkflow` and tool-calling activities.

## Phase 6: Observability (Langfuse) & Final Integration
**Objective:** Connect the dots with distributed tracing and E2E verification.

- [X] **Task 6.1: Langfuse Correlation Propagation**
    - [X] Update all microservices to propagate `X-Acp-Correlation-Id` and Langfuse trace headers.
    - [ ] *USER ACTION REQUIRED:* Configure local Langfuse instance and project keys.
- [ ] **Task 6.2: E2E Scenario Verification**
    - [ ] Run "Invoice Mismatch" scenario (Scenario 3 from seed data) through the full 9-layer stack.
    - [ ] Verify trace completeness in Langfuse UI (Orchestrator -> Temporal -> Client -> Gateway).
- [ ] **Task 6.3: Migration Cleanup**
    - [ ] Safely migrate all remaining logic and remove the legacy `python/app/` monolithic code once verified.

---

## Exit Criteria
1.  **Distributed Trace:** A single user message generates a Langfuse trace spanning 4+ microservices in the local Docker UI.
2.  **Durable Resume:** A workflow paused for "Approval" in Temporal survives a server restart.
3.  **Identity Guard:** A tool call without a valid User JWT is rejected at the MCP Gateway.
4.  **HANA Zero-Race:** The Gateway registry updates instantly via CAP refresh signal.

