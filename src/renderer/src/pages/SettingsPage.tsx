import React, { useState, useEffect } from 'react'
import { Save, RefreshCw, AlertCircle, CheckCircle, BookOpen, FolderOpen } from 'lucide-react'
import { useStore } from '../store'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-600">{hint}</p>}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-indigo-500/60 transition-colors selectable"
    />
  )
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null
  return (
    <div
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
        ok
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
      }`}
    >
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
      {label}
    </div>
  )
}

export function SettingsPage() {
  const { settings, setSettings, updateSetting, adkRunning, setAdkRunning } = useStore()

  const [form, setForm] = useState({
    'ollama.baseUrl': 'http://localhost:11434',
    'default.model': 'gemma4:26b',
    'adk.enabled': 'true',
    'adk.pythonPath': navigator.userAgent.includes('Windows') ? 'python' : 'python3',
    'theme': 'dark',
    'obsidian.enabled': 'false',
    'obsidian.vaultPath': '/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ryan/',
  })

  const [ollamaStatus, setOllamaStatus] = useState<boolean | null>(null)
  const [adkStatus, setAdkStatus] = useState<boolean | null>(null)
  const [obsidianStatus, setObsidianStatus] = useState<{ ok: boolean; noteCount?: number } | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      setForm((f) => ({
        ...f,
        'ollama.baseUrl': settings['ollama.baseUrl'] || f['ollama.baseUrl'],
        'default.model': settings['default.model'] || f['default.model'],
        'adk.enabled': settings['adk.enabled'] ?? f['adk.enabled'],
        'adk.pythonPath': settings['adk.pythonPath'] || f['adk.pythonPath'],
        'theme': settings['theme'] || f['theme'],
        'obsidian.enabled': settings['obsidian.enabled'] ?? f['obsidian.enabled'],
        'obsidian.vaultPath': settings['obsidian.vaultPath'] || f['obsidian.vaultPath'],
      }))
    }
  }, [settings])

  useEffect(() => {
    window.api.adk.status().then((s) => {
      setAdkStatus(s.running)
      setAdkRunning(s.running)
    })
  }, [setAdkRunning])

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  const testOllama = async () => {
    setTesting('ollama')
    const models = await window.api.models.listOllama(form['ollama.baseUrl'])
    setOllamaModels(models)
    setOllamaStatus(models.length > 0)
    setTesting(null)
  }

  const checkAdk = async () => {
    setTesting('adk')
    const status = await window.api.adk.status()
    setAdkStatus(status.running)
    setAdkRunning(status.running)
    setTesting(null)
  }

  const checkObsidian = async () => {
    setTesting('obsidian')
    try {
      const res = await fetch('http://127.0.0.1:7891/tools/obsidian/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_path: form['obsidian.vaultPath'], folder: '', recursive: false }),
      })
      const data = await res.json()
      if (data.error) {
        setObsidianStatus({ ok: false })
      } else {
        setObsidianStatus({ ok: true, noteCount: data.total || 0 })
      }
    } catch {
      setObsidianStatus({ ok: false })
    }
    setTesting(null)
  }

  const handleSave = async () => {
    setSaving(true)
    await window.api.settings.setMany(form)
    setSettings({ ...settings, ...form })

    // If obsidian is enabled, configure the vault path on the ADK server
    if (form['obsidian.enabled'] === 'true' && form['obsidian.vaultPath']) {
      try {
        await fetch('http://127.0.0.1:7891/tools/obsidian/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault_path: form['obsidian.vaultPath'] }),
        })
      } catch {
        // ADK server might not be running
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
          <p className="text-xs text-zinc-500">Configure your Ollama server, ADK, and integrations</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {saved ? (
            <><CheckCircle size={13} /> Saved</>
          ) : (
            <><Save size={13} /> {saving ? 'Saving...' : 'Save'}</>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Ollama */}
        <Section title="Ollama" description="Local Ollama server configuration">
          <Field label="Base URL" hint="Default: http://localhost:11434">
            <Input value={form['ollama.baseUrl']} onChange={(v) => update('ollama.baseUrl', v)} placeholder="http://localhost:11434" />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={testOllama}
              disabled={testing === 'ollama'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors"
            >
              <RefreshCw size={11} className={testing === 'ollama' ? 'animate-spin' : ''} />
              Test Connection
            </button>
            <StatusBadge ok={ollamaStatus} label={ollamaStatus ? `${ollamaModels.length} models` : 'Unreachable'} />
          </div>

          {ollamaModels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 font-medium">Available Models</p>
              <div className="flex flex-wrap gap-1.5">
                {ollamaModels.map((m) => (
                  <span
                    key={m}
                    onClick={() => update('default.model', m)}
                    className={`text-[11px] px-2 py-1 rounded-lg cursor-pointer transition-colors font-mono ${
                      form['default.model'] === m
                        ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Global Model */}
        <Section title="Global Model" description="Used by all agents and the orchestrator">
          <Field label="Model" hint="All agents will use this model. Click a model from the list above to select it.">
            <Input value={form['default.model']} onChange={(v) => update('default.model', v)} placeholder="e.g. llama3.2:latest" />
          </Field>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" description="Customize how the app looks">
          <Field label="Theme">
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update('theme', t)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all capitalize ${
                    form['theme'] === t
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-600 dark:text-indigo-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Obsidian */}
        <Section title="Obsidian" description="Knowledge management via your local Obsidian vault">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">Enable Obsidian Integration</p>
              <p className="text-xs text-zinc-500 mt-0.5">Enables search, read, create, update, and delete tools for all agents</p>
            </div>
            <div
              onClick={() => update('obsidian.enabled', form['obsidian.enabled'] === 'true' ? 'false' : 'true')}
              className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form['obsidian.enabled'] === 'true' ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form['obsidian.enabled'] === 'true' ? 'translate-x-5' : ''}`} />
            </div>
          </div>

          {form['obsidian.enabled'] === 'true' && (
            <>
              <Field label="Vault Path" hint="Full path to your Obsidian vault folder (iCloud sync supported)">
                <Input
                  value={form['obsidian.vaultPath']}
                  onChange={(v) => update('obsidian.vaultPath', v)}
                  placeholder="/Users/you/Documents/ObsidianVault/"
                />
              </Field>

              <div className="flex items-center gap-2">
                <button
                  onClick={checkObsidian}
                  disabled={testing === 'obsidian'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors"
                >
                  <RefreshCw size={11} className={testing === 'obsidian' ? 'animate-spin' : ''} />
                  Test Vault Connection
                </button>
                {obsidianStatus && (
                  <StatusBadge
                    ok={obsidianStatus.ok}
                    label={obsidianStatus.ok ? `${obsidianStatus.noteCount} notes found` : 'Vault not accessible'}
                  />
                )}
              </div>

              <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={13} className="text-violet-500" />
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400">Available Tools (when enabled)</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { name: 'obsidian_search', desc: 'Full-text search with tags & links' },
                    { name: 'obsidian_read', desc: 'Read note content & metadata' },
                    { name: 'obsidian_create', desc: 'Create notes with auto-categorization' },
                    { name: 'obsidian_update', desc: 'Update or append to notes' },
                    { name: 'obsidian_delete', desc: 'Delete notes from vault' },
                    { name: 'obsidian_list', desc: 'Browse vault structure' },
                  ].map((t) => (
                    <div key={t.name} className="flex items-start gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <FolderOpen size={10} className="mt-0.5 shrink-0 text-violet-400" />
                      <div>
                        <span className="font-mono text-violet-600 dark:text-violet-300">{t.name}</span>
                        <span className="text-zinc-400 dark:text-zinc-600 ml-1">— {t.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Google ADK */}
        <Section title="Google ADK" description="Agent Development Kit for advanced agent features">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">Enable Google ADK</p>
              <p className="text-xs text-zinc-500 mt-0.5">Runs a Python subprocess for enhanced agent capabilities</p>
            </div>
            <div
              onClick={() => update('adk.enabled', form['adk.enabled'] === 'true' ? 'false' : 'true')}
              className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form['adk.enabled'] === 'true' ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form['adk.enabled'] === 'true' ? 'translate-x-5' : ''}`} />
            </div>
          </div>

          <Field label="Python Executable Path" hint="Path to python executable. Must have google-adk installed.">
            <Input value={form['adk.pythonPath']} onChange={(v) => update('adk.pythonPath', v)} placeholder={navigator.userAgent.includes('Windows') ? 'python' : 'python3'} />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={checkAdk}
              disabled={testing === 'adk'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors"
            >
              <RefreshCw size={11} className={testing === 'adk' ? 'animate-spin' : ''} />
              Check ADK Status
            </button>
            <StatusBadge ok={adkStatus} label={adkStatus ? 'Running' : 'Not running'} />
          </div>

          <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 p-4 space-y-2">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Setup Instructions</p>
            <div className="font-mono text-[11px] text-zinc-500 space-y-1">
              <p className="text-zinc-500 dark:text-zinc-400"># Install google-adk:</p>
              <p>pip install google-adk</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
