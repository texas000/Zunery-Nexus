"""Agent management router."""

import logging
from fastapi import APIRouter

from backend.models import AgentConfig
from backend.adk_engine import register_agent, get_agents_registry

logger = logging.getLogger("zunery.agents")

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
async def list_agents():
    """List all registered agents."""
    registry = get_agents_registry()
    safe = {
        k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")}
        for k, v in registry.items()
    }
    return {"agents": safe}


@router.post("")
async def create_agent(config: AgentConfig):
    """Register a new agent."""
    register_agent(config.model_dump())
    logger.info(f"Registered agent: {config.name} ({config.id})")
    return {"ok": True, "id": config.id}
