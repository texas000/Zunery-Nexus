# Feature TODO: Anime Agents + Multi-Language Support

Branch: `claude/add-agents-multilang-SEqfB`

---

## Overview

This feature adds four default Japanese anime-styled agents (Assistant, Planner, Designer, Developer), a new **Agent Dashboard** as the default home screen showing all agents simultaneously, a smart **orchestrator** that routes user prompts to the right agent(s), and full **multi-language UI support**.

---

## 1. Default Anime Agents

Seed the database with four built-in agents at first launch. Each has a unique Japanese anime persona, avatar, and a tailored system prompt.

### 1.1 Agent Definitions

| Agent | Persona Name | Role | Personality |
|-------|-------------|------|-------------|
| **Assistant** | Hana | General-purpose helper | Cheerful, warm, helpful — like a kouhai eager to assist |
| **Planner** | Ren | Strategic thinker & task organizer | Calm, methodical, wise — like a stoic senpai |
| **Designer** | Yuki | UI/UX & creative ideas | Artistic, expressive, imaginative — like a creative club member |
| **Developer** | Kira | Code, debugging, technical solutions | Focused, precise, fast — like a genius hacker protagonist |

### 1.2 Tasks

- [ ] **DB seeding** — add a `is_default` boolean column to the `agents` table so built-in agents are protected from deletion
- [ ] **System prompts** — write detailed anime-flavored system prompts for each agent (personality, speech style, domain expertise)
- [ ] **Avatar assets** — add four anime-style SVG avatar illustrations (one per agent) in `src/renderer/src/assets/avatars/`
- [ ] **Color themes** — assign a distinct accent color per agent used in the dashboard cards and chat headers:
  - Hana → soft pink `#F472B6`
  - Ren → deep blue `#60A5FA`
  - Yuki → lavender `#A78BFA`
  - Kira → electric green `#34D399`
- [ ] **Seeding logic** — on app startup in `database.ts`, check if default agents exist; if not, insert them with fixed UUIDs so they are idempotent
- [ ] **Protect defaults** — hide "Delete" button and lock system prompt field in `AgentsPage.tsx` for agents where `is_default = true`

---

## 2. Agent Dashboard (Default Home Screen)

Replace the current empty chat default view with a grid dashboard that shows all agents at a glance.

### 2.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│  Zunery Nexus                                            │
│  ──────────────────────────────────────────────────────  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  🌸 Hana │  │ 🔵 Ren  │  │ 💜 Yuki │  │ ⚡ Kira │ │
│  │Assistant │  │ Planner  │  │ Designer │  │Developer│ │
│  │          │  │          │  │          │  │         │ │
│  │[Chat Now]│  │[Chat Now]│  │[Chat Now]│  │[Chat Now│ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Ask anything... (Orchestrator routes for you)     │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Tasks

- [ ] **Create `DashboardPage.tsx`** — new page at `src/renderer/src/pages/DashboardPage.tsx`
- [ ] **Agent cards** — each card displays: avatar image, agent name, persona name, short description, accent color border, and a "Chat Now" button
- [ ] **Responsive grid** — 2×2 on small windows, 4×1 on wide — using Tailwind CSS grid
- [ ] **Set dashboard as default view** — change initial `view` in Zustand store from `'chat'` to `'dashboard'`
- [ ] **"Chat Now" button** — clicking opens a new conversation with that agent and navigates to `ChatPage`
- [ ] **Sidebar link** — add "Home" navigation item in `Sidebar.tsx` that links to the dashboard
- [ ] **Recent activity panel** *(optional v2)* — show last message snippet per agent below each card

---

## 3. Orchestrator

When the user types a prompt in the dashboard's global input (or in a special "Auto" conversation), the orchestrator analyzes the intent and routes to the most appropriate agent.

### 3.1 Routing Logic

| Intent Keywords / Category | Routed To |
|---------------------------|-----------|
| General questions, greetings, summaries | Hana (Assistant) |
| Planning, scheduling, tasks, goals, roadmaps | Ren (Planner) |
| Design, UI, UX, colors, layout, branding, creative | Yuki (Designer) |
| Code, bug, debug, implement, function, API, error | Kira (Developer) |

### 3.2 Tasks

- [ ] **`orchestrator.ts`** — create `src/main/orchestrator.ts` with a `classifyPrompt(text: string): AgentRole` function
  - Primary approach: use a lightweight LLM call with a classification system prompt
  - Fallback: keyword scoring map when LLM is unavailable
- [ ] **IPC handler** — add `orchestrator:route` IPC channel in `ipc-handlers.ts` that accepts a prompt, returns `{ agentId, agentName, reasoning }`
- [ ] **Dashboard input handler** — wire the global dashboard prompt input to call `orchestrator:route`, then auto-open a chat with the selected agent and inject the prompt
- [ ] **Routing indicator** — show a small toast or banner: `"Routing to Kira (Developer)..."` before opening the chat
- [ ] **Manual override** — allow user to tap a different agent card to override the orchestrator's choice
- [ ] **Multi-agent mode** *(optional v2)* — if prompt spans multiple domains, send to multiple agents and display a split response view

---

## 4. Multi-Language Support

Add runtime language switching with translations for all UI strings.

### 4.1 Supported Languages (Phase 1)

| Code | Language |
|------|----------|
| `en` | English (default) |
| `ja` | Japanese |
| `ko` | Korean |
| `zh` | Chinese (Simplified) |

### 4.2 Tasks

#### Setup

- [ ] **Install i18next** — `bun add i18next react-i18next`
- [ ] **Create locale files** — `src/renderer/src/locales/{en,ja,ko,zh}/translation.json`
- [ ] **i18n bootstrap** — `src/renderer/src/i18n.ts` initializing i18next with language detection (localStorage → navigator.language → fallback `en`)
- [ ] **Wire into React** — wrap app root in `I18nextProvider` in `App.tsx`

#### Translation Keys (all UI strings)

- [ ] **Sidebar** — nav labels (Home, Chat, Agents, Settings), conversation list empty state
- [ ] **DashboardPage** — hero text, agent card labels, orchestrator input placeholder
- [ ] **ChatPage** — input placeholder, send button, streaming indicator, tool call labels
- [ ] **AgentsPage** — form labels (Name, Description, Model, Temperature, System Prompt, Tools), buttons (Save, Cancel, Delete, New Agent)
- [ ] **SettingsPage** — section headers, field labels, test buttons, status messages
- [ ] **Agent personas** — optionally localize agent description text shown in cards

#### Language Selector UI

- [ ] **Language selector component** — dropdown or flag buttons placed in `SettingsPage.tsx` under a new "Language" section
- [ ] **Persist preference** — store selected language in SQLite `settings` table under key `ui.language`
- [ ] **Load on startup** — read `ui.language` from settings and call `i18n.changeLanguage()` during app init in `App.tsx`

#### Japanese Translations (agent personas)

- [ ] Translate all four agent persona names and descriptions into Japanese
- [ ] Translate system prompts to optionally respond in Japanese when the UI language is set to `ja`

---

## 5. Database Schema Changes

- [ ] Add `is_default INTEGER DEFAULT 0` column to `agents` table (migration safe — use `ALTER TABLE ... ADD COLUMN`)
- [ ] Add `ui.language` key to default settings in `database.ts`
- [ ] Store agent avatar path in a new `avatar` TEXT column on `agents`

---

## 6. File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `src/main/database.ts` | Modify | Schema migration, agent seeding, new settings key |
| `src/main/ipc-handlers.ts` | Modify | Add `orchestrator:route` IPC channel |
| `src/main/orchestrator.ts` | **New** | Prompt classification + agent routing logic |
| `src/renderer/src/App.tsx` | Modify | i18n init, load language setting on startup |
| `src/renderer/src/i18n.ts` | **New** | i18next configuration |
| `src/renderer/src/store/index.ts` | Modify | Add `'dashboard'` to view type, default view |
| `src/renderer/src/pages/DashboardPage.tsx` | **New** | Agent grid + orchestrator input |
| `src/renderer/src/pages/AgentsPage.tsx` | Modify | Lock default agents, show avatar |
| `src/renderer/src/pages/ChatPage.tsx` | Modify | Show agent avatar + accent color in header |
| `src/renderer/src/components/Sidebar.tsx` | Modify | Add Home link, language-aware labels |
| `src/renderer/src/locales/en/translation.json` | **New** | English strings |
| `src/renderer/src/locales/ja/translation.json` | **New** | Japanese strings |
| `src/renderer/src/locales/ko/translation.json` | **New** | Korean strings |
| `src/renderer/src/locales/zh/translation.json` | **New** | Chinese strings |
| `src/renderer/src/assets/avatars/hana.svg` | **New** | Hana avatar |
| `src/renderer/src/assets/avatars/ren.svg` | **New** | Ren avatar |
| `src/renderer/src/assets/avatars/yuki.svg` | **New** | Yuki avatar |
| `src/renderer/src/assets/avatars/kira.svg` | **New** | Kira avatar |
| `src/preload/index.ts` | Modify | Expose `orchestrator.route` API |
| `src/preload/index.d.ts` | Modify | Add type for orchestrator API |

---

## 7. Implementation Order

1. **DB schema** — migrations + seeding (unblocks everything else)
2. **Orchestrator** — core routing logic
3. **Dashboard page** — home screen with agent cards
4. **i18n setup** — library install + locale files
5. **Translate all UI strings** — component by component
6. **Language selector** — settings UI + persistence
7. **Avatar assets** — SVG illustrations
8. **Polish** — routing toast, agent accent colors in chat, lock default agents
9. **Testing** — verify all languages render correctly, orchestrator routes accurately

---

## 8. Acceptance Criteria

- [ ] App opens to the dashboard showing all 4 anime agents in a grid
- [ ] Each agent card shows avatar, name, persona, and description
- [ ] Clicking "Chat Now" opens a conversation with that agent
- [ ] Typing in the dashboard prompt and pressing Enter routes to the correct agent automatically with a routing notification
- [ ] Language can be changed in Settings; all UI text updates immediately without restart
- [ ] App remembers the selected language between sessions
- [ ] Default agents cannot be deleted and their core fields are read-only
- [ ] All 4 languages (EN, JA, KO, ZH) are complete with no missing translation keys
