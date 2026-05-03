import os
import httpx
import logging
from temporalio import activity
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# The MCP Client (Layer 5) is the runner that handles protocol details.
# Default to localhost:8005 if not specified.
MCP_CLIENT_URL = os.getenv("MCP_CLIENT_URL", "http://localhost:8005")

@activity.defn
async def call_mcp_tool(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Temporal Activity to call a tool via the MCP Client.
    Expected params: { "name": str, "arguments": dict, "agentId": str }
    """
    logger.info(f"Activity: Calling tool '{params.get('name')}' via {MCP_CLIENT_URL}")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        rpc_request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": params,
            "id": 1
        }
        
        try:
            response = await client.post(f"{MCP_CLIENT_URL}/mcp/rpc", json=rpc_request)
            response.raise_for_status()
            rpc_response = response.json()
            
            if "error" in rpc_response:
                logger.error(f"MCP Client returned RPC error: {rpc_response['error']}")
                raise Exception(f"Tool execution failed: {rpc_response['error'].get('message', 'Unknown error')}")
                
            return rpc_response.get("result", {})
            
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to MCP Client at {MCP_CLIENT_URL}: {str(e)}")
            raise Exception(f"MCP Client connection failed: {str(e)}")
        except Exception as e:
            logger.exception("Unexpected error in call_mcp_tool activity")
            raise

@activity.defn
async def list_mcp_tools() -> List[Dict[str, Any]]:
    """
    Temporal Activity to discover available tools via the MCP Client.
    """
    logger.info(f"Activity: Listing tools via {MCP_CLIENT_URL}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        rpc_request = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "id": 1
        }
        
        try:
            response = await client.post(f"{MCP_CLIENT_URL}/mcp/rpc", json=rpc_request)
            response.raise_for_status()
            rpc_response = response.json()
            
            if "error" in rpc_response:
                logger.error(f"MCP Client returned RPC error: {rpc_response['error']}")
                raise Exception(f"Failed to list tools: {rpc_response['error'].get('message', 'Unknown error')}")
                
            # The result from mcp_client.mcp_rpc for tools/list is {"tools": [...]}
            result = rpc_response.get("result", {})
            return result.get("tools", [])
            
        except Exception as e:
            logger.exception("Unexpected error in list_mcp_tools activity")
            raise
