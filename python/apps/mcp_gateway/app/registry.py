import logging
from typing import Dict, Optional
from python.utils.db_utils import get_connection, query_as_dicts

logger = logging.getLogger(__name__)

class RoutingRegistry:
    def __init__(self):
        self._registry: Dict[str, str] = {}  # tool_name -> base_url
        self._tool_id_map: Dict[str, str] = {} # tool_name -> tool_id

    def get_url(self, tool_name: str) -> Optional[str]:
        return self._registry.get(tool_name)

    def get_tool_id(self, tool_name: str) -> Optional[str]:
        return self._tool_id_map.get(tool_name)

    def refresh(self):
        """Rebuild the registry from HANA."""
        logger.info("Refreshing routing registry from HANA...")
        try:
            conn = get_connection()
            # Join Tool and McpServer to get the base URL
            query = """
                SELECT T.NAME as TOOL_NAME, T.ID as TOOL_ID, S.BASEURL 
                FROM ACP_TOOL T
                JOIN ACP_MCPSERVER S ON T.SERVER_ID = S.ID
                WHERE T.STATUS = 'Active' AND S.STATUS = 'Active'
            """
            results = query_as_dicts(conn, query)
            
            new_registry = {}
            new_tool_id_map = {}
            for row in results:
                new_registry[row["TOOL_NAME"]] = row["BASEURL"]
                new_tool_id_map[row["TOOL_NAME"]] = row["TOOL_ID"]
            
            self._registry = new_registry
            self._tool_id_map = new_tool_id_map
            logger.info(f"Registry refreshed: {len(self._registry)} tools loaded.")
            conn.close()
        except Exception as e:
            logger.error(f"Failed to refresh registry: {e}")
            raise

# Global singleton
registry = RoutingRegistry()
