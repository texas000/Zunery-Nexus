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
    name: 'web_search',
    label: 'Google Search',
    description: 'Search Google to find current information, news, and facts (via Google ADK)',
    icon: 'Search',
  },
  {
    name: 'obsidian_search',
    label: 'Obsidian Search',
    description: 'Search notes in your Obsidian vault for relevant knowledge',
    icon: 'BookOpen',
    enabledBySetting: 'obsidian.enabled',
  },
  {
    name: 'obsidian_read',
    label: 'Obsidian Read',
    description: 'Read a specific note from your Obsidian vault',
    icon: 'FileText',
    enabledBySetting: 'obsidian.enabled',
  },
  {
    name: 'obsidian_create',
    label: 'Obsidian Create',
    description: 'Create a new note in your Obsidian vault with auto-categorization',
    icon: 'FilePlus',
    enabledBySetting: 'obsidian.enabled',
  },
  {
    name: 'obsidian_update',
    label: 'Obsidian Update',
    description: 'Update or append to an existing note in your Obsidian vault',
    icon: 'FileEdit',
    enabledBySetting: 'obsidian.enabled',
  },
  {
    name: 'obsidian_delete',
    label: 'Obsidian Delete',
    description: 'Delete a note from your Obsidian vault',
    icon: 'FileX',
    enabledBySetting: 'obsidian.enabled',
  },
  {
    name: 'obsidian_list',
    label: 'Obsidian List',
    description: 'List notes and folders in your Obsidian vault',
    icon: 'FolderOpen',
    enabledBySetting: 'obsidian.enabled',
  },
]

// ─── Tool definitions (sent to the LLM) ──────────────────────────────────────

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the INTERNET (Google) for external, public information, news, current events, or facts. Use this for web searches only. Do NOT use this when the user asks about their own notes, documents, or Obsidian vault — use obsidian_search instead.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query. Be specific and concise for better results.',
          },
        },
        required: ['query'],
      },
    },
  },
  obsidian_search: {
    type: 'function',
    function: {
      name: 'obsidian_search',
      description:
        'Search the user\'s LOCAL Obsidian vault for personal notes, documents, meeting notes, project docs, ideas, references, and stored knowledge. This is NOT a web search — it searches local Markdown files on the user\'s computer. Use this tool (NOT web_search) when the user mentions: notes, vault, obsidian, my documents, saved information, 노트, 메모, 기록, 내 문서. Also use this when the user says "search notes", "find my notes", "look up in my vault", etc.',
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

/** Get active tool definitions, filtering by settings (e.g. obsidian.enabled) */
export function getActiveToolDefinitions(): Record<string, ToolDefinition> {
  const settings = db.getSettings()
  const active: Record<string, ToolDefinition> = {}

  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    const catalogEntry = TOOL_CATALOG.find((c) => c.name === name)
    if (catalogEntry?.enabledBySetting) {
      if (settings[catalogEntry.enabledBySetting] !== 'true') continue
    }
    active[name] = def
  }
  return active
}

/** Get active tool catalog entries, filtering by settings */
export function getActiveToolCatalog(): ToolCatalogEntry[] {
  const settings = db.getSettings()
  return TOOL_CATALOG.filter((entry) => {
    if (entry.enabledBySetting) {
      return settings[entry.enabledBySetting] === 'true'
    }
    return true
  })
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    console.log('[TOOLS] executeToolCall', { name, args })
    let result: string
    switch (name) {
      case 'web_search':
        result = await adkServerSearch(String(args.query ?? ''))
        break
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

// ─── Web Search via ADK Server ──────────────────────────────────────────────

async function adkServerSearch(query: string): Promise<string> {
  if (!query.trim()) return 'No search query provided.'

  try {
    const res = await axios.post(
      'http://127.0.0.1:7891/tools/search',
      { query, max_results: 5 },
      { timeout: 45000, headers: { 'Content-Type': 'application/json' } },
    )
    const d = res.data as {
      query?: string
      results?: Array<{ position: number; title: string; url: string; snippet: string }>
      total_results?: number
      error?: string | null
    }

    if (d.error) return `Search error: ${d.error}`
    if (!d.results || d.results.length === 0) return `No results found for "${query}".`

    const lines: string[] = [`Search results for "${query}":`]
    for (const r of d.results) {
      lines.push(`\n${r.position}. ${r.title}`)
      lines.push(`   URL: ${r.url}`)
      if (r.snippet) lines.push(`   ${r.snippet}`)
    }
    return lines.join('\n')
  } catch {
    // ADK server unreachable — fall back to DuckDuckGo
    return duckDuckGoSearch(query)
  }
}

async function duckDuckGoSearch(query: string): Promise<string> {
  if (!query.trim()) return 'No search query provided.'

  const parts: string[] = []

  // 1. Instant Answer API (structured data)
  try {
    const ia = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_redirect: 1, no_html: 1, skip_disambig: 1 },
      timeout: 8000,
      headers: { 'User-Agent': 'ZuneryNexus/1.0' },
    })
    const d = ia.data

    if (d.Answer) parts.push(`Direct answer: ${d.Answer}`)
    if (d.AbstractText) {
      parts.push(`Summary: ${d.AbstractText}`)
      if (d.AbstractURL) parts.push(`Source: ${d.AbstractURL}`)
    }
    if (d.Definition) parts.push(`Definition: ${d.Definition}`)

    const related: Array<{ Text: string; FirstURL: string }> = (d.RelatedTopics || [])
      .filter((t: Record<string, string>) => t.Text && t.FirstURL)
      .slice(0, 5)

    if (related.length > 0 && !parts.length) {
      // Only use related topics if we have nothing else yet
      parts.push('Related results:')
      related.forEach((t) => parts.push(`• ${t.Text}\n  ${t.FirstURL}`))
    }
  } catch {
    // continue to HTML fallback
  }

  // 2. HTML search for real web results
  try {
    const html = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Accept: 'text/html',
      },
      timeout: 10000,
    })

    const body: string = html.data
    const webResults: string[] = []

    // Extract result blocks: title + snippet
    const blockRe = /<div class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
    const titleRe = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/
    const snippetRe = /class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/

    let match: RegExpExecArray | null
    let count = 0
    // eslint-disable-next-line no-cond-assign
    while ((match = blockRe.exec(body)) !== null && count < 6) {
      const block = match[1]
      const titleMatch = titleRe.exec(block)
      const snippetMatch = snippetRe.exec(block)
      if (titleMatch) {
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim()
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''
        if (title) {
          webResults.push(`• ${title}${snippet ? `\n  ${snippet}` : ''}`)
          count++
        }
      }
    }

    if (webResults.length > 0) {
      parts.push('\nWeb results:')
      parts.push(...webResults)
    }
  } catch {
    // HTML fallback failed; that's ok
  }

  return parts.length > 0
    ? parts.join('\n')
    : `No results found for "${query}". Try rephrasing your query.`
}
