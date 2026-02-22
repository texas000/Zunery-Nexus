import axios from 'axios'

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
}

// ─── Tool catalog (what's shown in the UI) ───────────────────────────────────

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'web_search',
    label: 'Web Search',
    description: 'Search DuckDuckGo to find current information, news, and facts',
    icon: 'Search',
  },
]

// ─── Tool definitions (sent to the LLM) ──────────────────────────────────────

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web using DuckDuckGo to get current information, news, facts, or answers. Use this whenever the user asks about recent events, specific facts you are unsure about, or anything that would benefit from up-to-date information.',
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
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    console.log('[TOOLS] executeToolCall', { name, args })
    let result: string
    switch (name) {
      case 'web_search':
        result = await duckDuckGoSearch(String(args.query ?? ''))
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

// ─── DuckDuckGo ───────────────────────────────────────────────────────────────

async function duckDuckGoSearch(query: string): Promise<string> {
  if (!query.trim()) return 'No search query provided.'

  const parts: string[] = []

  // 1. Instant Answer API (structured data)
  try {
    const ia = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_redirect: 1, no_html: 1, skip_disambig: 1 },
      timeout: 8000,
      headers: { 'User-Agent': 'ExpandAI/1.0' },
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
