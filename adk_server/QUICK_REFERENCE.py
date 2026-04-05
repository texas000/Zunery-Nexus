#!/usr/bin/env python3
"""
Quick Reference Card - Web Search Tool for AI Agents
"""

QUICK_REFERENCE = """

╔════════════════════════════════════════════════════════════════════════════╗
║             🚀 Web Search Tool - Quick Reference Card                      ║
║                        High-Performance Edition                              ║
╚════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  설치 (Installation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$ cd adk_server
$ pip install -r requirements.txt
$ playwright install chromium

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣  CLI 사용법 (Command Line)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 웹 검색 (Google Search)
$ python web_search_tool.py search "쿼리" [최대개수]

예제:
$ python web_search_tool.py search "Python Playwright" 5
$ python web_search_tool.py search "AI news" 3

결과: JSON 형식의 검색 결과 (제목, URL, 스니펫)

# 콘텐츠 추출 (Fetch Content)
$ python web_search_tool.py fetch "https://example.com"

예제:
$ python web_search_tool.py fetch "https://python.org"
$ python web_search_tool.py fetch "https://www.bbc.com/news"

결과: JSON 형식의 웹페이지 본문 (제목, 내용, 길이)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3️⃣  Python 코드 사용 (Async)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import asyncio
from web_search_tool import search, fetch_content

async def main():
    # 검색
    results = await search("AI breakthroughs", max_results=5)
    print(results)

    # 콘텐츠 추출
    content = await fetch_content("https://example.com")
    print(content)

asyncio.run(main())

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4️⃣  Python 코드 사용 (Sync)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from web_search_tool import search_sync, fetch_content_sync

# 검색
results = search_sync("Python web scraping", max_results=5)
print(results)

# 콘텐츠 추출
content = fetch_content_sync("https://example.com")
print(content)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5️⃣  ADK 에이전트 통합
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from web_search_tool import create_google_search_tool, create_fetch_content_tool
from google.adk.agents import Agent

# 도구 생성
search_tool = create_google_search_tool()
fetch_tool = create_fetch_content_tool()

# 에이전트 등록
agent = Agent(
    name="research_bot",
    model=model,
    tools=[search_tool, fetch_tool],
    description="AI research assistant",
    instruction="You can search the web and extract content..."
)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6️⃣  에이전트 서버 실행
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

터미널 1: 에이전트 서버 시작
$ python agent_server.py
# 또는 커스텀 포트
$ python agent_server.py --port 8000

예상 출력:
[ADK] Starting on port 7891 (ADK: available, google_search: available (Playwright))
ADK_READY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7️⃣  HTTP API 사용 (cURL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 헬스 체크
$ curl http://localhost:7891/health

# 에이전트 등록
$ curl -X POST http://localhost:7891/agents \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "research-001",
    "name": "Research Assistant",
    "model": "gemma4:26b",
    "baseUrl": "http://localhost:11434",
    "tools": ["web_search", "fetch_content"],
    "system_prompt": "You are a research assistant..."
  }'

# 에이전트 실행
$ curl -X POST http://localhost:7891/agents/research-001/run \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "What is the latest news about AI?",
    "session_id": "session-001"
  }'

# 등록된 에이전트 확인
$ curl http://localhost:7891/agents

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8️⃣  테스트 실행
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$ python test_web_search_tool.py

결과:
✅ Tool Definition 검증
✅ 검색 기능 테스트
✅ 콘텐츠 추출 테스트
✅ ADK 통합 테스트

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 응답 포맷
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

검색 응답 (search):
{
  "query": "검색어",
  "results": [
    {
      "position": 1,
      "title": "제목",
      "url": "https://url.com",
      "snippet": "설명"
    }
  ],
  "total_results": 5,
  "execution_time": 2.34,
  "timestamp": "2024-04-05T10:30:00",
  "error": null
}

콘텐츠 응답 (fetch_content):
{
  "url": "https://example.com",
  "title": "페이지 제목",
  "content": "추출된 본문...",
  "content_length": 5234,
  "execution_time": 3.12,
  "timestamp": "2024-04-05T10:30:00",
  "error": null
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️  설정 값 (web_search_tool.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MAX_SEARCH_RESULTS_TOKENS = 1500      # 검색 결과 토큰 제한
MAX_CONTENT_TOKENS = 4000              # 콘텐츠 토큰 제한
MAX_CONTENT_LENGTH = 16000             # 콘텐츠 문자 제한

PAGE_LOAD_TIMEOUT = 30000              # 페이지 로드 타임아웃 (ms)
NAVIGATION_TIMEOUT = 30000             # 네비게이션 타임아웃 (ms)
SEARCH_TIMEOUT = 20000                 # 검색 타임아웃 (ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️  특징
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 봇 감지 우회    - playwright-stealth 사용
✅ CAPTCHA 감지   - 자동 탐지 및 에러 반환
✅ 스마트 추출    - BeautifulSoup로 본문만 추출
✅ JSON 표준화   - 모든 응답이 JSON 형식
✅ 토큰 절약     - LLM 최적화된 텍스트 길이 제한
✅ 자동 정리     - 브라우저 자동 종료 및 메모리 해제
✅ 에러 처리     - 타임아웃, 네트워크 오류 자동 처리

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 문서
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEB_SEARCH_TOOL_README.md      → 상세 API 문서 및 설정
INTEGRATION_GUIDE.py           → 설치 및 배포 가이드
test_web_search_tool.py        → 테스트 스크립트
SUMMARY.md                     → 개요 및 파일 트리
agent_configs.example.json     → 에이전트 설정 예제

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🐛 문제 해결
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Playwright not installed"
→ pip install playwright && playwright install chromium

"CAPTCHA detected"
→ 1분 후 재시도 (retry_after 값 확인)

"Page load timeout"
→ 네트워크 상태 확인 또는 타임아웃값 증가

"ImportError"
→ pip install -r requirements.txt --force-reinstall

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 버전: 1.0.0
🎯 상태: 프로덕션 준비 완료

✨ Happy researching! ✨

"""

if __name__ == "__main__":
    print(QUICK_REFERENCE)
