"""Finance demo tools — tolerant inputs and stable structured results."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Mapping, Optional, Tuple

from python.utils.db_utils import query_as_dicts

# Demo data uses these exact status strings (see db/data/acp.demo-InvoiceHeader.csv)
_KNOWN_INVOICE_STATUSES = frozenset({"Paid", "Submitted", "Overdue", "Draft"})

# Common LLM / user synonyms → canonical DB values
_STATUS_ALIASES: Dict[str, str] = {
    "open": "Draft",
    "draft": "Draft",
    "pending": "Submitted",
    "submitted": "Submitted",
    "approved": "Paid",
    "paid": "Paid",
    "closed": "Paid",
    "overdue": "Overdue",
}

_SPEND_GROUP_ALIASES: Dict[str, str] = {
    "vendor": "vendor",
    "suppliers": "vendor",
    "supplier": "vendor",
    "category": "category",
    "categories": "category",
    "po": "po_id",
    "po_id": "po_id",
    "purchase_order": "po_id",
    "purchaseorder": "po_id",
}


def _str_clean(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _normalize_invoice_status(status: Optional[str]) -> Optional[str]:
    """Return canonical status for SQL filter, or None when no filter."""
    s = _str_clean(status)
    if not s:
        return None
    mapped = _STATUS_ALIASES.get(s.lower())
    if mapped is not None:
        return mapped
    if s in _KNOWN_INVOICE_STATUSES:
        return s
    if len(s) > 1:
        titled = s[0].upper() + s[1:].lower()
        if titled in _KNOWN_INVOICE_STATUSES:
            return titled
    return s


def _normalize_group_by(group_by: Any) -> Tuple[str, bool]:
    """
    Resolve vendor | category | po_id.
    Returns (mode, defaulted_from_unknown) where defaulted means we fell back to vendor.
    """
    raw = _str_clean(group_by) or "vendor"
    key = raw.lower().replace("-", "_").replace(" ", "_")
    if key in _SPEND_GROUP_ALIASES:
        return _SPEND_GROUP_ALIASES[key], False
    if key == "vendor" or key == "category":
        return key, False
    return "vendor", True


def _rows_to_plain(rows: Any) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        plain = {}
        for k, v in dict(row).items():
            plain[k] = float(v) if isinstance(v, Decimal) else v
        out.append(plain)
    return out


def _to_float(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, Decimal):
        return float(x)
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def get_invoices(conn, status: Optional[str] = None, due_before: Optional[str] = None, **kwargs: Any) -> Dict[str, Any]:
    """List invoices; status matching is case-insensitive with synonym support."""
    query = "SELECT * FROM acp_demo_InvoiceHeader"
    clauses: List[str] = []
    params: List[Any] = []

    canon_status = _normalize_invoice_status(status)
    if canon_status is not None:
        clauses.append("UPPER(status) = UPPER(?)")
        params.append(canon_status)

    due = _str_clean(due_before)
    if due:
        clauses.append("dueDate <= ?")
        params.append(due)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)

    rows = query_as_dicts(conn, query, params)
    invoices = _rows_to_plain(rows)
    result: Dict[str, Any] = {"invoices": invoices, "count": len(invoices)}

    if status and canon_status is not None and not invoices:
        result["_hint"] = (
            "No invoices match this filter. Demo statuses are: "
            + ", ".join(sorted(_KNOWN_INVOICE_STATUSES))
            + "."
        )
    return result


def get_invoice_detail(conn, invoice_id: Any = None, **kwargs: Any) -> Dict[str, Any]:
    """Invoice + line items, or a clear not-found structure (never None)."""
    inv_id = _str_clean(invoice_id)
    if not inv_id:
        return {"found": False, "message": "invoice_id is required", "invoice_id": None, "items": []}

    header_rows = query_as_dicts(conn, "SELECT * FROM acp_demo_InvoiceHeader WHERE ID = ?", [inv_id])
    if not header_rows:
        return {"found": False, "message": f"No invoice '{inv_id}'", "invoice_id": inv_id, "items": []}

    hdr = _rows_to_plain(header_rows)[0]
    items = _rows_to_plain(
        query_as_dicts(
            conn,
            "SELECT * FROM acp_demo_InvoiceItem WHERE invoice_ID = ? ORDER BY lineNo",
            [inv_id],
        )
    )
    hdr["items"] = items
    hdr["found"] = True
    return hdr


def match_invoice_to_po(conn, invoice_id: Any = None, **kwargs: Any) -> Dict[str, Any]:
    """Invoice vs PO comparison; safe strings and clear ok/message fields."""
    invoice_id_clean = _str_clean(invoice_id)
    po_id_kw = _str_clean(kwargs.get("po_id"))

    resolved_from_po = False
    if not invoice_id_clean and po_id_kw:
        inv_lookup = query_as_dicts(conn, "SELECT ID FROM acp_demo_InvoiceHeader WHERE po_ID = ?", [po_id_kw])
        if len(inv_lookup) > 1:
            ids = [_str_clean(r.get("ID")) for r in inv_lookup]
            return {
                "ok": False,
                "message": (
                    f"Multiple invoices ({len(ids)}) are linked to PO {po_id_kw}; "
                    "pass invoice_id to choose one."
                ),
                "invoice_id": None,
                "po_id": po_id_kw,
                "candidate_invoice_ids": ids,
            }
        if inv_lookup:
            invoice_id_clean = _str_clean(inv_lookup[0].get("ID"))
            resolved_from_po = True
        else:
            return {
                "ok": False,
                "message": f"No invoice linked to PO {po_id_kw}.",
                "invoice_id": None,
                "po_id": po_id_kw,
            }

    if not invoice_id_clean:
        return {
            "ok": False,
            "message": "Provide invoice_id and/or po_id (PO alone resolves if unique).",
            "invoice_id": None,
            "po_id": po_id_kw or None,
        }

    inv_rows = query_as_dicts(
        conn,
        "SELECT ID, po_ID, amount, currency FROM acp_demo_InvoiceHeader WHERE ID = ?",
        [invoice_id_clean],
    )
    if not inv_rows:
        return {
            "ok": False,
            "message": f"Invoice '{invoice_id_clean}' not found.",
            "invoice_id": invoice_id_clean,
            "po_id": po_id_kw or None,
        }

    inv = _rows_to_plain(inv_rows)[0]
    po_ref = _str_clean(inv.get("po_ID"))

    if not po_ref:
        return {
            "ok": False,
            "message": "This invoice has no linked purchase order.",
            "invoice": inv,
            "invoice_id": invoice_id_clean,
        }

    if po_id_kw and po_id_kw != po_ref and not resolved_from_po:
        return {
            "ok": False,
            "message": (
                f"Invoice {invoice_id_clean} is linked to PO {po_ref}, "
                f"not {po_id_kw}."
            ),
            "invoice_id": invoice_id_clean,
            "expected_po_id": po_ref,
            "po_id_requested": po_id_kw,
        }

    po_rows = query_as_dicts(
        conn, "SELECT ID, amount, currency FROM acp_demo_PurchaseOrder WHERE ID = ?", [po_ref]
    )
    if not po_rows:
        return {
            "ok": False,
            "message": f"Purchase order '{po_ref}' not found.",
            "invoice_id": invoice_id_clean,
            "po_id": po_ref,
        }

    po = _rows_to_plain(po_rows)[0]
    inv_items = _rows_to_plain(
        query_as_dicts(
            conn,
            (
                "SELECT lineNo, description, quantity, unitPrice, amount "
                "FROM acp_demo_InvoiceItem WHERE invoice_ID = ? ORDER BY lineNo"
            ),
            [invoice_id_clean],
        )
    )
    po_items = _rows_to_plain(
        query_as_dicts(
            conn,
            "SELECT lineNo, description, quantity, unitPrice, amount "
            "FROM acp_demo_POItem WHERE po_ID = ? ORDER BY lineNo",
            [po_ref],
        )
    )

    diff = _to_float(inv.get("amount")) - _to_float(po.get("amount"))
    return {
        "ok": True,
        "invoice": inv,
        "po": po,
        "totalDifference": diff,
        "invoiceItems": inv_items,
        "poItems": po_items,
        "note": "Amounts compared in their respective currencies.",
    }


def get_spend_summary(conn, group_by: Any = "vendor", **kwargs: Any) -> Dict[str, Any]:
    """PO spend rollup: vendor | category | po_id. Unknown tokens fall back to vendor with a hint."""
    requested = group_by if _str_clean(group_by) else "vendor"
    mode, unknown = _normalize_group_by(requested)

    if mode == "vendor":
        query = """
            SELECT v.name AS "grouping", SUM(po.amount) AS "totalAmount", po.currency AS "currency"
            FROM acp_demo_PurchaseOrder po
            JOIN acp_demo_Vendor v ON po.vendor_ID = v.ID
            GROUP BY v.name, po.currency
        """
    elif mode == "category":
        query = """
            SELECT v.category AS "grouping", SUM(po.amount) AS "totalAmount", po.currency AS "currency"
            FROM acp_demo_PurchaseOrder po
            JOIN acp_demo_Vendor v ON po.vendor_ID = v.ID
            GROUP BY v.category, po.currency
        """
    else:
        query = """
            SELECT po.ID AS "grouping", SUM(po.amount) AS "totalAmount", po.currency AS "currency"
            FROM acp_demo_PurchaseOrder po
            GROUP BY po.ID, po.currency
        """

    rows = _rows_to_plain(query_as_dicts(conn, query))
    result: Dict[str, Any] = {"summary": rows, "count": len(rows), "group_by": mode}
    if unknown:
        hint = (
            f"group_by {_str_clean(requested)!r} was not recognized; returning vendor rollup. "
            "Use vendor, category, or po_id."
        )
        result["_hint"] = hint
    return result
