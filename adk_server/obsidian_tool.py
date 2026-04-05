#!/usr/bin/env python3
"""
Zunery Nexus - Obsidian Vault Tool
Provides CRUD operations and powerful search for Obsidian vault (Markdown files).
Supports auto-categorization, indexing, and context retrieval for orchestrator decisions.
"""

import re
import time
from pathlib import Path
from datetime import datetime


# ─── Configuration ───────────────────────────────────────────────────────────

DEFAULT_VAULT_PATH = "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ryan/"

_vault_path: str = DEFAULT_VAULT_PATH


def set_vault_path(path: str):
    global _vault_path
    _vault_path = path


def get_vault_path() -> str:
    return _vault_path


# ─── Category Detection ─────────────────────────────────────────────────────

CATEGORY_PATTERNS = {
    "Projects": [r"project", r"프로젝트", r"개발", r"dev", r"build", r"implement"],
    "Daily Notes": [r"daily", r"journal", r"diary", r"일지", r"일기", r"\d{4}-\d{2}-\d{2}"],
    "Reference": [r"reference", r"참고", r"docs", r"documentation", r"wiki", r"manual"],
    "Ideas": [r"idea", r"아이디어", r"brainstorm", r"concept"],
    "Meeting Notes": [r"meeting", r"회의", r"미팅", r"minutes"],
    "Learning": [r"learn", r"study", r"학습", r"공부", r"tutorial", r"course"],
    "Tasks": [r"task", r"todo", r"할일", r"checklist"],
    "Archive": [r"archive", r"보관", r"old", r"deprecated"],
}


def detect_category(title: str, content: str = "") -> str:
    """Auto-detect category from title and content."""
    text = f"{title} {content}".lower()
    scores = {}
    for category, patterns in CATEGORY_PATTERNS.items():
        score = sum(1 for p in patterns if re.search(p, text, re.IGNORECASE))
        if score > 0:
            scores[category] = score
    if scores:
        return max(scores, key=scores.get)
    return ""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _ensure_vault():
    """Ensure vault path exists."""
    vault = Path(_vault_path)
    if not vault.exists():
        raise FileNotFoundError(f"Obsidian vault not found: {_vault_path}")
    return vault


def _resolve_note_path(note_path: str) -> Path:
    """Resolve a note path relative to vault, ensuring .md extension."""
    vault = _ensure_vault()
    if not note_path.endswith(".md"):
        note_path += ".md"
    full = vault / note_path
    # Security: prevent path traversal
    try:
        full.resolve().relative_to(vault.resolve())
    except ValueError:
        raise ValueError(f"Path traversal not allowed: {note_path}")
    return full


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content."""
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1].strip()
            body = parts[2].strip()
            fm = {}
            for line in fm_text.split("\n"):
                if ":" in line:
                    key, val = line.split(":", 1)
                    fm[key.strip()] = val.strip()
            return fm, body
    return {}, content


def _build_frontmatter(metadata: dict) -> str:
    """Build YAML frontmatter string."""
    if not metadata:
        return ""
    lines = ["---"]
    for k, v in metadata.items():
        if isinstance(v, list):
            lines.append(f"{k}:")
            for item in v:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines)


def _extract_tags(content: str) -> list[str]:
    """Extract #tags from content."""
    return list(set(re.findall(r"#([\w가-힣/\-]+)", content)))


def _extract_links(content: str) -> list[str]:
    """Extract [[wikilinks]] from content."""
    return list(set(re.findall(r"\[\[([^\]]+)\]\]", content)))


# ─── Core Operations ────────────────────────────────────────────────────────

def search_notes(query: str, max_results: int = 10, folder: str = "") -> dict:
    """
    Search notes in the Obsidian vault using powerful full-text search.
    Supports regex patterns, tags (#tag), and wikilinks ([[link]]).
    Use this to find relevant knowledge before making decisions.

    Args:
        query: Search query. Supports plain text, regex, #tags, [[links]].
        max_results: Maximum number of results to return (default 10).
        folder: Optional subfolder to limit search scope.

    Returns:
        dict with query, results list, and total count.
    """
    start = time.time()
    try:
        vault = _ensure_vault()
        search_root = vault / folder if folder else vault

        if not search_root.exists():
            return {"query": query, "results": [], "total": 0, "error": f"Folder not found: {folder}"}

        results = []
        query_lower = query.lower()

        # Compile regex if applicable
        try:
            pattern = re.compile(query, re.IGNORECASE | re.MULTILINE)
        except re.error:
            pattern = re.compile(re.escape(query), re.IGNORECASE | re.MULTILINE)

        for md_file in search_root.rglob("*.md"):
            # Skip hidden files/dirs
            if any(part.startswith(".") for part in md_file.relative_to(vault).parts):
                continue

            try:
                content = md_file.read_text(encoding="utf-8")
            except (UnicodeDecodeError, PermissionError):
                continue

            rel_path = str(md_file.relative_to(vault))
            title = md_file.stem

            # Score matching
            score = 0
            matches = []

            # Title match (high weight)
            if query_lower in title.lower():
                score += 10

            # Content regex match
            found = pattern.findall(content)
            if found:
                score += len(found) * 2

            # Tag match
            if query.startswith("#"):
                tags = _extract_tags(content)
                tag_query = query[1:].lower()
                for tag in tags:
                    if tag_query in tag.lower():
                        score += 5

            # Wikilink match
            if query.startswith("[[") and query.endswith("]]"):
                links = _extract_links(content)
                link_query = query[2:-2].lower()
                for link in links:
                    if link_query in link.lower():
                        score += 5

            if score == 0:
                continue

            # Extract context snippets
            for m in pattern.finditer(content):
                start_pos = max(0, m.start() - 80)
                end_pos = min(len(content), m.end() + 80)
                snippet = content[start_pos:end_pos].replace("\n", " ").strip()
                matches.append(f"...{snippet}...")
                if len(matches) >= 3:
                    break

            frontmatter, _ = _parse_frontmatter(content)
            tags = _extract_tags(content)

            results.append({
                "path": rel_path,
                "title": title,
                "score": score,
                "tags": tags[:10],
                "category": frontmatter.get("category", detect_category(title, content)),
                "modified": datetime.fromtimestamp(md_file.stat().st_mtime).isoformat(),
                "snippets": matches[:3],
                "size": len(content),
            })

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:max_results]

        return {
            "query": query,
            "results": results,
            "total": len(results),
            "execution_time": round(time.time() - start, 3),
        }

    except Exception as e:
        return {"query": query, "results": [], "total": 0, "error": str(e)}


def read_note(path: str) -> dict:
    """
    Read a specific note from the Obsidian vault.
    Returns full content, metadata, tags, and linked notes.

    Args:
        path: Relative path to the note within the vault (e.g., 'Projects/myproject.md').

    Returns:
        dict with title, content, frontmatter, tags, links, and metadata.
    """
    try:
        full_path = _resolve_note_path(path)
        if not full_path.exists():
            return {"error": f"Note not found: {path}"}

        content = full_path.read_text(encoding="utf-8")
        frontmatter, body = _parse_frontmatter(content)
        tags = _extract_tags(content)
        links = _extract_links(content)
        stat = full_path.stat()

        return {
            "path": path,
            "title": full_path.stem,
            "content": content,
            "body": body,
            "frontmatter": frontmatter,
            "tags": tags,
            "links": links,
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_birthtime).isoformat() if hasattr(stat, "st_birthtime") else None,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        }

    except Exception as e:
        return {"error": str(e)}


def create_note(path: str, content: str, tags: str = "", category: str = "") -> dict:
    """
    Create a new note in the Obsidian vault with auto-categorization.

    Args:
        path: Relative path for the note (e.g., 'Projects/new-idea.md').
        content: Markdown content for the note body.
        tags: Comma-separated tags to add (e.g., 'python,project,ai').
        category: Category folder. If empty, auto-detected from content.

    Returns:
        dict with created note path and metadata.
    """
    try:
        title = Path(path).stem

        # Auto-detect category if not provided
        if not category:
            category = detect_category(title, content)

        # If category detected but path doesn't include it, prepend it
        if category and not path.startswith(category):
            path = f"{category}/{path}"

        full_path = _resolve_note_path(path)

        if full_path.exists():
            return {"error": f"Note already exists: {path}"}

        # Ensure parent directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Build frontmatter
        fm = {
            "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        if category:
            fm["category"] = category
        if tags:
            fm["tags"] = [t.strip() for t in tags.split(",") if t.strip()]

        frontmatter_str = _build_frontmatter(fm)
        full_content = f"{frontmatter_str}\n\n{content}" if frontmatter_str else content

        full_path.write_text(full_content, encoding="utf-8")

        return {
            "path": str(full_path.relative_to(_ensure_vault())),
            "title": title,
            "category": category,
            "tags": fm.get("tags", []),
            "size": len(full_content),
            "created": True,
        }

    except Exception as e:
        return {"error": str(e)}


def update_note(path: str, content: str, append: bool = False) -> dict:
    """
    Update an existing note in the Obsidian vault.

    Args:
        path: Relative path to the note (e.g., 'Projects/myproject.md').
        content: New content. If append=true, appended to existing content.
        append: If 'true', append content instead of replacing.

    Returns:
        dict with updated note info.
    """
    try:
        full_path = _resolve_note_path(path)
        if not full_path.exists():
            return {"error": f"Note not found: {path}"}

        existing = full_path.read_text(encoding="utf-8")
        frontmatter, body = _parse_frontmatter(existing)

        # Handle append as string or bool
        is_append = append if isinstance(append, bool) else str(append).lower() == "true"

        if is_append:
            new_body = f"{body}\n\n{content}"
        else:
            new_body = content

        # Update timestamp
        frontmatter["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")

        fm_str = _build_frontmatter(frontmatter)
        full_content = f"{fm_str}\n\n{new_body}" if fm_str else new_body

        full_path.write_text(full_content, encoding="utf-8")

        return {
            "path": path,
            "title": full_path.stem,
            "size": len(full_content),
            "updated": True,
            "append": is_append,
        }

    except Exception as e:
        return {"error": str(e)}


def delete_note(path: str) -> dict:
    """
    Delete a note from the Obsidian vault.

    Args:
        path: Relative path to the note (e.g., 'Archive/old-note.md').

    Returns:
        dict with deletion status.
    """
    try:
        full_path = _resolve_note_path(path)
        if not full_path.exists():
            return {"error": f"Note not found: {path}"}

        full_path.unlink()

        # Clean up empty parent directories
        parent = full_path.parent
        vault = _ensure_vault()
        while parent != vault and parent.exists():
            if not any(parent.iterdir()):
                parent.rmdir()
                parent = parent.parent
            else:
                break

        return {"path": path, "deleted": True}

    except Exception as e:
        return {"error": str(e)}


def list_notes(folder: str = "", recursive: bool = True) -> dict:
    """
    List all notes in the Obsidian vault or a specific folder.
    Useful for browsing vault structure and discovering content.

    Args:
        folder: Subfolder to list (empty for root). e.g., 'Projects'.
        recursive: If 'true', list recursively including subfolders.

    Returns:
        dict with notes list, folder structure, and stats.
    """
    try:
        vault = _ensure_vault()
        search_root = vault / folder if folder else vault

        if not search_root.exists():
            return {"error": f"Folder not found: {folder}"}

        # Handle recursive as string or bool
        is_recursive = recursive if isinstance(recursive, bool) else str(recursive).lower() == "true"

        notes = []
        folders = set()
        glob_fn = search_root.rglob if is_recursive else search_root.glob

        for md_file in glob_fn("*.md"):
            # Skip hidden
            rel = md_file.relative_to(vault)
            if any(part.startswith(".") for part in rel.parts):
                continue

            parent_folder = str(rel.parent)
            if parent_folder != ".":
                folders.add(parent_folder)

            stat = md_file.stat()
            notes.append({
                "path": str(rel),
                "title": md_file.stem,
                "folder": parent_folder if parent_folder != "." else "",
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })

        # Sort by modification time (newest first)
        notes.sort(key=lambda x: x["modified"], reverse=True)

        return {
            "folder": folder or "/",
            "notes": notes,
            "total": len(notes),
            "folders": sorted(folders),
        }

    except Exception as e:
        return {"error": str(e)}


# ─── ADK-compatible wrapper functions ────────────────────────────────────────

def obsidian_search(query: str, max_results: int = 10) -> str:
    """Search notes in the Obsidian vault. Supports text, regex, #tags, [[links]].

    Args:
        query: Search query string.
        max_results: Maximum results to return.

    Returns:
        Formatted search results as text.
    """
    result = search_notes(query, max_results)
    if result.get("error"):
        return f"Search error: {result['error']}"
    if not result["results"]:
        return f"No notes found for '{query}'."

    lines = [f"Found {result['total']} notes for '{query}':"]
    for i, r in enumerate(result["results"], 1):
        lines.append(f"\n{i}. [{r['title']}] ({r['path']})")
        if r.get("tags"):
            lines.append(f"   Tags: {', '.join('#' + t for t in r['tags'])}")
        if r.get("category"):
            lines.append(f"   Category: {r['category']}")
        for s in r.get("snippets", []):
            lines.append(f"   {s}")
    return "\n".join(lines)


def obsidian_read(path: str) -> str:
    """Read a note from the Obsidian vault.

    Args:
        path: Relative path to the note file.

    Returns:
        Note content with metadata.
    """
    result = read_note(path)
    if result.get("error"):
        return f"Read error: {result['error']}"

    lines = [f"# {result['title']}", f"Path: {result['path']}"]
    if result.get("tags"):
        lines.append(f"Tags: {', '.join('#' + t for t in result['tags'])}")
    if result.get("links"):
        lines.append(f"Links: {', '.join('[[' + l + ']]' for l in result['links'])}")
    lines.append(f"Modified: {result['modified']}")
    lines.append(f"\n{result['body']}")
    return "\n".join(lines)


def obsidian_create(path: str, content: str, tags: str = "", category: str = "") -> str:
    """Create a new note in the Obsidian vault with auto-categorization.

    Args:
        path: Relative path for the new note.
        content: Markdown content body.
        tags: Comma-separated tags.
        category: Category name (auto-detected if empty).

    Returns:
        Creation result message.
    """
    result = create_note(path, content, tags, category)
    if result.get("error"):
        return f"Create error: {result['error']}"
    return f"Created note: {result['path']} (category: {result.get('category', 'none')}, tags: {result.get('tags', [])})"


def obsidian_update(path: str, content: str, append: str = "false") -> str:
    """Update an existing note in the Obsidian vault.

    Args:
        path: Relative path to the note.
        content: New content or content to append.
        append: 'true' to append, 'false' to replace body.

    Returns:
        Update result message.
    """
    result = update_note(path, content, append)
    if result.get("error"):
        return f"Update error: {result['error']}"
    mode = "Appended to" if result.get("append") else "Updated"
    return f"{mode} note: {result['path']} ({result['size']} bytes)"


def obsidian_delete(path: str) -> str:
    """Delete a note from the Obsidian vault.

    Args:
        path: Relative path to the note to delete.

    Returns:
        Deletion result message.
    """
    result = delete_note(path)
    if result.get("error"):
        return f"Delete error: {result['error']}"
    return f"Deleted note: {result['path']}"


def obsidian_list(folder: str = "", recursive: str = "true") -> str:
    """List notes in the Obsidian vault or a specific folder.

    Args:
        folder: Subfolder to list (empty for root).
        recursive: 'true' to include subfolders.

    Returns:
        Formatted list of notes.
    """
    result = list_notes(folder, recursive)
    if result.get("error"):
        return f"List error: {result['error']}"

    lines = [f"Vault: {result['folder']} ({result['total']} notes)"]
    if result.get("folders"):
        lines.append(f"Folders: {', '.join(result['folders'])}")
    lines.append("")
    for n in result["notes"][:50]:  # Limit display
        folder_prefix = f"[{n['folder']}] " if n['folder'] else ""
        lines.append(f"  {folder_prefix}{n['title']} ({n['size']}B, {n['modified'][:10]})")
    if result["total"] > 50:
        lines.append(f"  ... and {result['total'] - 50} more")
    return "\n".join(lines)
