import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send,
  Bot,
  User,
  Network,
  Loader2,
  Check,
  Search,
  Copy,
  X,
  AlertCircle,
  Trash2,
  ChevronDown,
  ArrowRight,
  Terminal,
  BookOpen,
  FileText,
  FilePlus,
  FileEdit,
  FileX,
  FolderOpen,
} from 'lucide-react'
import { useStore, type Agent, type ToolEvent, type OrchestratorLogEntry } from '../store'

// ─── Log type metadata ────────────────────────────────────────────────────────

const LOG_META: Record<string, { color: string; bg: string }> = {
  input:               { color: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
  'llm-request':       { color: 'text-amber-400',   bg: 'bg-amber-500/15' },
  'llm-prompt':        { color: 'text-amber-300',   bg: 'bg-amber-500/10' },
  'llm-response':      { color: 'text-orange-400',  bg: 'bg-orange-500/15' },
  routing:             { color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  'agent-request':     { color: 'text-violet-400',  bg: 'bg-violet-500/15' },
  'agent-prompt':      { color: 'text-purple-300',  bg: 'bg-purple-500/10' },
  'agent-response':    { color: 'text-sky-400',     bg: 'bg-sky-500/15' },
  'tool-call':         { color: 'text-yellow-400',  bg: 'bg-yellow-500/15' },
  'tool-result':       { color: 'text-green-400',   bg: 'bg-green-500/15' },
  'obsidian-prefetch': { color: 'text-violet-400',  bg: 'bg-violet-500/15' },
  'keyword-extract':   { color: 'text-amber-400',   bg: 'bg-amber-500/15' },
  info:                { color: 'text-zinc-400',    bg: 'bg-zinc-500/10' },
  error:               { color: 'text-red-400',     bg: 'bg-red-500/15' },
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── TraceLog ─────────────────────────────────────────────────────────────────

function TraceLog({ entries, live }: { entries: OrchestratorLogEntry[]; live?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length, live])

  if (entries.length === 0) return null

  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden font-mono text-[11px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <Terminal size={11} className="text-zinc-500" />
        <span className="text-zinc-500 font-sans">Trace log</span>
        {live && (
          <span className="ml-auto flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-sans text-[10px]">live</span>
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-80 p-3 space-y-1.5 selectable">
        {entries.map((entry, i) => {
          const meta = LOG_META[entry.type] || { color: 'text-zinc-400', bg: 'bg-zinc-500/10' }
          return (
            <div key={i} className="flex gap-2 items-start leading-relaxed">
              <span className="text-zinc-600 shrink-0 tabular-nums">{fmtTime(entry.ts)}</span>
              <span className={`shrink-0 px-1.5 rounded text-[9px] font-sans font-semibold uppercase tracking-wide mt-0.5 ${meta.color} ${meta.bg}`}>
                {entry.type}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-300 font-sans font-medium">{entry.label}</span>
                <span className="text-zinc-600 font-sans mx-1">›</span>
                <span className={`break-words whitespace-pre-wrap ${meta.color}`}>{entry.content}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── ThinkingBlock ────────────────────────────────────────────────────────────

function ThinkingBlock({
  content,
  agentName,
  reason,
  done,
}: {
  content: string
  agentName?: string | null
  reason?: string | null
  done: boolean
}) {
  const [expanded, setExpanded] = useState(!done)

  useEffect(() => {
    if (done) setExpanded(false)
  }, [done])

  if (!content && done) return null

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs animate-fade-in">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {!done ? (
          <Loader2 size={11} className="text-amber-500 dark:text-amber-400 animate-spin shrink-0" />
        ) : (
          <Check size={11} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
        )}
        <span className={`font-medium ${!done ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {!done ? 'Thinking...' : 'Analyzed'}
        </span>
        {done && agentName && (
          <>
            <ArrowRight size={10} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
            <Bot size={10} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{agentName}</span>
            {reason && (
              <span className="text-zinc-400 dark:text-zinc-600 truncate flex-1">— {reason}</span>
            )}
          </>
        )}
        <ChevronDown
          size={11}
          className={`ml-auto shrink-0 text-zinc-400 dark:text-zinc-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && content && (
        <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <p className="font-mono text-[10.5px] leading-relaxed text-zinc-400 dark:text-zinc-500 whitespace-pre-wrap selectable">
            {content}
            {!done && <span className="inline-block w-1.5 h-3 bg-amber-400 ml-0.5 animate-pulse align-middle rounded-sm" />}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── AgentBadge ───────────────────────────────────────────────────────────────

function AgentBadge({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-2">
      <div className="w-px h-4 bg-indigo-400/40 rounded-full" />
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
        <Bot size={10} className="text-indigo-500 dark:text-indigo-300 shrink-0" />
        <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{name}</span>
      </div>
    </div>
  )
}

// ─── Tool display metadata ───────────────────────────────────────────────────

const TOOL_DISPLAY: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; argKey: string }> = {
  obsidian_search: { label: 'Obsidian Search',  icon: BookOpen,   argKey: 'query' },
  obsidian_read:   { label: 'Obsidian Read',    icon: FileText,   argKey: 'path' },
  obsidian_create: { label: 'Obsidian Create',  icon: FilePlus,   argKey: 'path' },
  obsidian_update: { label: 'Obsidian Update',  icon: FileEdit,   argKey: 'path' },
  obsidian_delete: { label: 'Obsidian Delete',  icon: FileX,      argKey: 'path' },
  obsidian_list:   { label: 'Obsidian List',    icon: FolderOpen,  argKey: 'folder' },
}

// ─── StreamingToolEvents ──────────────────────────────────────────────────────

function StreamingToolEvents({ events }: { events: ToolEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="space-y-1.5">
      {events.map((ev, i) => {
        const meta = TOOL_DISPLAY[ev.toolName] || { label: ev.toolName, icon: Search, argKey: Object.keys(ev.args)[0] || 'query' }
        const IconComp = meta.icon
        const isObsidian = ev.toolName.startsWith('obsidian_')
        const argValue = String(ev.args[meta.argKey] ?? ev.args[Object.keys(ev.args)[0]] ?? '')

        return (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all ${
              ev.status === 'calling'
                ? isObsidian
                  ? 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-300'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {ev.status === 'calling' ? (
              <Loader2 size={11} className="animate-spin shrink-0" />
            ) : (
              <Check size={11} className="shrink-0" />
            )}
            <IconComp size={11} className="shrink-0 opacity-70" />
            <span className="font-medium">{meta.label}</span>
            <span className="opacity-60">—</span>
            <span className="font-mono opacity-80 truncate max-w-[240px]">
              {argValue}
            </span>
            {ev.status === 'done' && <span className="ml-auto opacity-50 shrink-0">done</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      title="Copy"
    >
      {copied ? <Check size={13} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={13} />}
    </button>
  )
}

// ─── AgentPill (header) ───────────────────────────────────────────────────────

function AgentPill({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50">
      <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center">
        <Bot size={8} className="text-indigo-500 dark:text-indigo-300" />
      </div>
      <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">{agent.name}</span>
    </div>
  )
}

// ─── OrchestratorPage ────────────────────────────────────────────────────────

export function OrchestratorPage() {
  const {
    agents,
    orchestratorMessages,
    orchestratorRouting,
    orchestratorStreaming,
    orchestratorStreamingContent,
    orchestratorThinkingContent,
    orchestratorCurrentLog,
    streamingToolEvents,
    adkRunning,
    useAdk,
    setView,
    addOrchestratorMessage,
    setOrchestratorRouting,
    setOrchestratorStreaming,
    appendOrchestratorChunk,
    appendOrchestratorThinking,
    addOrchestratorLog,
    finalizeOrchestratorResponse,
    clearOrchestrator,
    addToolCallEvent,
    resolveToolCallEvent,
    settings,
  } = useStore()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [visibleLogId, setVisibleLogId] = useState<string | null>(null)
  const [showLiveLog, setShowLiveLog] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const displayModel = settings['default.model']?.trim() || agents[0]?.model || 'default'

  // Register listeners
  useEffect(() => {
    const removeChunk = window.api.chat.onChunk((chunk) => {
      if (chunk.done) return
      appendOrchestratorChunk(chunk.content)
    })
    const removeThinking = window.api.chat.onOrchestratorThinking((chunk) => {
      if (!chunk.done) appendOrchestratorThinking(chunk.content)
    })
    const removeLog = window.api.chat.onOrchestratorLog((entry) => {
      addOrchestratorLog(entry)
    })
    const removeRouting = window.api.chat.onAgentRouting((ev) => {
      setOrchestratorRouting({ agentId: ev.agentId, agentName: ev.agentName, reason: ev.reason })
    })
    const removeToolCall = window.api.chat.onToolCall((ev) => {
      addToolCallEvent(ev.toolName, ev.args)
    })
    const removeToolResult = window.api.chat.onToolResult((ev) => {
      resolveToolCallEvent(ev.toolName, ev.result)
    })
    const removeError = window.api.chat.onError((ev) => {
      setError(ev.error)
      setOrchestratorStreaming(false)
      setOrchestratorRouting(null)
    })
    return () => {
      removeChunk()
      removeThinking()
      removeLog()
      removeRouting()
      removeToolCall()
      removeToolResult()
      removeError()
    }
  }, [
    appendOrchestratorChunk,
    appendOrchestratorThinking,
    addOrchestratorLog,
    setOrchestratorRouting,
    addToolCallEvent,
    resolveToolCallEvent,
    setOrchestratorStreaming,
  ])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [orchestratorMessages, orchestratorStreamingContent, orchestratorThinkingContent, orchestratorCurrentLog.length])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || orchestratorStreaming) return
    if (agents.length === 0) {
      setError('No agents available. Create agents first.')
      return
    }

    setError(null)
    setInput('')
    setVisibleLogId(null)
    setShowLiveLog(false)

    addOrchestratorMessage({ id: crypto.randomUUID(), role: 'user', content })
    setOrchestratorStreaming(true)
    setOrchestratorRouting(null)

    try {
      const result = await window.api.chat.orchestrate({
        content,
        useAdk: useAdk && adkRunning,
      })

      finalizeOrchestratorResponse({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        routedAgentId: result.agentId,
        routedAgentName: result.agentName,
        metadata: result.metadata,
      })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message || 'Orchestration failed')
      setOrchestratorStreaming(false)
      setOrchestratorRouting(null)
    }
  }, [
    input,
    orchestratorStreaming,
    agents,
    useAdk,
    adkRunning,
    addOrchestratorMessage,
    setOrchestratorStreaming,
    setOrchestratorRouting,
    finalizeOrchestratorResponse,
  ])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Empty state
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
          <Network size={28} className="text-amber-500 dark:text-amber-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Orchestrator</h2>
          <p className="text-sm text-zinc-500 max-w-sm">
            Create agents first. The orchestrator will automatically route your messages to the best agent.
          </p>
        </div>
        <button
          onClick={() => setView('agents')}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-700"
        >
          <Bot size={14} />
          Create Agents
        </button>
      </div>
    )
  }

  const hasMessages = orchestratorMessages.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Error snackbar */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-500/40 rounded-2xl text-sm text-red-600 dark:text-red-300 shadow-2xl shadow-black/10 dark:shadow-black/60 animate-fade-in max-w-sm">
          <AlertCircle size={14} className="shrink-0 text-red-500 dark:text-red-400" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-red-400 dark:text-red-500/60 hover:text-red-600 dark:hover:text-red-300 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/30 border border-amber-500/20 flex items-center justify-center">
          <Network size={15} className="text-amber-500 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Orchestrator</h1>
          <p className="text-xs text-zinc-500">
            <span className="font-mono text-amber-600 dark:text-amber-400">{displayModel}</span> · {agents.length} agent{agents.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5">
            {agents.slice(0, 4).map((a) => (
              <AgentPill key={a.id} agent={a} />
            ))}
            {agents.length > 4 && (
              <span className="text-[10px] text-zinc-500">+{agents.length - 4}</span>
            )}
          </div>
          {orchestratorMessages.length > 0 && (
            <button
              onClick={clearOrchestrator}
              className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Clear conversation"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!hasMessages && !orchestratorStreaming ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/15 flex items-center justify-center">
              <Network size={36} className="text-amber-500/80 dark:text-amber-400/80" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Ask anything
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                The orchestrator analyzes your message and routes it to the most suitable agent. You'll see the thinking process, agent selection, and full trace log in real time.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                >
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center">
                    <Bot size={10} className="text-indigo-500 dark:text-indigo-300" />
                  </div>
                  <div>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{a.name}</span>
                    {a.description && (
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5 max-w-[200px] truncate">
                        {a.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation */
          <div className="space-y-6 max-w-3xl mx-auto">
            {orchestratorMessages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end gap-3 animate-fade-in">
                    <div className="max-w-[75%] group flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <CopyButton text={msg.content} />
                        <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm selectable">
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 mt-auto">
                      <User size={14} className="text-zinc-600 dark:text-zinc-300" />
                    </div>
                  </div>
                )
              }

              // Assistant message
              const logVisible = visibleLogId === msg.id
              return (
                <div key={msg.id} className="space-y-2.5 animate-fade-in">
                  {/* Thinking block */}
                  {msg.thinking && (
                    <ThinkingBlock
                      content={msg.thinking}
                      agentName={msg.routedAgentName}
                      reason={msg.routingReason}
                      done={true}
                    />
                  )}

                  {/* Agent badge when no thinking block */}
                  {!msg.thinking && msg.routedAgentName && (
                    <AgentBadge name={msg.routedAgentName} />
                  )}

                  {/* Response bubble */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-indigo-500 dark:text-indigo-300" />
                    </div>
                    <div className="flex-1 group">
                      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 selectable">
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <CopyButton text={msg.content} />
                        {msg.routedAgentName && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-1">
                            via {msg.routedAgentName}
                          </span>
                        )}
                        {msg.log && msg.log.length > 0 && (
                          <button
                            onClick={() => setVisibleLogId(logVisible ? null : msg.id)}
                            className={`ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                              logVisible
                                ? 'bg-zinc-900 text-zinc-300 border border-zinc-700'
                                : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                            }`}
                          >
                            <Terminal size={10} />
                            <span>{logVisible ? 'Hide trace' : 'View trace'}</span>
                            <span className={`px-1 py-0.5 rounded text-[9px] font-mono ${logVisible ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'}`}>
                              {msg.log.length}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Trace log for this message */}
                  {logVisible && msg.log && (
                    <div className="ml-11 animate-fade-in">
                      <TraceLog entries={msg.log} />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Live streaming state */}
            {orchestratorStreaming && (
              <div className="space-y-2.5 animate-fade-in">
                {/* Live thinking block */}
                <ThinkingBlock
                  content={orchestratorThinkingContent}
                  agentName={orchestratorRouting?.agentName}
                  reason={orchestratorRouting?.reason}
                  done={orchestratorRouting !== null}
                />

                {/* Agent label after routing */}
                {orchestratorRouting && (
                  <AgentBadge name={orchestratorRouting.agentName} />
                )}

                {/* Live tool events */}
                {streamingToolEvents.length > 0 && (
                  <StreamingToolEvents events={streamingToolEvents} />
                )}

                {/* Streaming response */}
                {orchestratorStreamingContent ? (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-indigo-500 dark:text-indigo-300" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 selectable">
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {orchestratorStreamingContent}
                          </ReactMarkdown>
                        </div>
                        <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                      </div>
                    </div>
                  </div>
                ) : orchestratorRouting && streamingToolEvents.length === 0 ? (
                  /* Agent thinking dots */
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-indigo-500 dark:text-indigo-300" />
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <div className="flex gap-1 items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" />
                      </div>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {orchestratorRouting.agentName} is thinking...
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Live trace log toggle */}
                {orchestratorCurrentLog.length > 0 && (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setShowLiveLog((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors px-1"
                    >
                      <Terminal size={10} />
                      <span>{showLiveLog ? 'Hide' : 'Show'} trace log</span>
                      <span className="bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 px-1 rounded font-mono text-[9px]">
                        {orchestratorCurrentLog.length}
                      </span>
                      <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </button>
                    {showLiveLog && (
                      <TraceLog entries={orchestratorCurrentLog} live />
                    )}
                  </div>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-3 shrink-0">
        <div className="flex items-end gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-amber-500/50 transition-colors max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything — the orchestrator will route to the best agent..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 resize-none outline-none selectable"
            style={{ maxHeight: '160px' }}
            disabled={orchestratorStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || orchestratorStreaming}
            className="w-8 h-8 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0 mb-0.5"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-600 mt-2">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  )
}
