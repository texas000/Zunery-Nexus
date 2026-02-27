import { ElectronAPI } from '@electron-toolkit/preload'

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  system_prompt: string
  temperature: number
  provider: 'ollama' | 'litellm'
  tools: string
  is_default: number
  avatar: string
  created_at: string
  updated_at: string
}

export interface RouteResult {
  agentId: string
  agentName: string
  avatar: string
  reasoning: string
}

export interface Conversation {
  id: string
  agent_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: string
  created_at: string
}

export interface API {
  settings: {
    get: () => Promise<Record<string, string>>
    set: (key: string, value: string) => Promise<{ ok: boolean }>
    setMany: (pairs: Record<string, string>) => Promise<{ ok: boolean }>
  }
  agents: {
    list: () => Promise<Agent[]>
    get: (id: string) => Promise<Agent | undefined>
    create: (data: Partial<Agent>) => Promise<Agent>
    update: (id: string, data: Partial<Agent>) => Promise<Agent>
    delete: (id: string) => Promise<{ ok: boolean }>
  }
  conversations: {
    list: (agentId?: string) => Promise<Conversation[]>
    create: (agentId: string, title?: string) => Promise<Conversation>
    updateTitle: (id: string, title: string) => Promise<{ ok: boolean }>
    delete: (id: string) => Promise<{ ok: boolean }>
  }
  messages: {
    list: (conversationId: string) => Promise<Message[]>
  }
  chat: {
    send: (params: {
      conversationId: string
      agentId: string
      content: string
      useAdk: boolean
    }) => Promise<{ userMessage: Message; assistantMessage: Message }>
    onChunk: (callback: (chunk: { id: string; content: string; done: boolean }) => void) => () => void
    onToolCall: (callback: (ev: { id: string; toolName: string; args: Record<string, unknown> }) => void) => () => void
    onToolResult: (callback: (ev: { id: string; toolName: string; result: string }) => void) => () => void
  }
  models: {
    listOllama: (baseUrl?: string) => Promise<string[]>
    listLiteLLM: (baseUrl?: string, apiKey?: string) => Promise<string[]>
  }
  adk: {
    status: () => Promise<{ running: boolean; version?: string }>
    syncAgents: () => Promise<{ ok: boolean; synced?: number; error?: string }>
    onStatusChange: (callback: (status: { running: boolean; error?: string }) => void) => () => void
  }
  orchestrator: {
    route: (prompt: string) => Promise<RouteResult>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
