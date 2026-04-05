import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import * as db from './database'
import {
  streamOllama,
  ollamaChatWithTools,
  listOllamaModels,
  type ChatEvent,
} from './llm-client'
import { registerAdkAgent, runAdkAgent, getAdkStatus, isAdkReady } from './adk-bridge'
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
          // Always use Google ADK when available
          log_chat('[chat:send] Using ADK for agent', agentId)
          // Ensure agent is registered before running
          await registerAdkAgent({
            id: agent.id,
            name: agent.name,
            model: effectiveModel,
            provider: agent.provider,
            system_prompt: agent.system_prompt,
            tools: JSON.parse(agent.tools || '[]'),
            baseUrl: settings['ollama.baseUrl'],
            apiKey: '',
          }).catch(() => {})

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
      params: { content: string; useAdk: boolean }
    ) => {
      const { content, useAdk } = params
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

      // ── Obsidian pre-fetch: orchestrator gathers vault context before agent ──
      const obsidianEnabled = settings['obsidian.enabled'] === 'true'
      let obsidianContext = ''

      let fallbackToWeb = false

      if (obsidianEnabled) {
        // Step 1: Always search Obsidian first when enabled
        log('obsidian-prefetch', 'Obsidian search', `Searching vault: "${content.slice(0, 80)}"`)
        event.sender.send('chat:tool-call', { id: 'orchestrator', toolName: 'obsidian_search', args: { query: content } })

        try {
          const searchResult = await executeToolCall('obsidian_search', { query: content, max_results: '5' })
          event.sender.send('chat:tool-result', { id: 'orchestrator', toolName: 'obsidian_search', result: searchResult })

          const hasResults = searchResult
            && !searchResult.startsWith('No notes found')
            && !searchResult.startsWith('Obsidian error')
            && !searchResult.startsWith('Obsidian tool unavailable')

          if (hasResults) {
            // Obsidian found results — use them
            obsidianContext = searchResult
            log('obsidian-prefetch', 'Obsidian results', searchResult.length > 400 ? searchResult.slice(0, 400) + '…' : searchResult)

            // Pre-read the top matching note for richer context
            const pathMatch = searchResult.match(/\(([^)]+\.md)\)/)
            if (pathMatch) {
              log('obsidian-prefetch', 'Reading top note', pathMatch[1])
              event.sender.send('chat:tool-call', { id: 'orchestrator', toolName: 'obsidian_read', args: { path: pathMatch[1] } })

              try {
                const noteContent = await executeToolCall('obsidian_read', { path: pathMatch[1] })
                event.sender.send('chat:tool-result', { id: 'orchestrator', toolName: 'obsidian_read', result: noteContent })

                if (noteContent && !noteContent.startsWith('Read error')) {
                  const trimmed = noteContent.length > 2000 ? noteContent.slice(0, 2000) + '\n...(truncated)' : noteContent
                  obsidianContext += '\n\n--- Full note content ---\n' + trimmed
                  log('obsidian-prefetch', 'Note loaded', `${pathMatch[1]} (${noteContent.length} chars)`)
                }
              } catch {
                // Non-critical, skip
              }
            }
          } else {
            // Step 2: No Obsidian results — fallback to web search
            log('obsidian-prefetch', 'No vault results', 'Falling back to web search')
            fallbackToWeb = true
          }
        } catch (err: unknown) {
          log('obsidian-prefetch', 'Error', String((err as Error).message || err))
          fallbackToWeb = true
        }
      }

      // If obsidian had no results, try web search as fallback
      if (fallbackToWeb) {
        log('web-fallback', 'Web search fallback', `Searching web: "${content.slice(0, 80)}"`)
        event.sender.send('chat:tool-call', { id: 'orchestrator', toolName: 'web_search', args: { query: content } })

        try {
          const webResult = await executeToolCall('web_search', { query: content })
          event.sender.send('chat:tool-result', { id: 'orchestrator', toolName: 'web_search', result: webResult })

          const hasWebResults = webResult
            && !webResult.startsWith('No results found')
            && !webResult.startsWith('No search query')
            && !webResult.startsWith('Tool error')

          if (hasWebResults) {
            obsidianContext = webResult
            log('web-fallback', 'Web results', webResult.length > 400 ? webResult.slice(0, 400) + '…' : webResult)
          } else {
            log('web-fallback', 'No web results', 'No results from web search either')
          }
        } catch (err: unknown) {
          log('web-fallback', 'Web search error', String((err as Error).message || err))
        }
      }

      // Build enriched content with pre-fetched context
      const enrichedContent = obsidianContext
        ? `${content}\n\n[SYSTEM: The orchestrator has already searched for relevant context. Do NOT call web_search or obsidian_search again — use this context to answer directly.]\n\n--- Context ---\n${obsidianContext}`
        : content

      // If only one agent, skip routing and use it directly
      if (agents.length === 1) {
        const agent = agents[0]
        log('routing', 'Agent selected', `${agent.name} — only available agent`, { agent: agent.name })
        event.sender.send('chat:orchestrator-thinking', { content: '', done: true })
        event.sender.send('chat:agent-routing', {
          agentId: agent.id,
          agentName: agent.name,
          reason: 'Only available agent',
        })

        // Stream response from the single agent with enriched content
        return await streamFromAgent(event, agent, enrichedContent, settings, useAdk, log, !!obsidianContext)
      }

      // Build routing prompt with all agent descriptions and their tools
      const activeTools = getActiveToolDefinitions()
      const agentList = agents
        .map((a) => {
          const toolNames: string[] = JSON.parse(a.tools || '[]')
          const enabledTools = toolNames.filter((t) => activeTools[t])
          const toolsStr = enabledTools.length > 0 ? ` | Tools: [${enabledTools.join(', ')}]` : ''
          return `- ID: "${a.id}" | Name: "${a.name}" | Description: "${a.description || 'General purpose agent'}"${toolsStr}`
        })
        .join('\n')

      const routingPrompt = `You are a routing orchestrator. Given a user's message, decide which agent is best suited to handle it.

Available agents:
${agentList}

Tool descriptions:
- web_search: Search the internet (Google/Bing) for external, public information
- obsidian_search: Search the user's LOCAL Obsidian knowledge vault (personal notes, documents, projects)
- obsidian_read: Read a specific note from the user's Obsidian vault
- obsidian_create: Create a new note in the user's Obsidian vault
- obsidian_update: Update an existing note in the user's Obsidian vault
- obsidian_delete: Delete a note from the user's Obsidian vault
- obsidian_list: Browse the user's Obsidian vault folder structure

ROUTING RULES:
- If the user asks to search/find/read their notes, documents, knowledge, or Obsidian vault → pick an agent with obsidian_search or obsidian_read tools
- If the user asks to create/save/write/update/delete notes → pick an agent with obsidian_create/obsidian_update/obsidian_delete tools
- If the user asks about external/public information, news, or current events → pick an agent with web_search
- Keywords like "note", "notes", "vault", "obsidian", "my documents", "내 노트", "메모", "기록" → obsidian tools
- Always prefer the agent whose tools best match the request

Reply with ONLY a JSON object (no markdown, no explanation):
{"agent_id": "<id>", "reason": "<brief reason>"}

User message: "${content}"`

      // Use the global model setting for routing, fall back to first agent's model
      const routerAgent = agents[0]
      const model = settings['default.model'] || routerAgent.model
      const ollamaBase = settings['ollama.baseUrl'] || 'http://localhost:11434'

      log('llm-request', 'Routing LLM', `model: ${model}  url: ${ollamaBase}`, { model })
      log('llm-prompt', 'Routing prompt', routingPrompt)

      let routingResponse = ''
      try {
        for await (const chunk of streamOllama(
          ollamaBase,
          model,
          [{ role: 'user', content: routingPrompt }]
        )) {
          routingResponse += chunk.content
          event.sender.send('chat:orchestrator-thinking', { content: chunk.content, done: chunk.done })
          if (chunk.done) break
        }
      } catch (err: unknown) {
        // Fallback to first agent if routing fails
        const agent = agents[0]
        log('error', 'Routing failed', String((err as Error).message || err))
        event.sender.send('chat:orchestrator-thinking', { content: '', done: true })
        event.sender.send('chat:agent-routing', {
          agentId: agent.id,
          agentName: agent.name,
          reason: 'Routing failed, using default agent',
        })
        return await streamFromAgent(event, agent, content, settings, useAdk, log)
      }

      log('llm-response', 'Routing response', routingResponse)

      // Parse routing decision
      let chosenAgentId = agents[0].id
      let reason = 'Default selection'
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = routingResponse.match(/\{[\s\S]*?\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.agent_id && agents.find((a) => a.id === parsed.agent_id)) {
            chosenAgentId = parsed.agent_id
            reason = parsed.reason || 'Best match'
          }
        }
      } catch {
        // Use default
      }

      const chosenAgent = agents.find((a) => a.id === chosenAgentId) || agents[0]
      log('routing', 'Agent selected', `${chosenAgent.name} — ${reason}`, { agent: chosenAgent.name })

      // Notify frontend which agent was selected
      event.sender.send('chat:agent-routing', {
        agentId: chosenAgent.id,
        agentName: chosenAgent.name,
        reason,
      })

      // Stream response from chosen agent with enriched content
      return await streamFromAgent(event, chosenAgent, enrichedContent, settings, useAdk, log, !!obsidianContext)
    }
  )

  // Helper: stream a response from a specific agent
  async function streamFromAgent(
    event: Electron.IpcMainInvokeEvent,
    agent: db.Agent,
    content: string,
    settings: Record<string, string>,
    useAdk: boolean,
    log: (type: string, label: string, content: string, extra?: Record<string, string>) => void,
    /** When true, obsidian context was already pre-fetched — strip search tools */
    hasObsidianContext = false
  ) {
    const assistantMsgId = randomUUID()
    let fullContent = ''
    const toolCallLog: Array<{ toolName: string; args: Record<string, unknown>; result: string }> = []
    const ollamaBase = settings['ollama.baseUrl'] || 'http://localhost:11434'
    const effectiveModel = settings['default.model'] || agent.model

    log('agent-request', 'Agent call', `${agent.name} — model: ${effectiveModel}`, { agent: agent.name, model: effectiveModel })
    if (agent.system_prompt) {
      log('agent-prompt', 'System prompt', agent.system_prompt, { agent: agent.name })
    }

    try {
      if (useAdk && isAdkReady()) {
        log('info', 'Using ADK', `Running ${agent.name} via Google ADK`, { agent: agent.name })
        // Ensure agent is registered with ADK before running
        await registerAdkAgent({
          id: agent.id,
          name: agent.name,
          model: effectiveModel,
          provider: agent.provider,
          system_prompt: agent.system_prompt,
          tools: JSON.parse(agent.tools || '[]'),
          baseUrl: ollamaBase,
          apiKey: '',
        }).catch(() => {})

        const result = await runAdkAgent(agent.id, randomUUID(), content, [])
        if (result.ok && result.content) {
          fullContent = result.content
          event.sender.send('chat:chunk', { id: assistantMsgId, content: fullContent, done: true })
        } else {
          throw new Error(result.error || 'ADK run failed')
        }
      } else {
        const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
        const agentToolNames: string[] = JSON.parse(agent.tools || '[]')
        // When obsidian context was pre-fetched, strip search tools — context is already in the message
        const searchTools = ['web_search', 'obsidian_search', 'obsidian_read', 'obsidian_list']
        const filteredToolNames = hasObsidianContext
          ? agentToolNames.filter((n) => !searchTools.includes(n))
          : agentToolNames
        const activeToolDefs = filteredToolNames
          .filter((n) => getActiveToolDefinitions()[n])
          .map((n) => getActiveToolDefinitions()[n])
        const hasTools = activeToolDefs.length > 0

        if (hasObsidianContext) {
          log('info', 'Obsidian context injected', 'Search tools stripped — context already provided by orchestrator', { agent: agent.name })
        }

        if (hasTools) {
          log('info', 'Tools enabled', filteredToolNames.filter((n) => getActiveToolDefinitions()[n]).join(', '), { agent: agent.name })
          const toolStream =
            ollamaChatWithTools(
                  ollamaBase,
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
              log('tool-call', `Tool: ${ev.toolName}`, JSON.stringify(ev.args))
              event.sender.send('chat:tool-call', { id: assistantMsgId, toolName: ev.toolName, args: ev.args })
            } else if (ev.type === 'tool-result') {
              if (pendingToolCall) {
                toolCallLog.push({ ...pendingToolCall, result: ev.result })
                pendingToolCall = null
              }
              log('tool-result', `Result: ${ev.toolName}`, ev.result.length > 300 ? ev.result.slice(0, 300) + '…' : ev.result)
              event.sender.send('chat:tool-result', { id: assistantMsgId, toolName: ev.toolName, result: ev.result })
            } else {
              fullContent += ev.content
              event.sender.send('chat:chunk', { id: assistantMsgId, content: ev.content, done: ev.done })
              if (ev.done) break
            }
          }
        } else {
          const stream =
            streamOllama(
                  ollamaBase,
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

      // Extract more useful error info from Ollama/LiteLLM API errors
      if (e.response?.data) {
        const data = e.response.data as Record<string, unknown>
        if (data.error && typeof data.error === 'string') {
          errMsg = data.error
        } else if (data.message && typeof data.message === 'string') {
          errMsg = data.message
        }
      }

      // Make common errors more user-friendly
      if (errMsg.includes('ECONNREFUSED')) {
        errMsg = `Cannot connect to Ollama at ${ollamaBase}. Is it running?`
      } else if (errMsg.includes('404') || errMsg.includes('not found')) {
        errMsg = `Model "${effectiveModel}" not found. Make sure it's pulled/available in Ollama.`
      } else if (errMsg.includes('timeout')) {
        errMsg = `Request timed out. The model may be loading or the server is unresponsive.`
      }

      fullContent = ''
      // Send error as a special event so the UI can display it properly
      log('error', 'Agent error', errMsg, { agent: agent.name })
      event.sender.send('chat:error', { id: assistantMsgId, error: errMsg })
    }

    if (fullContent) {
      log('agent-response', 'Agent response', fullContent.length > 400 ? fullContent.slice(0, 400) + '…' : fullContent, { agent: agent.name })
    }

    const metadata = toolCallLog.length > 0 ? JSON.stringify({ tool_calls: toolCallLog }) : '{}'
    return { content: fullContent, metadata, agentId: agent.id, agentName: agent.name, error: fullContent === '' ? true : undefined }
  }

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
