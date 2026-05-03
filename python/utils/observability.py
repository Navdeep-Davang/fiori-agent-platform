import os
import uuid
import logging
import base64
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Constants for headers
CORRELATION_ID_HEADER = "X-Acp-Correlation-Id"
LANGFUSE_TRACE_ID_HEADER = "X-Langfuse-Trace-Id"


def _langfuse_otel_enabled() -> bool:
    v = (os.environ.get("ACP_LANGFUSE_OTEL") or os.environ.get("LANGFUSE_OTEL") or "").strip().lower()
    return v in ("1", "true", "yes")


def configure_langfuse_otel_env() -> None:
    """
    OpenTelemetry export to Langfuse is **opt-in** (``ACP_LANGFUSE_OTEL=true``).
    Without it, Langfuse CallbackHandler still works for ingestion, but the OTLP
    HTTP exporter is not configured — avoiding connection spam to localhost:3000 when
    Langfuse is not running.
    """
    if not _langfuse_otel_enabled():
        return

    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        host = (os.environ.get("LANGFUSE_HOST") or "").strip().rstrip("/")
        if not host:
            logger.debug("ACP_LANGFUSE_OTEL set but LANGFUSE_HOST empty — skip OTLP endpoint")
            return
        if "/api/public/otel" in host:
            endpoint = host
        else:
            endpoint = f"{host}/api/public/otel"
        os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = endpoint
        logger.info("Langfuse OTLP exporter enabled: %s", endpoint)

    if os.environ.get("OTEL_EXPORTER_OTLP_HEADERS"):
        return
    pk = (os.environ.get("LANGFUSE_PUBLIC_KEY") or "").strip()
    sk = (os.environ.get("LANGFUSE_SECRET_KEY") or "").strip()
    if not (pk and sk):
        return
    token = base64.b64encode(f"{pk}:{sk}".encode("utf-8")).decode("ascii")
    os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = (
        f"Authorization=Basic {token},x-langfuse-ingestion-version=4"
    )


def get_correlation_id(headers: Dict) -> str:
    """Extract correlation ID from headers or generate a new one."""
    # Try multiple common header names
    cid = headers.get(CORRELATION_ID_HEADER) or \
          headers.get(CORRELATION_ID_HEADER.lower()) or \
          headers.get("x-request-id") or \
          headers.get("X-Request-Id")
    
    if not cid:
        cid = str(uuid.uuid4())
        logger.debug(f"Generated new correlation ID: {cid}")
    return cid

def get_observability_headers(correlation_id: str, langfuse_trace_id: Optional[str] = None) -> Dict[str, str]:
    """Build headers for downstream requests."""
    headers = {CORRELATION_ID_HEADER: correlation_id}
    if langfuse_trace_id:
        headers[LANGFUSE_TRACE_ID_HEADER] = langfuse_trace_id
    return headers

def sanitize_for_logging(data: Dict) -> Dict:
    """Basic sanitization of sensitive data for logs."""
    # In a real app, this would be more comprehensive
    sensitive_keys = {"password", "secret", "token", "authorization", "api_key", "cookie"}
    sanitized = {}
    for k, v in data.items():
        if any(sk in k.lower() for sk in sensitive_keys):
            sanitized[k] = "***"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_for_logging(v)
        else:
            sanitized[k] = v
    return sanitized
