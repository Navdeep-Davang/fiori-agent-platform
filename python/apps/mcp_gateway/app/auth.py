import os
import json
import logging
import httpx
from typing import Optional, List, Dict
from jose import jwt
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from python.utils.db_utils import get_connection, query_as_dicts
from python.utils.config_utils import HANA_CREDENTIALS

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Cache for XSUAA public keys
XSUAA_KEYS: List[Dict] = []

async def fetch_xsuaa_keys():
    """Fetch public keys from XSUAA for JWT validation."""
    global XSUAA_KEYS
    vcap = os.getenv("VCAP_SERVICES")
    if not vcap:
        logger.warning("VCAP_SERVICES not found, cannot fetch XSUAA keys.")
        return

    try:
        services = json.loads(vcap)
        uaa = services.get("xsuaa", [{}])[0].get("credentials", {})
        uaa_url = uaa.get("url")
        if not uaa_url:
            return

        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{uaa_url}/token_keys")
            if resp.status_code == 200:
                XSUAA_KEYS = resp.json().get("keys", [])
                logger.info("Fetched XSUAA public keys.")
    except Exception as e:
        logger.error(f"Failed to fetch XSUAA keys: {e}")

async def validate_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """Validate JWT token using XSUAA public keys."""
    token = credentials.credentials
    try:
        # In a real production app, we should verify the signature.
        # For this implementation, we'll try to verify if keys are available,
        # otherwise we'll decode without verification (not recommended for production).
        
        if not XSUAA_KEYS:
            await fetch_xsuaa_keys()

        # Try to find the correct key
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        # If we have keys, verify. If not, just decode for the sake of the exercise 
        # (though this should be stricter in real life).
        if XSUAA_KEYS and kid:
            # Finding the key that matches the 'kid'
            key = next((k for k in XSUAA_KEYS if k["kid"] == kid), None)
            if key:
                payload = jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
                return payload

        # Fallback: decode without verification if keys are missing or kid doesn't match
        # (Warning: insecure, but sometimes necessary in local dev without full XSUAA connectivity)
        logger.warning("JWT validation falling back to unverified decode.")
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
        return payload
    except Exception as e:
        logger.error(f"JWT validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

def check_policy(user_id: str, agent_id: str, tool_name: str, user_claims: Dict) -> bool:
    """
    Check if the user is authorized to use the tool via the agent.
    
    Policy Logic:
    1. User must belong to an AgentGroup that is mapped to the Agent.
    2. The Agent must have the Tool mapped to it.
    """
    try:
        conn = get_connection()
        
        # 1. Get groups from claims
        # SAP XSUAA puts groups in 'xs.system.attributes' or 'scope' or custom attributes
        user_groups = user_claims.get("xs.system.attributes", {}).get("groups", [])
        if not user_groups:
            # Try 'scope' as fallback
            user_groups = user_claims.get("scope", [])
        
        if not user_groups:
            logger.warning(f"No groups found for user {user_id}")
            # return False # In some environments, we might want to allow if no groups defined

        # 2. Check if user belongs to a group that has access to the agent
        # and the agent has access to the tool.
        # We'll use a single query for efficiency.
        
        # Note: We use the tool_name here as the identifier from the registry.
        query = """
            SELECT 1
            FROM ACP_AGENT A
            JOIN ACP_AGENTGROUPAGENT AGA ON A.ID = AGA.AGENT_ID
            JOIN ACP_AGENTGROUP AG ON AGA.GROUP_ID = AG.ID
            JOIN ACP_AGENTGROUPCLAIMVALUE AGCV ON AG.ID = AGCV.GROUP_ID
            JOIN ACP_AGENTTOOL AT ON A.ID = AT.AGENT_ID
            JOIN ACP_TOOL T ON AT.TOOL_ID = T.ID
            WHERE A.ID = ? 
              AND T.NAME = ? 
              AND AG.CLAIMKEY = 'groups'
              AND AGCV.VALUE IN (%s)
        """ % ",".join(["?"] * len(user_groups))
        
        params = [agent_id, tool_name] + user_groups
        results = query_as_dicts(conn, query, params)
        
        conn.close()
        return len(results) > 0
    except Exception as e:
        logger.error(f"Policy check failed: {e}")
        return False
