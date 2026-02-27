import React, { useState, useRef } from 'react'
import { Send, ArrowRight, Sparkles } from 'lucide-react'
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
      {/* Glow ring on hover */}
      <div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 30px ${accent}18` }}
      />

      {/* Avatar */}
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

      {/* Info */}
      <div className="text-center space-y-1 flex-1">
        <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: `${accent}cc` }}>
          {persona}
        </p>
        <h3 className="text-base font-bold text-zinc-100">{agent.name}</h3>
        <p className="text-xs text-zinc-500 line-clamp-2 max-w-[180px] mx-auto">{agent.description}</p>
      </div>

      {/* Chat button */}
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

// ─── Routing Toast ───────────────────────────────────────────────────────────

function RoutingToast({ agentName, avatar, visible }: { agentName: string; avatar: string; visible: boolean }) {
  const accent = ACCENT_MAP[avatar] ?? '#818cf8'
  const AvatarComponent = AVATAR_MAP[avatar]
  return (
    <div
      className={`fixed bottom-28 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 z-50 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      style={{ borderColor: `${accent}50`, background: `${accent}22` }}
    >
      {AvatarComponent && <AvatarComponent className="w-7 h-7 rounded-lg overflow-hidden shrink-0" />}
      <div>
        <p className="text-[11px] text-zinc-400">Routing to</p>
        <p className="text-sm font-semibold" style={{ color: accent }}>{agentName}</p>
      </div>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t } = useTranslation()
  const { agents, setActiveAgent, setView, addConversation, setActiveConversation, setPendingPrompt } = useStore()
  const [prompt, setPrompt] = useState('')
  const [routing, setRouting] = useState(false)
  const [toast, setToast] = useState<{ agentName: string; avatar: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Only show default agents in the dashboard, in defined order
  const ORDER = ['hana', 'ren', 'yuki', 'kira']
  const defaultAgents = ORDER
    .map((key) => agents.find((a) => a.avatar === key && a.is_default))
    .filter(Boolean) as Agent[]

  const openChat = async (agent: Agent, promptText?: string) => {
    const conv = await window.api.conversations.create(agent.id, 'New Conversation')
    addConversation(conv)
    setActiveAgent(agent.id)
    setActiveConversation(conv.id)
    if (promptText) setPendingPrompt(promptText)
    setView('chat')
  }

  const handleOrchestrate = async () => {
    const text = prompt.trim()
    if (!text || routing) return
    setRouting(true)

    try {
      const result = await window.api.orchestrator.route(text)
      const target = agents.find((a) => a.id === result.agentId)
      if (!target) return

      setToast({ agentName: result.agentName, avatar: result.avatar })
      await new Promise((r) => setTimeout(r, 1200)) // let toast be visible

      setToast(null)
      setPrompt('')
      await openChat(target, text)
    } finally {
      setRouting(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleOrchestrate()
    }
  }

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
          <Sparkles size={15} className="text-zinc-600 mb-1 shrink-0" />
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('dashboard.inputPlaceholder')}
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none max-h-32 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
            disabled={routing}
          />
          <button
            onClick={handleOrchestrate}
            disabled={!prompt.trim() || routing}
            className="mb-0.5 p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
          >
            <Send size={13} />
          </button>
        </div>
        <p className="text-[11px] text-zinc-700 text-center mt-2">
          {t('dashboard.inputHint')}
        </p>
      </div>

      {/* Routing toast */}
      <RoutingToast
        visible={!!toast}
        agentName={toast?.agentName ?? ''}
        avatar={toast?.avatar ?? ''}
      />
    </div>
  )
}
