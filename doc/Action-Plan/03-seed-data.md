# Action Plan 03 — Seed Data Preparation

> **Goal:** Create all CDS entities for the ERP-like demo tables and write every CSV seed file so that one `cds deploy` or MTA deploy restores the full demo from scratch.
> **Reference:** `doc/SeedData/scenario.md` is the authoritative source for every data value. This plan is the implementation checklist.
> **Why this matters:** BTP Trial HANA instances reset nightly. Having all data in CSV files committed to the repo means `cf deploy` re-seeds everything automatically — zero manual data entry after restart.
> Last updated: 2026-03-28.

---

## Phase 1: CDS Demo Schema

> The `acp.demo` namespace holds ERP-like tables. They live in the same HDI container as the platform (`acp`) tables but in a separate namespace so they stay clearly separated.

- [ ] **Task 1.1:** Write `db/demo-schema.cds`.
  - [ ] Subtask 1.1.1: Declare `namespace acp.demo;` at the top of the file.
  - [ ] Subtask 1.1.2: Define `Vendor` entity:
    ```
    key ID       : String(10);
    name         : String(100);
    category     : String(50);
    country      : String(5);
    rating       : Decimal(3,1);
    ```
  - [ ] Subtask 1.1.3: Define `PurchaseOrder` entity:
    ```
    key ID       : String(10);
    vendor       : Association to Vendor;
    amount       : Decimal(15,2);
    currency     : String(3);
    status       : String(20) enum { Open; Closed; Pending };
    orderDate    : Date;
    buyer        : String(100);
    description  : String(200);
    items        : Composition of many POItem on items.po = $self;
    ```
  - [ ] Subtask 1.1.4: Define `POItem` entity:
    ```
    key ID       : String(20);
    po           : Association to PurchaseOrder;
    lineNo       : Integer;
    description  : String(200);
    quantity     : Decimal(10,2);
    unit         : String(5);
    unitPrice    : Decimal(15,2);
    currency     : String(3);
    ```
  - [ ] Subtask 1.1.5: Define `InvoiceHeader` entity:
    ```
    key ID       : String(10);
    po           : Association to PurchaseOrder;
    amount       : Decimal(15,2);
    currency     : String(3);
    status       : String(20) enum { Draft; Submitted; Paid; Overdue };
    invoiceDate  : Date;
    dueDate      : Date;
    invoiceRef   : String(50);
    items        : Composition of many InvoiceItem on items.invoice = $self;
    ```
  - [ ] Subtask 1.1.6: Define `InvoiceItem` entity:
    ```
    key ID       : String(20);
    invoice      : Association to InvoiceHeader;
    lineNo       : Integer;
    description  : String(200);
    quantity     : Decimal(10,2);
    unit         : String(5);
    unitPrice    : Decimal(15,2);
    currency     : String(3);
    ```
- [ ] **Task 1.2:** Verify schema compiles.
  - Run `cds compile db/demo-schema.cds` — expect no errors.
  - Run `cds compile db/schema.cds db/demo-schema.cds` together — no namespace conflicts.

---

## Phase 2: Platform Catalog Seed CSVs

> CAP loads CSV files from `db/data/` automatically on `cds deploy`. The file name must match the CDS entity path exactly: `<namespace>-<EntityName>.csv`.

### File: `db/data/acp-McpServer.csv`

- [ ] **Task 2.1:** Create `db/data/acp-McpServer.csv` with the following 2 rows.

```
ID,name,description,destinationName,baseUrl,authType,transportType,environment,ownerTeam,status,health
mcp-001,Procurement Data MCP,Exposes procurement and ERP query tools for Acme demo data.,PYTHON_MCP_SERVICE,,Destination,HTTP,dev,IT Platform,Active,UNKNOWN
mcp-002,Knowledge Base MCP,Exposes document search and knowledge base tools.,PYTHON_MCP_SERVICE,,Destination,HTTP,dev,IT Platform,Active,UNKNOWN
```

---

### File: `db/data/acp-Tool.csv`

- [ ] **Task 2.2:** Create `db/data/acp-Tool.csv` with the following 7 rows.

```
ID,name,description,server_ID,riskLevel,elevated,status
t-001,get_vendors,"Returns a list of vendors. Optional filter: category, country.",mcp-001,Low,false,Active
t-002,get_purchase_orders,"Returns purchase orders. Filters: status (Open/Closed/Pending), vendor_id, buyer.",mcp-001,Low,false,Active
t-003,get_po_detail,Returns full detail for one PO including line items. Input: po_id.,mcp-001,Low,false,Active
t-004,get_invoices,"Returns invoice headers. Filters: status (Draft/Submitted/Paid/Overdue), due_before.",mcp-001,Low,false,Active
t-005,get_invoice_detail,Returns full invoice detail including line items. Input: invoice_id.,mcp-001,Low,false,Active
t-006,match_invoice_to_po,Matches an invoice to its PO and returns amount comparison. Input: invoice_id.,mcp-001,Medium,false,Active
t-007,get_spend_summary,"Returns total spend grouped by vendor or category. Input: group_by (vendor/category), period.",mcp-001,Low,false,Active
```

---

### File: `db/data/acp-Agent.csv`

- [ ] **Task 2.3:** Create `db/data/acp-Agent.csv` with the following 3 rows.

```
ID,name,description,systemPrompt,modelProfile,identityMode,status
a-001,Procurement Assistant,Answers questions about vendors purchase orders and delivery status.,"You are a procurement assistant for Acme Manufacturing. Answer questions about vendors, purchase orders, and delivery status. Use the available tools to look up live data. If a question is not about procurement, politely say it is outside your scope. Keep answers concise and use bullet points for lists.",Fast,Delegated,Active
a-002,Invoice Analyst,Analyses invoices and matches them against purchase orders.,"You are a finance assistant for Acme Manufacturing specialising in invoice and purchase order reconciliation. Use the available tools to look up invoices, match them to POs, and identify discrepancies. Always show amounts with currency (EUR). Flag overdue invoices clearly.",Quality,Delegated,Active
a-003,General Assistant,Answers general questions and helps employees find the right department.,"You are a helpful assistant for Acme Manufacturing employees. Answer general questions about company processes, help draft emails or summaries, and guide users to the right department. You do not have access to live ERP data.",Fast,Delegated,Active
```

> Note: System prompts containing commas must be wrapped in double quotes in the CSV. Ensure no unescaped double quotes exist inside the prompt text.

---

### File: `db/data/acp-AgentTool.csv`

- [ ] **Task 2.4:** Create `db/data/acp-AgentTool.csv` — maps agents to their allowed tools.

```
ID,agent_ID,tool_ID,permissionOverride
at-001,a-001,t-001,Inherit
at-002,a-001,t-002,Inherit
at-003,a-001,t-003,Inherit
at-004,a-002,t-004,Inherit
at-005,a-002,t-005,Inherit
at-006,a-002,t-006,Inherit
at-007,a-002,t-007,Inherit
```

> General Assistant (a-003) has no tools — it does not appear here.

---

### File: `db/data/acp-AgentGroup.csv`

- [ ] **Task 2.5:** Create `db/data/acp-AgentGroup.csv` with 3 rows.

```
ID,name,description,claimKey,status
g-001,Procurement Team,Users in procurement or sourcing department.,dept,Active
g-002,Finance Team,Users in finance or accounts payable.,dept,Active
g-003,All Staff,All employees with standard access.,dept,Active
```

---

### File: `db/data/acp-AgentGroupClaimValue.csv`

- [ ] **Task 2.6:** Create `db/data/acp-AgentGroupClaimValue.csv` — one row per matching JWT claim value.

```
ID,group_ID,value
cv-001,g-001,procurement
cv-002,g-001,sourcing
cv-003,g-002,finance
cv-004,g-002,accounts_payable
cv-005,g-003,it
cv-006,g-003,hr
cv-007,g-003,operations
```

---

### File: `db/data/acp-AgentGroupAgent.csv`

- [ ] **Task 2.7:** Create `db/data/acp-AgentGroupAgent.csv` — maps agents to groups.

```
ID,group_ID,agent_ID
ga-001,g-001,a-001
ga-002,g-001,a-003
ga-003,g-002,a-002
ga-004,g-002,a-003
ga-005,g-003,a-003
```

> Procurement Team gets Procurement Assistant + General Assistant.
> Finance Team gets Invoice Analyst + General Assistant.
> All Staff (IT/HR/Ops) gets General Assistant only.

---

## Phase 3: ERP Demo Data CSVs

> These files seed the `acp.demo` namespace tables. All values come from `doc/SeedData/scenario.md`.

### File: `db/data/acp.demo-Vendor.csv`

- [ ] **Task 3.1:** Create `db/data/acp.demo-Vendor.csv` with 5 rows.

```
ID,name,category,country,rating
V-001,Hoffmann GmbH,Raw Materials,DE,4.5
V-002,Nordic Steel AB,Raw Materials,SE,4.2
V-003,Omega Logistics,Logistics,NL,3.8
V-004,TechParts Ltd,Components,GB,4.7
V-005,Castillo Supplies,Packaging,ES,4.0
```

---

### File: `db/data/acp.demo-PurchaseOrder.csv`

- [ ] **Task 3.2:** Create `db/data/acp.demo-PurchaseOrder.csv` with 8 rows.

```
ID,vendor_ID,amount,currency,status,orderDate,buyer,description
PO-001,V-001,45000.00,EUR,Open,2026-02-10,bob@acme.com,Steel coils Q1
PO-002,V-002,28500.00,EUR,Open,2026-02-18,bob@acme.com,Structural steel
PO-003,V-003,12000.00,EUR,Closed,2026-01-05,bob@acme.com,Freight Jan batch
PO-004,V-004,67200.00,EUR,Open,2026-03-01,bob@acme.com,PCB assemblies
PO-005,V-001,31000.00,EUR,Pending,2026-03-15,bob@acme.com,Steel coils Q2
PO-006,V-005,8400.00,EUR,Closed,2026-01-20,bob@acme.com,Packaging March
PO-007,V-003,15500.00,EUR,Open,2026-03-10,bob@acme.com,Freight Mar batch
PO-008,V-004,22100.00,EUR,Open,2026-03-20,bob@acme.com,Sensor modules
```

---

### File: `db/data/acp.demo-POItem.csv`

- [ ] **Task 3.3:** Create `db/data/acp.demo-POItem.csv` with 16 rows (2 per PO).

```
ID,po_ID,lineNo,description,quantity,unit,unitPrice,currency
POI-001-1,PO-001,1,Hot-rolled steel coil 3mm,50,t,650.00,EUR
POI-001-2,PO-001,2,Cold-rolled steel coil 1.5mm,30,t,583.33,EUR
POI-002-1,PO-002,1,HEA 200 beam,80,t,312.50,EUR
POI-002-2,PO-002,2,IPE 300 beam,20,t,462.50,EUR
POI-003-1,PO-003,1,Full-truck-load EU,6,trip,1500.00,EUR
POI-003-2,PO-003,2,Partial-load EU,6,trip,500.00,EUR
POI-004-1,PO-004,1,PCB assembly type A,400,pcs,112.00,EUR
POI-004-2,PO-004,2,PCB assembly type B,200,pcs,112.00,EUR
POI-005-1,PO-005,1,Steel coil Q2 batch,40,t,650.00,EUR
POI-005-2,PO-005,2,Zinc-coated steel,20,t,700.00,EUR
POI-006-1,PO-006,1,Cardboard box 30x30,10000,pcs,0.55,EUR
POI-006-2,PO-006,2,Stretch film roll,500,pcs,8.30,EUR
POI-007-1,PO-007,1,Full-truck-load EU,8,trip,1500.00,EUR
POI-007-2,PO-007,2,Express parcel service,30,pkg,83.33,EUR
POI-008-1,PO-008,1,Proximity sensor model X,300,pcs,49.67,EUR
POI-008-2,PO-008,2,Temperature sensor TH-20,200,pcs,55.83,EUR
```

---

### File: `db/data/acp.demo-InvoiceHeader.csv`

- [ ] **Task 3.4:** Create `db/data/acp.demo-InvoiceHeader.csv` with 6 rows.

```
ID,po_ID,amount,currency,status,invoiceDate,dueDate,invoiceRef
INV-001,PO-003,12000.00,EUR,Paid,2026-01-10,2026-02-10,OMEGA-2026-0045
INV-002,PO-001,45000.00,EUR,Submitted,2026-02-15,2026-03-15,HOFF-2026-0112
INV-003,PO-006,8400.00,EUR,Paid,2026-01-25,2026-02-25,CAST-2026-0018
INV-004,PO-004,67200.00,EUR,Overdue,2026-03-05,2026-03-26,TECH-2026-0089
INV-005,PO-002,28500.00,EUR,Draft,2026-03-20,2026-04-20,NORD-2026-0067
INV-006,PO-007,15200.00,EUR,Submitted,2026-03-12,2026-04-12,OMEGA-2026-0061
```

> INV-004 is intentionally overdue (due date = today in the demo).
> INV-006 total is EUR 15,200 vs PO-007 total EUR 15,500 — a deliberate EUR 300 discrepancy used in demo Conversation 3.

---

### File: `db/data/acp.demo-InvoiceItem.csv`

- [ ] **Task 3.5:** Create `db/data/acp.demo-InvoiceItem.csv` with 12 rows (2 per invoice).

```
ID,invoice_ID,lineNo,description,quantity,unit,unitPrice,currency
II-001-1,INV-001,1,Full-truck-load EU,6,trip,1500.00,EUR
II-001-2,INV-001,2,Partial-load EU,6,trip,500.00,EUR
II-002-1,INV-002,1,Hot-rolled steel coil 3mm,50,t,650.00,EUR
II-002-2,INV-002,2,Cold-rolled steel coil 1.5mm,30,t,583.33,EUR
II-003-1,INV-003,1,Cardboard box 30x30,10000,pcs,0.55,EUR
II-003-2,INV-003,2,Stretch film roll,500,pcs,8.30,EUR
II-004-1,INV-004,1,PCB assembly type A,400,pcs,112.00,EUR
II-004-2,INV-004,2,PCB assembly type B,200,pcs,112.00,EUR
II-005-1,INV-005,1,HEA 200 beam,80,t,312.50,EUR
II-005-2,INV-005,2,IPE 300 beam,20,t,462.50,EUR
II-006-1,INV-006,1,Full-truck-load EU,8,trip,1500.00,EUR
II-006-2,INV-006,2,Express parcel service,30,pkg,60.00,EUR
```

> II-006-2: unit price is 60.00; the PO line (POI-007-2) is 83.33. This is the line that creates the EUR 300 discrepancy (30 units × (83.33 − 60.00) = 30 × 23.33 ≈ EUR 300).

---

## Phase 4: Local Verification

- [ ] **Task 4.1:** Run `cds deploy --to sqlite` from project root.
  - Expect: schema compiled, all tables created, all CSV rows loaded. No errors.
- [ ] **Task 4.2:** Start `cds watch` and spot-check seed data via OData.
  - `GET http://localhost:4004/odata/v4/governance/McpServers` → 2 rows.
  - `GET http://localhost:4004/odata/v4/governance/Tools` → 7 rows.
  - `GET http://localhost:4004/odata/v4/governance/Agents` → 3 rows.
  - `GET http://localhost:4004/odata/v4/governance/AgentGroups` → 3 rows.
- [ ] **Task 4.3:** Verify agent group resolution logic.
  - Call `GET /api/agents` with a dummy JWT containing `dept=procurement` → response includes `Procurement Assistant` and `General Assistant` only (not `Invoice Analyst`).
  - Call with `dept=finance` → response includes `Invoice Analyst` and `General Assistant` only.
  - Call with `dept=it` → response includes `General Assistant` only.
- [ ] **Task 4.4:** Verify demo ERP data through Python tool handlers (once Phase 6 of Action Plan 01 is complete).
  - `POST http://localhost:8000/mcp/tools/call` `{ "name": "get_purchase_orders", "arguments": { "status": "Open" } }` → returns 5 POs (PO-001, PO-002, PO-004, PO-007, PO-008).
  - `POST http://localhost:8000/mcp/tools/call` `{ "name": "match_invoice_to_po", "arguments": { "invoice_id": "INV-006" } }` → returns discrepancy of EUR 300 on line 2.
  - `POST http://localhost:8000/mcp/tools/call` `{ "name": "get_invoices", "arguments": { "status": "Overdue" } }` → returns INV-004.

---

## Phase 5: HANA Deployment Verification

> Run this after BTP deploy (Action Plan 01, Phase 9) to confirm seed data survived the HANA deploy.

- [ ] **Task 5.1:** Open SAP HANA Database Explorer from BTP Cockpit.
  - SAP HANA Cloud tool → click your instance → **Open in SAP HANA Database Explorer**.
  - Log in with the administrator password you set in Action Plan 02 Phase 4.
- [ ] **Task 5.2:** Spot-check platform catalog tables.
  - Run: `SELECT COUNT(*) FROM "ACP_MCPSERVER"` → expect 2.
  - Run: `SELECT COUNT(*) FROM "ACP_TOOL"` → expect 7.
  - Run: `SELECT COUNT(*) FROM "ACP_AGENT"` → expect 3.
  - Run: `SELECT COUNT(*) FROM "ACP_AGENTGROUP"` → expect 3.
  - Run: `SELECT COUNT(*) FROM "ACP_AGENTGROUPCLAIMVALUE"` → expect 7.
- [ ] **Task 5.3:** Spot-check ERP demo tables.
  - Run: `SELECT COUNT(*) FROM "ACP_DEMO_VENDOR"` → expect 5.
  - Run: `SELECT COUNT(*) FROM "ACP_DEMO_PURCHASEORDER"` → expect 8.
  - Run: `SELECT COUNT(*) FROM "ACP_DEMO_POITEM"` → expect 16.
  - Run: `SELECT COUNT(*) FROM "ACP_DEMO_INVOICEHEADER"` → expect 6.
  - Run: `SELECT COUNT(*) FROM "ACP_DEMO_INVOICEITEM"` → expect 12.
- [ ] **Task 5.4:** Verify deliberate discrepancy in live data.
  - Run:
    ```sql
    SELECT h.ID, h.amount AS inv_amount, p.amount AS po_amount,
           p.amount - h.amount AS diff
    FROM "ACP_DEMO_INVOICEHEADER" h
    JOIN "ACP_DEMO_PURCHASEORDER" p ON h.PO_ID = p.ID
    WHERE h.ID = 'INV-006'
    ```
  - Expected: `diff = 300.00`.

---

## Phase 6: Trial Reset Recovery Procedure

> When BTP trial restarts and HANA is re-created, run this one command to restore everything:

- [ ] **Task 6.1:** Start the HANA Cloud instance (Action Plan 02, Phase 9 Task 9.1).
- [ ] **Task 6.2:** Re-deploy the MTA (which re-runs `acp-db-deployer` and reloads all CSVs).
  - `cf deploy mta_archives/agent-control-plane_*.mtar`
  - If MTA archive is stale: `mbt build` first, then deploy.
- [ ] **Task 6.3:** Re-set the LLM API key environment variable (cleared on app restart).
  - `cf set-env acp-python LLM_API_KEY <your-key>`
  - `cf restart acp-python`
- [ ] **Task 6.4:** Verify demo is working: run the smoke test checklist (Action Plan 02, Phase 10).

---

*End of Seed Data Action Plan — for demo conversation scripts and expected outputs, see `doc/SeedData/scenario.md`.*
