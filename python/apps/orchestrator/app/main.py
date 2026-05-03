import asyncio
import logging
from fastapi import FastAPI
from ..worker import run_worker

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Orchestrator Engine (Worker Node)")

@app.on_event("startup")
async def startup_event():
    """Start the Temporal worker in the background on app startup."""
    logger.info("Starting Temporal worker background task...")
    # Run the worker in a background task so it doesn't block the FastAPI event loop
    asyncio.create_task(run_worker())

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "orchestrator-engine", "worker": "running"}
