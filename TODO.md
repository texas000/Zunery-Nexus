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

- [x] **DB seeding** — added `is_default` and `avatar` columns via safe `PRAGMA table_info` migration in `database.ts`
- [x] **System prompts** — detailed anime-flavored system prompts written for each agent (personality, speech style, domain expertise)
- [x] **Avatar assets** — four anime-style SVG React components created in `src/renderer/src/assets/avatars/`
  - Each avatar has **animated eyes** that blink smoothly every 4-5 seconds (CSS keyframes + `transform-box: fill-box`)
  - Each avatar has a **floating/breathing** animation (3-4px vertical, 5-6.5s loop)
  - Yuki additionally has a gentle sway and a twinkling star hairclip animation
  - Kira has a glowing green hair-streak pulse animation
- [x] **Color themes** — accent colors applied to agent cards (borders, Chat button, Default badge):
  - Hana → soft pink `#F472B6`
  - Ren → deep blue `#60A5FA`
  - Yuki → lavender `#A78BFA`
  - Kira → electric green `#34D399`
- [x] **Seeding logic** — agents seeded at startup with fixed UUIDs using `INSERT OR IGNORE` (idempotent)
- [x] **Protect defaults** — Delete button hidden, Edit → View label, system prompt locked with read-only + lock icon

### 1.3 Animation Specifications

Each avatar SVG should include:

| Animation | Details |
|-----------|---------|
| **Eye Blink** | `0.3s` ease-in-out eyelid closure + `0.1s` pause + `0.3s` ease-out opening; repeat every 3-5 seconds with randomized intervals (3.5s ± 1s) |
| **Floating Breath** | Gentle vertical translation `transform: translateY(var(--float))` cycling between `-2px` and `+2px` over `5s`, easing in-out sine |
| **Idle Sway** | Subtle horizontal oscillation (optional) or slight rotation (`-0.5deg` to `+0.5deg`) over `6s` for character personality |
| **Entrance** | Fade in + scale up on first dashboard load (0.5s, cubic-bezier for smooth ease) |

**CSS Approach (Recommended)**:
```css
@keyframes blink {
  0%, 85%, 100% { height: var(--eye-height); }
  90%, 95% { height: 2px; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.avatar-eyes { animation: blink 4s steps(1, end) 3.5s infinite; }
.avatar { animation: float 5s ease-in-out infinite; }
```

**SVG Approach (Alternative)**:
- Use `<animate>` elements inside SVG for eyes and body groups
- Allows more granular control and works independently of CSS

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

- [x] **Create `DashboardPage.tsx`** — new page at `src/renderer/src/pages/DashboardPage.tsx`
- [x] **Agent cards** — each card displays animated avatar, persona name, role title, description, accent-colored border/glow, and "Chat Now" button
- [x] **Responsive grid** — `grid-cols-2 xl:grid-cols-4` (2×2 → 4×1)
- [x] **Set dashboard as default view** — Zustand store initial `view: 'dashboard'`
- [x] **"Chat Now" button** — creates a new conversation with that agent and navigates to `ChatPage`
- [x] **Sidebar link** — "Home" nav item with `LayoutGrid` icon added to `Sidebar.tsx`
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

- [x] **`orchestrator.ts`** — keyword scoring classifier with multi-word phrase weighting; Hana as fallback; covers 30+ keywords per domain
- [x] **IPC handler** — `orchestrator:route` channel in `ipc-handlers.ts`; preload exposed via `window.api.orchestrator.route()`
- [x] **Dashboard input handler** — orchestrator called on submit; result used to open correct agent chat
- [x] **Routing indicator** — animated toast with agent avatar + name visible for 1.2s before navigating
- [x] **Manual override** — clicking any agent card directly bypasses the orchestrator
- [x] **`pendingPrompt` store field** — `ChatPage` auto-sends the orchestrated prompt on mount
- [ ] **Multi-agent mode** *(optional v2)* — split response view

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

- [x] **Install i18next** — `bun add i18next react-i18next`
- [x] **Create locale files** — `src/renderer/src/locales/{en,ja,ko,zh}/translation.json`
- [x] **i18n bootstrap** — `src/renderer/src/i18n.ts` with localStorage → navigator.language → 'en' detection
- [x] **Wire into React** — i18n imported in `main.tsx` before app render; `useTranslation()` used in components

#### Translation Keys (all UI strings)

- [x] **Sidebar** — Home, Chat, Agents, Settings, conversation list empty state, agent section label
- [x] **DashboardPage** — hero subtitle/title/description, card "Chat Now", orchestrator placeholder + hint
- [ ] **ChatPage** — input placeholder, send button, streaming indicator, tool call labels *(partial)*
- [ ] **AgentsPage** — form labels, buttons *(keys defined, component wiring in progress)*
- [x] **SettingsPage** — Language section header + description; provider label wired
- [ ] **Agent personas** — localized persona descriptions *(optional v2)*

#### Language Selector UI

- [x] **Language selector** — button row in `SettingsPage.tsx` under "Language" section (EN / 日本語 / 한국어 / 中文)
- [x] **Persist preference** — stored in SQLite `ui.language` key via `window.api.settings.set`
- [x] **Load on startup** — `App.tsx` reads `ui.language` from settings and calls `i18n.changeLanguage()`

#### Japanese Translations (agent personas)

- [x] All four locale files include translated UI strings for JA, KO, ZH
- [ ] Translate system prompts to optionally respond in UI language *(optional v2)*

---

## 5. Database Schema Changes

- [x] Add `is_default INTEGER DEFAULT 0` column to `agents` table (safe migration via `PRAGMA table_info`)
- [x] `ui.language` persisted in SQLite settings table via `window.api.settings.set`
- [x] `avatar TEXT DEFAULT ''` column added to `agents` table

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
