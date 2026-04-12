import axios from 'axios'
import * as db from './database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}

export interface ToolCatalogEntry {
  name: string
  label: string
  description: string
  icon: string
  /** If set, tool is only shown in catalog when this setting is 'true' */
  enabledBySetting?: string
}

// ─── Tool catalog (what's shown in the UI) ───────────────────────────────────

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'obsidian_search',
    label: 'Obsidian Search',
    description: 'Search notes in your Obsidian vault for relevant knowledge',
    icon: 'BookOpen',
  },
  {
    name: 'obsidian_read',
    label: 'Obsidian Read',
    description: 'Read a specific note from your Obsidian vault',
    icon: 'FileText',
  },
  {
    name: 'obsidian_create',
    label: 'Obsidian Create',
    description: 'Create a new note in your Obsidian vault with auto-categorization',
    icon: 'FilePlus',
  },
  {
    name: 'obsidian_update',
    label: 'Obsidian Update',
    description: 'Update or append to an existing note in your Obsidian vault',
    icon: 'FileEdit',
  },
  {
    name: 'obsidian_delete',
    label: 'Obsidian Delete',
    description: 'Delete a note from your Obsidian vault',
    icon: 'FileX',
  },
  {
    name: 'obsidian_list',
    label: 'Obsidian List',
    description: 'List notes and folders in your Obsidian vault',
    icon: 'FolderOpen',
  },
]

// ─── Tool definitions (sent to the LLM) ──────────────────────────────────────

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  obsidian_search: {
    type: 'function',
    function: {
      name: 'obsidian_search',
      description:
        'Search the user\'s Obsidian vault for personal notes, documents, meeting notes, project docs, ideas, references, and stored knowledge. Searches local Markdown files. Use when the user mentions: notes, vault, obsidian, my documents, saved information, 노트, 메모, 기록, 내 문서. Also use when the user says "search notes", "find my notes", "look up in my vault", etc.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query. Supports plain text, regex, #tags (e.g. "#project"), [[wikilinks]].',
          },
          max_results: {
            type: 'string',
            description: 'Maximum results to return (default: 10).',
          },
        },
        required: ['query'],
      },
    },
  },
  obsidian_read: {
    type: 'function',
    function: {
      name: 'obsidian_read',
      description:
        'Read the full content of a specific note from the Obsidian vault. Use after searching to get complete note details including content, tags, and linked notes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the note (e.g. "Projects/myproject.md").',
          },
        },
        required: ['path'],
      },
    },
  },
  obsidian_create: {
    type: 'function',
    function: {
      name: 'obsidian_create',
      description:
        'Create a new Markdown note in the Obsidian vault. Auto-categorizes into folders if category is not specified. Use when the user wants to save new information, ideas, meeting notes, or project docs.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path for the note (e.g. "Projects/new-idea.md").',
          },
          content: {
            type: 'string',
            description: 'Markdown content for the note body.',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags (e.g. "python,project,ai").',
          },
          category: {
            type: 'string',
            description: 'Category folder name. If empty, auto-detected from content.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  obsidian_update: {
    type: 'function',
    function: {
      name: 'obsidian_update',
      description:
        'Update an existing note in the Obsidian vault. Can replace the body or append new content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the note (e.g. "Projects/myproject.md").',
          },
          content: {
            type: 'string',
            description: 'New content to write or append.',
          },
          append: {
            type: 'string',
            description: '"true" to append to existing content, "false" to replace (default: "false").',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  obsidian_delete: {
    type: 'function',
    function: {
      name: 'obsidian_delete',
      description: 'Delete a note from the Obsidian vault.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the note to delete.',
          },
        },
        required: ['path'],
      },
    },
  },
  obsidian_list: {
    type: 'function',
    function: {
      name: 'obsidian_list',
      description:
        'List notes and folders in the Obsidian vault. Useful for browsing vault structure and discovering available content.',
      parameters: {
        type: 'object',
        properties: {
          folder: {
            type: 'string',
            description: 'Subfolder to list (empty for vault root).',
          },
          recursive: {
            type: 'string',
            description: '"true" to include subfolders (default: "true").',
          },
        },
        required: [],
      },
    },
  },
}

/** Get all tool definitions (all tools are always available). */
export function getActiveToolDefinitions(): Record<string, ToolDefinition> {
  return { ...TOOL_DEFINITIONS }
}

/** Get all tool catalog entries (all tools are always available). */
export function getActiveToolCatalog(): ToolCatalogEntry[] {
  return [...TOOL_CATALOG]
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    console.log('[TOOLS] executeToolCall', { name, args })
    let result: string
    switch (name) {
      case 'obsidian_search':
        result = await adkObsidianCall('search', args)
        break
      case 'obsidian_read':
        result = await adkObsidianCall('read', args)
        break
      case 'obsidian_create':
        result = await adkObsidianCall('create', args)
        break
      case 'obsidian_update':
        result = await adkObsidianCall('update', args)
        break
      case 'obsidian_delete':
        result = await adkObsidianCall('delete', args)
        break
      case 'obsidian_list':
        result = await adkObsidianCall('list', args)
        break
      default:
        result = `Tool "${name}" is not available.`
    }
    // Truncate long logs to avoid huge console output
    console.log('[TOOLS] result', { name, summary: result && result.length > 200 ? result.slice(0, 200) + '…' : result })
    return result
  } catch (err: unknown) {
    const e = err as { message?: string }
    console.error('[TOOLS] execute error', name, e.message || err)
    return `Tool error: ${e.message || 'unknown'}`
  }
}

// ─── Obsidian Tool via ADK Server ───────────────────────────────────────────

async function adkObsidianCall(action: string, args: Record<string, unknown>): Promise<string> {
  try {
    const settings = db.getSettings()
    const vaultPath = settings['obsidian.vaultPath'] || ''
    const payload = { ...args, vault_path: vaultPath }

    const res = await axios.post(
      `http://127.0.0.1:7891/tools/obsidian/${action}`,
      payload,
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    )
    const d = res.data as { result?: string; error?: string }
    if (d.error) return `Obsidian error: ${d.error}`
    return d.result || JSON.stringify(d)
  } catch (err: unknown) {
    const e = err as { message?: string }
    return `Obsidian tool unavailable: ${e.message || 'unknown'}`
  }
}

