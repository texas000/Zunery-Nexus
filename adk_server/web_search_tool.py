#!/usr/bin/env python3
"""
High-performance Stealthy Web Search Tool for AI Agents
Uses Playwright with stealth mode to bypass bot detection.
Provides search and content extraction with LLM optimization.
"""

import json
import asyncio
import logging
import sys
import os
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import re
from html import unescape
from urllib.parse import quote_plus, urlencode

try:
    from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False

try:
    from bs4 import BeautifulSoup
    BEAUTIFULSOUP_AVAILABLE = True
except ImportError:
    BEAUTIFULSOUP_AVAILABLE = False

# ─── Configuration ───────────────────────────────────────────────────────────

# Log format with step-level detail
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] %(message)s"
LOG_DATE_FORMAT = "%H:%M:%S"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
logger = logging.getLogger("web_search")

# Max token limits for LLM optimization
MAX_CONTENT_LENGTH = 16000  # chars
MAX_SNIPPET_LENGTH = 250

# Browser timeouts (ms)
PAGE_LOAD_TIMEOUT = 30000
NAVIGATION_TIMEOUT = 30000
SELECTOR_TIMEOUT = 8000

# DEBUG_MODE: headless=False + screenshot on failure
DEBUG_MODE = os.environ.get("WST_DEBUG", "0") == "1"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "debug_screenshots")


# ─── Data Models ─────────────────────────────────────────────────────────────

@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    position: int = 0


@dataclass
class SearchResponse:
    query: str
    results: List[SearchResult]
    total_results: int = 0
    execution_time: float = 0.0
    timestamp: str = ""
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "query": self.query,
            "results": [
                {"position": r.position, "title": r.title, "url": r.url, "snippet": r.snippet}
                for r in self.results
            ],
            "total_results": self.total_results,
            "execution_time": round(self.execution_time, 2),
            "timestamp": self.timestamp,
        }


@dataclass
class ContentResponse:
    url: str
    title: str
    content: str
    content_length: int
    execution_time: float = 0.0
    timestamp: str = ""
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "url": self.url,
            "title": self.title,
            "content": self.content,
            "content_length": self.content_length,
            "execution_time": round(self.execution_time, 2),
            "timestamp": self.timestamp,
        }


# ─── Step Logger ─────────────────────────────────────────────────────────────

class StepLogger:
    """Verbose step-by-step logger for debugging."""

    def __init__(self, task: str):
        self.task = task
        self.steps: List[str] = []
        self.start = datetime.now()

    def _elapsed(self) -> str:
        ms = int((datetime.now() - self.start).total_seconds() * 1000)
        return f"+{ms}ms"

    def step(self, msg: str):
        entry = f"[{self._elapsed()}] {msg}"
        self.steps.append(entry)
        logger.info(f"[{self.task}] {msg}")

    def warn(self, msg: str):
        entry = f"[{self._elapsed()}] ⚠ {msg}"
        self.steps.append(entry)
        logger.warning(f"[{self.task}] {msg}")

    def error(self, msg: str):
        entry = f"[{self._elapsed()}] ✗ {msg}"
        self.steps.append(entry)
        logger.error(f"[{self.task}] {msg}")

    def ok(self, msg: str):
        entry = f"[{self._elapsed()}] ✓ {msg}"
        self.steps.append(entry)
        logger.info(f"[{self.task}] ✓ {msg}")

    def summary(self) -> str:
        return "\n".join(self.steps)


# ─── Debug Helpers ────────────────────────────────────────────────────────────

async def _save_debug_screenshot(page: Page, name: str):
    """Save a screenshot to help debug selector issues."""
    if not DEBUG_MODE:
        return
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    path = os.path.join(SCREENSHOT_DIR, f"{name}_{datetime.now().strftime('%H%M%S')}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        logger.debug(f"[DEBUG] Screenshot saved: {path}")
    except Exception as e:
        logger.debug(f"[DEBUG] Screenshot failed: {e}")


async def _dump_page_html(page: Page, name: str):
    """Dump page HTML snapshot for selector debugging."""
    if not DEBUG_MODE:
        return
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    path = os.path.join(SCREENSHOT_DIR, f"{name}_{datetime.now().strftime('%H%M%S')}.html")
    try:
        html = await page.content()
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        logger.debug(f"[DEBUG] HTML dump saved: {path}")
    except Exception as e:
        logger.debug(f"[DEBUG] HTML dump failed: {e}")


# ─── Stealth Browser Setup ───────────────────────────────────────────────────

async def create_stealth_browser():
    """Create a Playwright browser with stealth mode enabled."""
    if not PLAYWRIGHT_AVAILABLE:
        raise ImportError("playwright is not installed. Run: pip install playwright && playwright install chromium")

    playwright = await async_playwright().start()

    headless = not DEBUG_MODE  # headless=False when DEBUG_MODE

    browser = await playwright.chromium.launch(
        headless=headless,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-popup-blocking",
            "--disable-translate",
            "--disable-background-networking",
            "--disable-features=ImprovedCookieControls,LazyFrameLoading,"
            "GlobalMediaControls,DestroyProfileOnBrowserClose",
            "--window-size=1280,900",
        ],
    )
    return browser, playwright


async def apply_stealth(page: Page):
    """Apply stealth mode to a page."""
    if STEALTH_AVAILABLE:
        await stealth_async(page)
    else:
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        """)


# ─── Google Result Selectors (multiple fallbacks) ────────────────────────────

# Google changes its HTML often. We try multiple strategies in order.
GOOGLE_RESULT_SELECTORS = [
    # Strategy 1: classic .g container (most stable)
    {
        "container": "div.g",
        "title": "h3",
        "link": "a[href]",
        "snippet": "div[data-sncf] span, div.VwiC3b span, .IsZvec span, div[style='-webkit-line-clamp:2'] span",
    },
    # Strategy 2: div[data-hveid] containers
    {
        "container": "div[data-hveid]",
        "title": "h3",
        "link": "a[href]",
        "snippet": "div[data-sncf] span, span[data-ved], .VwiC3b span",
    },
    # Strategy 3: li items (older layout)
    {
        "container": "#search li",
        "title": "h3",
        "link": "a[href]",
        "snippet": "div.s span, .st span, em",
    },
]

CAPTCHA_SELECTORS = [
    "#captcha-form",
    "form#challenge-form",
    "[aria-label*='CAPTCHA']",
    "text=unusual traffic",
    "text=verify you're not a robot",
    "text=Our systems have detected",
]


# ─── Text Cleaning ───────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    text = unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    for pattern in [r'Advertisement', r'Sponsored', r'Cookie Policy']:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    return text.strip()


def truncate_text(text: str, max_chars: int = MAX_CONTENT_LENGTH) -> str:
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_space = truncated.rfind(' ')
    if last_space > max_chars * 0.8:
        truncated = truncated[:last_space]
    return truncated.rstrip() + "\n\n[Content truncated for LLM optimization]"


def extract_main_content(html_content: str) -> str:
    if not BEAUTIFULSOUP_AVAILABLE:
        text = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', '', text)
        return clean_text(text)

    soup = BeautifulSoup(html_content, 'html.parser')
    for tag in soup.find_all(['script', 'style', 'nav', 'footer', 'iframe', 'aside']):
        tag.decompose()
    for tag in soup.find_all(class_=re.compile(r'(ad|advert|banner|popup|cookie|consent)', re.I)):
        tag.decompose()

    for selector in ['article', 'main', '[role="main"]', '.content', '#content', '#main']:
        main = soup.select_one(selector)
        if main:
            return clean_text(main.get_text(separator='\n', strip=True))

    body = soup.find('body') or soup
    return clean_text(body.get_text(separator='\n', strip=True))


# ─── Search Implementation ───────────────────────────────────────────────────

async def search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Search Google for query and return structured results.

    Args:
        query: Search query string
        max_results: Maximum number of results (1-10)

    Returns:
        dict with keys: query, results, total_results, execution_time, timestamp
        On error: dict with key 'error'
    """
    if not PLAYWRIGHT_AVAILABLE:
        return {"error": "Playwright not installed. Run: pip install playwright && playwright install chromium"}

    max_results = min(max(max_results, 1), 10)
    slog = StepLogger("SEARCH")
    slog.step(f"Query='{query}' max_results={max_results} stealth={'ON' if STEALTH_AVAILABLE else 'BASIC'} debug={DEBUG_MODE}")

    browser = None
    playwright_inst = None
    start_time = datetime.now()

    try:
        # 1. Launch browser
        slog.step("Launching Chromium...")
        browser, playwright_inst = await create_stealth_browser()
        slog.ok(f"Browser launched (headless={not DEBUG_MODE})")

        # 2. New page with realistic user agent
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        page = await browser.new_page(user_agent=ua, locale="en-US")
        page.set_default_timeout(PAGE_LOAD_TIMEOUT)
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)

        # 3. Apply stealth
        slog.step(f"Applying stealth ({'playwright-stealth' if STEALTH_AVAILABLE else 'manual script'})...")
        await apply_stealth(page)
        slog.ok("Stealth applied")

        # 4. Navigate to Google
        search_url = f"https://www.google.com/search?q={quote_plus(query)}&hl=en&gl=us&num={max_results + 3}"
        slog.step(f"Navigating to: {search_url}")
        try:
            response = await page.goto(search_url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
            status = response.status if response else "?"
            slog.ok(f"Page loaded (HTTP {status})")
        except PlaywrightTimeoutError:
            slog.error("Page load timed out!")
            await _save_debug_screenshot(page, "search_timeout")
            return {"error": "Search timeout: Google page took too long to load", "query": query, "results": []}
        except Exception as e:
            slog.error(f"Navigation failed: {e}")
            return {"error": f"Navigation failed: {e}", "query": query, "results": []}

        # 5. Check for CAPTCHA
        slog.step("Checking for CAPTCHA...")
        captcha_found = False
        for sel in CAPTCHA_SELECTORS:
            try:
                elem = await page.query_selector(sel)
                if elem:
                    captcha_found = True
                    slog.warn(f"CAPTCHA detected via selector: {sel}")
                    break
            except Exception:
                pass
        if captcha_found:
            await _save_debug_screenshot(page, "captcha")
            await _dump_page_html(page, "captcha")
            return {
                "error": "CAPTCHA detected: Google blocked the request. Try again in 5 minutes.",
                "query": query,
                "results": [],
                "retry_after": 300,
            }
        slog.ok("No CAPTCHA detected")

        # 6. Wait for results
        slog.step("Waiting for search results...")
        for wait_sel in ["#search", "#rso", "div.g", "[data-hveid]"]:
            try:
                await page.wait_for_selector(wait_sel, timeout=SELECTOR_TIMEOUT)
                slog.ok(f"Results container found: '{wait_sel}'")
                break
            except PlaywrightTimeoutError:
                slog.warn(f"Selector '{wait_sel}' not found, trying next...")
        else:
            slog.warn("No standard results container found — page may have unusual layout")
            await _save_debug_screenshot(page, "no_results_container")
            await _dump_page_html(page, "no_results_container")

        # 7. Extract results using multiple strategies
        results: List[SearchResult] = []
        used_strategy = None

        for strategy in GOOGLE_RESULT_SELECTORS:
            if len(results) >= max_results:
                break

            container_sel = strategy["container"]
            containers = await page.query_selector_all(container_sel)
            slog.step(f"Strategy '{container_sel}' → found {len(containers)} containers")

            if not containers:
                continue

            used_strategy = container_sel
            for idx, container in enumerate(containers):
                if len(results) >= max_results:
                    break
                try:
                    # Title
                    title_elem = await container.query_selector(strategy["title"])
                    title = (await title_elem.text_content() or "").strip() if title_elem else ""

                    # URL
                    link_elem = await container.query_selector(strategy["link"])
                    href = (await link_elem.get_attribute("href") or "") if link_elem else ""
                    if not href.startswith(("http://", "https://")):
                        continue

                    # Snippet — try each comma-separated selector
                    snippet = ""
                    for snip_sel in strategy["snippet"].split(", "):
                        elem = await container.query_selector(snip_sel.strip())
                        if elem:
                            snippet = (await elem.text_content() or "").strip()
                            if snippet:
                                break

                    if title and href:
                        results.append(SearchResult(
                            title=clean_text(title),
                            url=href,
                            snippet=clean_text(snippet)[:MAX_SNIPPET_LENGTH],
                            position=len(results) + 1,
                        ))
                        slog.step(f"  [{len(results)}] {title[:60]}... → {href[:60]}")
                except Exception as e:
                    slog.warn(f"  container[{idx}] extraction failed: {e}")
                    continue

        if results:
            slog.ok(f"Extracted {len(results)} results using strategy '{used_strategy}'")
        else:
            slog.warn("Zero results extracted — taking debug snapshot")
            await _save_debug_screenshot(page, "zero_results")
            await _dump_page_html(page, "zero_results")

        execution_time = (datetime.now() - start_time).total_seconds()
        slog.ok(f"Done in {execution_time:.2f}s")

        response_obj = SearchResponse(
            query=query,
            results=results,
            total_results=len(results),
            execution_time=execution_time,
            timestamp=datetime.now().isoformat(),
        )
        return response_obj.to_dict()

    except Exception as e:
        slog.error(f"Unexpected error: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return {"error": f"Search failed: {e}", "query": query, "results": []}

    finally:
        if browser:
            await browser.close()
        if playwright_inst:
            await playwright_inst.stop()
        slog.step("Browser closed")


# ─── Content Fetching ────────────────────────────────────────────────────────

async def fetch_content(url: str) -> Dict[str, Any]:
    """
    Fetch and extract main text content from a URL.

    Args:
        url: URL to fetch

    Returns:
        dict with keys: url, title, content, content_length, execution_time
        On error: dict with key 'error'
    """
    if not PLAYWRIGHT_AVAILABLE:
        return {"error": "Playwright not installed. Run: pip install playwright && playwright install chromium"}

    slog = StepLogger("FETCH")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    slog.step(f"URL: {url}")

    browser = None
    playwright_inst = None
    start_time = datetime.now()

    try:
        slog.step("Launching browser...")
        browser, playwright_inst = await create_stealth_browser()

        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        page = await browser.new_page(user_agent=ua, locale="en-US")
        page.set_default_timeout(PAGE_LOAD_TIMEOUT)
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)

        slog.step("Applying stealth...")
        await apply_stealth(page)

        slog.step("Navigating...")
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=NAVIGATION_TIMEOUT)
            slog.ok(f"Loaded (HTTP {response.status if response else '?'})")
        except PlaywrightTimeoutError:
            slog.error("Timeout!")
            return {"error": "Page load timeout", "url": url, "content": ""}
        except Exception as e:
            slog.error(f"Navigation error: {e}")
            return {"error": f"Navigation failed: {e}", "url": url, "content": ""}

        # Wait for dynamic content
        slog.step("Waiting 1.5s for JS rendering...")
        await page.wait_for_timeout(1500)

        title = await page.title()
        slog.ok(f"Title: '{title}'")

        slog.step("Extracting page HTML...")
        html = await page.content()
        slog.step(f"HTML size: {len(html):,} bytes")

        slog.step("Parsing content with BeautifulSoup...")
        content = extract_main_content(html)
        slog.ok(f"Extracted text: {len(content):,} chars")

        content = truncate_text(content, MAX_CONTENT_LENGTH)
        if len(content) < len(extract_main_content(html)):
            slog.warn(f"Content truncated to {MAX_CONTENT_LENGTH:,} chars")

        execution_time = (datetime.now() - start_time).total_seconds()
        slog.ok(f"Done in {execution_time:.2f}s")

        return ContentResponse(
            url=url,
            title=title or "Untitled",
            content=content,
            content_length=len(content),
            execution_time=execution_time,
            timestamp=datetime.now().isoformat(),
        ).to_dict()

    except Exception as e:
        slog.error(f"Unexpected error: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return {"error": f"Failed to fetch content: {e}", "url": url, "content": ""}

    finally:
        if browser:
            await browser.close()
        if playwright_inst:
            await playwright_inst.stop()
        slog.step("Browser closed")


# ─── Sync wrappers ────────────────────────────────────────────────────────────

def search_sync(query: str, max_results: int = 5) -> Dict[str, Any]:
    return asyncio.run(search(query, max_results))


def fetch_content_sync(url: str) -> Dict[str, Any]:
    return asyncio.run(fetch_content(url))


# ─── Tool Definition for ADK ─────────────────────────────────────────────────

GOOGLE_SEARCH_TOOL_DEFINITION = {
    "name": "google_search",
    "description": "Search the web using Google. Returns titles, URLs, and snippets.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
        },
        "required": ["query"],
    },
}

FETCH_CONTENT_TOOL_DEFINITION = {
    "name": "fetch_webpage",
    "description": "Fetch and extract main text content from a URL. Returns cleaned text for LLM.",
    "parameters": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to fetch"},
        },
        "required": ["url"],
    },
}


def create_google_search_tool(config: Optional[Dict] = None):
    async def tool_impl(query: str, max_results: int = 5) -> str:
        result = await search(query, max_results)
        return json.dumps(result, ensure_ascii=False, indent=2)

    tool_impl.name = "google_search"
    tool_impl.description = GOOGLE_SEARCH_TOOL_DEFINITION["description"]
    tool_impl.parameters = GOOGLE_SEARCH_TOOL_DEFINITION["parameters"]
    return tool_impl


def create_fetch_content_tool(config: Optional[Dict] = None):
    async def tool_impl(url: str) -> str:
        result = await fetch_content(url)
        return json.dumps(result, ensure_ascii=False, indent=2)

    tool_impl.name = "fetch_webpage"
    tool_impl.description = FETCH_CONTENT_TOOL_DEFINITION["description"]
    tool_impl.parameters = FETCH_CONTENT_TOOL_DEFINITION["parameters"]
    return tool_impl


# ─── CLI ─────────────────────────────────────────────────────────────────────

async def main():
    """
    CLI usage:
      python web_search_tool.py search "<query>" [max_results]
      python web_search_tool.py fetch "<url>"
      WST_DEBUG=1 python web_search_tool.py search "<query>"   # debug mode
    """
    if len(sys.argv) < 2:
        print(__doc__)
        return

    logging.getLogger().setLevel(logging.DEBUG if DEBUG_MODE else logging.INFO)

    command = sys.argv[1]

    if command == "search":
        if len(sys.argv) < 3:
            print("Error: query required\nUsage: python web_search_tool.py search '<query>' [max]")
            return
        query = sys.argv[2]
        max_results = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        result = await search(query, max_results)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "fetch":
        if len(sys.argv) < 3:
            print("Error: URL required\nUsage: python web_search_tool.py fetch '<url>'")
            return
        result = await fetch_content(sys.argv[2])
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "check":
        # Quick dependency check
        print("=== Dependency Check ===")
        print(f"  playwright      : {'✓' if PLAYWRIGHT_AVAILABLE else '✗ (pip install playwright && playwright install chromium)'}")
        print(f"  playwright-stealth: {'✓' if STEALTH_AVAILABLE else '✗ (pip install playwright-stealth)'}")
        print(f"  beautifulsoup4  : {'✓' if BEAUTIFULSOUP_AVAILABLE else '✗ (pip install beautifulsoup4)'}")
        print(f"  debug mode      : {'ON (WST_DEBUG=1)' if DEBUG_MODE else 'OFF'}")
        if not PLAYWRIGHT_AVAILABLE:
            print("\n→ Run: pip install -r requirements.txt && playwright install chromium")

    else:
        print(f"Unknown command: {command}\nAvailable: search, fetch, check")


if __name__ == "__main__":
    asyncio.run(main())
