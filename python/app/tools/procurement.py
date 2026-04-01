from ..db import query_as_dicts

def get_vendors(conn, category: str = None, country: str = None):
    """List vendors, optionally filtered by category or country."""
    query = "SELECT * FROM acp_demo_Vendor"
    clauses = []
    params = []
    
    if category:
        clauses.append("category = ?")
        params.append(category)
    if country:
        clauses.append("country = ?")
        params.append(country)
        
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
        
    return query_as_dicts(conn, query, params)

def get_purchase_orders(conn, status: str = None, vendor_id: str = None, buyer: str = None):
    """List POs with optional filters for status, vendor_id, or buyer."""
    query = """
        SELECT po.*, v.name as vendorName 
        FROM acp_demo_PurchaseOrder po
        JOIN acp_demo_Vendor v ON po.vendor_ID = v.ID
    """
    clauses = []
    params = []
    
    if status:
        clauses.append("po.status = ?")
        params.append(status)
    if vendor_id:
        clauses.append("po.vendor_ID = ?")
        params.append(vendor_id)
    if buyer:
        clauses.append("po.buyer = ?")
        params.append(buyer)
        
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
        
    return query_as_dicts(conn, query, params)

def get_po_detail(conn, po_id: str):
    """Retrieve full detail for a single PO including line items."""
    po_header = query_as_dicts(conn, "SELECT * FROM acp_demo_PurchaseOrder WHERE ID = ?", [po_id])
    if not po_header:
        return None
    
    items = query_as_dicts(conn, "SELECT * FROM acp_demo_POItem WHERE po_ID = ? ORDER BY lineNo", [po_id])
    
    result = po_header[0]
    result["items"] = items
    return result
