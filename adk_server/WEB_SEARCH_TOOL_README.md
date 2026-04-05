# High-Performance Stealthy Web Search Tool

**Python + Playwright를 활용한 고성능 웹 검색 도구**

AI 에이전트를 위한 보트 감지 회피 및 스테이스풀 웹 검색/콘텐츠 추출 모듈입니다.

---

## 🎯 주요 기능

### 1. **무탐지 웹 검색 (Google Search)**
- `playwright-stealth` 적용으로 봇 감지 우회
- 자동 CAPTCHA 감지 및 에러 처리
- LLM 최적화된 JSON 응답

### 2. **스테이스풀 콘텐츠 추출**
- 웹페이지 본문 텍스트만 자동 추출
- HTML 태그, 광고 스크립트 제거
- 토큰 절약을 위한 자동 절단 로직

### 3. **에이전트 통합**
- Google ADK 호환 Tool Definition
- Factory 패턴으로 쉬운 통합
- 동기/비동기 인터페이스 모두 지원

---

## 📦 설치

### 필수 의존성

```bash
# 의존성 설치
pip install -r requirements.txt
```

**requirements.txt** 내용:
```
playwright>=1.40.0
playwright-stealth>=1.0.0
beautifulsoup4>=4.12.0
google-adk>=0.1.0
litellm>=1.0.0
```

### Playwright 브라우저 설치

```bash
# Chromium 브라우저 다운로드 (필수)
playwright install chromium
```

---

## 🚀 빠른 시작

### 1. CLI 사용

```bash
# 웹 검색
python web_search_tool.py search "Python Playwright stealth" 5

# 콘텐츠 추출
python web_search_tool.py fetch "https://example.com"
```

### 2. Python 코드에서 사용 (비동기)

```python
import asyncio
from web_search_tool import search, fetch_content

async def main():
    # 검색
    result = await search("AI latest news", max_results=5)
    print(result)

    # 콘텐츠 추출
    content = await fetch_content("https://example.com")
    print(content)

asyncio.run(main())
```

### 3. Python 코드에서 사용 (동기)

```python
from web_search_tool import search_sync, fetch_content_sync

# 검색
result = search_sync("AI latest news", max_results=5)
print(result)

# 콘텐츠 추출
content = fetch_content_sync("https://example.com")
print(content)
```

### 4. ADK 에이전트에 통합

```python
from web_search_tool import create_google_search_tool, create_fetch_content_tool

# 도구 생성
search_tool = create_google_search_tool()
fetch_tool = create_fetch_content_tool()

# ADK Agent에 추가
agent = Agent(
    name="my_agent",
    model=model,
    tools=[search_tool, fetch_tool],
    instruction="You are a research assistant with web search capabilities."
)
```

---

## 📋 API 상세

### `search(query, max_results=5)`

Google에서 검색을 수행합니다.

**매개변수:**
- `query` (str): 검색 쿼리
- `max_results` (int, 1-10): 반환할 최대 결과 수 (기본값: 5)

**반환:**
```json
{
  "query": "검색 쿼리",
  "results": [
    {
      "position": 1,
      "title": "결과 제목",
      "url": "https://example.com",
      "snippet": "간단한 설명 (200자 제한)"
    }
  ],
  "total_results": 5,
  "execution_time": 2.34,
  "timestamp": "2024-04-05T10:30:00.000000",
  "error": null
}
```

**에러 처리:**
- `timeout`: 페이지 로드가 30초 초과
- `CAPTCHA detected`: Google의 봇 감지 (재시도 권장)
- `navigation failed`: URL 로드 실패

### `fetch_content(url)`

URL에서 콘텐츠를 추출합니다.

**매개변수:**
- `url` (str): 추출할 웹페이지 URL

**반환:**
```json
{
  "url": "https://example.com",
  "title": "페이지 제목",
  "content": "추출된 본문 텍스트 (16,000자 제한)",
  "content_length": 5234,
  "execution_time": 3.45,
  "timestamp": "2024-04-05T10:30:00.000000",
  "error": null
}
```

**특징:**
- 자동으로 본문만 추출 (nav, footer, script, style 제거)
- BeautifulSoup를 사용한 스마트 HTML 파싱
- 광고 및 추적 요소 제거
- LLM 토큰 절약을 위한 자동 절단

---

## 🛡️ 스텔스 모드 설정

도구는 다음의 anti-bot 기법을 자동 적용합니다:

### Browser 레벨
```
--disable-blink-features=AutomationControlled  # 자동화 신호 차단
--disable-dev-shm-usage                        # 메모리 가압
--no-first-run                                 # 초기 설정 진행
--disable-popup-blocking                       # 팝업 완전 차단
```

### Page 레벨 (playwright-stealth)
```javascript
// navigator.webdriver 속성 제거
Object.defineProperty(navigator, 'webdriver', { get: () => false })

// plugins/languages 속성 추가
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] })
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
```

### User Agent
```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
```

---

## ⚙️ 성능 및 최적화

### 타임아웃 설정
```python
PAGE_LOAD_TIMEOUT = 30000  # 30초
NAVIGATION_TIMEOUT = 30000 # 30초
SEARCH_TIMEOUT = 20000     # 20초
```

### LLM 토큰 최적화

**검색 결과:**
- 최대 1,500 토큰 (~6,000자)
- 스니펫당 200자 제한

**콘텐츠 추출:**
- 최대 4,000 토큰 (~16,000자)
- 초과 시 자동 절단 (단어 경계에서)

### 메모리 효율
```python
# 자동 브라우저 정리
try:
    # ... 작업 수행
finally:
    await browser.close()
    await playwright.stop()
```

---

## 🔧 Tool Definition (ADK)

### Google Search Tool

```json
{
  "name": "google_search",
  "description": "Search the web using Google Search with stealth mode. Returns relevant search results.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query string (e.g., 'latest AI breakthroughs')"
      },
      "max_results": {
        "type": "integer",
        "description": "Maximum number of results to return (1-10, default: 5)",
        "default": 5,
        "minimum": 1,
        "maximum": 10
      }
    },
    "required": ["query"]
  }
}
```

### Fetch Webpage Tool

```json
{
  "name": "fetch_webpage",
  "description": "Fetch and extract main content from a specific URL. Returns cleaned text content optimized for LLM processing.",
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The URL to fetch content from"
      }
    },
    "required": ["url"]
  }
}
```

---

## 📝 사용 예제

### 예제 1: 뉴스 검색 및 콘텐츠 추출

```python
import asyncio
from web_search_tool import search, fetch_content

async def research_topic(topic):
    print(f"🔍 Researching: {topic}")

    # 1단계: 검색
    search_results = await search(topic, max_results=3)

    if "error" in search_results:
        print(f"❌ Search failed: {search_results['error']}")
        return

    print(f"✅ Found {search_results['total_results']} results")

    # 2단계: 각 결과에서 콘텐츠 추출
    for result in search_results['results']:
        print(f"\n📄 {result['title']}")

        content = await fetch_content(result['url'])

        if "error" not in content:
            print(f"   Text length: {content['content_length']} chars")
            print(f"   Preview: {content['content'][:200]}...")
        else:
            print(f"   Failed to fetch: {content['error']}")

# 실행
asyncio.run(research_topic("Anthropic Claude AI latest"))
```

### 예제 2: ADK 에이전트에 통합

```python
from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from web_search_tool import create_google_search_tool, create_fetch_content_tool

# 모델 설정
model = LiteLlm(model="ollama/gemma4:26b", api_base="http://localhost:11434")

# 도구 생성
search_tool = create_google_search_tool()
fetch_tool = create_fetch_content_tool()

# 에이전트 생성
agent = Agent(
    name="research_assistant",
    model=model,
    description="An AI assistant that can search the web and extract content",
    instruction="You are a knowledgeable research assistant. When asked about topics, "
                "use the google_search tool to find relevant information, then use "
                "fetch_webpage to read the full content. Provide well-reasoned answers "
                "based on the information you find.",
    tools=[search_tool, fetch_tool],
)

# 실행 (Runner로 감싸서 사용)
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

runner = Runner(agent=agent, app_name="research_ai", session_service=InMemorySessionService())
```

---

## 🐛 트러블슈팅

### 1. "Playwright not installed" 에러

```bash
pip install playwright
playwright install chromium
```

### 2. CAPTCHA 감지됨 (Google)

Google이 봇으로 의심할 경우:
- 재시도를 1분 후에 수행
- 검색 빈도 낮추기
- 서로 다른 IP에서 검색 (VPN 고려)

```python
result = await search("query")
if "CAPTCHA" in result.get("error", ""):
    retry_after = result.get("retry_after", 60)
    print(f"⏳ Retry after {retry_after} seconds")
```

### 3. 콘텐츠 추출 실패

페이지가 JavaScript 기반인 경우:
```python
# Playwright는 자동으로 JS를 실행하므로 대부분 작동
# 매우 복잡한 페이지는 wait_for_timeout 추가
```

### 4. 느린 속도

```python
# 타임아웃 조정 (web_search_tool.py에서)
PAGE_LOAD_TIMEOUT = 20000  # 20초로 단축 (빠르지만 실패율 증가)
```

---

## 📊 출력 포맷 (JSON)

모든 응답이 JSON 형식으로 표준화되어 있어 LLM이 쉽게 파싱할 수 있습니다:

```python
import json

result = await search("AI news")
print(json.dumps(result, indent=2, ensure_ascii=False))
```

---

## 🔐 보안 주의사항

- **개인정보 보호**: 민감한 정보를 검색하지 마세요
- **로깅**: 로그에 검색 쿼리가 기록될 수 있습니다
- **레이트 제한**: Google의 레이트 제한을 존중하세요
- **Terms of Service**: Google의 TOS를 확인하세요

---

## 📄 라이선스 및 참고

- [Playwright 문서](https://playwright.dev/)
- [playwright-stealth](https://github.com/MichaelXF/playwright-stealth)
- [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/)

---

**최종 업데이트**: 2024년 4월 5일
**버전**: 1.0.0
