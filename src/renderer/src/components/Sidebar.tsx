import React, { useEffect, useCallback } from 'react'
import {
  MessageSquare,
  Bot,
  Settings,
  Plus,
  Trash2,
  ChevronRight,
  Zap,
  ZapOff,
} from 'lucide-react'
import { useStore, type Conversation } from '../store'

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ElementType
  label: string
  active: boolean
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 no-drag ${
        active
          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  )
}

function ConversationItem({
  conv,
  active,
  onClick,
  onDelete,
}: {
  conv: Conversation
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 no-drag ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
      }`}
      onClick={onClick}
    >
      <ChevronRight size={12} className="shrink-0 opacity-50" />
      <span className="flex-1 text-xs truncate">{conv.title || 'New Conversation'}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400 no-drag"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

export function Sidebar() {
  const {
    view,
    setView,
    agents,
    conversations,
    activeAgentId,
    activeConversationId,
    adkRunning,
    setActiveAgent,
    setActiveConversation,
    setConversations,
    addConversation,
    removeConversation,
  } = useStore()

  const activeAgent = agents.find((a) => a.id === activeAgentId)

  const loadConversations = useCallback(async () => {
    if (!activeAgentId) return
    const convs = await window.api.conversations.list(activeAgentId)
    setConversations(convs)
  }, [activeAgentId, setConversations])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const handleNewConversation = async () => {
    if (!activeAgentId) return
    const conv = await window.api.conversations.create(activeAgentId, 'New Conversation')
    addConversation(conv)
    setActiveConversation(conv.id)
    setView('chat')
  }

  const handleDeleteConversation = async (id: string) => {
    await window.api.conversations.delete(id)
    removeConversation(id)
  }

  return (
    <aside className="flex flex-col h-full w-64 bg-zinc-950 border-r border-zinc-800/60 select-none shrink-0">
      {/* Titlebar drag region + logo */}
      <div className="drag-region h-12 flex items-center px-4 border-b border-zinc-800/60 shrink-0 mt-6.5">
        <div className="no-drag flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Bot size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-zinc-100">Zunery Nexus</span>
        </div>

        {/* ADK status */}
        <div className="no-drag ml-auto flex items-center gap-1.5">
          {adkRunning ? (
            <Zap size={12} className="text-emerald-400" title="ADK running" />
          ) : (
            <ZapOff size={12} className="text-zinc-600" title="ADK offline" />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="p-3 space-y-1 border-b border-zinc-800/60 shrink-0">
        <NavItem icon={MessageSquare} label="Chat" active={view === 'chat'} onClick={() => setView('chat')} />
        <NavItem
          icon={Bot}
          label="Agents"
          active={view === 'agents'}
          onClick={() => setView('agents')}
          badge={agents.length > 0 ? String(agents.length) : undefined}
        />
        <NavItem icon={Settings} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
      </div>

      {/* Agent picker */}
      {view === 'chat' && (
        <div className="p-3 border-b border-zinc-800/60 shrink-0">
          <p className="text-xs text-zinc-500 font-medium mb-2 px-1">AGENT</p>
          <div className="space-y-1">
            {agents.length === 0 ? (
              <button
                onClick={() => setView('agents')}
                className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors no-drag"
              >
                + Create your first agent
              </button>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { setActiveAgent(agent.id); setView('chat') }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all no-drag ${
                    activeAgentId === agent.id
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center shrink-0">
                    <Bot size={10} />
                  </div>
                  <span className="truncate">{agent.name}</span>
                  {activeAgentId === agent.id && <ChevronRight size={10} className="ml-auto shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Conversations list */}
      {view === 'chat' && activeAgentId && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs text-zinc-500 font-medium">CONVERSATIONS</p>
            <button
              onClick={handleNewConversation}
              className="no-drag p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="New conversation"
            >
              <Plus size={13} />
            </button>
          </div>

          {conversations.length === 0 ? (
            <button
              onClick={handleNewConversation}
              className="w-full text-xs text-zinc-600 hover:text-zinc-400 px-3 py-2 rounded-lg hover:bg-zinc-800/40 transition-colors no-drag text-left"
            >
              + Start a conversation
            </button>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  active={activeConversationId === conv.id}
                  onClick={() => setActiveConversation(conv.id)}
                  onDelete={() => handleDeleteConversation(conv.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800/60 mt-auto shrink-0">
        {activeAgent && view === 'chat' && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500/40 to-indigo-500/40 flex items-center justify-center shrink-0">
              <Bot size={10} className="text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{activeAgent.name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{activeAgent.model}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
