"""Chat router — POST /chat and POST /orchestrate endpoints."""

import logging
import traceback

from fastapi import APIRouter

from backend.models import (
    ChatRequest, ChatResponse,
    OrchestrateRequest, OrchestrateResponse,
)
from backend.adk_engine import run_agent, orchestrate as run_orchestrate

logger = logging.getLogger("zunery.chat")

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    try:
        result = await run_agent(
            agent_id=req.agent_id,
            session_id=req.session_id,
            message=req.message,
            history=req.history,
            model=req.model,
            provider=req.provider,
            base_url=req.base_url,
            system_prompt=req.system_prompt,
            tools=req.tools,
            temperature=req.temperature,
        )
        return ChatResponse(
            ok=True,
            content=result.get("content", ""),
            tool_calls=result.get("tool_calls", []),
        )
    except Exception as e:
        logger.error(f"[chat] error: {e}\n{traceback.format_exc()}")
        return ChatResponse(ok=False, content="", error=str(e))


@router.post("/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_endpoint(req: OrchestrateRequest) -> OrchestrateResponse:
    try:
        agents_dicts = [a.model_dump() for a in req.agents]
        settings_dict = req.settings.model_dump()

        result = await run_orchestrate(
            message=req.message,
            agents=agents_dicts,
            settings=settings_dict,
        )
        return OrchestrateResponse(**result)
    except Exception as e:
        logger.error(f"[orchestrate] error: {e}\n{traceback.format_exc()}")
        return OrchestrateResponse(ok=False, error=str(e))
