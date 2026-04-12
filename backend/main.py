#!/usr/bin/env python3
"""
Zunery Nexus — FastAPI Backend Server
Electron spawns this server as a subprocess and communicates via HTTP.

Run:
    uvicorn backend.main:app --host 127.0.0.1 --port 7891
    python -m backend.main --port 7891
"""

import sys
import argparse
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.models import HealthResponse
from backend.routers.chat import router as chat_router
from backend.routers.agents import router as agents_router
from backend.routers.tools_router import router as tools_router
from backend.adk_engine import get_agents_registry

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("zunery")

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Zunery Nexus API",
    version="2.0.0",
    description="AI Agent backend for Zunery Nexus desktop app",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(agents_router)
app.include_router(tools_router)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        ok=True,
        version="2.0.0",
        agents=len(get_agents_registry()),
    )


@app.on_event("startup")
async def startup():
    logger.info("Zunery Nexus backend ready")
    print("ADK_READY", flush=True)


# ─── CLI entry point ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Zunery Nexus FastAPI Backend")
    parser.add_argument("--port", type=int, default=7891)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
