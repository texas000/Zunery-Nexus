import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import axios from 'axios'
import { app } from 'electron'

const ADK_PORT = 7891
const ADK_BASE = `http://127.0.0.1:${ADK_PORT}`
let adkProcess: ChildProcess | null = null
let adkReady = false

function getServerScript(): string {
  // In production, bundled; in dev, use source
  const candidates = [
    join(app.getAppPath(), 'adk_server', 'agent_server.py'),
    join(process.cwd(), 'adk_server', 'agent_server.py'),
    join(__dirname, '../../adk_server/agent_server.py'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

export async function startAdkServer(pythonPath = 'python3'): Promise<{ ok: boolean; error?: string }> {
  if (adkReady) return { ok: true }

  const script = getServerScript()
  if (!existsSync(script)) {
    return { ok: false, error: `ADK server script not found at ${script}` }
  }

  return new Promise((resolve) => {
    adkProcess = spawn(pythonPath, [script, '--port', String(ADK_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let started = false

    adkProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[ADK]', msg.trim())
      if (msg.includes('ADK_READY') && !started) {
        started = true
        adkReady = true
        resolve({ ok: true })
      }
    })

    adkProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[ADK err]', data.toString().trim())
    })

    adkProcess.on('exit', (code) => {
      console.log('[ADK] process exited with code', code)
      adkReady = false
      adkProcess = null
    })

    adkProcess.on('error', (err) => {
      if (!started) {
        started = true
        resolve({ ok: false, error: err.message })
      }
    })

    // Timeout
    setTimeout(() => {
      if (!started) {
        started = true
        // Still try to check if it's running
        axios.get(`${ADK_BASE}/health`, { timeout: 1000 })
          .then(() => { adkReady = true; resolve({ ok: true }) })
          .catch(() => resolve({ ok: false, error: 'ADK server did not start in time' }))
      }
    }, 10000)
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

export async function registerAdkAgent(config: AdkAgentConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.post(`${ADK_BASE}/agents`, config, { timeout: 10000 })
    return { ok: res.data.ok === true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { ok: false, error: e.message }
  }
}

export async function runAdkAgent(
  agentId: string,
  sessionId: string,
  message: string,
  history: { role: string; content: string }[]
): Promise<{ ok: boolean; content?: string; error?: string }> {
  try {
    const res = await axios.post(
      `${ADK_BASE}/agents/${agentId}/run`,
      { session_id: sessionId, message, history },
      { timeout: 120000 }
    )
    return { ok: true, content: res.data.content }
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: { error?: string } } }
    return { ok: false, error: e.response?.data?.error || e.message }
  }
}

export async function getAdkStatus(): Promise<{ running: boolean; version?: string }> {
  try {
    const res = await axios.get(`${ADK_BASE}/health`, { timeout: 2000 })
    return { running: true, version: res.data.version }
  } catch {
    return { running: false }
  }
}
