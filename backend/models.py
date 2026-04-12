"""Pydantic models for the FastAPI backend."""

from typing import Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """POST /chat request body."""
    agent_id: str = Field(..., description="ID of the agent to use")
    session_id: str = Field(default="default", description="Session ID for conversation continuity")
    message: str = Field(..., description="User message to send to the agent")
    history: list[dict] = Field(default_factory=list, description="Previous conversation messages")
    model: Optional[str] = Field(default=None, description="Override model name (from Settings)")
    provider: str = Field(default="ollama", description="LLM provider")
    base_url: str = Field(default="http://localhost:11434", description="Ollama base URL")
    system_prompt: str = Field(default="You are a helpful assistant.", description="Agent system prompt")
    tools: list[str] = Field(default_factory=list, description="List of enabled tool names")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")


class ChatResponse(BaseModel):
    """POST /chat response body."""
    ok: bool = True
    content: str = Field(default="", description="Agent response text")
    error: Optional[str] = Field(default=None, description="Error message if ok=False")
    tool_calls: list[dict] = Field(default_factory=list, description="Tool calls made during response")


class AgentConfig(BaseModel):
    """Agent registration payload."""
    id: str
    name: str
    model: str = "gemma3:4b"
    provider: str = "ollama"
    system_prompt: str = "You are a helpful assistant."
    tools: list[str] = Field(default_factory=list)
    base_url: str = "http://localhost:11434"
    api_key: str = ""
    temperature: float = 0.7
    description: str = "A helpful assistant"


class HealthResponse(BaseModel):
    """GET /health response."""
    ok: bool = True
    version: str = "2.0.0"
    agents: int = 0


class ToolSearchRequest(BaseModel):
    query: str
    max_results: int = 5


class ToolFetchRequest(BaseModel):
    url: str


class ObsidianRequest(BaseModel):
    vault_path: str = ""
    query: str = ""
    path: str = ""
    content: str = ""
    tags: str = ""
    category: str = ""
    folder: str = ""
    recursive: bool = True
    append: bool = False
    max_results: int = 10


# ─── Orchestration ────────────────────────────────────────────────────────────


class OrchestrateAgentConfig(BaseModel):
    """Agent config as sent from the frontend DB."""
    id: str
    name: str
    description: str = "A helpful assistant"
    model: str = "gemma3:4b"
    provider: str = "ollama"
    system_prompt: str = "You are a helpful assistant."
    tools: list[str] = Field(default_factory=list)
    temperature: float = 0.7


class OrchestrateSettings(BaseModel):
    """Subset of frontend settings needed for orchestration."""
    obsidian_enabled: bool = False
    obsidian_vault_path: str = ""
    default_model: str = ""
    ollama_base_url: str = "http://localhost:11434"


class OrchestrateRequest(BaseModel):
    """POST /orchestrate request body."""
    message: str = Field(..., description="User message")
    agents: list[OrchestrateAgentConfig] = Field(..., description="Available agents from frontend DB")
    settings: OrchestrateSettings = Field(default_factory=OrchestrateSettings)


class OrchestrateResponse(BaseModel):
    """POST /orchestrate response body."""
    ok: bool = True
    content: str = ""
    agent_id: str = ""
    agent_name: str = ""
    reason: str = ""
    context_source: str = ""
    error: Optional[str] = None
