-- DDL for demo tables (HANA-compatible names)
CREATE TABLE IF NOT EXISTS acp_demo_Vendor (
    ID TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    country TEXT,
    rating INTEGER
);

CREATE TABLE IF NOT EXISTS acp_demo_PurchaseOrder (
    ID TEXT PRIMARY KEY,
    vendor_ID TEXT,
    amount DECIMAL(15, 2),
    currency TEXT,
    status TEXT,
    orderDate DATE,
    buyer TEXT,
    description TEXT,
    FOREIGN KEY (vendor_ID) REFERENCES acp_demo_Vendor(ID)
);

CREATE TABLE IF NOT EXISTS acp_demo_POItem (
    ID TEXT PRIMARY KEY,
    po_ID TEXT,
    lineNo INTEGER,
    description TEXT,
    quantity INTEGER,
    unit TEXT,
    unitPrice DECIMAL(15, 2),
    currency TEXT,
    FOREIGN KEY (po_ID) REFERENCES acp_demo_PurchaseOrder(ID)
);

CREATE TABLE IF NOT EXISTS acp_demo_InvoiceHeader (
    ID TEXT PRIMARY KEY,
    po_ID TEXT,
    amount DECIMAL(15, 2),
    currency TEXT,
    status TEXT,
    invoiceDate DATE,
    dueDate DATE,
    invoiceRef TEXT,
    FOREIGN KEY (po_ID) REFERENCES acp_demo_PurchaseOrder(ID)
);

CREATE TABLE IF NOT EXISTS acp_demo_InvoiceItem (
    ID TEXT PRIMARY KEY,
    invoice_ID TEXT,
    lineNo INTEGER,
    description TEXT,
    quantity INTEGER,
    unit TEXT,
    unitPrice DECIMAL(15, 2),
    currency TEXT,
    FOREIGN KEY (invoice_ID) REFERENCES acp_demo_InvoiceHeader(ID)
);

-- Seed rows (aligned with Phase 2/Action Plan 03)
INSERT INTO acp_demo_Vendor (ID, name, category, country, rating) VALUES ('v-001', 'Logistics Pro', 'Services', 'DE', 5);
INSERT INTO acp_demo_Vendor (ID, name, category, country, rating) VALUES ('v-002', 'Office Supply Co', 'Supplies', 'US', 4);
INSERT INTO acp_demo_Vendor (ID, name, category, country, rating) VALUES ('v-003', 'Steel Forge Ltd', 'Raw Materials', 'UK', 3);

INSERT INTO acp_demo_PurchaseOrder (ID, vendor_ID, amount, currency, status, orderDate, buyer, description) VALUES ('po-001', 'v-001', 5000.00, 'EUR', 'Open', '2026-03-01', 'Alice', 'March delivery');
INSERT INTO acp_demo_PurchaseOrder (ID, vendor_ID, amount, currency, status, orderDate, buyer, description) VALUES ('po-002', 'v-002', 1200.00, 'USD', 'Completed', '2026-03-05', 'Bob', 'Q1 stationery');

INSERT INTO acp_demo_POItem (ID, po_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('poi-001', 'po-001', 10, 'Standard Freight', 1, 'EA', 5000.00, 'EUR');
INSERT INTO acp_demo_POItem (ID, po_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('poi-002', 'po-002', 10, 'Paper A4', 100, 'REAM', 8.00, 'USD');
INSERT INTO acp_demo_POItem (ID, po_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('poi-003', 'po-002', 20, 'Pens Blue', 400, 'EA', 1.00, 'USD');

INSERT INTO acp_demo_InvoiceHeader (ID, po_ID, amount, currency, status, invoiceDate, dueDate, invoiceRef) VALUES ('inv-001', 'po-001', 5000.00, 'EUR', 'Open', '2026-03-10', '2026-04-10', 'REF-9912');
INSERT INTO acp_demo_InvoiceHeader (ID, po_ID, amount, currency, status, invoiceDate, dueDate, invoiceRef) VALUES ('inv-002', 'po-002', 1200.00, 'USD', 'Paid', '2026-03-15', '2026-04-15', 'REF-9915');

INSERT INTO acp_demo_InvoiceItem (ID, invoice_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('invi-001', 'inv-001', 10, 'Standard Freight', 1, 'EA', 5000.00, 'EUR');
INSERT INTO acp_demo_InvoiceItem (ID, invoice_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('invi-002', 'inv-002', 10, 'Paper A4', 100, 'REAM', 8.00, 'USD');
INSERT INTO acp_demo_InvoiceItem (ID, invoice_ID, lineNo, description, quantity, unit, unitPrice, currency) VALUES ('invi-003', 'inv-002', 20, 'Pens Blue', 400, 'EA', 1.00, 'USD');
