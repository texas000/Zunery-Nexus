import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

const userDataPath = app.getPath('userData')
if (!existsSync(userDataPath)) {
  mkdirSync(userDataPath, { recursive: true })
}

const dbPath = join(userDataPath, 'zunery_nexus.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT NOT NULL DEFAULT 'gemma4:26b',
    system_prompt TEXT DEFAULT '',
    temperature REAL DEFAULT 0.7,
    provider TEXT DEFAULT 'ollama',
    tools TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`)

// Seed defaults
const defaults: Record<string, string> = {
  provider: 'ollama',
  'ollama.baseUrl': 'http://localhost:11434',
  'default.model': 'gemma4:26b',
  'adk.enabled': 'true',
  'adk.pythonPath': process.platform === 'win32' ? 'python' : 'python3',
  'theme': 'dark',
  'obsidian.enabled': 'false',
  'obsidian.vaultPath': '/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ryan/',
  'orchestrator.prompt': `You are a routing orchestrator. Given a user's message, decide which agent is best suited to handle it.

Available agents:
{{AGENT_LIST}}

Tool descriptions:
- web_search: Search the internet (Google/Bing) for external, public information
- obsidian_search: Search the user's LOCAL Obsidian knowledge vault (personal notes, documents, projects)
- obsidian_read: Read a specific note from the user's Obsidian vault
- obsidian_create: Create a new note in the user's Obsidian vault
- obsidian_update: Update an existing note in the user's Obsidian vault
- obsidian_delete: Delete a note from the user's Obsidian vault
- obsidian_list: Browse the user's Obsidian vault folder structure

ROUTING RULES:
- If the user asks to search/find/read their notes, documents, knowledge, or Obsidian vault → pick an agent with obsidian_search or obsidian_read tools
- If the user asks to create/save/write/update/delete notes → pick an agent with obsidian_create/obsidian_update/obsidian_delete tools
- If the user asks about external/public information, news, or current events → pick an agent with web_search
- Keywords like "note", "notes", "vault", "obsidian", "my documents", "내 노트", "메모", "기록" → obsidian tools
- Always prefer the agent whose tools best match the request

Reply with ONLY a JSON object (no markdown, no explanation):
{"agent_id": "<id>", "reason": "<brief reason>"}

User message: "{{CONTENT}}"`,
}
const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [k, v] of Object.entries(defaults)) insert.run(k, v)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  system_prompt: string
  temperature: number
  provider: string
  tools: string
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  agent_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: string
  created_at: string
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return rows.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {})
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export function getAgents(): Agent[] {
  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Agent[]
}

export function getAgent(id: string): Agent | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined
}

export function createAgent(agent: Omit<Agent, 'created_at' | 'updated_at'>): Agent {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agents (id, name, description, model, system_prompt, temperature, provider, tools, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agent.id, agent.name, agent.description, agent.model, agent.system_prompt, agent.temperature, agent.provider, agent.tools, now, now)
  return getAgent(agent.id)!
}

export function updateAgent(id: string, updates: Partial<Omit<Agent, 'id' | 'created_at'>>): Agent | undefined {
  const now = new Date().toISOString()
  const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ')
  const values = Object.values(updates)
  db.prepare(`UPDATE agents SET ${fields}, updated_at = ? WHERE id = ?`).run(...values, now, id)
  return getAgent(id)
}

export function deleteAgent(id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function getConversations(agentId?: string): Conversation[] {
  if (agentId) {
    return db.prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC').all(agentId) as Conversation[]
  }
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Conversation[]
}

export function createConversation(conv: Omit<Conversation, 'created_at' | 'updated_at'>): Conversation {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(conv.id, conv.agent_id, conv.title, now, now)
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id) as Conversation
}

export function updateConversation(id: string, title: string): void {
  const now = new Date().toISOString()
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id)
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function getMessages(conversationId: string): Message[] {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Message[]
}

export function addMessage(msg: Omit<Message, 'created_at'>): Message {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.metadata || '{}', now)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, msg.conversation_id)
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as Message
}

export default db
