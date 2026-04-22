import os
import json
from dotenv import load_dotenv

# Load .env from project root if it exists
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

# LLM Config
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "google-genai")
LLM_API_KEY = os.getenv("LLM_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.1-flash-lite-preview")

# Phase 9 — bounded context (rough token estimate: len(text)//4)
SUMMARY_TOKEN_THRESHOLD = int(os.getenv("SUMMARY_TOKEN_THRESHOLD", "6000"))

# Langfuse (Phase 6b) — optional; never commit keys
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").strip()

# Python App Config
PYTHON_INTERNAL_BASE_URL = os.getenv("PYTHON_URL", "http://localhost:8000")

def get_hana_credentials():
    """Extract HANA credentials from VCAP_SERVICES or env vars."""
    vcap = os.getenv("VCAP_SERVICES")
    if vcap:
        try:
            services = json.loads(vcap)
            if "hana" in services:
                return services["hana"][0]["credentials"]
        except (json.JSONDecodeError, KeyError, IndexError):
            pass
            
    # Fallback to individual env vars for local dev against remote HANA
    return {
        "host": os.getenv("HANA_HOST"),
        "port": os.getenv("HANA_PORT"),
        "user": os.getenv("HANA_USER"),
        "password": os.getenv("HANA_PASSWORD"),
        "schema": os.getenv("HANA_SCHEMA")
    }

HANA_CREDENTIALS = get_hana_credentials()
