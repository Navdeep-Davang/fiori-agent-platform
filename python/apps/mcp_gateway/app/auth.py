import os
import json
import logging
import httpx
from typing import List, Dict, Optional
from jose import jwt
from jose.exceptions import JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from python.utils.db_utils import get_connection, query_as_dicts

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Cached XSUAA JWKS (from /token_keys)
XSUAA_KEYS: List[Dict] = []


def _xsuaa_uaa_base_url() -> Optional[str]:
    """
    OAuth server base URL (same as xsuaa binding credential `url`) used to GET /token_keys.
    On CF: VCAP_SERVICES. Locally: set XS_UAA_URL to that value from your xsuaa / XSUAA service key.
    """
    vcap = os.getenv("VCAP_SERVICES", "").strip()
    if vcap:
        try:
            services = json.loads(vcap)
            uaa = services.get("xsuaa", [{}])[0].get("credentials", {})
            u = uaa.get("url")
            if u:
                return str(u).strip().rstrip("/")
        except (json.JSONDecodeError, IndexError, TypeError) as e:
            logger.error("Parsing VCAP_SERVICES for xsuaa.url failed: %s", e)
    explicit = os.getenv("XS_UAA_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return None


async def refresh_xsuaa_jwks(*, force: bool = False) -> bool:
    """
    Fetch JWKS from {uaa.url}/token_keys and cache keys. Returns True if at least one key was loaded.
    When ``force`` is True, ignores any in-memory cache and refetches from the network (JWKS rotation).
    """
    global XSUAA_KEYS
    base = _xsuaa_uaa_base_url()
    if not base:
        XSUAA_KEYS = []
        logger.error(
            "MCP Gateway cannot load XSUAA JWKS: set VCAP_SERVICES (xsuaa binding on CF) or "
            "XS_UAA_URL to the oauth base URL from your xsuaa service key (credential `url`)."
        )
        return False
    try:
        url = f"{base}/token_keys"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            logger.error("XSUAA token_keys request failed (%s): %s", resp.status_code, resp.text[:200])
            if force:
                XSUAA_KEYS = []
            return False
        keys = resp.json().get("keys") or []
        if not keys:
            logger.error("XSUAA token_keys returned no keys from %s", url)
            XSUAA_KEYS = []
            return False
        XSUAA_KEYS = keys
        logger.info("Loaded %d XSUAA signing key(s) from %s", len(keys), url)
        return True
    except Exception as e:
        logger.error("Failed to fetch XSUAA JWKS: %s", e)
        if force:
            XSUAA_KEYS = []
        return False


def _jwk_for_kid(keys: List[Dict], kid: Optional[str]):
    if not kid:
        return None
    return next((k for k in keys if k.get("kid") == kid), None)


async def validate_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """
    Require a valid XSUAA access-token signature against JWKS (no unverified fallback).
    Claims: audience not enforced (SAP tokens vary); signature and expiry are enforced by python-jose.
    """
    token = credentials.credentials
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        logger.warning("Invalid JWT header: %s", e)
        raise HTTPException(status_code=401, detail="Invalid token")

    kid = unverified_header.get("kid")
    alg = unverified_header.get("alg") or "RS256"
    if not kid:
        raise HTTPException(
            status_code=401,
            detail="JWT is missing kid; cannot verify against XSUAA JWKS",
        )

    if not XSUAA_KEYS:
        loaded = await refresh_xsuaa_jwks()
        if not loaded:
            raise HTTPException(
                status_code=401,
                detail="JWT verification unavailable: XSUAA JWKS could not be loaded (check XS_UAA_URL or xsuaa binding)",
            )

    jwk = _jwk_for_kid(XSUAA_KEYS, kid)
    if not jwk:
        await refresh_xsuaa_jwks(force=True)
        jwk = _jwk_for_kid(XSUAA_KEYS, kid)
    if not jwk:
        raise HTTPException(
            status_code=401,
            detail="Unknown JWT signing key (kid). Token may use a rotated key retry after JWKS refresh.",
        )

    try:
        payload = jwt.decode(
            token,
            jwk,
            algorithms=[alg],
            options={
                "verify_aud": False,
            },
        )
        return payload
    except JWTError as e:
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def _dept_value_empty(value) -> bool:
    if value is None:
        return True
    if isinstance(value, list):
        return len(value) == 0 or str(value[0]).strip() == ""
    return str(value).strip() == ""


def _claim_pairs_from_jwt(user_claims: Dict) -> List[tuple]:
    """
    Claim (key, value) pairs usable for gateway policy, aligned with CAP `claimPairs`:
    flattened `xs.user.attributes` (+ top-level dept-style claims + customAttribute alias → dept).
    """
    attr: Dict[str, object] = {}
    xs = user_claims.get("xs.user.attributes") or user_claims.get("xs_user_attributes") or {}
    if isinstance(xs, dict):
        for ck, raw in xs.items():
            if raw is None:
                continue
            val = raw[0] if isinstance(raw, list) and raw else raw
            if val is None or str(val).strip() == "":
                continue
            attr[str(ck)] = val
    flat_keys = (
        "dept",
        "customAttribute1",
        "CustomAttribute1",
        "department",
        "Department",
        "deptCode",
        "Dept",
    )
    for fk in flat_keys:
        if fk not in user_claims or user_claims[fk] is None:
            continue
        rv = user_claims[fk]
        val = rv[0] if isinstance(rv, list) and rv else rv
        if val is None or str(val).strip() == "":
            continue
        if fk not in attr:
            attr[fk] = val
    if _dept_value_empty(attr.get("dept")):
        for alt in ("customAttribute1", "CustomAttribute1", "department", "Department"):
            if alt in attr and not _dept_value_empty(attr.get(alt)):
                attr["dept"] = attr[alt]
                break

    pairs = []
    for key, raw in attr.items():
        if raw is None:
            continue
        for val in raw if isinstance(raw, list) else [raw]:
            if val is None or str(val).strip() == "":
                continue
            pairs.append((str(key).strip(), str(val).strip()))
    return pairs


def _trusted_cap_dept_from_headers(request_headers) -> Optional[str]:
    """
    When CAP → Python → Gateway is a trusted hop, Python may forward the same
    ``X-Internal-Token`` (ACP_INTERNAL_TOKEN) and ``X-AC-Dept`` CAP already computed
    (see srv/python-trust.js). Use that dept only if the JWT did not already carry ``dept``,
    so brokered user.attr matches HANA policy even when the raw access token omits
    ``xs.user.attributes``.
    """
    if request_headers is None:
        return None
    expected = os.getenv("ACP_INTERNAL_TOKEN", "").strip()
    if not expected:
        return None
    got = request_headers.get("x-internal-token")
    if got != expected:
        return None
    dept = (request_headers.get("x-ac-dept") or "").strip()
    return dept or None


def check_policy(
    user_id: str,
    agent_id: str,
    tool_name: str,
    user_claims: Dict,
    request_headers=None,
) -> bool:
    """
    Check whether JWT claims authorize this user for tool_name via agent_id.

    Mirrors CAP `srv/server.js`: match AgentGroup CLAIMKEY / VALUE against flattened
    user attributes (e.g. dept=procurement), and require the agent to expose the tool.
    """
    pairs = list(_claim_pairs_from_jwt(user_claims))
    had_jwt_dept_before = any(str(p[0]).lower() == "dept" for p in pairs)
    trusted_dept = _trusted_cap_dept_from_headers(request_headers)
    if trusted_dept and not had_jwt_dept_before:
        pairs.append(("dept", trusted_dept))
    if not pairs:
        logger.warning("Gateway policy: no claim pairs from JWT for user=%s", user_id)
        return False
    query = """
        SELECT 1 FROM ACP_AGENT A
        INNER JOIN ACP_AGENTTOOL AGTOOL ON A.ID = AGTOOL.AGENT_ID
        INNER JOIN ACP_TOOL T ON AGTOOL.TOOL_ID = T.ID
        INNER JOIN ACP_AGENTGROUPAGENT AGA ON A.ID = AGA.AGENT_ID
        INNER JOIN ACP_AGENTGROUP G ON AGA.GROUP_ID = G.ID
        INNER JOIN ACP_AGENTGROUPCLAIMVALUE V ON V.GROUP_ID = G.ID
        WHERE A.ID = ?
          AND T.NAME = ?
          AND G.STATUS = 'Active'
          AND LOWER(TRIM(V.VALUE)) = LOWER(TRIM(?))
          AND LOWER(TRIM(G.CLAIMKEY)) = LOWER(TRIM(?))
        """
    try:
        conn = get_connection()
        try:
            matched = False
            for ck, cv in pairs:
                rows = query_as_dicts(conn, query, [agent_id, tool_name, cv, ck])
                if rows:
                    matched = True
                    break
            return matched
        finally:
            conn.close()
    except Exception as e:
        logger.error("Policy check failed: %s", e)
        return False
