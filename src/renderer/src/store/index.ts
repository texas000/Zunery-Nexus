import { create } from 'zustand'

export type View = 'home' | 'chat' | 'agents' | 'settings'

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

export interface ToolEvent {
  toolName: string
  args: Record<string, unknown>
  result?: string
  status: 'calling' | 'done'
}

export interface OrchestratorLogEntry {
  type: string
  label: string
  content: string
  ts: number
  model?: string
  agent?: string
}

export interface OrchestratorMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  routedAgentId?: string | null
  routedAgentName?: string | null
  routingReason?: string | null
  thinking?: string | null
  log?: OrchestratorLogEntry[]
  metadata?: string
}

interface AppState {
  view: View
  agents: Agent[]
  conversations: Conversation[]
  messages: Message[]
  activeAgentId: string | null
  activeConversationId: string | null
  streamingMessageId: string | null
  streamingContent: string
  streamingToolEvents: ToolEvent[]
  isStreaming: boolean
  adkRunning: boolean
  useAdk: boolean
  settings: Record<string, string>

  // Orchestrator state
  orchestratorMessages: OrchestratorMessage[]
  orchestratorRouting: { agentId: string; agentName: string; reason?: string } | null
  orchestratorStreaming: boolean
  orchestratorStreamingContent: string
  orchestratorThinkingContent: string
  orchestratorCurrentLog: OrchestratorLogEntry[]

  setView: (v: View) => void
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  updateAgent: (agent: Agent) => void
  removeAgent: (id: string) => void
  setConversations: (convs: Conversation[]) => void
  addConversation: (conv: Conversation) => void
  updateConversation: (id: string, title: string) => void
  removeConversation: (id: string) => void
  setMessages: (msgs: Message[]) => void
  appendMessage: (msg: Message) => void
  setActiveAgent: (id: string | null) => void
  setActiveConversation: (id: string | null) => void
  setStreamingMessage: (id: string | null, content?: string) => void
  appendStreamChunk: (chunk: string) => void
  addToolCallEvent: (toolName: string, args: Record<string, unknown>) => void
  resolveToolCallEvent: (toolName: string, result: string) => void
  finalizeStreaming: (msg: Message) => void
  setIsStreaming: (v: boolean) => void
  setAdkRunning: (v: boolean) => void
  setUseAdk: (v: boolean) => void
  setSettings: (s: Record<string, string>) => void
  updateSetting: (key: string, value: string) => void

  // Orchestrator actions
  addOrchestratorMessage: (msg: OrchestratorMessage) => void
  setOrchestratorRouting: (routing: { agentId: string; agentName: string; reason?: string } | null) => void
  setOrchestratorStreaming: (v: boolean) => void
  appendOrchestratorChunk: (chunk: string) => void
  appendOrchestratorThinking: (chunk: string) => void
  addOrchestratorLog: (entry: OrchestratorLogEntry) => void
  finalizeOrchestratorResponse: (msg: Omit<OrchestratorMessage, 'thinking' | 'log'>) => void
  clearOrchestrator: () => void
}

export const useStore = create<AppState>((set) => ({
  view: 'home',
  agents: [],
  conversations: [],
  messages: [],
  activeAgentId: null,
  activeConversationId: null,
  streamingMessageId: null,
  streamingContent: '',
  streamingToolEvents: [],
  isStreaming: false,
  adkRunning: false,
  useAdk: true,
  settings: {},

  // Orchestrator state
  orchestratorMessages: [],
  orchestratorRouting: null,
  orchestratorStreaming: false,
  orchestratorStreamingContent: '',
  orchestratorThinkingContent: '',
  orchestratorCurrentLog: [],

  setView: (v) => set({ view: v }),
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) => set((s) => ({ agents: [agent, ...s.agents] })),
  updateAgent: (agent) => set((s) => ({ agents: s.agents.map((a) => (a.id === agent.id ? agent : a)) })),
  removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

  setConversations: (conversations) => set({ conversations }),
  addConversation: (conv) => set((s) => ({ conversations: [conv, ...s.conversations] })),
  updateConversation: (id, title) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)) })),
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    })),

  setMessages: (messages) => set({ messages }),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setActiveAgent: (id) => set({ activeAgentId: id, conversations: [], messages: [], activeConversationId: null }),
  setActiveConversation: (id) => set({ activeConversationId: id, messages: [] }),

  setStreamingMessage: (id, content = '') =>
    set({ streamingMessageId: id, streamingContent: content, streamingToolEvents: [] }),
  appendStreamChunk: (chunk) => set((s) => ({ streamingContent: s.streamingContent + chunk })),

  addToolCallEvent: (toolName, args) =>
    set((s) => {
      // Only accept events while actively streaming
      if (!s.isStreaming) return s
      return { streamingToolEvents: [...s.streamingToolEvents, { toolName, args, status: 'calling' }] }
    }),
  resolveToolCallEvent: (toolName, result) =>
    set((s) => {
      if (!s.isStreaming) return s
      // Match the LAST calling event for this tool (handles repeated tool calls)
      let matched = false
      const updated = [...s.streamingToolEvents].reverse().map((ev) => {
        if (!matched && ev.toolName === toolName && ev.status === 'calling') {
          matched = true
          return { ...ev, result, status: 'done' as const }
        }
        return ev
      }).reverse()
      return { streamingToolEvents: updated }
    }),

  finalizeStreaming: (msg) =>
    set((s) => ({
      streamingMessageId: null,
      streamingContent: '',
      streamingToolEvents: [],
      isStreaming: false,
      messages: [...s.messages, msg],
    })),
  setIsStreaming: (v) => set({ isStreaming: v }),
  setAdkRunning: (v) => set({ adkRunning: v }),
  setUseAdk: (v) => set({ useAdk: v }),
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),

  // Orchestrator actions
  addOrchestratorMessage: (msg) =>
    set((s) => ({ orchestratorMessages: [...s.orchestratorMessages, msg] })),
  setOrchestratorRouting: (routing) => set({ orchestratorRouting: routing }),
  setOrchestratorStreaming: (v) =>
    set({ orchestratorStreaming: v, orchestratorStreamingContent: v ? '' : '' }),
  appendOrchestratorChunk: (chunk) =>
    set((s) => ({ orchestratorStreamingContent: s.orchestratorStreamingContent + chunk })),
  appendOrchestratorThinking: (chunk) =>
    set((s) => ({ orchestratorThinkingContent: s.orchestratorThinkingContent + chunk })),
  addOrchestratorLog: (entry) =>
    set((s) => ({ orchestratorCurrentLog: [...s.orchestratorCurrentLog, entry] })),
  finalizeOrchestratorResponse: (msg) =>
    set((s) => ({
      orchestratorMessages: [...s.orchestratorMessages, {
        ...msg,
        thinking: s.orchestratorThinkingContent || null,
        routingReason: s.orchestratorRouting?.reason || null,
        log: s.orchestratorCurrentLog.length > 0 ? [...s.orchestratorCurrentLog] : undefined,
      }],
      orchestratorStreaming: false,
      orchestratorStreamingContent: '',
      orchestratorThinkingContent: '',
      orchestratorCurrentLog: [],
      orchestratorRouting: null,
    })),
  clearOrchestrator: () =>
    set({
      orchestratorMessages: [],
      orchestratorRouting: null,
      orchestratorStreaming: false,
      orchestratorStreamingContent: '',
      orchestratorThinkingContent: '',
      orchestratorCurrentLog: [],
    }),
}))
