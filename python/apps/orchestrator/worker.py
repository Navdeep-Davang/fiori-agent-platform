import asyncio
import os
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from python.apps.orchestrator.workflows.agent_workflow import AgentWorkflow
from python.apps.orchestrator.activities.tool_activities import call_mcp_tool, list_mcp_tools

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEMPORAL_URL = os.getenv("TEMPORAL_URL", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = os.getenv("TASK_QUEUE", "agent-task-queue")

async def run_worker():
    # Connect to Temporal
    client = await Client.connect(TEMPORAL_URL, namespace=TEMPORAL_NAMESPACE)
    
    # Run the worker
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[AgentWorkflow],
        activities=[call_mcp_tool, list_mcp_tools],
    )
    
    logger.info(f"Starting Temporal worker on queue: {TASK_QUEUE}")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(run_worker())
