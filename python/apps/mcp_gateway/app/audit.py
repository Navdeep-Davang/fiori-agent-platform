import uuid
import logging
import json
from datetime import datetime
from python.utils.db_utils import get_connection

logger = logging.getLogger(__name__)

def log_audit(
    user_id: str,
    agent_id: str,
    tool_name: str,
    arguments: dict,
    status: str,
    error_message: str = None,
    correlation_id: str = None,
    duration_ms: int = 0
):
    """Log a tool call to the HANA AuditLog table."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        audit_id = str(uuid.uuid4())
        
        query = """
            INSERT INTO ACP_AUDITLOG (
                ID, USERID, AGENTID, TOOLNAME, ARGUMENTS, STATUS, ERRORMESSAGE, CORRELATIONID, DURATIONMS
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        params = (
            audit_id,
            user_id,
            agent_id,
            tool_name,
            json.dumps(arguments),
            status,
            error_message,
            correlation_id,
            duration_ms
        )
        
        cursor.execute(query, params)
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
