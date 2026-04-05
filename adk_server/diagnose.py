#!/usr/bin/env python3
"""
Web Search Tool - Diagnostics & Test Script

실행:
  python diagnose.py           # 전체 진단
  python diagnose.py deps      # 의존성 확인만
  python diagnose.py search    # 검색 테스트만
  python diagnose.py fetch     # 콘텐츠 추출 테스트만
  python diagnose.py selectors # Google 셀렉터 디버그 (브라우저 실제 오픈)
"""

import asyncio
import json
import sys
import os
import subprocess
import shutil
import platform
from datetime import datetime

# ─── Color Output ─────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg): print(f"  {GREEN}✓{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET} {msg}")
def fail(msg): print(f"  {RED}✗{RESET} {msg}")
def info(msg): print(f"  {CYAN}→{RESET} {msg}")
def header(title): print(f"\n{BOLD}{'─'*60}\n  {title}\n{'─'*60}{RESET}")


# ─── 1. Dependency Check ─────────────────────────────────────────────────────

def check_dependencies():
    header("1. 의존성 확인 (Dependency Check)")

    all_ok = True

    # Python version
    py = sys.version_info
    if py >= (3, 9):
        ok(f"Python {py.major}.{py.minor}.{py.micro}")
    else:
        fail(f"Python {py.major}.{py.minor} — 3.9+ required")
        all_ok = False

    # Package checks
    packages = {
        "playwright":         ("from playwright.async_api import async_playwright", "pip install playwright && playwright install chromium"),
        "playwright-stealth": ("from playwright_stealth import Stealth", "pip install playwright-stealth"),
        "bs4":                ("from bs4 import BeautifulSoup", "pip install beautifulsoup4"),
    }

    for pkg, (import_stmt, install_cmd) in packages.items():
        try:
            exec(import_stmt)
            # Get version
            result = subprocess.run([sys.executable, "-m", "pip", "show", pkg],
                                    capture_output=True, text=True)
            version_line = next((l for l in result.stdout.splitlines() if l.startswith("Version")), "")
            version = version_line.split(": ")[-1] if version_line else "?"
            ok(f"{pkg} {version}")
        except Exception:
            fail(f"{pkg} not installed")
            info(f"Fix: {install_cmd}")
            all_ok = False

    # Playwright browser
    print()
    info("Checking Playwright browsers...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "playwright", "show", "chromium"],
            capture_output=True, text=True
        )
        if "not found" in result.stdout.lower() or result.returncode != 0:
            # Try alternative check
            result2 = subprocess.run(
                [sys.executable, "-c", "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(); b.close(); p.stop(); print('OK')"],
                capture_output=True, text=True, timeout=30
            )
            if "OK" in result2.stdout:
                ok("Chromium browser available")
            else:
                fail(f"Chromium browser not found: {result2.stderr[:100]}")
                info("Fix: playwright install chromium")
                all_ok = False
        else:
            ok("Chromium browser available")
    except Exception as e:
        warn(f"Could not verify browser: {e}")
        info("Run: playwright install chromium")

    # Network check
    print()
    info("Checking network connectivity...")
    try:
        import urllib.request
        urllib.request.urlopen("https://www.google.com", timeout=5)
        ok("Google.com reachable")
    except Exception as e:
        fail(f"Google.com not reachable: {e}")
        warn("검색이 작동하려면 인터넷 연결이 필요합니다")
        all_ok = False

    return all_ok


# ─── 2. Import Check ─────────────────────────────────────────────────────────

def check_imports():
    header("2. 모듈 임포트 확인")

    try:
        from web_search_tool import (
            search, fetch_content,
            PLAYWRIGHT_AVAILABLE, STEALTH_AVAILABLE, BEAUTIFULSOUP_AVAILABLE,
            GOOGLE_SEARCH_TOOL_DEFINITION, FETCH_CONTENT_TOOL_DEFINITION,
            create_google_search_tool, create_fetch_content_tool,
        )
        ok("web_search_tool 임포트 성공")
        ok(f"PLAYWRIGHT_AVAILABLE = {PLAYWRIGHT_AVAILABLE}")
        ok(f"STEALTH_AVAILABLE    = {STEALTH_AVAILABLE}")
        ok(f"BEAUTIFULSOUP_AVAILABLE = {BEAUTIFULSOUP_AVAILABLE}")

        if not PLAYWRIGHT_AVAILABLE:
            fail("Playwright를 설치해야 검색이 작동합니다")
            return False
        if not STEALTH_AVAILABLE:
            warn("playwright-stealth 없음 — 기본 스텔스만 적용됩니다")
        return True
    except ImportError as e:
        fail(f"임포트 실패: {e}")
        info("web_search_tool.py 파일이 같은 디렉토리에 있어야 합니다")
        return False


# ─── 3. Search Test ──────────────────────────────────────────────────────────

async def test_search():
    header("3. 검색 기능 테스트 (Google Search)")

    from web_search_tool import search

    query = "Python programming language"
    info(f"쿼리: '{query}' (max_results=3)")
    print()

    t0 = datetime.now()
    result = await search(query, max_results=3)
    elapsed = (datetime.now() - t0).total_seconds()

    print(f"\n  {'─'*50}")
    if "error" in result and result["error"]:
        fail(f"에러 발생: {result['error']}")
        if "CAPTCHA" in result.get("error", ""):
            warn("Google이 봇으로 의심 — 잠시 후 재시도하세요")
            warn("팁: WST_DEBUG=1 python diagnose.py selectors  (브라우저 직접 확인)")
        elif "timeout" in result.get("error", "").lower():
            warn("네트워크 속도가 느리거나 응답이 없습니다")
        return False

    n = result.get("total_results", 0)
    if n == 0:
        fail("결과 0개 — 셀렉터가 Google HTML과 맞지 않을 수 있습니다")
        warn("WST_DEBUG=1 python diagnose.py selectors  를 실행해 HTML 덤프를 확인하세요")
        return False

    ok(f"{n}개 결과 수신 ({elapsed:.2f}초)")
    print()
    for r in result["results"]:
        print(f"  [{r['position']}] {r['title'][:70]}")
        print(f"      URL    : {r['url'][:80]}")
        print(f"      Snippet: {r['snippet'][:100]}")
        print()

    return True


# ─── 4. Fetch Test ───────────────────────────────────────────────────────────

async def test_fetch():
    header("4. 콘텐츠 추출 테스트 (Fetch Content)")

    from web_search_tool import fetch_content

    url = "https://www.python.org/"
    info(f"대상 URL: {url}")
    print()

    t0 = datetime.now()
    result = await fetch_content(url)
    elapsed = (datetime.now() - t0).total_seconds()

    print(f"\n  {'─'*50}")
    if "error" in result and result["error"]:
        fail(f"에러 발생: {result['error']}")
        return False

    title = result.get("title", "")
    content = result.get("content", "")
    length = result.get("content_length", 0)

    ok(f"페이지 제목: '{title}'")
    ok(f"추출된 텍스트: {length:,}자 ({elapsed:.2f}초)")
    print()
    print(f"  {CYAN}--- 본문 미리보기 (첫 400자) ---{RESET}")
    print(f"  {content[:400]}")
    print()

    if length < 100:
        warn("추출된 텍스트가 너무 짧습니다 (JS 렌더링 필요한 페이지일 수 있음)")
        return False

    return True


# ─── 5. Selector Debug (WST_DEBUG=1) ─────────────────────────────────────────

async def test_selectors():
    header("5. Google 셀렉터 디버그 (브라우저 실제 오픈)")

    import os
    os.environ["WST_DEBUG"] = "1"  # force debug mode

    # Reload module with debug flag
    if "web_search_tool" in sys.modules:
        del sys.modules["web_search_tool"]

    from web_search_tool import search, SCREENSHOT_DIR

    info("브라우저를 열고 Google.com에서 미리 셀렉터를 검사합니다")
    info(f"스크린샷 저장 경로: {SCREENSHOT_DIR}")
    print()

    result = await search("site:python.org Python tutorial", max_results=3)

    print()
    if result.get("total_results", 0) > 0:
        ok(f"결과 {result['total_results']}개 — 셀렉터 정상 작동!")
    else:
        fail("결과 0개")
        info(f"스크린샷/HTML 덤프를 확인하세요: {SCREENSHOT_DIR}")

    return result.get("total_results", 0) > 0


# ─── 6. Tool Definition Check ────────────────────────────────────────────────

def check_tool_definitions():
    header("6. Tool Definition 확인 (ADK 통합)")

    from web_search_tool import GOOGLE_SEARCH_TOOL_DEFINITION, FETCH_CONTENT_TOOL_DEFINITION

    for defn in [GOOGLE_SEARCH_TOOL_DEFINITION, FETCH_CONTENT_TOOL_DEFINITION]:
        name = defn.get("name", "?")
        params = list(defn.get("parameters", {}).get("properties", {}).keys())
        required = defn.get("parameters", {}).get("required", [])
        ok(f"tool '{name}' — params: {params}, required: {required}")


# ─── 7. Full JSON Output ─────────────────────────────────────────────────────

async def show_full_json():
    header("7. JSON 응답 샘플 (실제 출력 형태)")

    from web_search_tool import search

    result = await search("Playwright Python stealth", max_results=2)
    print()
    print(json.dumps(result, ensure_ascii=False, indent=2))


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    print(f"\n{BOLD}{'='*60}")
    print(f"  Web Search Tool — 진단 스크립트")
    print(f"  플랫폼: {platform.system()} {platform.machine()}")
    print(f"  시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}{RESET}")

    if mode in ("all", "deps"):
        deps_ok = check_dependencies()
        if not deps_ok and mode == "all":
            print(f"\n{RED}의존성 문제가 있습니다. 위의 Fix 명령을 실행한 후 재시도하세요.{RESET}\n")
            return

    if mode in ("all", "imports"):
        imports_ok = check_imports()
        if not imports_ok and mode == "all":
            return

    if mode == "all":
        check_tool_definitions()

    if mode in ("all", "search"):
        try:
            await test_search()
        except Exception as e:
            fail(f"검색 테스트 예외: {e}")
            import traceback
            traceback.print_exc()

    if mode in ("all", "fetch"):
        try:
            await test_fetch()
        except Exception as e:
            fail(f"콘텐츠 추출 테스트 예외: {e}")
            import traceback
            traceback.print_exc()

    if mode == "selectors":
        try:
            await test_selectors()
        except Exception as e:
            fail(f"셀렉터 디버그 예외: {e}")
            import traceback
            traceback.print_exc()

    if mode == "json":
        try:
            await show_full_json()
        except Exception as e:
            fail(f"JSON 출력 예외: {e}")

    # Summary
    print(f"\n{BOLD}{'─'*60}")
    print("  진단 완료!")
    print(f"{'─'*60}{RESET}")
    print()
    print("  유용한 커맨드:")
    print(f"  {CYAN}python web_search_tool.py check{RESET}               # 의존성 체크")
    print(f"  {CYAN}python web_search_tool.py search 'Python' 3{RESET}    # 검색 테스트")
    print(f"  {CYAN}python web_search_tool.py fetch https://python.org{RESET} # 추출 테스트")
    print(f"  {CYAN}WST_DEBUG=1 python diagnose.py selectors{RESET}       # 브라우저 열어서 디버그")
    print(f"  {CYAN}python diagnose.py json{RESET}                        # JSON 응답 샘플 출력")
    print()


if __name__ == "__main__":
    # Change to script's directory so imports work correctly
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    asyncio.run(main())
