import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Bot, User, Plus, AlertCircle, Copy, Check, Search, Loader2, ChevronDown, ChevronRight, X } from 'lucide-react'
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

// Live tool call indicator shown while streaming
function StreamingToolEvents({ events }: { events: ToolEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="flex items-end gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-indigo-300" />
      </div>
      <div className="space-y-1.5">
        {events.map((ev, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all ${
              ev.status === 'calling'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            {ev.status === 'calling' ? (
              <Loader2 size={11} className="animate-spin shrink-0" />
            ) : (
              <Check size={11} className="shrink-0" />
            )}
            <Search size={11} className="shrink-0 opacity-70" />
            <span className="font-medium">Web Search</span>
            <span className="opacity-60">—</span>
            <span className="font-mono opacity-80 truncate max-w-[240px]">
              {String(ev.args.query ?? '')}
            </span>
            {ev.status === 'done' && (
              <span className="ml-auto opacity-50 shrink-0">done</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Single expandable tool call card
function ToolCallCard({ tc }: { tc: { toolName: string; args: Record<string, unknown>; result: string } }) {
  const [expanded, setExpanded] = useState(false)
  const query = String(tc.args.query ?? tc.args.input ?? Object.values(tc.args)[0] ?? '')
  return (
    <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/20 transition-colors text-left"
      >
        <Search size={11} className="text-emerald-400 shrink-0" />
        <span className="text-zinc-300 font-medium">Web Search</span>
        <span className="text-zinc-600">·</span>
        <span className="font-mono text-emerald-300 truncate flex-1">"{query}"</span>
        {expanded
          ? <ChevronDown size={11} className="text-zinc-500 shrink-0" />
          : <ChevronRight size={11} className="text-zinc-500 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1.5 border-t border-zinc-700/40">
          <div className="max-h-56 overflow-y-auto text-zinc-400 leading-relaxed whitespace-pre-wrap selectable text-[11px]">
            {tc.result}
          </div>
        </div>
      )}
    </div>
  )
}

// Tool calls stored in message metadata, shown as individual expandable cards
function MessageToolCalls({ metadata }: { metadata: string }) {
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
        <ToolCallCard key={i} tc={tc} />
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
    <div className="flex items-end gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-indigo-300" />
      </div>
      <div className="max-w-[80%] group">
        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-zinc-200 selectable">
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
          {streaming && (
            <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
        {!streaming && (
          <div className="px-1 mt-1">
            <MessageToolCalls metadata={metadata} />
            <div className="flex items-center gap-1 mt-1">
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
    pendingPrompt,
    setPendingPrompt,
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

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    window.api.messages.list(activeConversationId).then(setMessages)
  }, [activeConversationId, setMessages])

  // Register streaming + tool event listeners
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
    return () => { removeChunk(); removeToolCall(); removeToolResult() }
  }, [appendStreamChunk, addToolCallEvent, resolveToolCallEvent])

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

  // Auto-send when navigated from dashboard with a pending prompt
  useEffect(() => {
    if (!pendingPrompt || !activeConversationId || isStreaming) return
    const text = pendingPrompt
    setPendingPrompt(null)
    sendMessage(text)
  }, [pendingPrompt, activeConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (content: string) => {
    if (!content || !activeAgentId || isStreaming) return

    setError(null)

    let convId = activeConversationId
    if (!convId) {
      convId = (await createNewConversation()) || null
      if (!convId) return
    }

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
      const result = await window.api.chat.send({
        conversationId: convId,
        agentId: activeAgentId,
        content,
        useAdk: false,
      })

      finalizeStreaming(result.assistantMessage)

      if (messages.length === 0) {
        const title = content.slice(0, 60) + (content.length > 60 ? '…' : '')
        updateConversation(convId, title)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message || 'Failed to send message')
      setIsStreaming(false)
    }
  }

  const handleSend = async () => {
    const content = input.trim()
    if (!content) return
    setInput('')
    await sendMessage(content)
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
            {activeAgent?.model} · {activeAgent?.provider}
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
