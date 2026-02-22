import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    setMany: (pairs: Record<string, string>) => ipcRenderer.invoke('settings:set-many', pairs),
  },

  // Agents
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id: string) => ipcRenderer.invoke('agents:get', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('agents:create', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('agents:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
  },

  // Conversations
  conversations: {
    list: (agentId?: string) => ipcRenderer.invoke('conversations:list', agentId),
    create: (agentId: string, title?: string) => ipcRenderer.invoke('conversations:create', agentId, title),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('conversations:update-title', id, title),
    delete: (id: string) => ipcRenderer.invoke('conversations:delete', id),
  },

  // Messages
  messages: {
    list: (conversationId: string) => ipcRenderer.invoke('messages:list', conversationId),
  },

  // Chat
  chat: {
    send: (params: {
      conversationId: string
      agentId: string
      content: string
      useAdk: boolean
    }) => ipcRenderer.invoke('chat:send', params),

    onChunk: (callback: (chunk: { id: string; content: string; done: boolean }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, chunk: { id: string; content: string; done: boolean }) =>
        callback(chunk)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.removeListener('chat:chunk', handler)
    },
    onToolCall: (callback: (ev: { id: string; toolName: string; args: Record<string, unknown> }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, ev: { id: string; toolName: string; args: Record<string, unknown> }) =>
        callback(ev)
      ipcRenderer.on('chat:tool-call', handler)
      return () => ipcRenderer.removeListener('chat:tool-call', handler)
    },
    onToolResult: (callback: (ev: { id: string; toolName: string; result: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, ev: { id: string; toolName: string; result: string }) =>
        callback(ev)
      ipcRenderer.on('chat:tool-result', handler)
      return () => ipcRenderer.removeListener('chat:tool-result', handler)
    },
  },

  // Models
  models: {
    listOllama: (baseUrl?: string) => ipcRenderer.invoke('models:list-ollama', baseUrl),
    listLiteLLM: (baseUrl?: string, apiKey?: string) => ipcRenderer.invoke('models:list-litellm', baseUrl, apiKey),
  },

  // ADK
  adk: {
    status: () => ipcRenderer.invoke('adk:status'),
    syncAgents: () => ipcRenderer.invoke('adk:sync-agents'),
    onStatusChange: (callback: (status: { running: boolean; error?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: { running: boolean; error?: string }) =>
        callback(status)
      ipcRenderer.on('adk:status-change', handler)
      return () => ipcRenderer.removeListener('adk:status-change', handler)
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
