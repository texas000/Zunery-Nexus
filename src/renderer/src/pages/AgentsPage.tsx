import React, { useState } from 'react'
import { Bot, Plus, Edit2, Trash2, ChevronRight, Cpu, Search, Wrench, Lock } from 'lucide-react'
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

const PROVIDER_LABELS = { ollama: 'Ollama', litellm: 'LiteLLM' }

// Keep this in sync with src/main/tools.ts TOOL_CATALOG
const TOOL_CATALOG = [
  {
    name: 'web_search',
    label: 'Web Search',
    description: 'Search DuckDuckGo for current information, news, and facts',
    icon: Search,
  },
] as const

interface AgentFormData {
  name: string
  description: string
  model: string
  system_prompt: string
  temperature: number
  provider: 'ollama' | 'litellm'
  tools: string
}

const DEFAULT_FORM: AgentFormData = {
  name: '',
  description: '',
  model: 'gemma3:latest',
  system_prompt: '',
  temperature: 0.7,
  provider: 'ollama',
  tools: '[]',
}

function AgentModal({
  initial,
  onSave,
  onClose,
  availableModels,
}: {
  initial?: Agent
  onSave: (data: AgentFormData) => Promise<void>
  onClose: () => void
  availableModels: string[]
}) {
  const isDefault = Boolean(initial?.is_default)
  const [form, setForm] = useState<AgentFormData>({
    name: initial?.name || '',
    description: initial?.description || '',
    model: initial?.model || 'gemma3:latest',
    system_prompt: initial?.system_prompt || '',
    temperature: initial?.temperature ?? 0.7,
    provider: (initial?.provider as 'ollama' | 'litellm') || 'ollama',
    tools: initial?.tools || '[]',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (key: keyof AgentFormData, val: unknown) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-500/20 flex items-center justify-center">
            <Bot size={15} className="text-indigo-300" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100">
            {initial ? 'Edit Agent' : 'Create Agent'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Name *</label>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="My Assistant"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Description</label>
            <input
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What this agent does…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>

          {/* Provider + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => update('provider', e.target.value as 'ollama' | 'litellm')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60 transition-colors"
              >
                <option value="ollama">Ollama</option>
                <option value="litellm">LiteLLM</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Model</label>
              {availableModels.length > 0 ? (
                <select
                  value={form.model}
                  onChange={(e) => update('model', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60 transition-colors"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.model}
                  onChange={(e) => update('model', e.target.value)}
                  placeholder="gemma3:latest"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/60 transition-colors"
                />
              )}
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-zinc-400">System Prompt</label>
              {isDefault && <Lock size={10} className="text-zinc-600" />}
            </div>
            <textarea
              value={form.system_prompt}
              onChange={(e) => !isDefault && update('system_prompt', e.target.value)}
              readOnly={isDefault}
              placeholder="You are a helpful assistant…"
              rows={4}
              className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors resize-none selectable ${isDefault ? 'opacity-60 cursor-default' : 'focus:border-indigo-500/60'}`}
            />
            {isDefault && (
              <p className="text-[11px] text-zinc-600 flex items-center gap-1">
                <Lock size={9} /> System prompt is read-only for built-in agents.
              </p>
            )}
          </div>

          {/* Tools */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-zinc-400" />
              <label className="text-xs font-medium text-zinc-400">Tools</label>
              <span className="text-[10px] text-zinc-600">Agent decides when to use them</span>
            </div>
            <div className="space-y-2">
              {TOOL_CATALOG.map((tool) => {
                const enabled = (() => {
                  try { return (JSON.parse(form.tools) as string[]).includes(tool.name) } catch { return false }
                })()
                const toggle = () => {
                  try {
                    const current: string[] = JSON.parse(form.tools)
                    const next = enabled ? current.filter((t) => t !== tool.name) : [...current, tool.name]
                    update('tools', JSON.stringify(next))
                  } catch {
                    update('tools', JSON.stringify([tool.name]))
                  }
                }
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={toggle}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      enabled
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-zinc-100'
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      enabled ? 'bg-emerald-500/20' : 'bg-zinc-700/60'
                    }`}>
                      <tool.icon size={13} className={enabled ? 'text-emerald-400' : 'text-zinc-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tool.label}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{tool.description}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      enabled ? 'border-emerald-400 bg-emerald-400' : 'border-zinc-600'
                    }`}>
                      {enabled && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">Temperature</label>
              <span className="text-xs text-indigo-400 font-mono">{form.temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => update('temperature', parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Precise (0)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
            >
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AgentCard({
  agent,
  onEdit,
  onDelete,
  onChat,
}: {
  agent: Agent
  onEdit: () => void
  onDelete: () => void
  onChat: () => void
}) {
  const AvatarComponent = agent.avatar ? AVATAR_MAP[agent.avatar] : null
  const accentColor = agent.avatar ? ACCENT_MAP[agent.avatar] : undefined
  const isDefault = Boolean(agent.is_default)

  return (
    <div
      className="group relative bg-zinc-900 border rounded-2xl p-5 transition-all duration-200 animate-fade-in hover:border-zinc-600"
      style={{ borderColor: accentColor ? `${accentColor}40` : undefined }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar or default Bot icon */}
        {AvatarComponent ? (
          <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden" style={{ filter: 'drop-shadow(0 0 6px ' + accentColor + '55)' }}>
            <AvatarComponent className="w-full h-full" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Bot size={18} className="text-indigo-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">{agent.name}</h3>
            {isDefault && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: accentColor, borderColor: `${accentColor}60`, background: `${accentColor}15` }}>
                <Lock size={8} />
                Default
              </span>
            )}
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              {PROVIDER_LABELS[agent.provider as keyof typeof PROVIDER_LABELS] || agent.provider}
            </span>
          </div>
          {agent.description && (
            <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{agent.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <Cpu size={10} />
              <span className="font-mono">{agent.model}</span>
            </div>
            <span className="text-zinc-700">·</span>
            <span className="text-[11px] text-zinc-500">temp {agent.temperature}</span>
            {(() => {
              try {
                const tools: string[] = JSON.parse(agent.tools || '[]')
                if (tools.length === 0) return null
                return tools.map((t) => {
                  const entry = TOOL_CATALOG.find((c) => c.name === t)
                  return (
                    <span key={t} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {entry ? <entry.icon size={9} /> : <Wrench size={9} />}
                      {entry?.label || t}
                    </span>
                  )
                })
              } catch { return null }
            })()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-800">
        <button
          onClick={onChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
          style={accentColor ? { color: accentColor, borderColor: `${accentColor}40`, background: `${accentColor}15` } : { color: '#818cf8', borderColor: '#4f46e540', background: '#4f46e510' }}
        >
          Chat
          <ChevronRight size={11} />
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
        >
          <Edit2 size={11} />
          {isDefault ? 'View' : 'Edit'}
        </button>
        {!isDefault && (
          <button
            onClick={onDelete}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 text-xs transition-colors"
          >
            <Trash2 size={11} />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export function AgentsPage() {
  const { agents, setAgents, addAgent, updateAgent, removeAgent, setView, setActiveAgent } = useStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>()
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const { settings } = useStore()

  const loadModels = async () => {
    try {
      const provider = settings['provider'] || 'ollama'
      let models: string[] = []
      if (provider === 'ollama') {
        models = await window.api.models.listOllama()
      } else {
        models = await window.api.models.listLiteLLM()
      }
      setAvailableModels(models)
    } catch {
      setAvailableModels([])
    }
  }

  const handleOpenCreate = () => {
    setEditingAgent(undefined)
    loadModels()
    setModalOpen(true)
  }

  const handleOpenEdit = (agent: Agent) => {
    setEditingAgent(agent)
    loadModels()
    setModalOpen(true)
  }

  const handleSave = async (data: AgentFormData) => {
    if (editingAgent) {
      const updated = await window.api.agents.update(editingAgent.id, {
        ...data,
        tools: data.tools,
      })
      if (updated) updateAgent(updated as Agent)
    } else {
      const created = await window.api.agents.create({
        ...data,
        tools: data.tools,
      })
      addAgent(created as Agent)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent? All conversations will also be deleted.')) return
    await window.api.agents.delete(id)
    removeAgent(id)
  }

  const handleChat = (agent: Agent) => {
    setActiveAgent(agent.id)
    setView('chat')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-zinc-100">Agents</h1>
          <p className="text-xs text-zinc-500">{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            New Agent
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 flex items-center justify-center">
              <Bot size={28} className="text-zinc-500" />
            </div>
            <div className="text-center">
              <h2 className="text-base font-semibold text-zinc-200 mb-2">No agents yet</h2>
              <p className="text-sm text-zinc-500 max-w-sm">
                Create an agent to start chatting. Each agent can have its own model, system prompt, and configuration.
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Create First Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => handleOpenEdit(agent)}
                onDelete={() => handleDelete(agent.id)}
                onChat={() => handleChat(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <AgentModal
          initial={editingAgent}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          availableModels={availableModels}
        />
      )}
    </div>
  )
}
