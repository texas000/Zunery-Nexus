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
        'Search Google to get current information, news, facts, or answers. Use this whenever the user asks about recent events, specific facts you are unsure about, or anything that would benefit from up-to-date information. IMPORTANT: always pass short keyword phrases, never full sentences or questions.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Short keyword phrase only — 1 to 5 words. Do NOT pass a full sentence or question. Examples: "typescript generics tutorial", "latest iPhone release date", "Node.js fs readFile async". Bad examples: "What is the latest iPhone release date?", "How do I use generics in TypeScript?"',
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

// ─── Browser management ────────────────────────────────────────────────────────

let _browser: Browser | null = null

/**
 * Scan the Playwright browser cache for any usable Chromium executable.
 * Handles Windows (%LOCALAPPDATA%), macOS (~/Library/Caches), and Linux (~/.cache).
 * Tries every chromium-* subdirectory newest-first so we pick up the latest revision.
 */
function findChromiumInCache(): string | undefined {
  const cacheDirs: string[] = []

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (local) cacheDirs.push(join(local, 'ms-playwright'))
  } else if (process.platform === 'darwin') {
    const home = process.env.HOME || ''
    cacheDirs.push(join(home, 'Library', 'Caches', 'ms-playwright'))
    cacheDirs.push(join(home, '.cache', 'ms-playwright'))
  } else {
    const home = process.env.HOME || '/root'
    cacheDirs.push(join(home, '.cache', 'ms-playwright'))
  }

  for (const cacheDir of cacheDirs) {
    if (!existsSync(cacheDir)) continue
    let dirs: string[]
    try { dirs = readdirSync(cacheDir).sort().reverse() } catch { continue }

    for (const dir of dirs) {
      if (!dir.startsWith('chromium')) continue

      const candidates =
        process.platform === 'win32'
          ? [
              join(cacheDir, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
              join(cacheDir, dir, 'chrome-win64', 'chrome.exe'),
              join(cacheDir, dir, 'chrome-win', 'chrome.exe'),
            ]
          : process.platform === 'darwin'
          ? [
              join(cacheDir, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
              join(cacheDir, dir, 'chrome-headless-shell-mac_arm64', 'chrome-headless-shell'),
              join(cacheDir, dir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
              join(cacheDir, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
              join(cacheDir, dir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
              join(cacheDir, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
            ]
          : [
              join(cacheDir, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
              join(cacheDir, dir, 'chrome-linux', 'chrome'),
              join(cacheDir, dir, 'chrome-linux64', 'chrome'),
            ]

      for (const p of candidates) if (existsSync(p)) return p
    }
  }
  return undefined
}

/**
 * Find a system-installed Chrome/Chromium executable.
 */
function findSystemChrome(): string | undefined {
  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean) as string[]
    for (const root of roots) {
      const p = join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')
      if (existsSync(p)) return p
    }
    return undefined
  }

  if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ]
    for (const p of macPaths) if (existsSync(p)) return p
    return undefined
  }

  // Linux — scan PATH
  for (const cmd of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const p = execSync(`which ${cmd} 2>/dev/null`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim()
      if (p && existsSync(p)) return p
    } catch { /* continue */ }
  }
  return undefined
}

// Extra flags needed in sandboxed / containerised Linux environments
const LINUX_SANDBOX_ARGS = process.platform === 'linux'
  ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  : []

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser

  const onDisconnect = () => { _browser = null }

  // Strategy 1 — channel:'chrome' uses whatever Chrome the OS has installed.
  //   Works on Windows, macOS, and Linux where Chrome is available without any
  //   Playwright browser download.
  try {
    _browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: LINUX_SANDBOX_ARGS,
    })
    _browser.on('disconnected', onDisconnect)
    console.log('[TOOLS] browser: system Chrome (channel:chrome)')
    return _browser
  } catch { /* Chrome not installed, continue */ }

  // Strategy 2 — look for any Chromium in the Playwright cache that exists,
  //   regardless of version. Even an older revision works fine for web search.
  const cachedPath = findChromiumInCache()
  if (cachedPath) {
    _browser = await chromium.launch({
      headless: true,
      executablePath: cachedPath,
      args: LINUX_SANDBOX_ARGS,
    })
    _browser.on('disconnected', onDisconnect)
    console.log('[TOOLS] browser: Playwright cache', cachedPath)
    return _browser
  }

  // Strategy 3 — system-installed Chromium (Linux/Mac PATH, Windows well-known paths)
  const systemPath = findSystemChrome()
  if (systemPath) {
    _browser = await chromium.launch({
      headless: true,
      executablePath: systemPath,
      args: LINUX_SANDBOX_ARGS,
    })
    _browser.on('disconnected', onDisconnect)
    console.log('[TOOLS] browser: system path', systemPath)
    return _browser
  }

  throw new Error(
    'No Chromium browser found. Install Google Chrome or run: npx playwright install chromium'
  )
}

// ─── Google Search ─────────────────────────────────────────────────────────────

async function googleSearch(query: string): Promise<string> {
  if (!query.trim()) return 'No search query provided.'

  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  const page = await context.newPage()

  try {
    console.log(`[TOOLS] Searching DuckDuckGo: "${query}"`)
    // DuckDuckGo HTML endpoint — no CAPTCHA, stable selectors
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForSelector('.result', { timeout: 10000 }).catch(() => {})

    const pageTitle = await page.title()
    console.log(`[TOOLS] Page title: "${pageTitle}"`)

    const blockCount = await page.$$('.result').then((els) => els.length).catch(() => 0)
    console.log(`[TOOLS] Result blocks: ${blockCount}`)

    if (blockCount === 0) {
      const bodyText = await page.$eval('body', (b) => (b as HTMLElement).innerText.slice(0, 400)).catch(() => '')
      console.log('[TOOLS] No results found. Body preview:', bodyText)
      return `No results found for "${query}".`
    }

    const results = await page.$$eval('.result', (elements) => {
      const seen = new Set<string>()
      const items: Array<{ title: string; url: string; description: string }> = []

      for (const el of elements) {
        if (items.length >= 8) break

        // Title
        const titleEl = el.querySelector('.result__title a, .result__a') as HTMLElement | null
        const title = titleEl?.innerText?.trim()
        if (!title) continue

        // URL — DuckDuckGo uses uddg= redirect params, extract the real URL
        const anchor = titleEl?.closest('a') as HTMLAnchorElement | null
          ?? el.querySelector('a.result__url, a[href*="uddg"]') as HTMLAnchorElement | null
        let href = anchor?.href ?? ''
        if (!href) continue

        // Unwrap DuckDuckGo redirect: /l/?uddg=<encoded-url>
        if (href.includes('uddg=')) {
          try { href = decodeURIComponent(new URL(href).searchParams.get('uddg') ?? href) } catch {}
        }
        if (!href || href.includes('duckduckgo.com') || href.startsWith('#')) continue
        if (seen.has(href)) continue
        seen.add(href)

        // Snippet
        const snippetEl = el.querySelector('.result__snippet') as HTMLElement | null
        const description = snippetEl?.innerText?.trim() ?? ''

        items.push({ title, url: href, description })
      }

      return items
    })

    console.log(`[TOOLS] Extracted ${results.length} results`)

    if (results.length === 0) {
      return `No results found for "${query}".`
    }

    const lines = results.map(
      (r, i) => `[${i + 1}] ${r.title}\n    ${r.url}${r.description ? `\n    ${r.description}` : ''}`
    )
    return `Search results for "${query}":\n\n${lines.join('\n\n')}`
  } finally {
    await context.close()
  }
}
