# Demo Scenario: Acme Manufacturing — Finance & Procurement Intelligence

> **Purpose:** This document defines the exact business story and data that seeds the Agent Control Plane demo. It is the reference for writing seed scripts and CSV data files.
> Last updated: 2026-03-28.

---

## The story (one paragraph)

Acme Manufacturing is a mid-sized industrial company. Their IT team has deployed the Agent Control Plane on SAP BTP. The procurement department uses it to query purchase orders and vendor data. The finance department uses it to analyse invoices and match them against POs. All staff have access to a general assistant. The platform admin has registered the MCP servers, reviewed every tool, set risk levels, and mapped departments to agent groups. Users sign in, see only their department's agents, and chat — the data comes from HANA.

---

## Personas in the demo

| Demo user | Department JWT claim | What they see |
|-----------|----------------------|----------------|
| Alice (Platform Admin) | `dept=it` | All admin screens, all agents |
| Bob (Procurement Analyst) | `dept=procurement` | Procurement Assistant + General Assistant |
| Carol (Finance Analyst) | `dept=finance` | Invoice Analyst + General Assistant |
| Dave (Auditor) | — | Read-only audit view of all sessions |

---

## HANA data layout

One HDI container. Two CDS namespaces.

| Namespace | Tables | Purpose |
|-----------|--------|---------|
| `acp` | McpServer, Tool, Agent, AgentTool, AgentGroup, AgentGroupClaimValue, AgentGroupAgent, ChatSession, ChatMessage, ToolCallRecord | Platform catalog + chat history. Managed by CAP. |
| `acp.demo` | Vendor, PurchaseOrder, POItem, InvoiceHeader, InvoiceItem | ERP-like demo data. Read-only by Python MCP service. |

---

## Category A — Platform catalog seed

### MCP servers (2 rows)

| ID | name | destinationName | transportType | environment | ownerTeam | status |
|----|------|-----------------|---------------|-------------|-----------|--------|
| `mcp-001` | Procurement Data MCP | `PYTHON_MCP_SERVICE` | HTTP | dev | IT Platform | Active |
| `mcp-002` | Knowledge Base MCP | `PYTHON_MCP_SERVICE` | HTTP | dev | IT Platform | Active |

> Both point to the same Python service on BTP. The Python service routes calls to the correct tool handler based on tool name.

---

### Tools (7 rows)

| ID | name | mcpServer | riskLevel | elevated | status | description (sent to LLM) |
|----|------|-----------|-----------|----------|--------|---------------------------|
| `t-001` | `get_vendors` | mcp-001 | Low | false | Active | Returns a list of vendors. Optional filter: category, country. |
| `t-002` | `get_purchase_orders` | mcp-001 | Low | false | Active | Returns purchase orders. Filters: status (Open/Closed/Pending), vendor_id, buyer. |
| `t-003` | `get_po_detail` | mcp-001 | Low | false | Active | Returns full detail for one PO including line items. Input: po_id. |
| `t-004` | `get_invoices` | mcp-001 | Low | false | Active | Returns invoice headers. Filters: status (Draft/Submitted/Paid/Overdue), due_before. |
| `t-005` | `get_invoice_detail` | mcp-001 | Low | false | Active | Returns full invoice detail including line items. Input: invoice_id. |
| `t-006` | `match_invoice_to_po` | mcp-001 | Medium | false | Active | Matches an invoice to its PO and returns amount comparison. Input: invoice_id. |
| `t-007` | `get_spend_summary` | mcp-001 | Low | false | Active | Returns total spend grouped by vendor or category. Input: group_by (vendor/category), period. |

---

### Agents (3 rows)

#### Agent 1 — Procurement Assistant

| Field | Value |
|-------|-------|
| name | Procurement Assistant |
| status | Active |
| modelProfile | Fast |
| identityMode | Delegated |
| systemPrompt | You are a procurement assistant for Acme Manufacturing. Answer questions about vendors, purchase orders, and delivery status. Use the available tools to look up live data. If a question is not about procurement, politely say it is outside your scope. Keep answers concise and use bullet points for lists. |

Tools assigned: `get_vendors`, `get_purchase_orders`, `get_po_detail` — all with `permissionOverride: Inherit`.

#### Agent 2 — Invoice Analyst

| Field | Value |
|-------|-------|
| name | Invoice Analyst |
| status | Active |
| modelProfile | Quality |
| identityMode | Delegated |
| systemPrompt | You are a finance assistant for Acme Manufacturing specialising in invoice and purchase order reconciliation. Use the available tools to look up invoices, match them to POs, and identify discrepancies. Always show amounts with currency (EUR). Flag overdue invoices clearly. |

Tools assigned: `get_invoices`, `get_invoice_detail`, `match_invoice_to_po`, `get_spend_summary` — all with `permissionOverride: Inherit`.

#### Agent 3 — General Assistant

| Field | Value |
|-------|-------|
| name | General Assistant |
| status | Active |
| modelProfile | Fast |
| identityMode | Delegated |
| systemPrompt | You are a helpful assistant for Acme Manufacturing employees. Answer general questions about company processes, help draft emails or summaries, and guide users to the right department. You do not have access to live ERP data. |

Tools assigned: none.

---

### Agent groups (3 rows)

| name | claimKey | claimValues | Agents included |
|------|----------|-------------|-----------------|
| Procurement Team | `dept` | `procurement`, `sourcing` | Procurement Assistant, General Assistant |
| Finance Team | `dept` | `finance`, `accounts_payable` | Invoice Analyst, General Assistant |
| All Staff | `dept` | `it`, `hr`, `operations` | General Assistant |

> The Procurement Team and Finance Team groups each include General Assistant so those users always have a fallback agent.

---

## Category B — ERP-like demo data (`acp.demo` namespace)

These tables are defined in `db/demo-schema.cds` (namespace `acp.demo`) and deployed into the same HDI container as the platform data. The Python MCP service reads from them using the HANA binding it already has.

### `acp.demo.Vendor` (5 rows)

| ID | name | category | country | rating |
|----|------|----------|---------|--------|
| V-001 | Hoffmann GmbH | Raw Materials | DE | 4.5 |
| V-002 | Nordic Steel AB | Raw Materials | SE | 4.2 |
| V-003 | Omega Logistics | Logistics | NL | 3.8 |
| V-004 | TechParts Ltd | Components | GB | 4.7 |
| V-005 | Castillo Supplies | Packaging | ES | 4.0 |

---

### `acp.demo.PurchaseOrder` (8 rows)

| ID | vendor_ID | amount | currency | status | orderDate | buyer | description |
|----|-----------|--------|----------|--------|-----------|-------|-------------|
| PO-001 | V-001 | 45000.00 | EUR | Open | 2026-02-10 | bob@acme.com | Steel coils Q1 |
| PO-002 | V-002 | 28500.00 | EUR | Open | 2026-02-18 | bob@acme.com | Structural steel |
| PO-003 | V-003 | 12000.00 | EUR | Closed | 2026-01-05 | bob@acme.com | Freight Jan batch |
| PO-004 | V-004 | 67200.00 | EUR | Open | 2026-03-01 | bob@acme.com | PCB assemblies |
| PO-005 | V-001 | 31000.00 | EUR | Pending | 2026-03-15 | bob@acme.com | Steel coils Q2 |
| PO-006 | V-005 | 8400.00 | EUR | Closed | 2026-01-20 | bob@acme.com | Packaging March |
| PO-007 | V-003 | 15500.00 | EUR | Open | 2026-03-10 | bob@acme.com | Freight Mar batch |
| PO-008 | V-004 | 22100.00 | EUR | Open | 2026-03-20 | bob@acme.com | Sensor modules |

---

### `acp.demo.POItem` (16 rows — 2 per PO)

Each PO has 2 line items. Pattern: `POI-<PO number>-<line>`.

| ID | po_ID | lineNo | description | quantity | unit | unitPrice | currency |
|----|-------|--------|-------------|----------|------|-----------|----------|
| POI-001-1 | PO-001 | 1 | Hot-rolled steel coil 3mm | 50 | t | 650.00 | EUR |
| POI-001-2 | PO-001 | 2 | Cold-rolled steel coil 1.5mm | 30 | t | 583.33 | EUR |
| POI-002-1 | PO-002 | 1 | HEA 200 beam | 80 | t | 312.50 | EUR |
| POI-002-2 | PO-002 | 2 | IPE 300 beam | 20 | t | 462.50 | EUR |
| POI-003-1 | PO-003 | 1 | Full-truck-load EU | 6 | trip | 1500.00 | EUR |
| POI-003-2 | PO-003 | 2 | Partial-load EU | 6 | trip | 500.00 | EUR |
| POI-004-1 | PO-004 | 1 | PCB assembly type A | 400 | pcs | 112.00 | EUR |
| POI-004-2 | PO-004 | 2 | PCB assembly type B | 200 | pcs | 112.00 | EUR |
| POI-005-1 | PO-005 | 1 | Steel coil Q2 batch | 40 | t | 650.00 | EUR |
| POI-005-2 | PO-005 | 2 | Zinc-coated steel | 20 | t | 700.00 | EUR |
| POI-006-1 | PO-006 | 1 | Cardboard box 30x30 | 10000 | pcs | 0.55 | EUR |
| POI-006-2 | PO-006 | 2 | Stretch film roll | 500 | pcs | 8.30 | EUR |
| POI-007-1 | PO-007 | 1 | Full-truck-load EU | 8 | trip | 1500.00 | EUR |
| POI-007-2 | PO-007 | 2 | Express parcel service | 30 | pkg | 83.33 | EUR |
| POI-008-1 | PO-008 | 1 | Proximity sensor model X | 300 | pcs | 49.67 | EUR |
| POI-008-2 | PO-008 | 2 | Temperature sensor TH-20 | 200 | pcs | 55.83 | EUR |

---

### `acp.demo.InvoiceHeader` (6 rows)

| ID | po_ID | amount | currency | status | invoiceDate | dueDate | invoiceRef |
|----|-------|--------|----------|--------|-------------|---------|------------|
| INV-001 | PO-003 | 12000.00 | EUR | Paid | 2026-01-10 | 2026-02-10 | OMEGA-2026-0045 |
| INV-002 | PO-001 | 45000.00 | EUR | Submitted | 2026-02-15 | 2026-03-15 | HOFF-2026-0112 |
| INV-003 | PO-006 | 8400.00 | EUR | Paid | 2026-01-25 | 2026-02-25 | CAST-2026-0018 |
| INV-004 | PO-004 | 67200.00 | EUR | Overdue | 2026-03-05 | 2026-03-26 | TECH-2026-0089 |
| INV-005 | PO-002 | 28500.00 | EUR | Draft | 2026-03-20 | 2026-04-20 | NORD-2026-0067 |
| INV-006 | PO-007 | 15200.00 | EUR | Submitted | 2026-03-12 | 2026-04-12 | OMEGA-2026-0061 |

> INV-004 is intentionally overdue (due 2026-03-26, today's date) and has a slight amount mismatch with PO-004 (67200 vs 67200 — this one matches exactly; adjust INV-006 vs PO-007 to 15200 vs 15500 to create a deliberate mismatch for the demo).

---

### `acp.demo.InvoiceItem` (12 rows — 2 per invoice)

| ID | invoice_ID | lineNo | description | quantity | unit | unitPrice | currency |
|----|------------|--------|-------------|----------|------|-----------|----------|
| II-001-1 | INV-001 | 1 | Full-truck-load EU | 6 | trip | 1500.00 | EUR |
| II-001-2 | INV-001 | 2 | Partial-load EU | 6 | trip | 500.00 | EUR |
| II-002-1 | INV-002 | 1 | Hot-rolled steel coil 3mm | 50 | t | 650.00 | EUR |
| II-002-2 | INV-002 | 2 | Cold-rolled steel coil 1.5mm | 30 | t | 583.33 | EUR |
| II-003-1 | INV-003 | 1 | Cardboard box 30x30 | 10000 | pcs | 0.55 | EUR |
| II-003-2 | INV-003 | 2 | Stretch film roll | 500 | pcs | 8.30 | EUR |
| II-004-1 | INV-004 | 1 | PCB assembly type A | 400 | pcs | 112.00 | EUR |
| II-004-2 | INV-004 | 2 | PCB assembly type B | 200 | pcs | 112.00 | EUR |
| II-005-1 | INV-005 | 1 | HEA 200 beam | 80 | t | 312.50 | EUR |
| II-005-2 | INV-005 | 2 | IPE 300 beam | 20 | t | 462.50 | EUR |
| II-006-1 | INV-006 | 1 | Full-truck-load EU | 8 | trip | 1500.00 | EUR |
| II-006-2 | INV-006 | 2 | Express parcel service | 30 | pkg | 60.00 | EUR |

> INV-006 line 2: unit price is 60.00 but PO-007 line 2 was 83.33. This creates the deliberate discrepancy the demo conversation uses.

---

## Three demo conversations (what to show)

### Conversation 1 — Bob (Procurement), Procurement Assistant

**User:** "Show me all open purchase orders."

**Expected:** Agent calls `get_purchase_orders(status="Open")` → returns PO-001, PO-002, PO-004, PO-007, PO-008 with amounts. Tool trace visible in UI.

---

### Conversation 2 — Carol (Finance), Invoice Analyst

**User:** "Which invoices are overdue or due this week?"

**Expected:** Agent calls `get_invoices(status="Overdue")` → returns INV-004 (TECH-2026-0089, EUR 67,200, overdue). Agent flags it clearly.

---

### Conversation 3 — Carol (Finance), Invoice Analyst

**User:** "Match invoice INV-006 to its purchase order and check if the amounts align."

**Expected:** Agent calls `get_invoice_detail(invoice_id="INV-006")` then `match_invoice_to_po(invoice_id="INV-006")`. Tool returns: PO-007 total = EUR 15,500; INV-006 total = EUR 15,200. Agent reports a EUR 300 discrepancy on line 2 (Express parcel service: invoiced at 60.00 vs PO at 83.33 per unit, 30 units). This demonstrates multi-tool chaining in a single response.

---

## How the Python MCP service uses this data

The Python service (`python/app/mcp_client.py` / `executor.py`) connects to HANA using the same `acp-hana` service binding that CAP uses. It reads the `acp.demo.*` tables directly via SQL. It does **not** go through CAP OData — it is a direct HANA connection.

Tool handler mapping (in Python):

| Tool name | SQL tables queried |
|-----------|--------------------|
| `get_vendors` | `acp_demo_Vendor` |
| `get_purchase_orders` | `acp_demo_PurchaseOrder` JOIN `acp_demo_Vendor` |
| `get_po_detail` | `acp_demo_PurchaseOrder` + `acp_demo_POItem` |
| `get_invoices` | `acp_demo_InvoiceHeader` |
| `get_invoice_detail` | `acp_demo_InvoiceHeader` + `acp_demo_InvoiceItem` |
| `match_invoice_to_po` | `acp_demo_InvoiceHeader` + `acp_demo_PurchaseOrder` + line items |
| `get_spend_summary` | `acp_demo_PurchaseOrder` JOIN `acp_demo_Vendor` GROUP BY |

> HANA table names in SQL use underscore separators (CDS deploys `acp.demo.Vendor` as `acp_demo_Vendor`).

---

## What gets reset on trial restart

BTP trial HANA Cloud instances are stopped nightly and deleted if not started within 30 days. When the HDI container is re-deployed (e.g. **`npm run deploy:hana`** from the repo after **`cds bind`**), all seed data is re-applied from:

- `db/data/acp-*.csv` — platform catalog rows
- `db/data/acp.demo-*.csv` — ERP-like demo rows

Both sets of CSV files must be committed to the repo so a fresh **HANA deploy** restores the full demo in one command.

---

*End of scenario document — for CDS entity definitions of `acp.demo` tables, see `db/demo-schema.cds` (to be created in the developer action plan).*
