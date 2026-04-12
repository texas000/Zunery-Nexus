/**
 * FastAPI Backend Bridge
 * Spawns and communicates with the Python FastAPI backend server.
 * Replaces the old Python direct call logic with clean HTTP API calls.
 */

import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import axios from 'axios'
import { app } from 'electron'

const ADK_PORT = 7891
const ADK_BASE = `http://127.0.0.1:${ADK_PORT}`
let adkProcess: ChildProcess | null = null
let adkReady = false

/**
 * Find the backend entry point.
 * In dev: runs `python -m backend` from project root.
 * In production: runs the PyInstaller-built executable.
 */
function getBackendCommand(pythonPath: string): { cmd: string; args: string[]; cwd: string } {
  // Production: look for bundled executable
  const exeName = process.platform === 'win32' ? 'zunery-backend.exe' : 'zunery-backend'
  const bundledPaths = [
    join(app.getAppPath(), 'backend-dist', exeName),
    join(process.resourcesPath || '', 'backend-dist', exeName),
  ]

  for (const p of bundledPaths) {
    if (existsSync(p)) {
      return { cmd: p, args: ['--port', String(ADK_PORT)], cwd: join(p, '..') }
    }
  }

  // Development: run as Python module
  const projectRoots = [
    join(app.getAppPath()),
    process.cwd(),
    join(__dirname, '../..'),
  ]

  for (const root of projectRoots) {
    if (existsSync(join(root, 'backend', 'main.py'))) {
      return {
        cmd: pythonPath,
        args: ['-m', 'backend', '--port', String(ADK_PORT)],
        cwd: root,
      }
    }
  }

  // Fallback
  return {
    cmd: pythonPath,
    args: ['-m', 'backend', '--port', String(ADK_PORT)],
    cwd: process.cwd(),
  }
}

export async function startAdkServer(
  pythonPath = process.platform === 'win32' ? 'python' : 'python3'
): Promise<{ ok: boolean; error?: string }> {
  if (adkReady) return { ok: true }

  // Check if backend is already running (e.g. started by concurrently in dev)
  try {
    await axios.get(`${ADK_BASE}/health`, { timeout: 2000 })
    console.log('[Backend] Already running (external process)')
    adkReady = true
    return { ok: true }
  } catch {
    // Not running yet — spawn it
  }

  const { cmd, args, cwd } = getBackendCommand(pythonPath)
  console.log(`[Backend] Starting: ${cmd} ${args.join(' ')} (cwd: ${cwd})`)

  return new Promise((resolve) => {
    adkProcess = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd,
    })

    let started = false

    adkProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[Backend]', msg.trim())
      if (msg.includes('ADK_READY') && !started) {
        started = true
        adkReady = true
        resolve({ ok: true })
      }
    })

    adkProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Backend err]', data.toString().trim())
    })

    adkProcess.on('exit', (code) => {
      console.log('[Backend] process exited with code', code)
      adkReady = false
      adkProcess = null
    })

    adkProcess.on('error', (err) => {
      if (!started) {
        started = true
        resolve({ ok: false, error: err.message })
      }
    })

    // Timeout: 15s to allow FastAPI + uvicorn startup
    setTimeout(() => {
      if (!started) {
        started = true
        axios
          .get(`${ADK_BASE}/health`, { timeout: 2000 })
          .then(() => {
            adkReady = true
            resolve({ ok: true })
          })
          .catch(() => resolve({ ok: false, error: 'Backend server did not start in time' }))
      }
    }, 15000)
  })
}

export function stopAdkServer(): void {
  if (adkProcess) {
    adkProcess.kill()
    adkProcess = null
    adkReady = false
  }
}

export function isAdkReady(): boolean {
  return adkReady
}

// ─── Agent Management ────────────────────────────────────────────────────────

export interface AdkAgentConfig {
  id: string
  name: string
  model: string
  provider: string
  system_prompt: string
  tools: string[]
  baseUrl?: string
  apiKey?: string
}

export async function registerAdkAgent(
  config: AdkAgentConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.post(
      `${ADK_BASE}/agents`,
      {
        id: config.id,
        name: config.name,
        model: config.model,
        provider: config.provider,
        system_prompt: config.system_prompt,
        tools: config.tools,
        base_url: config.baseUrl || 'http://localhost:11434',
        api_key: config.apiKey || '',
      },
      { timeout: 10000 }
    )
    return { ok: res.data.ok === true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { ok: false, error: e.message }
  }
}

// ─── Chat API (new primary endpoint) ─────────────────────────────────────────

export interface ChatParams {
  agentId: string
  sessionId: string
  message: string
  history: { role: string; content: string }[]
  model?: string
  provider?: string
  baseUrl?: string
  systemPrompt?: string
  tools?: string[]
  temperature?: number
}

export async function chatWithAgent(
  params: ChatParams
): Promise<{ ok: boolean; content?: string; error?: string; tool_calls?: unknown[] }> {
  try {
    const res = await axios.post(
      `${ADK_BASE}/chat`,
      {
        agent_id: params.agentId,
        session_id: params.sessionId,
        message: params.message,
        history: params.history,
        model: params.model,
        provider: params.provider || 'ollama',
        base_url: params.baseUrl || 'http://localhost:11434',
        system_prompt: params.systemPrompt || '',
        tools: params.tools || [],
        temperature: params.temperature ?? 0.7,
      },
      { timeout: 120000 }
    )
    return {
      ok: res.data.ok,
      content: res.data.content,
      tool_calls: res.data.tool_calls,
      error: res.data.error,
    }
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: { error?: string } } }
    return { ok: false, error: e.response?.data?.error || e.message }
  }
}

// ─── Orchestrate API ─────────────────────────────────────────────────────────

export interface OrchestrateParams {
  message: string
  agents: Array<{
    id: string
    name: string
    description: string
    model: string
    provider: string
    system_prompt: string
    tools: string[]
    temperature: number
  }>
  settings: {
    obsidian_enabled: boolean
    obsidian_vault_path: string
    default_model: string
    ollama_base_url: string
  }
}

export interface OrchestrateResult {
  ok: boolean
  content: string
  agent_id: string
  agent_name: string
  reason: string
  context_source: string
  error?: string
}

export async function orchestrateWithBackend(
  params: OrchestrateParams
): Promise<OrchestrateResult> {
  try {
    const res = await axios.post(`${ADK_BASE}/orchestrate`, params, { timeout: 180000 })
    return res.data
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: { error?: string } } }
    return {
      ok: false,
      content: '',
      agent_id: '',
      agent_name: '',
      reason: '',
      context_source: '',
      error: e.response?.data?.error || e.message,
    }
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getAdkStatus(): Promise<{ running: boolean; version?: string }> {
  try {
    const res = await axios.get(`${ADK_BASE}/health`, { timeout: 2000 })
    return { running: true, version: res.data.version }
  } catch {
    return { running: false }
  }
}
