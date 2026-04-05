#!/usr/bin/env python3
"""
Integration Guide for Web Search Tool with ADK Agent Server
"""

INTEGRATION_GUIDE = """

╔════════════════════════════════════════════════════════════════════════════╗
║                    Web Search Tool Integration Guide                       ║
║              High-Performance Stealthy Web Search for AI Agents            ║
╚════════════════════════════════════════════════════════════════════════════╝

## 📋 목차
1. 설치 및 준비
2. 웹 검색 도구 독립 테스트
3. ADK 에이전트 서버 통합
4. 전체 워크플로우
5. 트러블슈팅 및 성능 최적화

═══════════════════════════════════════════════════════════════════════════════

## 1️⃣ 설치 및 준비

### 1.1 디렉토리 구조 확인

```
adk_server/
├── agent_server.py                 # ADK 에이전트 서버 (수정됨)
├── web_search_tool.py              # ✨ NEW: 웹 검색 도구
├── test_web_search_tool.py         # ✨ NEW: 테스트 스크립트
├── WEB_SEARCH_TOOL_README.md       # ✨ NEW: 상세 설명서
├── agent_configs.example.json      # ✨ NEW: 에이전트 설정 예제
├── requirements.txt                # 수정됨: 의존성 추가
└── __init__.py                     # (있으면 자동 인식)
```

### 1.2 Python 환경 설정

```bash
# 1. Python 3.9+ 확인
python3 --version

# 2. 가상 환경 생성 (권장)
cd /Users/ryan/App/Zunery-Nexus/adk_server
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or
venv\\Scripts\\activate    # Windows

# 3. 의존성 설치
pip install --upgrade pip
pip install -r requirements.txt

# 4. Playwright 브라우저 설치 (필수!)
playwright install chromium
```

### 1.3 의존성 확인

```bash
# 설치 확인
python3 -c "from web_search_tool import search, fetch_content; print('✅ web_search_tool imported successfully')"

# Playwright 확인
python3 -c "from playwright.async_api import async_playwright; print('✅ Playwright available')"

# Stealth 확인
python3 -c "from playwright_stealth import stealth_async; print('✅ playwright-stealth available')"

# BeautifulSoup 확인
python3 -c "from bs4 import BeautifulSoup; print('✅ BeautifulSoup4 available')"
```

═══════════════════════════════════════════════════════════════════════════════

## 2️⃣ 웹 검색 도구 독립 테스트

### 2.1 Tool Definition 확인

```bash
python3 test_web_search_tool.py
```

Expected Output:
```
🧪 Web Search Tool - Test Suite

========================================
TEST 3: Tool Definitions (for ADK integration)
========================================

--- Google Search Tool Definition ---
{
  "name": "google_search",
  "description": "Search the web using Google Search with stealth mode. Returns relevant search results.",
  "parameters": {
    "type": "object",
    ...
  }
}
```

### 2.2 CLI로 직접 테스트

```bash
# 검색 테스트
python3 web_search_tool.py search "Anthropic Claude" 3

# Expected output:
# {
#   "query": "Anthropic Claude",
#   "results": [
#     {
#       "position": 1,
#       "title": "Claude - Anthropic",
#       "url": "https://claude.ai",
#       "snippet": "..."
#     },
#     ...
#   ],
#   "total_results": 3,
#   "execution_time": 2.45,
#   "timestamp": "2024-04-05T10:30:00",
#   "error": null
# }
```

```bash
# 콘텐츠 추출 테스트
python3 web_search_tool.py fetch "https://www.python.org"

# Expected output:
# {
#   "url": "https://www.python.org",
#   "title": "Welcome to Python.org",
#   "content": "Python is a programming language...",
#   "content_length": 5234,
#   "execution_time": 3.12,
#   ...
# }
```

### 2.3 Python에서 직접 테스트

```python
import asyncio
from web_search_tool import search, fetch_content

async def test():
    # 검색 테스트
    result = await search("Python AsyncIO", max_results=3)
    assert result['total_results'] >= 0
    assert not result.get('error')
    print("✅ Search working")

    # 콘텐츠 추출 테스트
    result = await fetch_content("https://python.org")
    assert result['content_length'] > 0
    assert not result.get('error')
    print("✅ Fetch working")

asyncio.run(test())
```

═══════════════════════════════════════════════════════════════════════════════

## 3️⃣ ADK 에이전트 서버 통합

### 3.1 에이전트 서버 시작

```bash
# 기본 포트(7891)로 시작
python3 agent_server.py

# 커스텀 포트로 시작
python3 agent_server.py --port 8000

# Expected output:
# [ADK] Starting on port 7891 (ADK: available, google_search: available (Playwright))
# ADK_READY
```

### 3.2 에이전트 등록 및 실행

```bash
# 다른 터미널에서:
curl -X POST http://localhost:7891/agents \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "research-001",
    "name": "Research Assistant",
    "description": "An AI research assistant",
    "provider": "ollama",
    "model": "gemma4:26b",
    "baseUrl": "http://localhost:11434",
    "tools": ["web_search"],
    "system_prompt": "You are a helpful research assistant with web search capabilities."
  }'

# Response:
# {"ok": true, "id": "research-001"}
```

### 3.3 에이전트 실행

```bash
curl -X POST http://localhost:7891/agents/research-001/run \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "What are the latest developments in AI?",
    "session_id": "demo-session"
  }'

# Response:
# {
#   "ok": true,
#   "content": "Based on my search, the latest developments in AI..."
# }
```

### 3.4 상태 확인

```bash
# 건강 상태 확인
curl http://localhost:7891/health

# Response:
# {
#   "ok": true,
#   "version": "1.0.0",
#   "adk_available": true,
#   "agents": 1
# }

# 등록된 에이전트 확인
curl http://localhost:7891/agents

# Response:
# {
#   "agents": {
#     "research-001": {
#       "id": "research-001",
#       "name": "Research Assistant",
#       "model": "gemma4:26b",
#       ...
#     }
#   }
# }
```

═══════════════════════════════════════════════════════════════════════════════

## 4️⃣ 전체 워크플로우 예제

### 시나리오: "최신 AI 뉴스" 조사

#### 4.1 에이전트 서버 시작

```bash
# 터미널 1
cd /Users/ryan/App/Zunery-Nexus/adk_server
python3 agent_server.py
```

#### 4.2 Ollama 실행 (모델 서버)

```bash
# 터미널 2
ollama serve
# or
ollama run gemma4:26b
```

#### 4.3 에이전트 등록

```bash
# 터미널 3
curl -X POST http://localhost:7891/agents \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "news-bot",
    "name": "News Bot",
    "description": "AI news aggregator and analyzer",
    "provider": "ollama",
    "model": "gemma4:26b",
    "baseUrl": "http://localhost:11434",
    "tools": ["web_search", "fetch_content"],
    "system_prompt": "You are a news aggregator bot. When asked about news, search for the latest information, fetch full articles, and provide a comprehensive summary with sources."
  }'
```

#### 4.4 뉴스 조회 요청

```bash
# 조회 요청
curl -X POST http://localhost:7891/agents/news-bot/run \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "What are today'\''s top AI news stories?",
    "session_id": "news-session-001"
  }'

# Agent 흐름:
# 1. LLM이 메시지를 분석
# 2. google_search 도구 호출: "AI news today 2024"
# 3. 최상위 결과들에 대해 fetch_webpage 호출
# 4. 정보를 종합하여 최종 응답 생성
```

═══════════════════════════════════════════════════════════════════════════════

## 5️⃣ 프로덕션 배포 체크리스트

### 5.1 성능 최적화

```python
# web_search_tool.py에서 조정 가능한 설정들:

# 타임아웃 값 (ms)
PAGE_LOAD_TIMEOUT = 30000      # 페이지 로드 최대 대기
NAVIGATION_TIMEOUT = 30000     # 네비게이션 최대 대기
SEARCH_TIMEOUT = 20000         # 검색 결과 로드 최대 대기

# LLM 최적화
MAX_SEARCH_RESULTS_TOKENS = 1500  # 검색 결과 토큰 제한
MAX_CONTENT_TOKENS = 4000         # 콘텐츠 토큰 제한
MAX_CONTENT_LENGTH = 16000        # 콘텐츠 문자 제한
```

### 5.2 에러 처리

```python
# 모든 응답은 JSON이므로 클라이언트에서:
import json
import time

response = curl.get("...")
data = json.loads(response)

if data.get("error"):
    error_type = identify_error(data["error"])
    if "CAPTCHA" in error_type:
        # Google이 봇 감지 - 지수 백오프 재시도
        wait_time = data.get("retry_after", 300)
        time.sleep(wait_time)
        retry()
    elif "timeout" in error_type:
        # 네트워크 문제 - 재시도
        time.sleep(5)
        retry()
```

### 5.3 로깅 설정

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('web_search.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
```

### 5.4 보안 고려사항

- [ ] Google의 Terms of Service 준수
- [ ] User Agent 수정 금지
- [ ] Rate limiting 구현 (동시 요청 제한)
- [ ] 검색 로그 암호화
- [ ] 민감한 정보 필터링

### 5.5 모니터링

```bash
# 정기적인 헬스 체크
watch -n 60 'curl -s http://localhost:7891/health | jq'

# 로그 모니터링
tail -f web_search.log

# 활성 에이전트 확인
curl -s http://localhost:7891/agents | jq '.agents | keys'
```

═══════════════════════════════════════════════════════════════════════════════

## 트러블슈팅

### ❌ "Playwright not installed"

```bash
pip install playwright
playwright install chromium
```

### ❌ "CAPTCHA detected"

- Google이 봇으로 의심
- 재시도 권장 (response에 retry_after 값 확인)
- 검색 간격 늘리기
- IP 변경 고려

### ❌ "Page load timeout"

- 네트워크 속도 저하
- 타임아웃 값 증가
- 또는 URL 존재 확인

### ❌ "Module import error"

```bash
# 모든 의존성 재설치
pip install -r requirements.txt --force-reinstall
```

═══════════════════════════════════════════════════════════════════════════════

## 📊 Metrics & Performance

### 예상 성능 지표

- **검색**: 2-5초 (5개 결과)
- **콘텐츠 추출**: 2-4초 (평균 페이지)
- **메모리 사용**: ~100-150MB per request
- **동시성**: 1-3 concurrent requests (권장)

### 최적화 팁

1. **배치 처리**: 여러 검색을 순차적으로 수행
2. **캐싱**: 최근 검색 결과 캐시
3. **병렬화**: 독립적인 요청은 병렬 처리
4. **리소스 제한**: max_results 조절로 응답 시간 단축

═══════════════════════════════════════════════════════════════════════════════

## 다음 단계

1. ✅ 웹 검색 도구 설치 및 테스트 완료
2. ✅ ADK 에이전트 서버에 통합 완료
3. 📝 추가 사항:
   - [ ] Caching layer 구현
   - [ ] Multi-agent orchestration
   - [ ] Custom search providers (Bing, DuckDuckGo 등)
   - [ ] Persistent session management

═══════════════════════════════════════════════════════════════════════════════

더 질문이 있으신가요? WEB_SEARCH_TOOL_README.md를 참조하세요!

"""

print(INTEGRATION_GUIDE)

__doc__ = INTEGRATION_GUIDE
