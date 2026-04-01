from ..db import query_as_dicts

def get_invoices(conn, status: str = None, due_before: str = None):
    """List invoices with optional status or due_before date filters."""
    query = "SELECT * FROM acp_demo_InvoiceHeader"
    clauses = []
    params = []
    
    if status:
        clauses.append("status = ?")
        params.append(status)
    if due_before:
        clauses.append("dueDate <= ?")
        params.append(due_before)
        
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
        
    return query_as_dicts(conn, query, params)

def get_invoice_detail(conn, invoice_id: str):
    """Full detail for a single invoice including line items."""
    header = query_as_dicts(conn, "SELECT * FROM acp_demo_InvoiceHeader WHERE ID = ?", [invoice_id])
    if not header:
        return None
    
    items = query_as_dicts(conn, "SELECT * FROM acp_demo_InvoiceItem WHERE invoice_ID = ? ORDER BY lineNo", [invoice_id])
    
    result = header[0]
    result["items"] = items
    return result

def match_invoice_to_po(conn, invoice_id: str):
    """Compare invoice amount vs associated PO and return details."""
    inv = query_as_dicts(conn, "SELECT ID, po_ID, amount, currency FROM acp_demo_InvoiceHeader WHERE ID = ?", [invoice_id])
    if not inv:
        return {"error": "Invoice not found"}
    
    po_id = inv[0].get("po_ID")
    if not po_id:
        return {"error": "No associated PO for this invoice"}
        
    po = query_as_dicts(conn, "SELECT ID, amount, currency FROM acp_demo_PurchaseOrder WHERE ID = ?", [po_id])
    if not po:
        return {"error": f"Associated PO {po_id} not found"}
        
    inv_items = query_as_dicts(conn, "SELECT lineNo, description, quantity, unitPrice, amount FROM acp_demo_InvoiceItem WHERE invoice_ID = ?", [invoice_id])
    po_items = query_as_dicts(conn, "SELECT lineNo, description, quantity, unitPrice, amount FROM acp_demo_POItem WHERE po_ID = ?", [po_id])
    
    # Calculate difference
    diff = inv[0]["amount"] - po[0]["amount"]
    
    return {
        "invoice": inv[0],
        "po": po[0],
        "totalDifference": diff,
        "invoiceItems": inv_items,
        "poItems": po_items,
        "note": "Amounts compared in their respective currencies."
    }

def get_spend_summary(conn, group_by: str, period: str = None):
    """Aggregate PO spend amounts, grouped by vendor or category."""
    if group_by == "vendor":
        query = """
            SELECT v.name as grouping, SUM(po.amount) as totalAmount, po.currency 
            FROM acp_demo_PurchaseOrder po
            JOIN acp_demo_Vendor v ON po.vendor_ID = v.ID
            GROUP BY v.name, po.currency
        """
    elif group_by == "category":
        query = """
            SELECT v.category as grouping, SUM(po.amount) as totalAmount, po.currency 
            FROM acp_demo_PurchaseOrder po
            JOIN acp_demo_Vendor v ON po.vendor_ID = v.ID
            GROUP BY v.category, po.currency
        """
    else:
        return {"error": "Group by must be 'vendor' or 'category'"}
        
    return query_as_dicts(conn, query)
