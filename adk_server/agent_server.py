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
google_search_tool = None

# Try Google's built-in search tool first
try:
    from google.adk.agents import Agent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types
    ADK_AVAILABLE = True
    try:
        from google.adk.tools import google_search as _google_search
        google_search_tool = _google_search
    except ImportError:
        pass
except ImportError:
    try:
        # Older ADK package structure
        from google.adk.agent import Agent
        from google.adk.models.lite_llm import LiteLlm
        from google.adk.runner import Runner
        from google.adk.session import InMemorySessionService
        ADK_AVAILABLE = True
        try:
            from google.adk.tools import google_search as _google_search
            google_search_tool = _google_search
        except ImportError:
            pass
    except ImportError:
        pass

# ─── Custom Web Search Tool (Playwright-based) ───────────────────────────────

custom_search_tool = None
fetch_content_tool = None
_direct_search_fn = None   # raw search(query, max_results) -> dict
_direct_fetch_fn = None    # raw fetch_content(url) -> dict

try:
    from web_search_tool import (
        google_search as _ws_google_search,
        fetch_webpage as _ws_fetch_webpage,
        search as _ws_search,
        fetch_content as _ws_fetch_content,
    )
    _direct_search_fn = _ws_search
    _direct_fetch_fn = _ws_fetch_content

    # ADK requires FunctionTool wrapping — it reads type annotations & docstring
    try:
        from google.adk.tools.function_tool import FunctionTool
        custom_search_tool = FunctionTool(_ws_google_search)
        fetch_content_tool = FunctionTool(_ws_fetch_webpage)
        print("[ADK] Web search tools wrapped with FunctionTool (ADK native)", flush=True)
    except Exception as e:
        # FunctionTool not available — pass raw callables (ADK may auto-wrap)
        custom_search_tool = _ws_google_search
        fetch_content_tool = _ws_fetch_webpage
        print(f"[ADK] Web search tools loaded as raw callables (FunctionTool unavailable: {e})", flush=True)

except ImportError as e:
    print(f"[ADK] web_search_tool not available: {e}", flush=True)

# ─── Obsidian Vault Tool ────────────────────────────────────────────────────

_obsidian_available = False
_obsidian_tools = {}  # ADK FunctionTool wrapped obsidian tools

try:
    from obsidian_tool import (
        obsidian_search as _obs_search,
        obsidian_read as _obs_read,
        obsidian_create as _obs_create,
        obsidian_update as _obs_update,
        obsidian_delete as _obs_delete,
        obsidian_list as _obs_list,
        search_notes as _obs_search_raw,
        read_note as _obs_read_raw,
        create_note as _obs_create_raw,
        update_note as _obs_update_raw,
        delete_note as _obs_delete_raw,
        list_notes as _obs_list_raw,
        set_vault_path as _obs_set_vault_path,
    )
    _obsidian_available = True

    # Wrap for ADK
    try:
        from google.adk.tools.function_tool import FunctionTool
        _obsidian_tools = {
            "obsidian_search": FunctionTool(_obs_search),
            "obsidian_read": FunctionTool(_obs_read),
            "obsidian_create": FunctionTool(_obs_create),
            "obsidian_update": FunctionTool(_obs_update),
            "obsidian_delete": FunctionTool(_obs_delete),
            "obsidian_list": FunctionTool(_obs_list),
        }
        print("[ADK] Obsidian tools wrapped with FunctionTool", flush=True)
    except Exception as e:
        _obsidian_tools = {
            "obsidian_search": _obs_search,
            "obsidian_read": _obs_read,
            "obsidian_create": _obs_create,
            "obsidian_update": _obs_update,
            "obsidian_delete": _obs_delete,
            "obsidian_list": _obs_list,
        }
        print(f"[ADK] Obsidian tools loaded as raw callables (FunctionTool unavailable: {e})", flush=True)

except ImportError as e:
    print(f"[ADK] obsidian_tool not available: {e}", flush=True)

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
    model_name = config.get("model", "gemma4:26b")
    base_url = config.get("baseUrl", "http://localhost:11434")
    api_key = config.get("apiKey", "dummy")

    # Ollama via ADK's LiteLlm adapter
    return LiteLlm(
        model=f"ollama/{model_name}",
        api_base=base_url,
    )


def build_adk_agent(config: dict):
    """Build an ADK Agent from config."""
    if not ADK_AVAILABLE:
        return None

    model = build_model(config)
    if model is None:
        return None

    # Build tools list from agent config
    agent_tools = []
    tool_names = config.get("tools", [])

    if "web_search" in tool_names:
        # Prefer Google's built-in search tool, fallback to custom Playwright-based tool
        if google_search_tool is not None:
            agent_tools.append(google_search_tool)
            log(f"Agent '{config.get('name')}' — google_search tool enabled (Google ADK)")
        elif custom_search_tool is not None:
            agent_tools.append(custom_search_tool)
            log(f"Agent '{config.get('name')}' — google_search tool enabled (Playwright)")
        else:
            log(f"Agent '{config.get('name')}' — web_search requested but no search tool available")

    if "fetch_content" in tool_names and fetch_content_tool is not None:
        agent_tools.append(fetch_content_tool)
        log(f"Agent '{config.get('name')}' — fetch_content tool enabled")

    # Obsidian tools
    obsidian_tool_names = [t for t in tool_names if t.startswith("obsidian_")]
    for ot_name in obsidian_tool_names:
        if ot_name in _obsidian_tools:
            agent_tools.append(_obsidian_tools[ot_name])
            log(f"Agent '{config.get('name')}' — {ot_name} tool enabled")

    kwargs = {
        "name": config.get("name", "agent").replace(" ", "_").lower(),
        "model": model,
        "description": config.get("description", "A helpful assistant"),
        "instruction": config.get("system_prompt", "You are a helpful assistant."),
    }
    if agent_tools:
        kwargs["tools"] = agent_tools

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
    """Fallback: call Ollama directly via HTTP if ADK is unavailable."""
    try:
        import urllib.request
        model = agent_config.get("model", "gemma4:26b")
        base_url = agent_config.get("baseUrl", "http://localhost:11434").rstrip("/")
        system_prompt = agent_config.get("system_prompt", "")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})

        payload = json.dumps({"model": model, "messages": messages, "stream": False}).encode()
        req = urllib.request.Request(
            f"{base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        return data.get("message", {}).get("content", "") or ""
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
                "obsidian_available": _obsidian_available,
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

        if path == "/tools/search":
            if _direct_search_fn is None:
                json_response(self, 503, {"error": "web_search_tool not available"})
                return
            data = read_body(self)
            query = data.get("query", "")
            max_results = int(data.get("max_results", 5))
            if not query:
                json_response(self, 400, {"error": "query required"})
                return
            try:
                loop = asyncio.new_event_loop()
                result = loop.run_until_complete(_direct_search_fn(query, max_results))
                loop.close()
                json_response(self, 200, result)
            except Exception as e:
                log(f"tools/search error: {e}")
                json_response(self, 500, {"error": str(e)})

        elif path == "/tools/fetch":
            if _direct_fetch_fn is None:
                json_response(self, 503, {"error": "web_search_tool not available"})
                return
            data = read_body(self)
            url = data.get("url", "")
            if not url:
                json_response(self, 400, {"error": "url required"})
                return
            try:
                loop = asyncio.new_event_loop()
                result = loop.run_until_complete(_direct_fetch_fn(url))
                loop.close()
                json_response(self, 200, result)
            except Exception as e:
                log(f"tools/fetch error: {e}")
                json_response(self, 500, {"error": str(e)})

        elif path.startswith("/tools/obsidian/"):
            action = path.split("/tools/obsidian/")[1]
            if not _obsidian_available:
                json_response(self, 503, {"error": "obsidian_tool not available"})
                return
            data = read_body(self)

            # Configure vault path if provided
            vault_path = data.pop("vault_path", None)
            if vault_path:
                _obs_set_vault_path(vault_path)

            if action == "config":
                vp = data.get("vault_path", vault_path or "")
                if vp:
                    _obs_set_vault_path(vp)
                    json_response(self, 200, {"ok": True, "vault_path": vp})
                else:
                    json_response(self, 400, {"error": "vault_path required"})
                return

            try:
                action_map = {
                    "search": lambda d: _obs_search_raw(d.get("query", ""), int(d.get("max_results", 10))),
                    "read": lambda d: _obs_read_raw(d.get("path", "")),
                    "create": lambda d: _obs_create_raw(d.get("path", ""), d.get("content", ""), d.get("tags", ""), d.get("category", "")),
                    "update": lambda d: _obs_update_raw(d.get("path", ""), d.get("content", ""), d.get("append", False)),
                    "delete": lambda d: _obs_delete_raw(d.get("path", "")),
                    "list": lambda d: _obs_list_raw(d.get("folder", ""), d.get("recursive", True)),
                }

                if action not in action_map:
                    json_response(self, 404, {"error": f"Unknown obsidian action: {action}"})
                    return

                result = action_map[action](data)
                if isinstance(result, str):
                    json_response(self, 200, {"result": result})
                else:
                    json_response(self, 200, result)
            except Exception as e:
                log(f"tools/obsidian/{action} error: {e}")
                json_response(self, 500, {"error": str(e)})

        elif path == "/agents":
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

    search_status = "available (Google ADK)" if google_search_tool else ("available (Playwright)" if custom_search_tool else "not available")
    obsidian_status = "available" if _obsidian_available else "not available"
    log(f"Starting on port {args.port} (ADK: {'available' if ADK_AVAILABLE else 'not installed'}, google_search: {search_status}, obsidian: {obsidian_status})")

    # Signal ready to Electron
    print("ADK_READY", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
