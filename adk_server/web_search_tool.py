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
    # playwright-stealth v2 API
    from playwright_stealth import Stealth as _Stealth
    _stealth_instance = _Stealth()
    STEALTH_AVAILABLE = True
except ImportError:
    try:
        # playwright-stealth v1 legacy API
        from playwright_stealth import stealth_async as _stealth_async_v1
        _stealth_instance = None
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
    """Apply stealth mode to a page (supports v1 and v2 API)."""
    if STEALTH_AVAILABLE:
        try:
            if _stealth_instance is not None:
                # v2: Stealth().apply_stealth_async(page)
                await _stealth_instance.apply_stealth_async(page)
            else:
                # v1: stealth_async(page)
                await _stealth_async_v1(page)
            return
        except Exception as e:
            logger.warning(f"playwright-stealth failed: {e}, falling back to manual script")

    # Fallback: manual script injection
    await page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)


# ─── Google Result Selectors (multiple fallbacks) ────────────────────────────

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

# DuckDuckGo HTML (https://html.duckduckgo.com/html/) - bot-friendly, no JS required
DDGO_RESULT_SELECTORS = {
    "container": "div.results_links, div.result",
    "title": "a.result__a, h2.result__title a",
    "link": "a.result__a",
    "snippet": "a.result__snippet",
}

# Only check true CAPTCHA indicators (title + confirmed element)
GOOGLE_CAPTCHA_TITLE_HINTS = ["unusual traffic", "captcha", "verify", "robot"]
GOOGLE_CAPTCHA_SELECTORS = ["#captcha-form", "form#challenge-form", "div.g-recaptcha"]


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


# ─── Search: Bing (primary, bot-friendly) ────────────────────────────────────

async def _search_bing(query: str, max_results: int, slog: "StepLogger") -> List["SearchResult"]:
    """Search using Bing — reliable results, minimal bot detection."""
    results: List[SearchResult] = []
    browser = None
    playwright_inst = None

    try:
        browser, playwright_inst = await create_stealth_browser()
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        page = await browser.new_page(user_agent=ua, locale="en-US")
        page.set_default_timeout(PAGE_LOAD_TIMEOUT)
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)
        await apply_stealth(page)

        bing_url = f"https://www.bing.com/search?q={quote_plus(query)}&count={max_results + 3}"
        slog.step(f"[Bing] Navigating to: {bing_url}")

        response = await page.goto(bing_url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        slog.ok(f"[Bing] Page loaded (HTTP {response.status if response else '?'}, title='{await page.title()}')")

        try:
            await page.wait_for_selector("li.b_algo", timeout=SELECTOR_TIMEOUT)
        except PlaywrightTimeoutError:
            slog.warn("[Bing] Results selector timeout — trying anyway")

        containers = await page.query_selector_all("li.b_algo")
        slog.step(f"[Bing] Found {len(containers)} result containers")

        for container in containers:
            if len(results) >= max_results:
                break
            try:
                # Title from h2 a
                title_elem = await container.query_selector("h2 a")
                title = (await title_elem.text_content() or "").strip() if title_elem else ""

                # Real URL from <cite> element (Bing wraps hrefs in redirects)
                cite_elem = await container.query_selector("cite")
                real_url = (await cite_elem.text_content() or "").strip() if cite_elem else ""
                if not real_url.startswith("http"):
                    real_url = f"https://{real_url}"

                # Skip if still not a valid URL
                if not real_url.startswith(("http://", "https://")):
                    continue

                # Snippet
                snippet = ""
                for snip_sel in ["p.b_lineclamp2", "p.b_algoSlug", ".b_caption p", "p"]:
                    s_elem = await container.query_selector(snip_sel)
                    if s_elem:
                        snippet = (await s_elem.text_content() or "").strip()
                        if snippet:
                            break

                if title and real_url:
                    results.append(SearchResult(
                        title=clean_text(title),
                        url=real_url,
                        snippet=clean_text(snippet)[:MAX_SNIPPET_LENGTH],
                        position=len(results) + 1,
                    ))
                    slog.step(f"  [Bing {len(results)}] {title[:60]}")
            except Exception as e:
                slog.warn(f"[Bing] Container extraction failed: {e}")
                continue

    finally:
        if browser:
            await browser.close()
        if playwright_inst:
            await playwright_inst.stop()

    return results


# ─── Search: DuckDuckGo (secondary) ──────────────────────────────────────────

async def _search_duckduckgo(query: str, max_results: int, slog: "StepLogger") -> List["SearchResult"]:
    """Search using DuckDuckGo — fallback option."""
    results: List[SearchResult] = []
    browser = None
    playwright_inst = None

    try:
        browser, playwright_inst = await create_stealth_browser()
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        page = await browser.new_page(user_agent=ua, locale="en-US")
        page.set_default_timeout(PAGE_LOAD_TIMEOUT)
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)
        await apply_stealth(page)

        # Navigate to DDG homepage first to get cookies, then search
        await page.goto("https://duckduckgo.com/", wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        await page.wait_for_timeout(1000)

        ddg_url = f"https://duckduckgo.com/?q={quote_plus(query)}&ia=web"
        slog.step(f"[DDG] Navigating to: {ddg_url}")
        response = await page.goto(ddg_url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        slog.ok(f"[DDG] Page loaded (HTTP {response.status if response else '?'})")

        # DDG is JS-heavy, wait for results
        try:
            await page.wait_for_selector("[data-testid='result']", timeout=SELECTOR_TIMEOUT)
        except PlaywrightTimeoutError:
            slog.warn("[DDG] Results selector timeout")

        containers = await page.query_selector_all("[data-testid='result'], .nrn-react-div article")
        slog.step(f"[DDG] Found {len(containers)} result containers")

        for container in containers:
            if len(results) >= max_results:
                break
            try:
                title_elem = await container.query_selector("h2, [data-testid='result-title-a']")
                title = (await title_elem.text_content() or "").strip() if title_elem else ""

                link_elem = await container.query_selector("a[href]")
                href = (await link_elem.get_attribute("href") or "") if link_elem else ""
                if not href.startswith(("http://", "https://")):
                    continue

                snippet_elem = await container.query_selector("[data-result='snippet'], .OgdwYG")
                snippet = (await snippet_elem.text_content() or "").strip() if snippet_elem else ""

                if title and href:
                    results.append(SearchResult(
                        title=clean_text(title),
                        url=href,
                        snippet=clean_text(snippet)[:MAX_SNIPPET_LENGTH],
                        position=len(results) + 1,
                    ))
                    slog.step(f"  [DDG {len(results)}] {title[:60]}")
            except Exception as e:
                slog.warn(f"[DDG] Container extraction failed: {e}")
                continue

    finally:
        if browser:
            await browser.close()
        if playwright_inst:
            await playwright_inst.stop()

    return results


# ─── Search: Google (fallback) ────────────────────────────────────────────────

async def _search_google(query: str, max_results: int, slog: "StepLogger") -> List["SearchResult"]:
    """Search using Google — stronger bot detection, used as fallback."""
    results: List[SearchResult] = []
    browser = None
    playwright_inst = None

    try:
        browser, playwright_inst = await create_stealth_browser()
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        page = await browser.new_page(user_agent=ua, locale="en-US")
        page.set_default_timeout(PAGE_LOAD_TIMEOUT)
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)
        await apply_stealth(page)

        search_url = f"https://www.google.com/search?q={quote_plus(query)}&hl=en&gl=us&num={max_results + 3}"
        slog.step(f"[Google] Navigating to: {search_url}")

        response = await page.goto(search_url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT)
        slog.ok(f"[Google] Page loaded (HTTP {response.status if response else '?'})")

        # Check for CAPTCHA: must have the form AND a suspicious page title
        page_title = (await page.title()).lower()
        slog.step(f"[Google] Page title: '{page_title}'")

        is_captcha = False
        if any(hint in page_title for hint in GOOGLE_CAPTCHA_TITLE_HINTS):
            for sel in GOOGLE_CAPTCHA_SELECTORS:
                try:
                    elem = await page.query_selector(sel)
                    if elem:
                        is_captcha = True
                        slog.warn(f"[Google] CAPTCHA confirmed: title='{page_title}' selector='{sel}'")
                        break
                except Exception:
                    pass

        if is_captcha:
            await _save_debug_screenshot(page, "google_captcha")
            await _dump_page_html(page, "google_captcha")
            slog.error("[Google] Blocked by CAPTCHA — Google fallback failed")
            return []

        # Wait for results
        for wait_sel in ["#search", "#rso", "div.g", "[data-hveid]"]:
            try:
                await page.wait_for_selector(wait_sel, timeout=SELECTOR_TIMEOUT)
                slog.ok(f"[Google] Results container found: '{wait_sel}'")
                break
            except PlaywrightTimeoutError:
                slog.warn(f"[Google] Selector '{wait_sel}' not found, trying next...")

        # Extract using multiple strategies
        for strategy in GOOGLE_RESULT_SELECTORS:
            if len(results) >= max_results:
                break
            containers = await page.query_selector_all(strategy["container"])
            slog.step(f"[Google] Strategy '{strategy['container']}' → {len(containers)} containers")
            if not containers:
                continue

            for container in containers:
                if len(results) >= max_results:
                    break
                try:
                    title_elem = await container.query_selector(strategy["title"])
                    title = (await title_elem.text_content() or "").strip() if title_elem else ""

                    link_elem = await container.query_selector(strategy["link"])
                    href = (await link_elem.get_attribute("href") or "") if link_elem else ""
                    if not href.startswith(("http://", "https://")):
                        continue

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
                        slog.step(f"  [Google {len(results)}] {title[:60]}")
                except Exception as e:
                    slog.warn(f"[Google] Container extraction failed: {e}")
                    continue

        if not results:
            await _save_debug_screenshot(page, "google_zero_results")
            await _dump_page_html(page, "google_zero_results")

    finally:
        if browser:
            await browser.close()
        if playwright_inst:
            await playwright_inst.stop()

    return results


# ─── Search (public API) ─────────────────────────────────────────────────────

async def search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Search the web and return structured results.
    Tries DuckDuckGo first (bot-friendly), falls back to Google.

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
    slog.step(f"Query='{query}' max_results={max_results} stealth={'ON' if STEALTH_AVAILABLE else 'BASIC'}")
    start_time = datetime.now()

    results: List[SearchResult] = []

    # 1. Try Bing (primary — reliable, minimal bot detection)
    try:
        slog.step("Attempting Bing (primary)...")
        results = await _search_bing(query, max_results, slog)
        if results:
            slog.ok(f"Bing returned {len(results)} results")
        else:
            slog.warn("Bing returned 0 results — trying DuckDuckGo")
    except Exception as e:
        slog.warn(f"Bing failed: {e} — trying DuckDuckGo")

    # 2. Fallback to DuckDuckGo
    if not results:
        try:
            slog.step("Attempting DuckDuckGo (fallback)...")
            results = await _search_duckduckgo(query, max_results, slog)
            if results:
                slog.ok(f"DuckDuckGo returned {len(results)} results")
            else:
                slog.warn("DuckDuckGo returned 0 results — trying Google")
        except Exception as e:
            slog.warn(f"DuckDuckGo failed: {e} — trying Google")

    # 3. Last resort: Google
    if not results:
        try:
            slog.step("Attempting Google (last resort)...")
            results = await _search_google(query, max_results, slog)
            if results:
                slog.ok(f"Google returned {len(results)} results")
            else:
                slog.error("All search engines returned 0 results")
        except Exception as e:
            slog.error(f"Google fallback failed: {e}")
            return {"error": f"All search engines failed. Last error: {e}", "query": query, "results": []}

    execution_time = (datetime.now() - start_time).total_seconds()
    slog.ok(f"Total time: {execution_time:.2f}s, results: {len(results)}")

    return SearchResponse(
        query=query,
        results=results,
        total_results=len(results),
        execution_time=execution_time,
        timestamp=datetime.now().isoformat(),
    ).to_dict()


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


# ─── ADK-Compatible Tool Functions ───────────────────────────────────────────
# ADK builds the tool schema from type annotations + docstring.
# These functions are designed to be passed directly to Agent(tools=[...])
# via FunctionTool wrapping in agent_server.py.

async def google_search(query: str, max_results: int = 5) -> str:
    """Search the web for the given query using Bing/DuckDuckGo/Google.

    Returns a JSON string with keys:
      - query: the original search query
      - results: list of {position, title, url, snippet}
      - total_results: number of results returned
      - execution_time: seconds taken
      - error: null on success, error message on failure

    Args:
        query: The search query string, e.g. 'latest AI news'
        max_results: How many results to return (1-10, default 5)

    Returns:
        JSON string with search results
    """
    result = await search(query, max_results)
    return json.dumps(result, ensure_ascii=False, indent=2)


async def fetch_webpage(url: str) -> str:
    """Fetch and extract the main text content from a web page URL.

    Strips HTML tags, ads, and navigation elements.
    Returns a JSON string with keys:
      - url: the fetched URL
      - title: page title
      - content: extracted plain text (up to 16,000 chars)
      - content_length: character count of content
      - execution_time: seconds taken
      - error: null on success, error message on failure

    Args:
        url: The full URL to fetch, e.g. 'https://example.com/article'

    Returns:
        JSON string with extracted page content
    """
    result = await fetch_content(url)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ─── Legacy factory helpers (kept for backward compatibility) ─────────────────

def create_google_search_tool(config: Optional[Dict] = None):
    """Return the google_search function (pass to FunctionTool in agent_server)."""
    return google_search


def create_fetch_content_tool(config: Optional[Dict] = None):
    """Return the fetch_webpage function (pass to FunctionTool in agent_server)."""
    return fetch_webpage


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
