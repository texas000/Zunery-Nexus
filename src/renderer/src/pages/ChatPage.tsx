import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Bot, User, Plus, AlertCircle, Copy, Check, Search, BookOpen, FileText, FilePlus, FileEdit, FileX, FolderOpen, Wrench, Loader2, ChevronDown, ChevronRight, X, ExternalLink } from 'lucide-react'
import { useStore, type ToolEvent } from '../store'

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-indigo-300" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
        </div>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
      title="Copy"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  )
}

// ─── Tool display metadata ──────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; argKey: string; color: string }> = {
  obsidian_search: { label: 'Obsidian Search',  icon: BookOpen,   argKey: 'query',  color: 'violet' },
  obsidian_read:   { label: 'Obsidian Read',    icon: FileText,   argKey: 'path',   color: 'sky' },
  obsidian_create: { label: 'Obsidian Create',  icon: FilePlus,   argKey: 'path',   color: 'emerald' },
  obsidian_update: { label: 'Obsidian Update',  icon: FileEdit,   argKey: 'path',   color: 'amber' },
  obsidian_delete: { label: 'Obsidian Delete',  icon: FileX,      argKey: 'path',   color: 'red' },
  obsidian_list:   { label: 'Obsidian List',    icon: FolderOpen,  argKey: 'folder', color: 'indigo' },
}

function getToolMeta(name: string) {
  return TOOL_META[name] || { label: name, icon: Wrench, argKey: 'query', color: 'zinc' }
}

// Live tool call indicators shown while streaming
function StreamingToolEvents({ events }: { events: ToolEvent[] }) {
  if (events.length === 0) return null
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const { settings } = useStore()
  const vaultPath = settings['obsidian.vaultPath'] || ''

  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-indigo-300" />
      </div>
      <div className="space-y-1.5 flex-1 max-w-[80%]">
        {events.map((ev, i) => {
          const meta = getToolMeta(ev.toolName)
          const Icon = meta.icon
          const isDone = ev.status === 'done'
          const isWriteTool = OBSIDIAN_WRITE_TOOLS.has(ev.toolName)
          const notePath = String((ev.args as Record<string, unknown>).path ?? '')
          const obsidianUri = isWriteTool && notePath ? buildObsidianUri(vaultPath, notePath) : ''

          // Write tool (create/update/delete) — compact status + link
          if (isWriteTool) {
            const actionLabel = !isDone
              ? (ev.toolName === 'obsidian_create' ? 'Creating note…'
                : ev.toolName === 'obsidian_update' ? 'Updating note…'
                : 'Deleting note…')
              : (ev.toolName === 'obsidian_create' ? 'Note created'
                : ev.toolName === 'obsidian_update' ? 'Note updated'
                : 'Note deleted')

            return (
              <div key={i} className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden text-xs">
                <div className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {isDone
                      ? <Check size={11} className="text-emerald-400 shrink-0" />
                      : <Loader2 size={11} className="animate-spin text-amber-300 shrink-0" />
                    }
                    <Icon size={11} className={`shrink-0 opacity-70 ${isDone ? 'text-emerald-400' : 'text-amber-300'}`} />
                    <span className={`font-medium ${isDone ? 'text-emerald-400' : 'text-amber-300'}`}>{actionLabel}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="font-mono text-zinc-300 truncate flex-1">{notePath}</span>
                  </div>
                  {isDone && obsidianUri && ev.toolName !== 'obsidian_delete' && (
                    <button
                      onClick={() => window.api.shell.openExternal(obsidianUri)}
                      className="flex items-center gap-1.5 ml-5 text-violet-400 hover:text-violet-300 transition-colors w-fit"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="font-medium">Open in Obsidian</span>
                    </button>
                  )}
                </div>
              </div>
            )
          }

          // Read/search/list tool — expandable with raw response
          const { primary, extra } = formatToolArgs(ev.args as Record<string, unknown>)
          const isExpanded = expandedIdx === i

          return (
            <div key={i} className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden text-xs">
              <button
                onClick={() => isDone && setExpandedIdx(isExpanded ? null : i)}
                className={`w-full flex flex-col gap-1 px-3 py-2 text-left transition-colors ${
                  isDone ? 'hover:bg-zinc-700/20 cursor-pointer' : 'cursor-default'
                } ${isDone ? 'text-emerald-400' : 'text-amber-300'}`}
              >
                <div className="flex items-center gap-2 w-full">
                  {isDone
                    ? <Check size={11} className="shrink-0" />
                    : <Loader2 size={11} className="animate-spin shrink-0" />
                  }
                  <Icon size={11} className="shrink-0 opacity-70" />
                  <span className="font-medium text-zinc-300">{meta.label}</span>
                  <span className="text-zinc-600">·</span>
                  <span className={`font-mono truncate flex-1 ${isDone ? 'text-emerald-300' : 'text-amber-200'}`}>
                    {primary}
                  </span>
                  {isDone && (
                    isExpanded
                      ? <ChevronDown size={11} className="text-zinc-500 shrink-0" />
                      : <ChevronRight size={11} className="text-zinc-500 shrink-0" />
                  )}
                </div>
                {extra.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5">
                    {extra.map(({ key, val }) => (
                      <span key={key} className="text-zinc-500">
                        <span className="text-zinc-600">{key}:</span>{' '}
                        <span className="text-zinc-400 font-mono">{val}</span>
                      </span>
                    ))}
                  </div>
                )}
              </button>
              {isExpanded && ev.result && (
                <div className="px-3 pb-3 pt-1.5 border-t border-zinc-700/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Raw Response</span>
                    <CopyButton text={ev.result} />
                  </div>
                  <div className="max-h-64 overflow-y-auto bg-zinc-900/80 rounded-lg p-2.5 text-zinc-400 leading-relaxed whitespace-pre-wrap selectable text-[11px] font-mono">
                    {ev.result}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Tools that write to Obsidian — show link instead of raw content
const OBSIDIAN_WRITE_TOOLS = new Set(['obsidian_create', 'obsidian_update', 'obsidian_delete'])

/** Build an obsidian:// deep link from vault path + note path */
function buildObsidianUri(vaultPath: string, notePath: string): string {
  // Extract vault name from path (last directory segment)
  const segments = vaultPath.replace(/\/+$/, '').split('/')
  const vaultName = segments[segments.length - 1] || 'Ryan'
  // Remove .md extension for Obsidian URI
  const file = notePath.replace(/\.md$/, '')
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`
}

// Format tool args for display — show key=value pairs
function formatToolArgs(args: Record<string, unknown>): { primary: string; extra: Array<{ key: string; val: string }> } {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return { primary: '', extra: [] }

  // First entry is the primary display value
  const [, firstVal] = entries[0]
  const primary = String(firstVal)

  // Remaining entries shown as extra context
  const extra = entries.slice(1).map(([key, val]) => {
    const s = String(val)
    return { key, val: s.length > 80 ? s.slice(0, 80) + '…' : s }
  })

  return { primary, extra }
}

// Single expandable tool call card (for persisted messages)
function ToolCallCard({ tc, vaultPath }: { tc: { toolName: string; args: Record<string, unknown>; result: string }; vaultPath: string }) {
  const [expanded, setExpanded] = useState(false)
  const meta = getToolMeta(tc.toolName)
  const Icon = meta.icon
  const isWriteTool = OBSIDIAN_WRITE_TOOLS.has(tc.toolName)
  const notePath = String(tc.args.path ?? '')
  const obsidianUri = isWriteTool && notePath ? buildObsidianUri(vaultPath, notePath) : ''

  // For write tools: show compact card with status + open link
  if (isWriteTool) {
    const actionLabel = tc.toolName === 'obsidian_create' ? 'Note created'
      : tc.toolName === 'obsidian_update' ? 'Note updated'
      : 'Note deleted'

    return (
      <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden text-xs">
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Icon size={12} className="text-emerald-400 shrink-0" />
            <span className="text-emerald-400 font-medium">{actionLabel}</span>
            <span className="text-zinc-600">·</span>
            <span className="font-mono text-zinc-300 truncate flex-1">{notePath}</span>
          </div>
          {obsidianUri && tc.toolName !== 'obsidian_delete' && (
            <button
              onClick={() => window.api.shell.openExternal(obsidianUri)}
              className="flex items-center gap-1.5 ml-5 text-violet-400 hover:text-violet-300 transition-colors w-fit"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="font-medium">Open in Obsidian</span>
            </button>
          )}
          {tc.result && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 ml-5 text-zinc-500 hover:text-zinc-400 transition-colors w-fit"
            >
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <span className="text-[10px]">raw response</span>
            </button>
          )}
        </div>
        {expanded && tc.result && (
          <div className="px-3 pb-3 pt-1.5 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Raw Response</span>
              <CopyButton text={tc.result} />
            </div>
            <div className="max-h-64 overflow-y-auto bg-zinc-900/80 rounded-lg p-2.5 text-zinc-400 leading-relaxed whitespace-pre-wrap selectable text-[11px] font-mono">
              {tc.result}
            </div>
          </div>
        )}
      </div>
    )
  }

  // For read/search/list tools: show full expandable card
  const { primary, extra } = formatToolArgs(tc.args)
  return (
    <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-col gap-1 px-3 py-2 hover:bg-zinc-700/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 w-full">
          <Icon size={11} className="text-emerald-400 shrink-0" />
          <span className="text-zinc-300 font-medium">{meta.label}</span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono text-emerald-300 truncate flex-1">{primary}</span>
          {expanded
            ? <ChevronDown size={11} className="text-zinc-500 shrink-0" />
            : <ChevronRight size={11} className="text-zinc-500 shrink-0" />}
        </div>
        {extra.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5">
            {extra.map(({ key, val }) => (
              <span key={key} className="text-zinc-500">
                <span className="text-zinc-600">{key}:</span>{' '}
                <span className="text-zinc-400 font-mono">{val}</span>
              </span>
            ))}
          </div>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1.5 border-t border-zinc-700/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Raw Response</span>
            <CopyButton text={tc.result} />
          </div>
          <div className="max-h-64 overflow-y-auto bg-zinc-900/80 rounded-lg p-2.5 text-zinc-400 leading-relaxed whitespace-pre-wrap selectable text-[11px] font-mono">
            {tc.result || '(no result)'}
          </div>
        </div>
      )}
    </div>
  )
}

// Tool calls stored in message metadata, shown as individual expandable cards
function MessageToolCalls({ metadata, vaultPath }: { metadata: string; vaultPath: string }) {
  let toolCalls: Array<{ toolName: string; args: Record<string, unknown>; result: string }> = []
  try {
    const parsed = JSON.parse(metadata)
    toolCalls = parsed.tool_calls || []
  } catch {
    return null
  }
  if (toolCalls.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {toolCalls.map((tc, i) => (
        <ToolCallCard key={i} tc={tc} vaultPath={vaultPath} />
      ))}
    </div>
  )
}

// Snackbar for errors — auto-dismisses after 5 s
function Snackbar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-zinc-900 border border-red-500/40 rounded-2xl text-sm text-red-300 shadow-2xl shadow-black/60 animate-fade-in max-w-sm">
      <AlertCircle size={14} className="shrink-0 text-red-400" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 text-red-500/60 hover:text-red-300 transition-colors">
        <X size={13} />
      </button>
    </div>
  )
}

function MessageBubble({
  role,
  content,
  metadata = '{}',
  streaming = false,
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: string
  streaming?: boolean
}) {
  const { settings } = useStore()
  const vaultPath = settings['obsidian.vaultPath'] || ''
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end gap-3 animate-fade-in">
        <div className="max-w-[75%] group flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <CopyButton text={content} />
            <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm selectable">
              <p className="whitespace-pre-wrap">{content}</p>
            </div>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-auto">
          <User size={14} className="text-zinc-300" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-indigo-300" />
      </div>
      <div className="max-w-[80%] group space-y-2">
        {/* Tool calls shown above the response */}
        {!streaming && <MessageToolCalls metadata={metadata} vaultPath={vaultPath} />}

        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-zinc-200 selectable">
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
          {streaming && (
            <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
        {!streaming && (
          <div className="px-1">
            <div className="flex items-center gap-1">
              <CopyButton text={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyChat({ agentName, onNew }: { agentName: string; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
        <Bot size={28} className="text-indigo-400" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Chat with {agentName}</h2>
        <p className="text-sm text-zinc-500">Start a conversation or select one from the sidebar.</p>
      </div>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
      >
        <Plus size={14} />
        New Conversation
      </button>
    </div>
  )
}

function NoAgentPrompt({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 flex items-center justify-center">
        <Bot size={28} className="text-zinc-500" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-200 mb-2">No agent selected</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          Create an agent first to start chatting. Agents use your configured LLM to respond.
        </p>
      </div>
      <button
        onClick={onNavigate}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition-colors border border-zinc-700"
      >
        <Bot size={14} />
        Create an Agent
      </button>
    </div>
  )
}

export function ChatPage() {
  const {
    agents,
    messages,
    activeAgentId,
    activeConversationId,
    isStreaming,
    streamingContent,
    streamingToolEvents,
    adkRunning,
    useAdk,
    settings,
    setView,
    setMessages,
    setIsStreaming,
    setStreamingMessage,
    appendStreamChunk,
    addToolCallEvent,
    resolveToolCallEvent,
    finalizeStreaming,
    addConversation,
    setActiveConversation,
    updateConversation,
    appendMessage,
  } = useStore()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  // Show the globally configured model if set, otherwise fall back to agent's model
  const displayModel = settings['default.model'] && settings['default.model'].trim() ? settings['default.model'] : (activeAgent?.model || 'default')

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    window.api.messages.list(activeConversationId).then(setMessages)
  }, [activeConversationId, setMessages])

  // Register streaming + tool event + error listeners
  useEffect(() => {
    const removeChunk = window.api.chat.onChunk((chunk) => {
      if (chunk.done) return
      appendStreamChunk(chunk.content)
    })
    const removeToolCall = window.api.chat.onToolCall((ev) => {
      addToolCallEvent(ev.toolName, ev.args)
    })
    const removeToolResult = window.api.chat.onToolResult((ev) => {
      resolveToolCallEvent(ev.toolName, ev.result)
    })
    const removeError = window.api.chat.onError((ev) => {
      setError(ev.error)
      setIsStreaming(false)
      setStreamingMessage(null)
    })
    return () => { removeChunk(); removeToolCall(); removeToolResult(); removeError() }
  }, [appendStreamChunk, addToolCallEvent, resolveToolCallEvent, setIsStreaming, setStreamingMessage])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  const createNewConversation = useCallback(async () => {
    if (!activeAgentId) return null
    const conv = await window.api.conversations.create(activeAgentId, 'New Conversation')
    addConversation(conv)
    setActiveConversation(conv.id)
    return conv.id
  }, [activeAgentId, addConversation, setActiveConversation])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || !activeAgentId || isStreaming) return

    setError(null)
    setInput('')

    let convId = activeConversationId
    if (!convId) {
      convId = (await createNewConversation()) || null
      if (!convId) return
    }

    // Optimistically show the user message immediately
    appendMessage({
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: 'user',
      content,
      metadata: '{}',
      created_at: new Date().toISOString(),
    })

    setIsStreaming(true)
    setStreamingMessage('streaming-' + Date.now())

    try {
      console.log('chat: sending request', {
        conversationId: convId,
        agentId: activeAgentId,
        content,
        useAdk: useAdk && adkRunning,
      })

      const result = await window.api.chat.send({
        conversationId: convId,
        agentId: activeAgentId,
        content,
        useAdk: useAdk && adkRunning,
      })

      console.log('chat: received response', { assistantMessage: result?.assistantMessage })

      finalizeStreaming(result.assistantMessage)

      // Update title in sidebar if first message
      if (messages.length === 0) {
        const title = content.slice(0, 60) + (content.length > 60 ? '…' : '')
        updateConversation(convId, title)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message || 'Failed to send message')
      setIsStreaming(false)
      setStreamingMessage(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeAgentId) {
    return <NoAgentPrompt onNavigate={() => setView('agents')} />
  }

  if (!activeConversationId && messages.length === 0) {
    return (
      <EmptyChat
        agentName={activeAgent?.name || 'Agent'}
        onNew={createNewConversation}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {error && <Snackbar message={error} onDismiss={() => setError(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center">
          <Bot size={15} className="text-indigo-300" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">{activeAgent?.name || 'Agent'}</h1>
          <p className="text-xs text-zinc-500">
            <span className="font-mono text-indigo-400">{displayModel}</span> · {activeAgent?.provider}
            {activeAgent && (() => { try { const t = JSON.parse(activeAgent.tools || '[]'); return t.length > 0 ? ` · ${t.length} tool${t.length>1?'s':''}` : '' } catch { return '' } })()}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} metadata={msg.metadata} />
        ))}

        {/* Live tool call indicators while searching */}
        {isStreaming && streamingToolEvents.length > 0 && (
          <StreamingToolEvents events={streamingToolEvents} />
        )}

        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} streaming />
        )}
        {isStreaming && !streamingContent && streamingToolEvents.length === 0 && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-3 shrink-0">
        <div className="flex items-end gap-3 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-indigo-500/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none outline-none selectable"
            style={{ maxHeight: '160px' }}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0 mb-0.5"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-600 mt-2">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  )
}
