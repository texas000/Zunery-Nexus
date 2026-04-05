#!/usr/bin/env python3
"""
Web Search Tool Test & Example Script
Demonstrates how to use the Playwright-based web search tool.
"""

import asyncio
import json
from web_search_tool import search, fetch_content, GOOGLE_SEARCH_TOOL_DEFINITION, FETCH_CONTENT_TOOL_DEFINITION


async def test_search():
    """Test the search functionality."""
    print("\n" + "=" * 80)
    print("TEST 1: Web Search")
    print("=" * 80)

    query = "Python web scraping with Playwright"
    print(f"\nSearching for: '{query}'\n")

    result = await search(query, max_results=5)

    if "error" in result:
        print(f"❌ Error: {result['error']}")
        if "retry_after" in result:
            print(f"   Retry after: {result['retry_after']}s")
    else:
        print(f"✅ Found {result['total_results']} results in {result['execution_time']:.2f}s\n")

        for r in result['results']:
            print(f"[{r['position']}] {r['title']}")
            print(f"    URL: {r['url']}")
            print(f"    Snippet: {r['snippet'][:100]}...")
            print()


async def test_fetch():
    """Test the content fetching functionality."""
    print("\n" + "=" * 80)
    print("TEST 2: Content Fetching")
    print("=" * 80)

    url = "https://www.python.org/"
    print(f"\nFetching from: {url}\n")

    result = await fetch_content(url)

    if "error" in result:
        print(f"❌ Error: {result['error']}")
    else:
        print(f"✅ Fetched successfully in {result['execution_time']:.2f}s\n")
        print(f"Title: {result['title']}")
        print(f"Content length: {result['content_length']} characters")
        print(f"\nContent preview:\n{result['content'][:500]}...\n")


def test_tool_definitions():
    """Test tool definition exports."""
    print("\n" + "=" * 80)
    print("TEST 3: Tool Definitions (for ADK integration)")
    print("=" * 80)

    print("\n--- Google Search Tool Definition ---")
    print(json.dumps(GOOGLE_SEARCH_TOOL_DEFINITION, indent=2))

    print("\n--- Fetch Content Tool Definition ---")
    print(json.dumps(FETCH_CONTENT_TOOL_DEFINITION, indent=2))


async def test_integration_with_factory():
    """Test the factory functions for ADK integration."""
    print("\n" + "=" * 80)
    print("TEST 4: ADK Integration (Factory Functions)")
    print("=" * 80)

    from web_search_tool import create_google_search_tool, create_fetch_content_tool

    # Create tool instances
    search_tool = create_google_search_tool()
    fetch_tool = create_fetch_content_tool()

    print(f"\n✅ Created search_tool: {search_tool.name}")
    print(f"   Description: {search_tool.description}")
    print(f"   Parameters: {list(search_tool.parameters['properties'].keys())}")

    print(f"\n✅ Created fetch_tool: {fetch_tool.name}")
    print(f"   Description: {fetch_tool.description}")
    print(f"   Parameters: {list(fetch_tool.parameters['properties'].keys())}")

    # Test calling the tools
    print("\n--- Testing search_tool call ---")
    try:
        result_json = await search_tool("AI breakthroughs 2024", max_results=3)
        result = json.loads(result_json)
        print(f"✅ Search returned {result['total_results']} results")
    except Exception as e:
        print(f"❌ Error: {e}")


async def main():
    """Run all tests."""
    print("\n🧪 Web Search Tool - Test Suite\n")

    # Test 1: Tool definitions
    test_tool_definitions()

    # Test 2: Factory integration
    try:
        await test_integration_with_factory()
    except Exception as e:
        print(f"⚠️  Integration test skipped: {e}")

    # Test 3: Search functionality (requires browser)
    try:
        await test_search()
    except Exception as e:
        print(f"\n⚠️  Search test failed: {e}")
        print(f"   Make sure to install Playwright: pip install playwright")
        print(f"   And download browser: playwright install chromium")

    # Test 4: Fetch functionality (requires browser)
    try:
        await test_fetch()
    except Exception as e:
        print(f"\n⚠️  Fetch test failed: {e}")

    print("\n" + "=" * 80)
    print("Test suite completed!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
