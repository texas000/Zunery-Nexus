# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for building Zunery Nexus backend as a single executable.

Build:
    cd /path/to/Zunery-Nexus
    pyinstaller backend/zunery-backend.spec

Output:
    dist/zunery-backend  (or zunery-backend.exe on Windows)
"""

import sys
import os
from pathlib import Path

# Project root
PROJECT_ROOT = Path(SPECPATH).parent

block_cipher = None

a = Analysis(
    [str(PROJECT_ROOT / 'backend' / 'main.py')],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=[
        # Include tool modules
        (str(PROJECT_ROOT / 'backend' / 'tools'), 'backend/tools'),
        (str(PROJECT_ROOT / 'backend' / 'routers'), 'backend/routers'),
        (str(PROJECT_ROOT / 'backend' / 'models.py'), 'backend'),
        (str(PROJECT_ROOT / 'backend' / 'adk_engine.py'), 'backend'),
        (str(PROJECT_ROOT / 'backend' / '__init__.py'), 'backend'),
    ],
    hiddenimports=[
        # FastAPI & dependencies
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'pydantic',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # Backend modules
        'backend',
        'backend.main',
        'backend.models',
        'backend.adk_engine',
        'backend.routers',
        'backend.routers.chat',
        'backend.routers.agents',
        'backend.routers.tools_router',
        'backend.tools',
        'backend.tools.web_search',
        'backend.tools.obsidian',
        # Google ADK (optional)
        'google.adk',
        'google.adk.agents',
        'google.adk.models.lite_llm',
        'google.adk.runners',
        'google.adk.sessions',
        'google.adk.tools',
        'google.adk.tools.function_tool',
        # LiteLLM
        'litellm',
        # Playwright (lazy-loaded)
        'playwright',
        'playwright.async_api',
        'playwright_stealth',
        # BeautifulSoup
        'bs4',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'cv2',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='zunery-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for stdout IPC with Electron
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
