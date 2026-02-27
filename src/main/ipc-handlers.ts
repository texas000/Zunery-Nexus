import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import * as db from './database'
import { routePrompt } from './orchestrator'
import {
  streamOllama,
  streamLiteLLM,
  ollamaChatWithTools,
  litellmChatWithTools,
  listOllamaModels,
  listLiteLLMModels,
  type ChatEvent,
} from './llm-client'
import { registerAdkAgent, runAdkAgent, getAdkStatus, isAdkReady } from './adk-bridge'
import { TOOL_DEFINITIONS, executeToolCall } from './tools'

// ─── Language injection ────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  zh: 'Chinese (中文)',
  en: 'English',
}

function withLanguage(systemPrompt: string, lang: string): string {
  if (!lang || lang === 'en') return systemPrompt
  const name = LANG_NAMES[lang] ?? lang
  const instruction = `IMPORTANT: You must always respond in ${name}. Do not switch languages even if the user writes in another language.`
  return systemPrompt ? `${instruction}\n\n${systemPrompt}` : instruction
}

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
    'models:list-ollama',
    'models:list-litellm',
    'adk:status',
    'adk:sync-agents',
    'orchestrator:route',
    'orchestrator:team',
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
      model: data.model || 'gemma3:latest',
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
        baseUrl: agent.provider === 'ollama' ? settings['ollama.baseUrl'] : settings['litellm.baseUrl'],
        apiKey: settings['litellm.apiKey'],
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
        baseUrl: agent.provider === 'ollama' ? settings['ollama.baseUrl'] : settings['litellm.baseUrl'],
        apiKey: settings['litellm.apiKey'],
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
      console.log(`Agent ${agentId} : ${agent ? agent.name : 'NOT FOUND'}, useAdk: ${useAdk}`)
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

      const lang = settings['ui.language'] || 'en'
      const systemPrompt = withLanguage(agent.system_prompt, lang)

      let fullContent = ''
      const toolCallLog: Array<{ toolName: string; args: Record<string, unknown>; result: string }> = []

      try {
        if (useAdk && isAdkReady()) {
          // Use Google ADK
          const result = await runAdkAgent(agentId, conversationId, content, history.slice(0, -1))
          if (result.ok && result.content) {
            fullContent = result.content
            event.sender.send('chat:chunk', { id: assistantMsgId, content: fullContent, done: true })
          } else {
            throw new Error(result.error || 'ADK run failed')
          }
        } else {
          const chatHistory = history
            .slice(0, -1)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          const agentToolNames: string[] = JSON.parse(agent.tools || '[]')
          const activeToolDefs = agentToolNames
            .filter((n) => TOOL_DEFINITIONS[n])
            .map((n) => TOOL_DEFINITIONS[n])
          const hasTools = activeToolDefs.length > 0

          if (hasTools) {
            // Tool-enabled call (handles search → final streaming response internally)
            const toolStream =
              agent.provider === 'litellm'
                ? litellmChatWithTools(
                    settings['litellm.baseUrl'],
                    settings['litellm.apiKey'],
                    agent.model,
                    [...chatHistory, { role: 'user', content }],
                    activeToolDefs,
                    executeToolCall,
                    systemPrompt
                  )
                : ollamaChatWithTools(
                    settings['ollama.baseUrl'],
                    agent.model,
                    [...chatHistory, { role: 'user', content }],
                    activeToolDefs,
                    executeToolCall,
                    systemPrompt
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
              agent.provider === 'litellm'
                ? streamLiteLLM(
                    settings['litellm.baseUrl'],
                    settings['litellm.apiKey'],
                    agent.model,
                    [...chatHistory, { role: 'user', content }],
                    systemPrompt
                  )
                : streamOllama(
                    settings['ollama.baseUrl'],
                    agent.model,
                    [...chatHistory, { role: 'user', content }],
                    systemPrompt
                  )
            for await (const chunk of stream) {
              fullContent += chunk.content
              event.sender.send('chat:chunk', { id: assistantMsgId, content: chunk.content, done: chunk.done })
              if (chunk.done) break
            }
          }
        }
      } catch (err: unknown) {
        const e = err as { message?: string }
        const errMsg = `Error: ${e.message || 'Unknown error'}`
        fullContent = errMsg
        event.sender.send('chat:chunk', { id: assistantMsgId, content: errMsg, done: true })
      }

      // Store tool call log in metadata so history can show it
      const metadata = toolCallLog.length > 0 ? JSON.stringify({ tool_calls: toolCallLog }) : '{}'

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

  // ─── Models ───────────────────────────────────────────────────────────────

  ipcMain.handle('models:list-ollama', async (_, baseUrl?: string) => {
    const settings = db.getSettings()
    return listOllamaModels(baseUrl || settings['ollama.baseUrl'])
  })

  ipcMain.handle('models:list-litellm', async (_, baseUrl?: string, apiKey?: string) => {
    const settings = db.getSettings()
    return listLiteLLMModels(baseUrl || settings['litellm.baseUrl'], apiKey || settings['litellm.apiKey'])
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

  // ─── Orchestrator ─────────────────────────────────────────────────────────

  ipcMain.handle('orchestrator:route', (_, prompt: string) => {
    return routePrompt(prompt)
  })

  ipcMain.handle('orchestrator:team', async (event, prompt: string) => {
    const settings = db.getSettings()
    const lang = settings['ui.language'] || 'en'
    const teamAgentIds = [
      '00000000-hana-4001-a000-000000000001',
      '00000000-ren0-4001-a000-000000000002',
      '00000000-yuki-4001-a000-000000000003',
      '00000000-kira-4001-a000-000000000004',
    ]

    await Promise.allSettled(
      teamAgentIds.map(async (agentId) => {
        const agent = db.getAgent(agentId)
        if (!agent) return

        try {
          const msgs = [{ role: 'user' as const, content: prompt }]
          const sysPrompt = withLanguage(agent.system_prompt, lang)
          const stream =
            agent.provider === 'litellm'
              ? streamLiteLLM(settings['litellm.baseUrl'], settings['litellm.apiKey'], agent.model, msgs, sysPrompt)
              : streamOllama(settings['ollama.baseUrl'], agent.model, msgs, sysPrompt)

          for await (const chunk of stream) {
            event.sender.send('team:chunk', {
              agentId,
              avatar: agent.avatar,
              content: chunk.content,
              done: chunk.done,
            })
            if (chunk.done) break
          }
        } catch (err: unknown) {
          const e = err as { message?: string }
          event.sender.send('team:chunk', {
            agentId,
            avatar: agent.avatar,
            content: `Error: ${e.message || 'Unknown error'}`,
            done: true,
          })
        }
      })
    )

    return { ok: true }
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
