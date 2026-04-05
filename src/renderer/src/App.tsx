import React, { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { OrchestratorPage } from './pages/OrchestratorPage'
import { ChatPage } from './pages/ChatPage'
import { AgentsPage } from './pages/AgentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useStore } from './store'

export default function App() {
  const { view, setAgents, setSettings, setAdkRunning, settings } = useStore()

  // Bootstrap app data
  useEffect(() => {
    const init = async () => {
      const [agents, settings] = await Promise.all([
        window.api.agents.list(),
        window.api.settings.get(),
      ])
      setAgents(agents)
      setSettings(settings)
    }
    init()

    // Listen for ADK status updates from main process
    const removeAdkListener = window.api.adk.onStatusChange((status) => {
      setAdkRunning(status.running)
    })

    return () => {
      removeAdkListener()
    }
  }, [setAgents, setSettings, setAdkRunning])

  // Apply theme
  useEffect(() => {
    const theme = settings['theme'] || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [settings])

  return (
    <div className="flex h-full bg-white dark:bg-zinc-950 text-black dark:text-white">
      <Sidebar />
      <main className="flex-1 min-w-0 bg-white dark:bg-zinc-950">
        {view === 'home' && <OrchestratorPage />}
        {view === 'chat' && <ChatPage />}
        {view === 'agents' && <AgentsPage />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
