#!/usr/bin/env python3
"""
Zunery Nexus - Google ADK Agent Server
Provides HTTP API to create and run ADK agents.
Communicates status via stdout (Electron IPC bridge).
"""

import sys
import json
import asyncio
import argparse
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import traceback

# ─── ADK imports (optional) ──────────────────────────────────────────────────

ADK_AVAILABLE = False
LiteLlm = None
Runner = None
InMemorySessionService = None

try:
    from google.adk.agents import Agent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types
    ADK_AVAILABLE = True
except ImportError:
    try:
        # Older ADK package structure
        from google.adk.agent import Agent
        from google.adk.models.lite_llm import LiteLlm
        from google.adk.runner import Runner
        from google.adk.session import InMemorySessionService
        ADK_AVAILABLE = True
    except ImportError:
        pass

# ─── State ───────────────────────────────────────────────────────────────────

VERSION = "1.0.0"
agents_registry: dict = {}  # id -> Agent config + adk instance
session_service = None

if ADK_AVAILABLE and InMemorySessionService:
    try:
        session_service = InMemorySessionService()
    except Exception:
        pass


# ─── Helpers ─────────────────────────────────────────────────────────────────

def log(msg: str):
    print(f"[ADK] {msg}", flush=True)

def json_response(handler: BaseHTTPRequestHandler, status: int, data: dict):
    body = json.dumps(data).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)

def read_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    body = handler.rfile.read(length)
    try:
        return json.loads(body)
    except Exception:
        return {}


def build_model(config: dict):
    """Build an ADK-compatible model from config."""
    if not ADK_AVAILABLE or LiteLlm is None:
        return None

    provider = config.get("provider", "ollama")
    model_name = config.get("model", "gemma3:latest")
    base_url = config.get("baseUrl", "http://localhost:11434")
    api_key = config.get("apiKey", "dummy")

    if provider == "ollama":
        # LiteLLM ollama format
        return LiteLlm(
            model=f"ollama/{model_name}",
            api_base=base_url,
        )
    elif provider == "litellm":
        # OpenAI-compatible via LiteLLM
        return LiteLlm(
            model=f"openai/{model_name}",
            api_base=base_url,
            api_key=api_key or "dummy",
        )
    else:
        return LiteLlm(model=model_name)


def build_adk_agent(config: dict):
    """Build an ADK Agent from config."""
    if not ADK_AVAILABLE:
        return None

    model = build_model(config)
    if model is None:
        return None

    kwargs = {
        "name": config.get("name", "agent").replace(" ", "_").lower(),
        "model": model,
        "description": config.get("description", "A helpful assistant"),
        "instruction": config.get("system_prompt", "You are a helpful assistant."),
    }

    try:
        return Agent(**kwargs)
    except Exception as e:
        log(f"Error building agent: {e}")
        return None


async def run_agent_async(agent_config: dict, session_id: str, message: str, history: list) -> str:
    """Run an ADK agent and return the response text."""
    if not ADK_AVAILABLE or Runner is None or session_service is None:
        return run_agent_fallback(agent_config, message)

    adk_agent = agent_config.get("_adk_instance")
    if adk_agent is None:
        adk_agent = build_adk_agent(agent_config)
        if adk_agent is None:
            return run_agent_fallback(agent_config, message)
        agent_config["_adk_instance"] = adk_agent

    app_name = f"zunery_nexus_{agent_config['id'][:8]}"

    try:
        runner = Runner(
            agent=adk_agent,
            app_name=app_name,
            session_service=session_service,
        )

        # Get or create session
        try:
            session = await session_service.get_session(
                app_name=app_name,
                user_id="user",
                session_id=session_id,
            )
        except Exception:
            session = await session_service.create_session(
                app_name=app_name,
                user_id="user",
                session_id=session_id,
            )

        # Build content
        try:
            from google.genai import types as genai_types
            content = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=message)]
            )
        except Exception:
            # Fallback content format
            content = {"role": "user", "parts": [{"text": message}]}

        response_parts = []
        async for event in runner.run_async(
            user_id="user",
            session_id=session_id,
            new_message=content,
        ):
            if hasattr(event, 'is_final_response') and event.is_final_response():
                if hasattr(event, 'content') and event.content:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            response_parts.append(part.text)

        return "".join(response_parts) if response_parts else "No response generated."

    except Exception as e:
        log(f"ADK run error: {e}\n{traceback.format_exc()}")
        return run_agent_fallback(agent_config, message)


def run_agent_fallback(agent_config: dict, message: str) -> str:
    """Fallback: call LiteLLM directly if ADK is unavailable."""
    try:
        import litellm
        provider = agent_config.get("provider", "ollama")
        model = agent_config.get("model", "gemma3:latest")
        base_url = agent_config.get("baseUrl", "http://localhost:11434")
        api_key = agent_config.get("apiKey", "dummy")
        system_prompt = agent_config.get("system_prompt", "")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})

        if provider == "ollama":
            resp = litellm.completion(
                model=f"ollama/{model}",
                messages=messages,
                api_base=base_url,
            )
        else:
            resp = litellm.completion(
                model=f"openai/{model}",
                messages=messages,
                api_base=base_url,
                api_key=api_key or "dummy",
            )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"Error: {e}"


# ─── HTTP Handler ─────────────────────────────────────────────────────────────

class AdkHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default HTTP logs

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            json_response(self, 200, {
                "ok": True,
                "version": VERSION,
                "adk_available": ADK_AVAILABLE,
                "agents": len(agents_registry),
            })
        elif path == "/agents":
            safe = {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")}
                    for k, v in agents_registry.items()}
            json_response(self, 200, {"agents": safe})
        else:
            json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/agents":
            data = read_body(self)
            agent_id = data.get("id")
            if not agent_id:
                json_response(self, 400, {"error": "id required"})
                return

            agents_registry[agent_id] = {**data, "_adk_instance": None}
            log(f"Registered agent: {data.get('name', agent_id)}")
            json_response(self, 200, {"ok": True, "id": agent_id})

        elif path.startswith("/agents/") and path.endswith("/run"):
            parts = path.split("/")
            # /agents/{id}/run
            if len(parts) != 4:
                json_response(self, 404, {"error": "Not found"})
                return

            agent_id = parts[2]
            if agent_id not in agents_registry:
                json_response(self, 404, {"error": f"Agent {agent_id} not registered"})
                return

            data = read_body(self)
            session_id = data.get("session_id", "default")
            message = data.get("message", "")
            history = data.get("history", [])

            try:
                # Run in event loop
                loop = asyncio.new_event_loop()
                content = loop.run_until_complete(
                    run_agent_async(agents_registry[agent_id], session_id, message, history)
                )
                loop.close()
                json_response(self, 200, {"ok": True, "content": content})
            except Exception as e:
                log(f"Run error: {e}")
                json_response(self, 500, {"error": str(e)})

        else:
            json_response(self, 404, {"error": "Not found"})


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Zunery Nexus ADK Server")
    parser.add_argument("--port", type=int, default=7891)
    args = parser.parse_args()

    server = HTTPServer(("127.0.0.1", args.port), AdkHandler)

    log(f"Starting on port {args.port} (ADK: {'available' if ADK_AVAILABLE else 'not installed'})")

    # Signal ready to Electron
    print("ADK_READY", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
