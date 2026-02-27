import React, { useState, useEffect } from 'react'
import { Save, RefreshCw, Server, Zap, ZapOff, AlertCircle, CheckCircle, Cpu, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n, { SUPPORTED_LANGUAGES, type LangCode } from '../i18n'
import { useStore } from '../store'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
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
      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500/60 transition-colors selectable"
    />
  )
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null
  return (
    <div
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
    >
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
      {label}
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { settings, setSettings, updateSetting, adkRunning, setAdkRunning } = useStore()
  const [currentLang, setCurrentLang] = useState<LangCode>((i18n.language as LangCode) || 'en')

  const handleLanguageChange = async (code: LangCode) => {
    setCurrentLang(code)
    await i18n.changeLanguage(code)
    localStorage.setItem('ui.language', code)
    await window.api.settings.set('ui.language', code)
  }

  const [form, setForm] = useState({
    provider: 'ollama',
    'ollama.baseUrl': 'http://localhost:11434',
    'litellm.baseUrl': 'http://localhost:4000',
    'litellm.apiKey': '',
    'default.model': 'gemma3:latest',
    'adk.enabled': 'true',
    'adk.pythonPath': 'python3',
  })

  const [ollamaStatus, setOllamaStatus] = useState<boolean | null>(null)
  const [litellmStatus, setLitellmStatus] = useState<boolean | null>(null)
  const [adkStatus, setAdkStatus] = useState<boolean | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [litellmModels, setLitellmModels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      setForm((f) => ({
        ...f,
        provider: settings['provider'] || f.provider,
        'ollama.baseUrl': settings['ollama.baseUrl'] || f['ollama.baseUrl'],
        'litellm.baseUrl': settings['litellm.baseUrl'] || f['litellm.baseUrl'],
        'litellm.apiKey': settings['litellm.apiKey'] || f['litellm.apiKey'],
        'default.model': settings['default.model'] || f['default.model'],
        'adk.enabled': settings['adk.enabled'] ?? f['adk.enabled'],
        'adk.pythonPath': settings['adk.pythonPath'] || f['adk.pythonPath'],
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

  const testLiteLLM = async () => {
    setTesting('litellm')
    const models = await window.api.models.listLiteLLM(form['litellm.baseUrl'], form['litellm.apiKey'])
    setLitellmModels(models)
    setLitellmStatus(models.length > 0)
    setTesting(null)
  }

  const checkAdk = async () => {
    setTesting('adk')
    const status = await window.api.adk.status()
    setAdkStatus(status.running)
    setAdkRunning(status.running)
    setTesting(null)
  }

  const handleSave = async () => {
    setSaving(true)
    await window.api.settings.setMany(form)
    setSettings({ ...settings, ...form })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-zinc-100">Settings</h1>
          <p className="text-xs text-zinc-500">Configure your LLM providers and ADK integration</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {saved ? (
            <><CheckCircle size={13} /> Saved</>
          ) : (
            <><Save size={13} /> {saving ? 'Saving…' : 'Save'}</>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Language */}
        <Section title={t('settings.language')} description={t('settings.languageDesc')}>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code as LangCode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                  currentLang === lang.code
                    ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <Languages size={13} />
                {lang.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Provider */}
        <Section title={t('settings.provider')} description="Choose your primary inference provider">
          <div className="grid grid-cols-2 gap-3">
            {(['ollama', 'litellm'] as const).map((p) => (
              <button
                key={p}
                onClick={() => update('provider', p)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  form.provider === p
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-zinc-100'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Server size={16} className={form.provider === p ? 'text-indigo-400' : 'text-zinc-500'} />
                <div>
                  <p className="text-sm font-medium capitalize">{p === 'litellm' ? 'LiteLLM' : 'Ollama'}</p>
                  <p className="text-[11px] text-zinc-500">
                    {p === 'ollama' ? 'Local inference' : 'Proxy / cloud'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Ollama */}
        <Section title="Ollama" description="Local Ollama server configuration">
          <Field label="Base URL" hint="Default: http://localhost:11434">
            <Input value={form['ollama.baseUrl']} onChange={(v) => update('ollama.baseUrl', v)} placeholder="http://localhost:11434" />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={testOllama}
              disabled={testing === 'ollama'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
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
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* LiteLLM */}
        <Section title="LiteLLM" description="OpenAI-compatible proxy server">
          <Field label="Base URL" hint="Your LiteLLM server URL">
            <Input value={form['litellm.baseUrl']} onChange={(v) => update('litellm.baseUrl', v)} placeholder="http://localhost:4000" />
          </Field>
          <Field label="API Key" hint="Leave empty for local servers without auth">
            <Input type="password" value={form['litellm.apiKey']} onChange={(v) => update('litellm.apiKey', v)} placeholder="sk-..." />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={testLiteLLM}
              disabled={testing === 'litellm'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
            >
              <RefreshCw size={11} className={testing === 'litellm' ? 'animate-spin' : ''} />
              Test Connection
            </button>
            <StatusBadge ok={litellmStatus} label={litellmStatus ? `${litellmModels.length} models` : 'Unreachable'} />
          </div>

          {litellmModels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 font-medium">Available Models</p>
              <div className="flex flex-wrap gap-1.5">
                {litellmModels.slice(0, 20).map((m) => (
                  <span key={m} className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Default Model */}
        <Section title="Defaults">
          <Field label="Default Model" hint="Used when creating new agents">
            <Input value={form['default.model']} onChange={(v) => update('default.model', v)} placeholder="gemma3:latest" />
          </Field>
        </Section>

        {/* Google ADK */}
        <Section title="Google ADK" description="Agent Development Kit for advanced agent features">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-200 font-medium">Enable Google ADK</p>
              <p className="text-xs text-zinc-500 mt-0.5">Runs a Python subprocess for enhanced agent capabilities</p>
            </div>
            <div
              onClick={() => update('adk.enabled', form['adk.enabled'] === 'true' ? 'false' : 'true')}
              className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form['adk.enabled'] === 'true' ? 'bg-indigo-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form['adk.enabled'] === 'true' ? 'translate-x-5' : ''}`} />
            </div>
          </div>

          <Field label="Python Executable Path" hint="Path to python3 binary. Must have google-adk installed.">
            <Input value={form['adk.pythonPath']} onChange={(v) => update('adk.pythonPath', v)} placeholder="python3" />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={checkAdk}
              disabled={testing === 'adk'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
            >
              <RefreshCw size={11} className={testing === 'adk' ? 'animate-spin' : ''} />
              Check ADK Status
            </button>
            <StatusBadge ok={adkStatus} label={adkStatus ? 'Running' : 'Not running'} />
          </div>

          <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-4 space-y-2">
            <p className="text-xs font-medium text-zinc-400">Setup Instructions</p>
            <div className="font-mono text-[11px] text-zinc-500 space-y-1">
              <p className="text-zinc-400"># Install google-adk:</p>
              <p>pip install google-adk</p>
              <p className="text-zinc-400 mt-2"># For Ollama support via LiteLLM:</p>
              <p>pip install litellm</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
