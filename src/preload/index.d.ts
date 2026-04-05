import { ElectronAPI } from '@electron-toolkit/preload'

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  system_prompt: string
  temperature: number
  provider: 'ollama'
  tools: string
  created_at: string
  updated_at: string
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
    orchestrate: (params: { content: string; useAdk: boolean }) => Promise<{
      content: string; metadata: string; agentId: string; agentName: string
    }>
    onChunk: (callback: (chunk: { id: string; content: string; done: boolean }) => void) => () => void
    onToolCall: (callback: (ev: { id: string; toolName: string; args: Record<string, unknown> }) => void) => () => void
    onToolResult: (callback: (ev: { id: string; toolName: string; result: string }) => void) => () => void
    onAgentRouting: (callback: (ev: { agentId: string; agentName: string; reason: string }) => void) => () => void
    onOrchestratorThinking: (callback: (chunk: { content: string; done: boolean }) => void) => () => void
    onOrchestratorLog: (callback: (entry: { type: string; label: string; content: string; ts: number; model?: string; agent?: string }) => void) => () => void
    onError: (callback: (ev: { id: string; error: string }) => void) => () => void
  }
  models: {
    listOllama: (baseUrl?: string) => Promise<string[]>
  }
  adk: {
    status: () => Promise<{ running: boolean; version?: string }>
    syncAgents: () => Promise<{ ok: boolean; synced?: number; error?: string }>
    onStatusChange: (callback: (status: { running: boolean; error?: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
