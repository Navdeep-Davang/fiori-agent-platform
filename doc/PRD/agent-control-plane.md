# Product requirements: Agent Control Plane (SAP BTP)

> **Living document** — we iterate here. **Audience:** anyone new to the project (including new grads). **Goal:** after reading this once, you know **what** we are building, **why** each part exists, and **how** it fits end to end.  
> Last updated: 2026-03-26.

---

## Read this first (2 minutes)

**What problem are we solving?**  
Companies want AI assistants that can **call tools** (search docs, query data, run allowed actions). If there is no central place to **register those tools**, **control who can use them**, and **record what happened**, IT cannot trust the system. A plain chat app does not solve that.

**What is the product?**  
A **control plane** on **SAP BTP**: teams **define agents**, **register MCP servers and tools**, **set who may do what**, and **chat** with those agents. Data and audit live in **SAP HANA Cloud**. Users sign in with **SAP identity (XSUAA)**. The app runs on **Cloud Foundry**.

**Why SAP tech here?**  
So the solution looks like a **real SAP extension**: Fiori UI, CAP services, HANA data — the same building blocks customers use next to S/4HANA and other SAP systems. The AI piece (Python) still fits in, but **governance** stays in SAP’s world.

---

## 1. What is this product? (one clear sentence)

**Agent Control Plane on SAP BTP** is a secure web product where the organization **manages AI agents and tools in one place**, **enforces access rules**, and gives end users a **chat** to talk to those agents — with **history and audit** stored in the database.

---

## 2. Why does this product exist?

| Why | Explanation |
|-----|-------------|
| **For the business (story we tell)** | IT needs **governance**: which tools exist, who can run them, and proof of what ran. Chat alone is not enough. |
| **For the user** | One place to **configure** agents and **use** them without asking developers for every change. |
| **For us (builders)** | We show we can ship **Fiori + CAP + HANA + security**, and also **modern AI** (agents, MCP, streaming) — not only tutorials. |

**What we do not claim:** We are not replacing SAP S/4HANA or full finance automation. We are building a **credible BTP extension** that could sit beside ERP later.

---

## 3. Who is it for? (personas — simple)

| Who | What they want |
|-----|----------------|
| **Platform admin** | Register MCP servers, turn tools on or off, set rules for the whole org. |
| **Agent author** | Create and edit agents: prompts, which tools they may use, within policy. |
| **Business user** | Pick an agent and chat; only see what they are allowed to use. |
| **Auditor / support** | Read-only: who chatted, which tools ran (trust and troubleshooting). |

**UI note:** We do not need four separate apps. In practice there are **two experiences**: **Admin / builder** (lists and forms) and **Chat** (conversation).

---

## 4. What the product does (features) — what and why

### 4.1 Sign-in and roles

**What:** Users log in through **SAP XSUAA**. The app checks **roles** (for example: chat user, author, admin, optional auditor).

**Why:** Without login and roles, anyone could use any tool. That is not acceptable in a real company.

---

### 4.2 Register MCP servers

**What:** An admin adds a row in the system for each **MCP server**: name, how to reach it, owner team, health/status. Secrets are **not** pasted into random fields — we use **BTP Destinations** or **Credential Store** when we need them.

**Why:** The company must know **which tool servers are official**. No “shadow” servers in production.

---

### 4.3 Register and approve tools

**What:** Each **tool** has a name, description, input shape (what arguments it needs), risk level, on/off flag, and link to an MCP server. Tools can be **entered by hand** or **filled in later** from an MCP “sync” action. A simple status (draft / active) can come in a later phase.

**Why:** Only **reviewed** tools should reach real agents. That is how you keep AI **controlled**, not chaotic.

---

### 4.4 Define agents

**What:** An **agent** is **configuration**, not the AI model file: name, description, system instructions, which tools it may use, default “quality vs speed” style if we model that.

**Why:** The business can **change behavior** without redeploying code — same idea as “digital workers” in enterprise talk.

---

### 4.5 Chat (main user experience)

**What:** A **freestyle SAPUI5** screen: pick agent, type messages, see **streaming** replies, see **which tools ran** when we show that in the UI. Sessions and messages are **saved** so users can come back.

**Why:** People already understand chat. **Streaming** feels responsive. Showing **tool use** builds **trust**.

**Why not Fiori Elements for chat?** Fiori Elements is great for **tables and forms** (list + object pages). Chat is not that pattern, so we use **custom SAPUI5** here — same approach SAP uses in many assistant-style samples.

---

### 4.6 What happens when someone sends a message? (execution — simple steps)

1. User picks an **agent** and sends a **message**.  
2. The backend loads that agent’s **settings** and the list of **tools** this user is **allowed** to use.  
3. A **Python** service (using **Agent Development Kit** style logic) talks to the **LLM** and **MCP** to run tools. It only runs tools that are **allowed** for that agent and that user.  
4. The UI receives a **stream** of text (and later, tool events). We **save** messages and tool-use records to **HANA** for audit and history.

**Why this split:** **SAP CAP** holds the **rules and data**. **Python** holds the **AI and MCP wiring**. That way we do not put secret keys and messy AI code inside the database layer alone.

---

## 5. How the architecture fits together (one story, not three apps)

Think of **one product** with clear layers:

| Layer | What it does | Why it exists |
|-------|----------------|---------------|
| **Fiori (SAPUI5)** | **Fiori Elements** for admin screens (MCP, tools, agents). **Freestyle** for chat. | Standard SAP UI for data; custom UI where streaming chat needs it. |
| **App Router** | Login, routes browser traffic, passes tokens to APIs. | Single front door for security. |
| **CAP (Node.js)** | **OData** services for all **main data** (agents, tools, servers, sessions, messages). **Actions** for short tasks that call Python (example: “test MCP connection”, “sync tools from server”). | CAP + **HANA** is how Fiori Elements binds to data and how we keep **one governed API**. |
| **CAP `server.js` (same Node process)** | **REST endpoints** for **chat streaming** (for example SSE under `/api/chat`). They validate the user and **forward** the stream to Python. | **Why not only OData actions for chat?** Streaming many small tokens does not match a single OData “action response” well. So chat uses a **normal HTTP stream** on the same CAP server. |
| **Python service** | LLM calls, MCP client, streaming body. | Best place for AI libraries and tools. It must **respect** what CAP stored (allowed tools, roles). |
| **SAP HANA Cloud** | Stores catalog data, chat history, audit rows. | One **system of record** on BTP. |
| **Optional later** | **Destination** to S/4 OData sandbox for a **read-only** demo tool. | Shows integration skill without owning a full ERP. |

**Short version for grads:**  
- **CAP + HANA** = “what is allowed” and “what is stored.”  
- **Python** = “how the AI runs and talks to MCP.”  
- **Chat HTTP stream on CAP** = “how the browser gets live tokens without fighting OData.”

---

## 6. Seed data (demo-ready)

**What:** After deploy, the database should already contain a **small realistic sample**: one or two MCP servers, several tools with risk labels, two agents (for example “General” and “ERP helper”), and test users in BTP with the right **role collections**.

**Why:** Anyone opening the demo sees value in **minutes**, not after manual setup.

---

## 7. Phasing (keep scope honest)

| Phase | What we build |
|-------|----------------|
| **MVP** | HANA seed data; Elements CRUD for MCP, tools, agents; freestyle chat with streaming; XSUAA; save messages and basic audit. |
| **Next** | Sync tools from MCP; “test tool” screen; tighten secrets (Destinations / Credential Store). |
| **Later** | Strong approval workflow, multi-tenant, SAP AI Core if the account allows, Work Zone tile. |

---

## 8. Terms (quick glossary)

| Term | Simple meaning |
|------|----------------|
| **BTP** | SAP’s cloud platform where we run the app, identity, and database services. |
| **Cloud Foundry (CF)** | The runtime we deploy to (common on BTP). |
| **CAP** | **Cloud Application Programming** model — Node (or Java) services, often with **CDS** models and **OData** APIs. |
| **OData** | A standard way for the UI to read and write **rows** in the database through the server. |
| **Fiori Elements** | Prebuilt SAP UI patterns (list + detail) driven by annotations — less custom XML. |
| **Freestyle SAPUI5** | We build the UI ourselves (needed for rich chat and streaming). |
| **XSUAA** | SAP’s service for **login and JWT tokens** with **scopes/roles**. |
| **MCP** | **Model Context Protocol** — a way for the AI to call **tools** on a server in a structured way. |
| **MCP server** | A service that exposes **tools** the agent can call. |
| **SSE** | **Server-Sent Events** — one way to **stream** text from server to browser over HTTP. |
| **HANA Cloud** | SAP’s managed database on BTP; our main store for this product. |
| **ADK (here)** | **Agent Development Kit** style — libraries/patterns for building **agents** in Python (executor side). |

---

## 9. UI split (remember this)

| Area | UI style | Why |
|------|-----------|-----|
| MCP servers, tools, agents | **Fiori Elements** | Lots of structured fields and tables — Elements fits well. |
| Chat | **Freestyle SAPUI5** | Streaming, bubbles, tool traces — needs custom UI. |

---

*End of PRD — for technical deployment steps and file layout, see `doc/Architecture/fiori-agent-platform.md`.*
