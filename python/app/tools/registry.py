from .procurement import get_vendors, get_purchase_orders, get_po_detail
from .finance import get_invoices, get_invoice_detail, match_invoice_to_po, get_spend_summary

TOOL_REGISTRY = {
    "get_vendors": {
        "handler": get_vendors,
        "description": "List vendors, optionally filtered by category or country.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Vendor category e.g. 'Supplies'"},
                "country": {"type": "string", "description": "Two-letter country code e.g. 'US'"}
            }
        }
    },
    "get_purchase_orders": {
        "handler": get_purchase_orders,
        "description": "List POs with optional filters for status, vendor_id, or buyer.",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "PO status e.g. 'Open'"},
                "vendor_id": {"type": "string", "description": "Vendor ID e.g. 'v-001'"},
                "buyer": {"type": "string", "description": "Buyer name e.g. 'Alice'"}
            }
        }
    },
    "get_po_detail": {
        "handler": get_po_detail,
        "description": "Retrieve full detail for a single PO including line items.",
        "parameters": {
            "type": "object",
            "properties": {
                "po_id": {"type": "string", "description": "PO ID e.g. 'po-001'"}
            },
            "required": ["po_id"]
        }
    },
    "get_invoices": {
        "handler": get_invoices,
        "description": "List invoices with optional status or due_before date filters.",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Invoice status e.g. 'Open'"},
                "due_before": {"type": "string", "description": "Due date ISO string e.g. '2026-04-01'"}
            }
        }
    },
    "get_invoice_detail": {
        "handler": get_invoice_detail,
        "description": "Full detail for a single invoice including line items.",
        "parameters": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "Invoice ID e.g. 'inv-001'"}
            },
            "required": ["invoice_id"]
        }
    },
    "match_invoice_to_po": {
        "handler": match_invoice_to_po,
        "description": "Compare invoice amount vs associated PO and return details.",
        "parameters": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "Invoice ID e.g. 'inv-001'"}
            },
            "required": ["invoice_id"]
        }
    },
    "get_spend_summary": {
        "handler": get_spend_summary,
        "description": "Aggregate PO spend amounts, grouped by vendor or category.",
        "parameters": {
            "type": "object",
            "properties": {
                "group_by": {"type": "string", "enum": ["vendor", "category"], "description": "Dimension to group spend by."},
                "period": {"type": "string", "description": "Optional period name e.g. 'Q1'"}
            },
            "required": ["group_by"]
        }
    }
}
