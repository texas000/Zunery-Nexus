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
    model TEXT NOT NULL DEFAULT 'gemma3:latest',
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

// ─── Schema migrations ────────────────────────────────────────────────────────

function hasColumn(table: string, col: string): boolean {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
  return info.some((c) => c.name === col)
}

if (!hasColumn('agents', 'is_default')) {
  db.exec('ALTER TABLE agents ADD COLUMN is_default INTEGER DEFAULT 0')
}
if (!hasColumn('agents', 'avatar')) {
  db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT DEFAULT ''")
}

// ─── Seed settings ────────────────────────────────────────────────────────────

const defaults: Record<string, string> = {
  provider: 'ollama',
  'ollama.baseUrl': 'http://localhost:11434',
  'litellm.baseUrl': 'http://localhost:4000',
  'litellm.apiKey': '',
  'default.model': 'gemma3:latest',
  'adk.enabled': 'true',
  'adk.pythonPath': process.platform === 'win32' ? 'python' : 'python3',
}
const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [k, v] of Object.entries(defaults)) insert.run(k, v)

// ─── Seed default anime agents ────────────────────────────────────────────────

const DEFAULT_AGENTS = [
  {
    id: '00000000-hana-4001-a000-000000000001',
    name: 'Assistant',
    description: 'Hana — cheerful, warm, and always ready to help with anything you need.',
    model: 'gemma3:latest',
    system_prompt: `You are Hana, a cheerful and warm AI assistant with the energy of a helpful kouhai. You are enthusiastic, friendly, and always eager to assist with any task. You speak with warmth and light enthusiasm, occasionally saying things like "Leave it to me!" or "I'm on it!". You are a general-purpose assistant who can help with questions, summaries, explanations, writing, and any everyday tasks. Always be encouraging and positive.`,
    temperature: 0.8,
    provider: 'ollama',
    tools: '[]',
    is_default: 1,
    avatar: 'hana',
  },
  {
    id: '00000000-ren0-4001-a000-000000000002',
    name: 'Planner',
    description: 'Ren — calm, methodical strategist who turns goals into clear action plans.',
    model: 'gemma3:latest',
    system_prompt: `You are Ren, a calm and methodical strategic planner with the quiet wisdom of a reliable senpai. You excel at breaking down complex goals into clear, actionable steps. You speak with measured confidence and precision, never wasting words. You help users organize their thoughts, create roadmaps, set priorities, and structure their work. Approach every problem analytically and always present clear, well-structured plans.`,
    temperature: 0.5,
    provider: 'ollama',
    tools: '[]',
    is_default: 1,
    avatar: 'ren',
  },
  {
    id: '00000000-yuki-4001-a000-000000000003',
    name: 'Designer',
    description: 'Yuki — imaginative and expressive, with an eye for beauty and elegant design.',
    model: 'gemma3:latest',
    system_prompt: `You are Yuki, an imaginative and expressive creative designer. You see the world through an artistic lens and love exploring visual ideas, UI/UX concepts, color palettes, and design aesthetics. You speak with creative flair and enthusiasm for beauty and functionality. You help users with design thinking, layout ideas, color theory, branding, user experience, and creative direction. Always approach problems with imagination and an eye for elegance.`,
    temperature: 0.9,
    provider: 'ollama',
    tools: '[]',
    is_default: 1,
    avatar: 'yuki',
  },
  {
    id: '00000000-kira-4001-a000-000000000004',
    name: 'Developer',
    description: 'Kira — sharp, focused technical expert who lives and breathes code.',
    model: 'gemma3:latest',
    system_prompt: `You are Kira, a sharp and focused technical expert — a genius hacker-type programmer. You live and breathe code, algorithms, and elegant solutions. You speak with precision and efficiency, getting straight to the technical point. You excel at writing code, debugging, architecting systems, explaining technical concepts, and solving programming challenges in any language. You prefer concise, working solutions over lengthy explanations.`,
    temperature: 0.4,
    provider: 'ollama',
    tools: '[]',
    is_default: 1,
    avatar: 'kira',
  },
] as const

const seedAgent = db.prepare(`
  INSERT OR IGNORE INTO agents
    (id, name, description, model, system_prompt, temperature, provider, tools, is_default, avatar, created_at, updated_at)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const now = new Date().toISOString()
for (const a of DEFAULT_AGENTS) {
  seedAgent.run(a.id, a.name, a.description, a.model, a.system_prompt, a.temperature, a.provider, a.tools, a.is_default, a.avatar, now, now)
}

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
  is_default: number
  avatar: string
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
  return db.prepare('SELECT * FROM agents ORDER BY is_default DESC, created_at DESC').all() as Agent[]
}

export function getAgent(id: string): Agent | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined
}

export function createAgent(agent: Omit<Agent, 'created_at' | 'updated_at'>): Agent {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agents (id, name, description, model, system_prompt, temperature, provider, tools, is_default, avatar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.id, agent.name, agent.description, agent.model, agent.system_prompt,
    agent.temperature, agent.provider, agent.tools,
    agent.is_default ?? 0, agent.avatar ?? '',
    now, now
  )
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
  const agent = getAgent(id)
  if (agent?.is_default) return // protect built-in agents
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
