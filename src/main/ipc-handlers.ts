import { ipcMain, BrowserWindow, shell } from 'electron'
import { randomUUID } from 'crypto'
import * as db from './database'
import {
  streamOllama,
  ollamaChatWithTools,
  listOllamaModels,
  type ChatEvent,
} from './llm-client'
import {
  registerAdkAgent,
  chatWithAgent,
  orchestrateWithBackend,
  getAdkStatus,
  isAdkReady,
} from './adk-bridge'
import { getActiveToolDefinitions, getActiveToolCatalog, executeToolCall } from './tools'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Prevent double registration when multiple windows are created
  if ((registerIpcHandlers as any)._registered) return
  ;(registerIpcHandlers as any)._registered = true

  // List of channels so we can remove them when the window closes
  const CHANNELS = [
    'settings:get',
    'settings:set',
    'settings:set-many',
    'agents:list',
    'agents:get',
    'agents:create',
    'agents:update',
    'agents:delete',
    'conversations:list',
    'conversations:create',
    'conversations:update-title',
    'conversations:delete',
    'messages:list',
    'chat:send',
    'chat:orchestrate',
    'chat:orchestrator-thinking',
    'chat:orchestrator-log',
    'models:list-ollama',
    'adk:status',
    'adk:sync-agents',
    'tools:catalog',
    'shell:open-external',
  ]

  // ─── Settings ─────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => db.getSettings())

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    db.setSetting(key, value)
    return { ok: true }
  })

  ipcMain.handle('settings:set-many', (_, pairs: Record<string, string>) => {
    for (const [k, v] of Object.entries(pairs)) db.setSetting(k, v)
    return { ok: true }
  })

  // ─── Agents ───────────────────────────────────────────────────────────────

  ipcMain.handle('agents:list', () => db.getAgents())

  ipcMain.handle('agents:get', (_, id: string) => db.getAgent(id))

  ipcMain.handle('agents:create', async (_, data: Partial<db.Agent>) => {
    const agent = db.createAgent({
      id: randomUUID(),
      name: data.name || 'New Agent',
      description: data.description || '',
      model: data.model,
      system_prompt: data.system_prompt || '',
      temperature: data.temperature ?? 0.7,
      provider: data.provider || 'ollama',
      tools: data.tools || '[]',
    })
    // Register with ADK in background
    if (isAdkReady()) {
      const settings = db.getSettings()
      registerAdkAgent({
        id: agent.id,
        name: agent.name,
        model: agent.model,
        provider: agent.provider,
        system_prompt: agent.system_prompt,
        tools: JSON.parse(agent.tools || '[]'),
        baseUrl: settings['ollama.baseUrl'],
      }).catch(console.error)
    }
    return agent
  })

  ipcMain.handle('agents:update', async (_, id: string, data: Partial<db.Agent>) => {
    const agent = db.updateAgent(id, data)
    if (agent && isAdkReady()) {
      const settings = db.getSettings()
      registerAdkAgent({
        id: agent.id,
        name: agent.name,
        model: agent.model,
        provider: agent.provider,
        system_prompt: agent.system_prompt,
        tools: JSON.parse(agent.tools || '[]'),
        baseUrl: settings['ollama.baseUrl'],
      }).catch(console.error)
    }
    return agent
  })

  ipcMain.handle('agents:delete', (_, id: string) => {
    db.deleteAgent(id)
    return { ok: true }
  })

  // ─── Conversations ────────────────────────────────────────────────────────

  ipcMain.handle('conversations:list', (_, agentId?: string) => db.getConversations(agentId))

  ipcMain.handle('conversations:create', (_, agentId: string, title?: string) => {
    return db.createConversation({ id: randomUUID(), agent_id: agentId, title: title || 'New Conversation' })
  })

  ipcMain.handle('conversations:update-title', (_, id: string, title: string) => {
    db.updateConversation(id, title)
    return { ok: true }
  })

  ipcMain.handle('conversations:delete', (_, id: string) => {
    db.deleteConversation(id)
    return { ok: true }
  })

  // ─── Messages ─────────────────────────────────────────────────────────────

  ipcMain.handle('messages:list', (_, conversationId: string) => db.getMessages(conversationId))

  // ─── Chat (streaming) ─────────────────────────────────────────────────────

  ipcMain.handle(
    'chat:send',
    async (
      event,
      params: {
        conversationId: string
        agentId: string
        content: string
        useAdk: boolean
      }
    ) => {
      const { conversationId, agentId, content, useAdk } = params
      const settings = db.getSettings()
      const agent = db.getAgent(agentId)
      const effectiveModel = settings['default.model'] || agent?.model
      console.log(`Agent ${agentId} : ${agent ? agent.name : 'NOT FOUND'}, useAdk: ${useAdk}, model: ${effectiveModel}`)
      if (!agent) throw new Error('Agent not found')

      // Save user message
      const userMsg = db.addMessage({
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content,
        metadata: '{}',
      })

      // Load conversation history
      const history = db.getMessages(conversationId).map((m) => ({ role: m.role, content: m.content }))

      // Generate a response message ID upfront
      const assistantMsgId = randomUUID()

      let fullContent = ''
      const toolCallLog: Array<{ toolName: string; args: Record<string, unknown>; result: string }> = []

      try {
        if (isAdkReady()) {
          // Use FastAPI backend /chat endpoint
          console.log('[chat:send] Using FastAPI backend for agent', agentId)
          const result = await chatWithAgent({
            agentId: agent.id,
            sessionId: conversationId,
            message: content,
            history: history.slice(0, -1),
            model: effectiveModel,
            provider: agent.provider,
            baseUrl: settings['ollama.baseUrl'],
            systemPrompt: agent.system_prompt,
            tools: JSON.parse(agent.tools || '[]'),
            temperature: agent.temperature ?? 0.7,
          })
          if (result.ok && result.content) {
            fullContent = result.content
            event.sender.send('chat:chunk', { id: assistantMsgId, content: fullContent, done: true })
          } else {
            throw new Error(result.error || 'Backend chat failed')
          }
        } else {
          const chatHistory = history
            .slice(0, -1)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          const agentToolNames: string[] = JSON.parse(agent.tools || '[]')
          const activeToolDefs = agentToolNames
            .filter((n) => getActiveToolDefinitions()[n])
            .map((n) => getActiveToolDefinitions()[n])
          const hasTools = activeToolDefs.length > 0

          if (hasTools) {
            // Tool-enabled call (handles search → final streaming response internally)
            const toolStream =
              ollamaChatWithTools(
                    settings['ollama.baseUrl'],
                    effectiveModel,
                    [...chatHistory, { role: 'user', content }],
                    activeToolDefs,
                    executeToolCall,
                    agent.system_prompt
                  )

            let pendingToolCall: { toolName: string; args: Record<string, unknown> } | null = null
            for await (const ev of toolStream as AsyncGenerator<ChatEvent>) {
              if (ev.type === 'tool-call') {
                pendingToolCall = { toolName: ev.toolName, args: ev.args }
                console.log('[IPC] tool-call', { assistantMsgId, toolName: ev.toolName, args: ev.args })
                event.sender.send('chat:tool-call', { id: assistantMsgId, toolName: ev.toolName, args: ev.args })
              } else if (ev.type === 'tool-result') {
                if (pendingToolCall) {
                  toolCallLog.push({ ...pendingToolCall, result: ev.result })
                  pendingToolCall = null
                }
                console.log('[IPC] tool-result', { assistantMsgId, toolName: ev.toolName, result: ev.result && typeof ev.result === 'string' ? (ev.result.length > 200 ? ev.result.slice(0,200)+'…' : ev.result) : ev.result })
                event.sender.send('chat:tool-result', { id: assistantMsgId, toolName: ev.toolName, result: ev.result })
              } else {
                fullContent += ev.content
                event.sender.send('chat:chunk', { id: assistantMsgId, content: ev.content, done: ev.done })
                if (ev.done) break
              }
            }
          } else {
            // Plain streaming (no tools)
            const stream =
              streamOllama(
                    settings['ollama.baseUrl'],
                    effectiveModel,
                    [...chatHistory, { role: 'user', content }],
                    agent.system_prompt
                  )
            for await (const chunk of stream) {
              fullContent += chunk.content
              event.sender.send('chat:chunk', { id: assistantMsgId, content: chunk.content, done: chunk.done })
              if (chunk.done) break
            }
          }
        }
      } catch (err: unknown) {
        const e = err as { message?: string; response?: { status?: number; data?: unknown } }
        let errMsg = e.message || 'Unknown error'

        // Extract detailed error from API responses
        if (e.response?.data) {
          const data = e.response.data as Record<string, unknown>
          if (data.error && typeof data.error === 'string') errMsg = data.error
          else if (data.message && typeof data.message === 'string') errMsg = data.message
        }

        if (errMsg.includes('ECONNREFUSED')) {
          errMsg = `Cannot connect to Ollama. Is it running?`
        } else if (errMsg.includes('404') || errMsg.includes('not found')) {
          errMsg = `Model "${effectiveModel}" not found. Make sure it's pulled/available.`
        } else if (errMsg.includes('timeout')) {
          errMsg = `Request timed out. The model may be loading or the server is unresponsive.`
        }

        fullContent = ''
        event.sender.send('chat:error', { id: assistantMsgId, error: errMsg })
      }

      // Store tool call log in metadata so history can show it
      const metadata = toolCallLog.length > 0 ? JSON.stringify({ tool_calls: toolCallLog }) : '{}'

      // Only save assistant message if we got content (skip on error)
      if (!fullContent) {
        throw new Error('No response generated')
      }

      // Save assistant message (metadata includes tool call log if any)
      const assistantMsg = db.addMessage({
        id: assistantMsgId,
        conversation_id: conversationId,
        role: 'assistant',
        content: fullContent,
        metadata,
      })

      // Auto-title conversation from first user message
      const msgs = db.getMessages(conversationId)
      if (msgs.length === 2) {
        const title = content.slice(0, 60) + (content.length > 60 ? '…' : '')
        db.updateConversation(conversationId, title)
      }

      return { userMessage: userMsg, assistantMessage: assistantMsg }
    }
  )

  // ─── Orchestrator ────────────────────────────────────────────────────────

  ipcMain.handle(
    'chat:orchestrate',
    async (
      event,
      params: { content: string; useAdk?: boolean }
    ) => {
      const { content } = params
      const settings = db.getSettings()
      const agents = db.getAgents()

      const log = (type: string, label: string, logContent: string, extra?: Record<string, string>) => {
        const entry = { type, label, content: logContent, ts: Date.now(), ...extra }
        event.sender.send('chat:orchestrator-log', entry)
        console.log(`[Orchestrator][${type}] ${label}:`, logContent.length > 200 ? logContent.slice(0, 200) + '…' : logContent)
      }

      log('input', 'User message', content)
      log('info', 'Agents available', agents.map((a) => a.name).join(', '))

      if (agents.length === 0) throw new Error('No agents available. Create at least one agent first.')

      // ── Primary path: delegate to backend /orchestrate ──
      if (isAdkReady()) {
        log('info', 'Using backend orchestration', 'Delegating to POST /orchestrate')

        const agentConfigs = agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description || 'General purpose agent',
          model: a.model,
          provider: a.provider,
          system_prompt: a.system_prompt,
          tools: JSON.parse(a.tools || '[]') as string[],
          temperature: a.temperature ?? 0.7,
        }))

        const result = await orchestrateWithBackend({
          message: content,
          agents: agentConfigs,
          settings: {
            obsidian_enabled: settings['obsidian.enabled'] === 'true',
            obsidian_vault_path: settings['obsidian.vaultPath'] || '',
            default_model: settings['default.model'] || '',
            ollama_base_url: settings['ollama.baseUrl'] || 'http://localhost:11434',
          },
        })

        if (result.ok && result.content) {
          log('routing', 'Agent selected', `${result.agent_name} — ${result.reason}`, { agent: result.agent_name })
          event.sender.send('chat:orchestrator-thinking', { content: '', done: true })
          event.sender.send('chat:agent-routing', {
            agentId: result.agent_id,
            agentName: result.agent_name,
            reason: result.reason,
          })
          event.sender.send('chat:chunk', { id: randomUUID(), content: result.content, done: true })

          return {
            content: result.content,
            metadata: '{}',
            agentId: result.agent_id,
            agentName: result.agent_name,
          }
        }

        // Backend returned error — fall through to Ollama fallback
        if (result.error) {
          log('error', 'Backend orchestration failed', result.error)
        }
      }

      // ── Fallback: direct Ollama streaming (backend down) ──
      log('info', 'Fallback mode', 'Using direct Ollama streaming')

      const agent = agents[0]
      const ollamaBase = settings['ollama.baseUrl'] || 'http://localhost:11434'
      const effectiveModel = settings['default.model'] || agent.model
      const assistantMsgId = randomUUID()
      let fullContent = ''

      event.sender.send('chat:orchestrator-thinking', { content: '', done: true })
      event.sender.send('chat:agent-routing', {
        agentId: agent.id,
        agentName: agent.name,
        reason: 'Fallback — using first agent (backend unavailable)',
      })

      try {
        const agentToolNames: string[] = JSON.parse(agent.tools || '[]')
        const activeToolDefs = agentToolNames
          .filter((n) => getActiveToolDefinitions()[n])
          .map((n) => getActiveToolDefinitions()[n])
        const hasTools = activeToolDefs.length > 0

        if (hasTools) {
          const toolStream = ollamaChatWithTools(
            ollamaBase,
            effectiveModel,
            [{ role: 'user', content }],
            activeToolDefs,
            executeToolCall,
            agent.system_prompt
          )

          for await (const ev of toolStream as AsyncGenerator<ChatEvent>) {
            if (ev.type === 'tool-call') {
              event.sender.send('chat:tool-call', { id: assistantMsgId, toolName: ev.toolName, args: ev.args })
            } else if (ev.type === 'tool-result') {
              event.sender.send('chat:tool-result', { id: assistantMsgId, toolName: ev.toolName, result: ev.result })
            } else {
              fullContent += ev.content
              event.sender.send('chat:chunk', { id: assistantMsgId, content: ev.content, done: ev.done })
              if (ev.done) break
            }
          }
        } else {
          const stream = streamOllama(ollamaBase, effectiveModel, [{ role: 'user', content }], agent.system_prompt)
          for await (const chunk of stream) {
            fullContent += chunk.content
            event.sender.send('chat:chunk', { id: assistantMsgId, content: chunk.content, done: chunk.done })
            if (chunk.done) break
          }
        }
      } catch (err: unknown) {
        const e = err as { message?: string }
        const errMsg = e.message || 'Unknown error'
        log('error', 'Agent error', errMsg, { agent: agent.name })
        event.sender.send('chat:error', { id: assistantMsgId, error: errMsg })
      }

      return { content: fullContent, metadata: '{}', agentId: agent.id, agentName: agent.name, error: fullContent === '' ? true : undefined }
    }
  )

  // ─── Models ───────────────────────────────────────────────────────────────

  ipcMain.handle('models:list-ollama', async (_, baseUrl?: string) => {
    const settings = db.getSettings()
    return listOllamaModels(baseUrl || settings['ollama.baseUrl'])
  })

  // ─── ADK ──────────────────────────────────────────────────────────────────

  ipcMain.handle('adk:status', async () => {
    return getAdkStatus()
  })

  ipcMain.handle('adk:sync-agents', async () => {
    if (!isAdkReady()) return { ok: false, error: 'ADK not running' }
    const agents = db.getAgents()
    const settings = db.getSettings()
    const results = await Promise.allSettled(
      agents.map((a) =>
        registerAdkAgent({
          id: a.id,
          name: a.name,
          model: a.model,
          provider: a.provider,
          system_prompt: a.system_prompt,
          tools: JSON.parse(a.tools || '[]'),
          baseUrl: a.provider === 'ollama' ? settings['ollama.baseUrl'] : settings['litellm.baseUrl'],
          apiKey: settings['litellm.apiKey'],
        })
      )
    )
    return { ok: true, synced: results.filter((r) => r.status === 'fulfilled').length }
  })

  // ─── Tools ──────────────────────────────────────────────────────────────

  ipcMain.handle('tools:catalog', () => {
    return getActiveToolCatalog()
  })

  // ─── Shell ──────────────────────────────────────────────────────────────
  ipcMain.handle('shell:open-external', (_, url: string) => {
    return shell.openExternal(url)
  })

  // ─── Emit window events (called from main index) ──────────────────────────
  mainWindow.on('close', () => {
    for (const ch of CHANNELS) {
      try {
        ipcMain.removeHandler(ch)
      } catch (e) {
        // ignore
      }
    }
    ;(registerIpcHandlers as any)._registered = false
  })
}
