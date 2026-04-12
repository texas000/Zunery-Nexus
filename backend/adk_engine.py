"""
ADK Engine — Simple Google ADK LlmAgent wrapper.
Tools are passed as props to LlmAgent.
"""

import json
import logging
import re
from typing import Optional

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from backend.tools.obsidian import (
    obsidian_search, obsidian_read, obsidian_create,
    obsidian_update, obsidian_delete, obsidian_list,
    set_vault_path,
)

logger = logging.getLogger("zunery.adk")

# ─── Tool registry ───────────────────────────────────────────────────────────

AVAILABLE_TOOLS = {
    "obsidian_search": obsidian_search,
    "obsidian_read": obsidian_read,
    "obsidian_create": obsidian_create,
    "obsidian_update": obsidian_update,
    "obsidian_delete": obsidian_delete,
    "obsidian_list": obsidian_list,
}

# ─── State ───────────────────────────────────────────────────────────────────

_agents_registry: dict = {}
_session_service = InMemorySessionService()


def register_agent(config: dict):
    """Register an agent config."""
    agent_id = config.get("id")
    if not agent_id:
        raise ValueError("Agent config must have an 'id'")
    _agents_registry[agent_id] = {**config, "_adk_agent": None}


def get_agents_registry() -> dict:
    return _agents_registry


# ─── Build Agent ─────────────────────────────────────────────────────────────

def _resolve_tools(tool_names: list[str]) -> list:
    """Resolve tool name strings to actual tool functions."""
    tools = []
    for name in tool_names:
        if name in AVAILABLE_TOOLS:
            tools.append(AVAILABLE_TOOLS[name])
    return tools


def _build_agent(config: dict) -> LlmAgent:
    """Build an LlmAgent from config with tools as props."""
    model_name = config.get("model", "gemma3:4b")
    provider = config.get("provider", "ollama")

    # Format model string for LiteLLM
    if provider == "ollama" and not model_name.startswith("ollama/"):
        model_name = f"ollama/{model_name}"

    tools = _resolve_tools(config.get("tools", []))

    return LlmAgent(
        name=config.get("name", "agent").replace(" ", "_").lower(),
        model=model_name,
        description=config.get("description", "A helpful assistant"),
        instruction=config.get("system_prompt", "You are a helpful assistant."),
        tools=tools,
    )


# ─── Run Agent ───────────────────────────────────────────────────────────────

async def run_agent(
    agent_id: str,
    session_id: str,
    message: str,
    history: list = None,
    model: Optional[str] = None,
    provider: str = "ollama",
    base_url: str = "http://localhost:11434",
    system_prompt: str = "",
    tools: list = None,
    temperature: float = 0.7,
) -> dict:
    """Run an LlmAgent and return the response."""
    tools = tools or []

    config = {
        "id": agent_id,
        "model": model or "gemma3:4b",
        "provider": provider,
        "base_url": base_url,
        "system_prompt": system_prompt,
        "tools": tools,
        "temperature": temperature,
        "name": _agents_registry.get(agent_id, {}).get("name", "agent"),
        "description": _agents_registry.get(agent_id, {}).get("description", ""),
    }

    # Get or build agent
    reg = _agents_registry.get(agent_id, {})
    agent = reg.get("_adk_agent")
    if agent is None:
        agent = _build_agent(config)
        if agent_id in _agents_registry:
            _agents_registry[agent_id]["_adk_agent"] = agent

    app_name = f"zunery_{agent_id[:8]}"
    runner = Runner(
        agent=agent,
        app_name=app_name,
        session_service=_session_service,
    )

    # Get or create session
    try:
        await _session_service.get_session(
            app_name=app_name, user_id="user", session_id=session_id,
        )
    except Exception:
        await _session_service.create_session(
            app_name=app_name, user_id="user", session_id=session_id,
        )

    content = genai_types.Content(
        role="user", parts=[genai_types.Part(text=message)]
    )

    response_parts = []
    async for event in runner.run_async(
        user_id="user", session_id=session_id, new_message=content,
    ):
        if hasattr(event, "is_final_response") and event.is_final_response():
            if hasattr(event, "content") and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        response_parts.append(part.text)

    return {
        "content": "".join(response_parts) if response_parts else "",
        "tool_calls": [],
    }


# ─── Orchestrate ─────────────────────────────────────────────────────────────

TOOL_DESCRIPTIONS = {
    "obsidian_search": "Search the user's LOCAL Obsidian knowledge vault",
    "obsidian_read": "Read a specific note from the user's Obsidian vault",
    "obsidian_create": "Create a new note in the user's Obsidian vault",
    "obsidian_update": "Update an existing note in the user's Obsidian vault",
    "obsidian_delete": "Delete a note from the user's Obsidian vault",
    "obsidian_list": "Browse the user's Obsidian vault folder structure",
}


async def _extract_keywords(
    message: str,
    model: str = "gemma3:4b",
    provider: str = "ollama",
    ollama_base: str = "http://localhost:11434",
) -> list[str]:
    """
    Use the LLM to extract 2-5 search keywords from the user's message.
    These keywords are used to search the Obsidian vault for relevant notes.
    Falls back to simple word extraction if LLM is unavailable.
    """
    try:
        model_name = model
        if provider == "ollama" and not model_name.startswith("ollama/"):
            model_name = f"ollama/{model_name}"

        keyword_agent = LlmAgent(
            name="keyword_extractor",
            model=model_name,
            description="Extracts search keywords from user messages",
            instruction=(
                "You are a keyword extractor. Given a user message, extract 2-5 search keywords or short phrases "
                "that would be most useful for searching a personal knowledge base (Obsidian vault) for relevant notes.\n\n"
                "Rules:\n"
                "- Extract the core topics, names, concepts, or terms\n"
                "- Include both English and Korean terms if the message contains Korean\n"
                "- Keep each keyword/phrase short (1-3 words)\n"
                "- Reply with ONLY a JSON array of strings, nothing else\n"
                '- Example: ["machine learning", "transformer", "attention mechanism"]\n'
                '- Example: ["프로젝트 관리", "project management", "일정"]'
            ),
            tools=[],
        )

        app_name = "zunery_keywords"
        runner = Runner(agent=keyword_agent, app_name=app_name, session_service=_session_service)

        import uuid
        sid = str(uuid.uuid4())
        try:
            await _session_service.create_session(app_name=app_name, user_id="user", session_id=sid)
        except Exception:
            pass

        content = genai_types.Content(
            role="user", parts=[genai_types.Part(text=f"Extract search keywords from this message:\n\n{message}")]
        )

        response_text = ""
        async for ev in runner.run_async(user_id="user", session_id=sid, new_message=content):
            if hasattr(ev, "is_final_response") and ev.is_final_response():
                if hasattr(ev, "content") and ev.content:
                    for part in ev.content.parts:
                        if hasattr(part, "text") and part.text:
                            response_text += part.text

        # Parse JSON array from response
        json_match = re.search(r"\[[\s\S]*?\]", response_text)
        if json_match:
            keywords = json.loads(json_match.group(0))
            if isinstance(keywords, list) and all(isinstance(k, str) for k in keywords):
                return keywords[:5]

    except Exception as e:
        logger.warning(f"Keyword extraction via LLM failed: {e}")

    # Fallback: simple keyword extraction (split on spaces, filter short words)
    words = re.findall(r"[가-힣]+|[a-zA-Z]{3,}", message)
    # Remove common stop words
    stop_words = {"the", "and", "for", "that", "this", "with", "from", "are", "was", "will", "can", "how", "what", "which", "about"}
    keywords = [w for w in words if w.lower() not in stop_words]
    return keywords[:5]


async def orchestrate(
    message: str,
    agents: list[dict],
    settings: dict,
) -> dict:
    """
    Orchestration logic:

    1. Extract keywords from user message, search Obsidian vault for context
    2. Route to best agent (LLM-based if multiple agents)
    3. Run chosen agent with enriched content
    """
    obsidian_enabled = settings.get("obsidian_enabled", False)
    vault_path = settings.get("obsidian_vault_path", "")
    default_model = settings.get("default_model", "")
    ollama_base = settings.get("ollama_base_url", "http://localhost:11434")

    if not agents:
        return {"ok": False, "error": "No agents available. Create at least one agent first."}

    # ── Step 1: Extract keywords & pre-fetch Obsidian context ───────────

    context = ""
    context_source = ""

    if obsidian_enabled and vault_path:
        set_vault_path(vault_path)

        # Extract search keywords from user message using the LLM
        keywords = await _extract_keywords(
            message=message,
            model=default_model or (agents[0].get("model", "gemma3:4b") if agents else "gemma3:4b"),
            provider=agents[0].get("provider", "ollama") if agents else "ollama",
            ollama_base=ollama_base,
        )
        logger.info(f"Extracted keywords: {keywords}")

        # Search Obsidian with each keyword, collect unique results
        all_results = []
        seen_paths = set()

        for kw in keywords:
            try:
                search_result = obsidian_search(query=kw, max_results=3)
                has_results = (
                    search_result
                    and not search_result.startswith("No notes found")
                    and not search_result.startswith("Obsidian error")
                )
                if has_results:
                    # Deduplicate by note path
                    for line in search_result.split("\n"):
                        path_match = re.search(r"\(([^)]+\.md)\)", line)
                        if path_match and path_match.group(1) not in seen_paths:
                            seen_paths.add(path_match.group(1))
                            all_results.append(line)
            except Exception as e:
                logger.warning(f"Obsidian search failed for keyword '{kw}': {e}")

        if all_results:
            context = "\n".join(all_results)
            context_source = "obsidian"

            # Read top matching notes for richer context (up to 3)
            note_contents = []
            for note_path in list(seen_paths)[:3]:
                try:
                    note_content = obsidian_read(path=note_path)
                    if note_content and not note_content.startswith("Read error"):
                        trimmed = note_content[:2000] + "\n...(truncated)" if len(note_content) > 2000 else note_content
                        note_contents.append(f"--- {note_path} ---\n{trimmed}")
                except Exception:
                    pass

            if note_contents:
                context += "\n\n" + "\n\n".join(note_contents)

    # ── Step 2: Build enriched content ─────────────────────────────────────

    if context:
        enriched = (
            f"{message}\n\n"
            "[SYSTEM: The orchestrator has already searched the Obsidian vault for relevant context. "
            "Do NOT call obsidian_search again — use the notes below to answer directly.]\n\n"
            f"--- Obsidian Context ---\n{context}"
        )
    else:
        enriched = message

    # ── Step 3: Agent routing ──────────────────────────────────────────────

    chosen = agents[0]
    reason = "Only available agent"

    if len(agents) > 1:
        # Build routing prompt
        agent_list_str = "\n".join(
            f'- ID: "{a["id"]}" | Name: "{a["name"]}" | Description: "{a.get("description", "General purpose agent")}"'
            + (f' | Tools: [{", ".join(a.get("tools", []))}]' if a.get("tools") else "")
            for a in agents
        )

        routing_prompt = (
            "You are a routing orchestrator. Given a user's message, decide which agent is best suited to handle it.\n\n"
            f"Available agents:\n{agent_list_str}\n\n"
            "Tool descriptions:\n"
            + "\n".join(f"- {k}: {v}" for k, v in TOOL_DESCRIPTIONS.items())
            + "\n\n"
            "ROUTING RULES:\n"
            "- If the user asks to search/find/read their notes, documents, knowledge, or Obsidian vault → pick an agent with obsidian_search or obsidian_read tools\n"
            "- If the user asks to create/save/write/update/delete notes → pick an agent with obsidian_create/obsidian_update/obsidian_delete tools\n"
            "- Always prefer the agent whose tools best match the request\n\n"
            'Reply with ONLY a JSON object (no markdown, no explanation):\n'
            '{"agent_id": "<id>", "reason": "<brief reason>"}\n\n'
            f'User message: "{message}"'
        )

        # Use default model for routing
        model = default_model or agents[0].get("model", "gemma3:4b")
        provider = agents[0].get("provider", "ollama")

        try:
            routing_config = {
                "id": "__router__",
                "name": "router",
                "model": model,
                "provider": provider,
                "base_url": ollama_base,
                "system_prompt": "You are a routing orchestrator. Reply only with JSON.",
                "tools": [],
            }
            router_agent = _build_agent(routing_config)
            app_name = "zunery_router"
            runner = Runner(agent=router_agent, app_name=app_name, session_service=_session_service)

            import uuid
            sid = str(uuid.uuid4())
            try:
                await _session_service.create_session(app_name=app_name, user_id="user", session_id=sid)
            except Exception:
                pass

            routing_content = genai_types.Content(
                role="user", parts=[genai_types.Part(text=routing_prompt)]
            )

            routing_response = ""
            async for ev in runner.run_async(user_id="user", session_id=sid, new_message=routing_content):
                if hasattr(ev, "is_final_response") and ev.is_final_response():
                    if hasattr(ev, "content") and ev.content:
                        for part in ev.content.parts:
                            if hasattr(part, "text") and part.text:
                                routing_response += part.text

            # Parse routing decision
            json_match = re.search(r"\{[\s\S]*?\}", routing_response)
            if json_match:
                parsed = json.loads(json_match.group(0))
                matched = next((a for a in agents if a["id"] == parsed.get("agent_id")), None)
                if matched:
                    chosen = matched
                    reason = parsed.get("reason", "Best match")

        except Exception as e:
            logger.warning(f"Routing LLM failed, using first agent: {e}")
            reason = "Routing failed, using default agent"

    # ── Step 4: Run chosen agent ───────────────────────────────────────────

    # Strip search tools if context was pre-fetched
    search_tools = {"obsidian_search", "obsidian_read", "obsidian_list"}
    agent_tools = chosen.get("tools", [])
    if context:
        agent_tools = [t for t in agent_tools if t not in search_tools]

    try:
        result = await run_agent(
            agent_id=chosen["id"],
            session_id=str(__import__("uuid").uuid4()),
            message=enriched,
            model=default_model or chosen.get("model"),
            provider=chosen.get("provider", "ollama"),
            base_url=ollama_base,
            system_prompt=chosen.get("system_prompt", ""),
            tools=agent_tools,
            temperature=chosen.get("temperature", 0.7),
        )
        return {
            "ok": True,
            "content": result.get("content", ""),
            "agent_id": chosen["id"],
            "agent_name": chosen.get("name", ""),
            "reason": reason,
            "context_source": context_source,
        }
    except Exception as e:
        logger.error(f"Agent execution failed: {e}")
        return {
            "ok": False,
            "content": "",
            "agent_id": chosen["id"],
            "agent_name": chosen.get("name", ""),
            "reason": reason,
            "context_source": context_source,
            "error": str(e),
        }
