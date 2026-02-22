import axios from 'axios'
import type { ToolDefinition } from './tools'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamChunk {
  content: string
  done: boolean
}

export type ChatEvent =
  | { type: 'chunk'; content: string; done: boolean }
  | { type: 'tool-call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result: string }

// ─── Ollama ───────────────────────────────────────────────────────────────────

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 })
    return (res.data.models || []).map((m: { name: string }) => m.name)
  } catch {
    return []
  }
}

export async function* streamOllama(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string
): AsyncGenerator<StreamChunk> {
  const payload = {
    model,
    messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
    stream: true,
  }

  const res = await axios.post(`${baseUrl}/api/chat`, payload, { responseType: 'stream' })

  let buffer = ''
  for await (const chunk of res.data) {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const data = JSON.parse(line)
        if (data.message?.content) {
          yield { content: data.message.content, done: false }
        }
        if (data.done) {
          yield { content: '', done: true }
          return
        }
      } catch {
        // skip malformed lines
      }
    }
  }
  yield { content: '', done: true }
}

// ─── LiteLLM / OpenAI-compatible ─────────────────────────────────────────────

export async function listLiteLLMModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const res = await axios.get(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
    })
    return (res.data.data || []).map((m: { id: string }) => m.id)
  } catch {
    return []
  }
}

export async function* streamLiteLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string
): AsyncGenerator<StreamChunk> {
  const payload = {
    model,
    messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
    stream: true,
  }

  const res = await axios.post(`${baseUrl}/v1/chat/completions`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey || 'dummy'}`,
      'Content-Type': 'application/json',
    },
    responseType: 'stream',
  })

  let buffer = ''
  for await (const chunk of res.data) {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          yield { content: '', done: true }
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) yield { content, done: false }
        } catch {
          // skip
        }
      }
    }
  }
  yield { content: '', done: true }
}

// ─── ReAct helpers ────────────────────────────────────────────────────────────

function buildReActSystemPrompt(tools: ToolDefinition[], originalSystemPrompt?: string): string {
  const toolDescriptions = tools
    .map((t) => {
      const fn = t.function
      const props = fn.parameters?.properties || {}
      const paramList = Object.entries(props)
        .map(([k, v]: [string, { type: string; description?: string }]) => `  - ${k}: ${v.description || v.type}`)
        .join('\n')
      return `${fn.name}: ${fn.description}${paramList ? '\n' + paramList : ''}`
    })
    .join('\n\n')

  const base = originalSystemPrompt ? `${originalSystemPrompt}\n\n` : ''
  return `${base}You have access to the following tools:

${toolDescriptions}

To use a tool, respond with ONLY this exact format and nothing else:
ACTION: <tool_name>
INPUT: <input value>

After receiving the tool result, provide your complete final answer.
Only use a tool when you genuinely need current or specific information.`
}

function parseReActToolCall(content: string): { toolName: string; input: string } | null {
  const match = content.match(/ACTION:\s*(\w+)\s*[\r\n]+INPUT:\s*([\s\S]+?)(?:\s*$)/m)
  if (!match) return null
  return { toolName: match[1].trim(), input: match[2].trim() }
}

function buildToolArgs(toolName: string, input: string, tools: ToolDefinition[]): Record<string, unknown> {
  const def = tools.find((t) => t.function.name === toolName)
  const props = def?.function.parameters?.properties || {}
  const firstKey = Object.keys(props)[0] || 'query'
  return { [firstKey]: input }
}

// ─── Ollama — tool-calling loop ───────────────────────────────────────────────

export async function* ollamaChatWithTools(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  systemPrompt?: string
): AsyncGenerator<ChatEvent> {
  type OllamaMsg = { role: string; content: string | null; tool_calls?: unknown }

  const msgs: OllamaMsg[] = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // Try native tool calling first
  let nativeData: Record<string, unknown> | null = null
  try {
    const res = await axios.post(
      `${baseUrl}/api/chat`,
      { model, messages: msgs, tools, stream: false },
      { timeout: 120000 }
    )
    nativeData = res.data
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 400 || status === 422) {
      // Model doesn't support native tool calling — fall back to ReAct
      yield* ollamaReActFallback(baseUrl, model, messages, tools, executeToolFn, systemPrompt)
      return
    }
    throw err
  }

  const assistantMsg = (nativeData as { message: { content: string | null; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> } }).message
  const toolCalls = assistantMsg.tool_calls || []

  if (toolCalls.length === 0) {
    // Model chose not to use tools — emit content directly
    if (assistantMsg.content) yield { type: 'chunk', content: assistantMsg.content, done: false }
    yield { type: 'chunk', content: '', done: true }
    return
  }

  // Execute each tool call
  msgs.push({ role: 'assistant', content: assistantMsg.content || '', tool_calls: toolCalls })
  for (const tc of toolCalls) {
    const name = tc.function.name
    const args = tc.function.arguments // Ollama gives an object
    yield { type: 'tool-call', toolName: name, args }
    const result = await executeToolFn(name, args)
    yield { type: 'tool-result', toolName: name, result }
    msgs.push({ role: 'tool', content: result })
  }

  // Stream final response with search context but without tools
  yield* ollamaStream(baseUrl, model, msgs)
}

async function* ollamaReActFallback(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  systemPrompt?: string
): AsyncGenerator<ChatEvent> {
  const reactSystemPrompt = buildReActSystemPrompt(tools, systemPrompt)

  const msgs = [
    { role: 'system', content: reactSystemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // Non-streaming call to see if model wants to use a tool
  const res = await axios.post(
    `${baseUrl}/api/chat`,
    { model, messages: msgs, stream: false },
    { timeout: 120000 }
  )
  const content: string = res.data?.message?.content || ''

  const toolCall = parseReActToolCall(content)
  if (!toolCall) {
    // No tool use, just emit the response
    if (content) yield { type: 'chunk', content, done: false }
    yield { type: 'chunk', content: '', done: true }
    return
  }

  // Execute the tool
  const args = buildToolArgs(toolCall.toolName, toolCall.input, tools)
  yield { type: 'tool-call', toolName: toolCall.toolName, args }
  const result = await executeToolFn(toolCall.toolName, args)
  yield { type: 'tool-result', toolName: toolCall.toolName, result }

  // Build final context and stream the answer
  const finalMsgs: Array<{ role: string; content: string }> = []
  if (systemPrompt) finalMsgs.push({ role: 'system', content: systemPrompt })
  finalMsgs.push(...messages.map((m) => ({ role: m.role, content: m.content })))
  finalMsgs.push({
    role: 'user',
    content: `[Search result for "${toolCall.input}"]\n${result}\n\nUsing the above search results, please answer my previous question.`,
  })

  yield* ollamaStream(baseUrl, model, finalMsgs)
}

async function* ollamaStream(
  baseUrl: string,
  model: string,
  messages: Array<{ role: string; content: string | null }>
): AsyncGenerator<ChatEvent> {
  const finalRes = await axios.post(
    `${baseUrl}/api/chat`,
    { model, messages, stream: true },
    { responseType: 'stream', timeout: 120000 }
  )
  let buf = ''
  for await (const chunk of finalRes.data) {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const d = JSON.parse(line)
        if (d.message?.content) yield { type: 'chunk', content: d.message.content, done: false }
        if (d.done) {
          yield { type: 'chunk', content: '', done: true }
          return
        }
      } catch {
        /* skip */
      }
    }
  }
  yield { type: 'chunk', content: '', done: true }
}

// ─── LiteLLM — tool-calling loop ─────────────────────────────────────────────

export async function* litellmChatWithTools(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  systemPrompt?: string
): AsyncGenerator<ChatEvent> {
  type OAIMsg = Record<string, unknown>

  const msgs: OAIMsg[] = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]
  const headers = { Authorization: `Bearer ${apiKey || 'dummy'}`, 'Content-Type': 'application/json' }

  // Try native tool calling first
  let nativeData: Record<string, unknown> | null = null
  try {
    const res = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      { model, messages: msgs, tools, stream: false },
      { headers, timeout: 120000 }
    )
    nativeData = res.data
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 400 || status === 422) {
      yield* litellmReActFallback(baseUrl, apiKey, model, messages, tools, executeToolFn, systemPrompt)
      return
    }
    throw err
  }

  const assistantMsg = (nativeData as { choices: Array<{ message: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> }).choices?.[0]?.message
  const toolCalls = assistantMsg?.tool_calls || []

  if (toolCalls.length === 0) {
    if (assistantMsg?.content) yield { type: 'chunk', content: assistantMsg.content, done: false }
    yield { type: 'chunk', content: '', done: true }
    return
  }

  msgs.push({ role: 'assistant', content: assistantMsg.content ?? null, tool_calls: toolCalls })
  for (const tc of toolCalls) {
    const name = tc.function.name
    const args: Record<string, unknown> =
      typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : (tc.function.arguments as Record<string, unknown>)
    yield { type: 'tool-call', toolName: name, args }
    const result = await executeToolFn(name, args)
    yield { type: 'tool-result', toolName: name, result }
    msgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
  }

  // Stream final response
  yield* litellmStream(baseUrl, apiKey, model, msgs)
}

async function* litellmReActFallback(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  systemPrompt?: string
): AsyncGenerator<ChatEvent> {
  const reactSystemPrompt = buildReActSystemPrompt(tools, systemPrompt)
  const headers = { Authorization: `Bearer ${apiKey || 'dummy'}`, 'Content-Type': 'application/json' }

  const msgs = [
    { role: 'system', content: reactSystemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const res = await axios.post(
    `${baseUrl}/v1/chat/completions`,
    { model, messages: msgs, stream: false },
    { headers, timeout: 120000 }
  )
  const content: string = res.data?.choices?.[0]?.message?.content || ''

  const toolCall = parseReActToolCall(content)
  if (!toolCall) {
    if (content) yield { type: 'chunk', content, done: false }
    yield { type: 'chunk', content: '', done: true }
    return
  }

  const args = buildToolArgs(toolCall.toolName, toolCall.input, tools)
  yield { type: 'tool-call', toolName: toolCall.toolName, args }
  const result = await executeToolFn(toolCall.toolName, args)
  yield { type: 'tool-result', toolName: toolCall.toolName, result }

  const finalMsgs: Array<{ role: string; content: string }> = []
  if (systemPrompt) finalMsgs.push({ role: 'system', content: systemPrompt })
  finalMsgs.push(...messages.map((m) => ({ role: m.role, content: m.content })))
  finalMsgs.push({
    role: 'user',
    content: `[Search result for "${toolCall.input}"]\n${result}\n\nUsing the above search results, please answer my previous question.`,
  })

  yield* litellmStream(baseUrl, apiKey, model, finalMsgs)
}

async function* litellmStream(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<Record<string, unknown>>
): AsyncGenerator<ChatEvent> {
  const headers = { Authorization: `Bearer ${apiKey || 'dummy'}`, 'Content-Type': 'application/json' }
  const finalRes = await axios.post(
    `${baseUrl}/v1/chat/completions`,
    { model, messages, stream: true },
    { headers, responseType: 'stream', timeout: 120000 }
  )
  let buf = ''
  for await (const chunk of finalRes.data) {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          yield { type: 'chunk', content: '', done: true }
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) yield { type: 'chunk', content, done: false }
        } catch {
          /* skip */
        }
      }
    }
  }
  yield { type: 'chunk', content: '', done: true }
}
