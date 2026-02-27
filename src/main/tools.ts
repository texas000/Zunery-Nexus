import { chromium, type Browser } from 'playwright-core'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

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
    description: 'Search Google to find current information, news, and facts',
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
        'Search Google to get current information, news, facts, or answers. Use this whenever the user asks about recent events, specific facts you are unsure about, or anything that would benefit from up-to-date information.',
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
        result = await googleSearch(String(args.query ?? ''))
        break
      default:
        result = `Tool "${name}" is not available.`
    }
    console.log('[TOOLS] result', { name, summary: result && result.length > 200 ? result.slice(0, 200) + '…' : result })
    return result
  } catch (err: unknown) {
    const e = err as { message?: string }
    console.error('[TOOLS] execute error', name, e.message || err)
    return `Tool error: ${e.message || 'unknown'}`
  }
}

// ─── Chromium browser management ──────────────────────────────────────────────

let _browser: Browser | null = null

function findChromiumPath(): string | undefined {
  const home = process.env.HOME || process.env.USERPROFILE || '/root'
  const cacheDir = join(home, '.cache', 'ms-playwright')

  if (existsSync(cacheDir)) {
    try {
      const dirs = readdirSync(cacheDir).sort().reverse()
      for (const dir of dirs) {
        if (!dir.startsWith('chromium')) continue
        const candidates = [
          join(cacheDir, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
          join(cacheDir, dir, 'chrome-linux', 'chrome'),
          join(cacheDir, dir, 'chrome-linux64', 'chrome'),
          join(cacheDir, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          join(cacheDir, dir, 'chrome-win', 'chrome.exe'),
        ]
        for (const p of candidates) if (existsSync(p)) return p
      }
    } catch { /* continue */ }
  }

  // Try system-installed Chrome / Chromium
  for (const cmd of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execSync(`which ${cmd} 2>/dev/null`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
      if (p && existsSync(p)) return p
    } catch { /* continue */ }
  }

  return undefined
}

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser
  const executablePath = findChromiumPath()
  console.log('[TOOLS] launching browser', { executablePath: executablePath ?? '(playwright default)' })
  _browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  })
  _browser.on('disconnected', () => { _browser = null })
  return _browser
}

// ─── Google Search ─────────────────────────────────────────────────────────────

async function googleSearch(query: string): Promise<string> {
  if (!query.trim()) return 'No search query provided.'

  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  const page = await context.newPage()

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&num=10`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })

    // Wait for either the results container or a known result element
    await page.waitForSelector('#rso, #search', { timeout: 12000 }).catch(() => {})

    const results = await page.evaluate(() => {
      const items: Array<{ title: string; url: string; snippet: string }> = []

      // Walk all result blocks — use multiple selector strategies for robustness
      const blocks = Array.from(
        document.querySelectorAll('#rso .g, #rso > div > div, [data-sokoban-container], [data-hveid]')
      )

      for (const block of blocks) {
        const h3 = block.querySelector('h3')
        if (!h3) continue

        const title = h3.textContent?.trim() ?? ''
        if (!title) continue

        // URL: walk up from h3 to the nearest <a>
        const anchor =
          (h3.closest('a') as HTMLAnchorElement | null) ??
          (block.querySelector('a[href^="http"], a[href^="/url"]') as HTMLAnchorElement | null)
        let href = anchor?.href ?? anchor?.getAttribute('href') ?? ''

        // Unwrap Google redirect URLs (/url?q=...)
        if (href.includes('/url?')) {
          try {
            href = new URL(href).searchParams.get('q') ?? href
          } catch { /* keep raw */ }
        }

        // Skip Google-internal links
        if (!href || href.includes('google.com') || href.startsWith('#')) continue

        // Snippet: try several known class/attribute patterns Google uses
        const snippetEl = block.querySelector(
          '[data-sncf="1"], .VwiC3b, .lEBKkf, [class*="r025kc"], [class*="s3v9rd"], .st'
        )
        const snippet = snippetEl?.textContent?.trim() ?? ''

        items.push({ title, url: href, snippet })
        if (items.length >= 6) break
      }

      return items
    })

    if (results.length === 0) {
      return `No results found for "${query}". Google may have returned a CAPTCHA or the query produced no organic results.`
    }

    const lines = results.map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n    ${r.url}${r.snippet ? `\n    ${r.snippet}` : ''}`
    )

    return `Google search results for "${query}":\n\n${lines.join('\n\n')}`
  } finally {
    await context.close()
  }
}
