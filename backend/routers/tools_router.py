"""Tool execution router — obsidian vault operations."""

import logging
from fastapi import APIRouter, HTTPException

from backend.models import ObsidianRequest

logger = logging.getLogger("zunery.tools")

router = APIRouter(prefix="/tools", tags=["tools"])


# ─── Obsidian ─────────────────────────────────────────────────────────────────

@router.post("/obsidian/{action}")
async def tool_obsidian(action: str, req: ObsidianRequest):
    """Execute an Obsidian vault operation."""
    try:
        from backend.tools.obsidian import (
            search_notes, read_note, create_note, update_note,
            delete_note, list_notes, set_vault_path,
        )
    except ImportError:
        raise HTTPException(status_code=503, detail="obsidian tool not available")

    # Configure vault path if provided
    if req.vault_path:
        set_vault_path(req.vault_path)

    if action == "config":
        if req.vault_path:
            set_vault_path(req.vault_path)
            return {"ok": True, "vault_path": req.vault_path}
        raise HTTPException(status_code=400, detail="vault_path required")

    action_map = {
        "search": lambda: search_notes(req.query, req.max_results),
        "read": lambda: read_note(req.path),
        "create": lambda: create_note(req.path, req.content, req.tags, req.category),
        "update": lambda: update_note(req.path, req.content, req.append),
        "delete": lambda: delete_note(req.path),
        "list": lambda: list_notes(req.folder, req.recursive),
    }

    if action not in action_map:
        raise HTTPException(status_code=404, detail=f"Unknown obsidian action: {action}")

    try:
        result = action_map[action]()
        if isinstance(result, str):
            return {"result": result}
        return result
    except Exception as e:
        logger.error(f"tools/obsidian/{action} error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
