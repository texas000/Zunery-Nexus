import React, { useState, useRef, useEffect } from 'react'
import { Send, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore, type Agent } from '../store'
import { HanaAvatar } from '../assets/avatars/HanaAvatar'
import { RenAvatar } from '../assets/avatars/RenAvatar'
import { YukiAvatar } from '../assets/avatars/YukiAvatar'
import { KiraAvatar } from '../assets/avatars/KiraAvatar'

const AVATAR_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  hana: HanaAvatar,
  ren: RenAvatar,
  yuki: YukiAvatar,
  kira: KiraAvatar,
}

const ACCENT_MAP: Record<string, string> = {
  hana: '#F472B6',
  ren: '#60A5FA',
  yuki: '#A78BFA',
  kira: '#34D399',
}

const PERSONA_MAP: Record<string, string> = {
  hana: 'Hana',
  ren: 'Ren',
  yuki: 'Yuki',
  kira: 'Kira',
}

// ─── Agent Card ──────────────────────────────────────────────────────────────

function AgentCard({ agent, onChat }: { agent: Agent; onChat: () => void }) {
  const { t } = useTranslation()
  const AvatarComponent = AVATAR_MAP[agent.avatar]
  const accent = ACCENT_MAP[agent.avatar] ?? '#818cf8'
  const persona = PERSONA_MAP[agent.avatar] ?? agent.name

  return (
    <div
      className="relative flex flex-col items-center gap-4 p-6 rounded-3xl border bg-zinc-900 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer group"
      style={{ borderColor: `${accent}40`, boxShadow: `0 0 0 0 ${accent}` }}
      onClick={onChat}
    >
      <div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 30px ${accent}18` }}
      />
      <div
        className="w-28 h-28 rounded-2xl overflow-hidden"
        style={{ filter: `drop-shadow(0 0 14px ${accent}66)` }}
      >
        {AvatarComponent ? (
          <AvatarComponent className="w-full h-full" />
        ) : (
          <div className="w-full h-full rounded-2xl flex items-center justify-center bg-zinc-800" />
        )}
      </div>
      <div className="text-center space-y-1 flex-1">
        <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: `${accent}cc` }}>
          {persona}
        </p>
        <h3 className="text-base font-bold text-zinc-100">{agent.name}</h3>
        <p className="text-xs text-zinc-500 line-clamp-2 max-w-[180px] mx-auto">{agent.description}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onChat() }}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border"
        style={{ color: accent, borderColor: `${accent}60`, background: `${accent}18` }}
      >
        {t('dashboard.chatNow')}
        <ArrowRight size={11} />
      </button>
    </div>
  )
}

// ─── Team Response Card ───────────────────────────────────────────────────────

function TeamCard({
  agent,
  content,
  done,
  onContinue,
}: {
  agent: Agent
  content: string
  done: boolean
  onContinue: () => void
}) {
  const { t } = useTranslation()
  const AvatarComponent = AVATAR_MAP[agent.avatar]
  const accent = ACCENT_MAP[agent.avatar] ?? '#818cf8'
  const persona = PERSONA_MAP[agent.avatar] ?? agent.name
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [content])

  return (
    <div
      className="flex flex-col rounded-2xl border bg-zinc-900 overflow-hidden"
      style={{ borderColor: `${accent}30` }}
    >
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b" style={{ borderColor: `${accent}20` }}>
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0" style={{ filter: `drop-shadow(0 0 6px ${accent}55)` }}>
          {AvatarComponent ? <AvatarComponent className="w-full h-full" /> : <div className="w-full h-full bg-zinc-800 rounded-lg" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium tracking-widest uppercase truncate" style={{ color: `${accent}cc` }}>{persona}</p>
          <p className="text-xs font-semibold text-zinc-100 truncate">{agent.name}</p>
        </div>
        {!done && <Loader2 size={11} className="shrink-0 animate-spin" style={{ color: accent }} />}
      </div>

      {/* Streaming content */}
      <div
        ref={bodyRef}
        className="flex-1 overflow-y-auto px-3 py-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap min-h-[80px] max-h-48"
      >
        {content || <span className="text-zinc-600 italic">Thinking…</span>}
      </div>

      {/* Continue button */}
      {done && (
        <div className="px-3 pb-3">
          <button
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all"
            style={{ color: accent, borderColor: `${accent}50`, background: `${accent}12` }}
          >
            {t('dashboard.chatNow')}
            <ArrowRight size={10} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t } = useTranslation()
  const { agents, setActiveAgent, setView, addConversation, setActiveConversation, setPendingPrompt } = useStore()
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)

  // Team mode state
  const [teamMode, setTeamMode] = useState(false)
  const [teamPrompt, setTeamPrompt] = useState('')
  const [teamResponses, setTeamResponses] = useState<Record<string, { content: string; done: boolean }>>({})

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const ORDER = ['hana', 'ren', 'yuki', 'kira']
  const defaultAgents = ORDER
    .map((key) => agents.find((a) => a.avatar === key && a.is_default))
    .filter(Boolean) as Agent[]

  // Subscribe to team:chunk events
  useEffect(() => {
    const unsub = window.api.orchestrator.onTeamChunk((chunk) => {
      setTeamResponses((prev) => ({
        ...prev,
        [chunk.agentId]: {
          content: (prev[chunk.agentId]?.content ?? '') + chunk.content,
          done: chunk.done,
        },
      }))
    })
    return unsub
  }, [])

  const openChat = async (agent: Agent, promptText?: string) => {
    const conv = await window.api.conversations.create(agent.id, 'New Conversation')
    addConversation(conv)
    setActiveAgent(agent.id)
    setActiveConversation(conv.id)
    if (promptText) setPendingPrompt(promptText)
    setView('chat')
  }

  const handleSend = async () => {
    const text = prompt.trim()
    if (!text || sending) return
    setSending(true)
    setTeamPrompt(text)
    setTeamResponses({})
    setTeamMode(true)
    setPrompt('')

    try {
      await window.api.orchestrator.team(text)
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = () => {
    setTeamMode(false)
    setTeamResponses({})
    setTeamPrompt('')
  }

  // ─── Team Mode View ───────────────────────────────────────────────────────

  if (teamMode) {
    return (
      <div className="flex flex-col h-full overflow-y-auto bg-zinc-950">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-zinc-800/60">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Team Response</p>
            <p className="text-sm text-zinc-300 font-medium truncate">{teamPrompt}</p>
          </div>
          {sending && <Loader2 size={13} className="shrink-0 animate-spin text-zinc-500" />}
        </div>

        {/* Agent response grid */}
        <div className="flex-1 p-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {defaultAgents.map((agent) => {
              const resp = teamResponses[agent.id]
              return (
                <TeamCard
                  key={agent.id}
                  agent={agent}
                  content={resp?.content ?? ''}
                  done={resp?.done ?? false}
                  onContinue={() => openChat(agent, teamPrompt)}
                />
              )
            })}
          </div>
        </div>

        {/* New prompt bar */}
        <div className="flex-shrink-0 px-6 pb-6 max-w-2xl mx-auto w-full">
          <div className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-500 transition-colors shadow-xl">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('dashboard.inputPlaceholder')}
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none max-h-32 overflow-y-auto"
              style={{ lineHeight: '1.5' }}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || sending}
              className="mb-0.5 p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Default View ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 relative">
      {/* Header */}
      <div className="flex-shrink-0 pt-10 pb-6 text-center px-6">
        <p className="text-xs font-medium tracking-widest text-zinc-500 uppercase mb-2">{t('dashboard.subtitle')}</p>
        <h1 className="text-2xl font-bold text-zinc-100 mb-1">{t('dashboard.title')}</h1>
        <p className="text-sm text-zinc-500">{t('dashboard.description')}</p>
      </div>

      {/* Agent grid */}
      <div className="flex-1 px-6 pb-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {defaultAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onChat={() => openChat(agent)}
            />
          ))}
        </div>
      </div>

      {/* Orchestrator input */}
      <div className="flex-shrink-0 px-6 pb-8 max-w-2xl mx-auto w-full">
        <div className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-500 transition-colors shadow-xl">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('dashboard.inputPlaceholder')}
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none max-h-32 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || sending}
            className="mb-0.5 p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[11px] text-zinc-700 text-center mt-2">
          {t('dashboard.inputHint')}
        </p>
      </div>
    </div>
  )
}
