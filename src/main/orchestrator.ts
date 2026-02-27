// Keyword-scoring orchestrator that maps a user prompt to the best default agent.
// Falls back to Hana (Assistant) when no domain has a clear winner.

const DEFAULT_AGENT_IDS = {
  hana: '00000000-hana-4001-a000-000000000001',
  ren:  '00000000-ren0-4001-a000-000000000002',
  yuki: '00000000-yuki-4001-a000-000000000003',
  kira: '00000000-kira-4001-a000-000000000004',
} as const

export interface RouteResult {
  agentId: string
  agentName: string
  avatar: string
  reasoning: string
}

const DOMAINS: Array<{
  id: string
  name: string
  avatar: string
  keywords: string[]
  reason: string
}> = [
  {
    id: DEFAULT_AGENT_IDS.kira,
    name: 'Developer',
    avatar: 'kira',
    keywords: [
      'code', 'bug', 'debug', 'error', 'fix', 'function', 'implement', 'refactor',
      'api', 'endpoint', 'database', 'sql', 'query', 'algorithm', 'data structure',
      'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'c++', 'bash',
      'script', 'build', 'deploy', 'compile', 'npm', 'git', 'github', 'test',
      'unit test', 'async', 'promise', 'class', 'interface', 'type', 'import',
      'library', 'package', 'backend', 'frontend', 'server', 'client', 'terminal',
      'cli', 'docker', 'kubernetes', 'ci/cd', 'regex', 'loop', 'array', 'object',
      'performance', 'optimize', 'memory', 'thread', 'syntax', 'parse', 'lint',
    ],
    reason: 'the prompt involves code, programming, or technical implementation.',
  },
  {
    id: DEFAULT_AGENT_IDS.yuki,
    name: 'Designer',
    avatar: 'yuki',
    keywords: [
      'design', 'ui', 'ux', 'layout', 'color', 'palette', 'branding', 'logo',
      'font', 'typography', 'visual', 'aesthetic', 'mockup', 'wireframe', 'figma',
      'creative', 'graphic', 'style', 'theme', 'icon', 'illustration', 'image',
      'responsive', 'beautiful', 'elegant', 'minimalist', 'dark mode', 'light mode',
      'animation', 'transition', 'gradient', 'shadow', 'border', 'spacing',
      'component', 'button', 'card', 'modal', 'sidebar', 'navbar', 'hero',
      'landing page', 'figma', 'adobe', 'sketch', 'prototype', 'user flow',
      'accessibility', 'contrast', 'whitespace', 'grid', 'flex',
    ],
    reason: 'the prompt involves design, UI/UX, or creative visual work.',
  },
  {
    id: DEFAULT_AGENT_IDS.ren,
    name: 'Planner',
    avatar: 'ren',
    keywords: [
      'plan', 'planning', 'roadmap', 'schedule', 'timeline', 'deadline', 'goal',
      'strategy', 'organize', 'task', 'tasks', 'project', 'milestone', 'sprint',
      'agile', 'scrum', 'priority', 'prioritize', 'breakdown', 'steps', 'phase',
      'workflow', 'process', 'outline', 'agenda', 'meeting', 'kanban', 'backlog',
      'epic', 'story', 'objective', 'okr', 'kpi', 'deliverable', 'scope',
      'estimate', 'resource', 'team', 'coordinate', 'manage', 'track', 'progress',
    ],
    reason: 'the prompt involves planning, organizing, or strategic thinking.',
  },
]

export function routePrompt(prompt: string): RouteResult {
  const lower = prompt.toLowerCase()

  let bestScore = 0
  let bestDomain = {
    id: DEFAULT_AGENT_IDS.hana,
    name: 'Assistant',
    avatar: 'hana',
    reason: 'this looks like a general question or request.',
  }

  for (const domain of DOMAINS) {
    let score = 0
    for (const kw of domain.keywords) {
      if (lower.includes(kw)) score += kw.includes(' ') ? 2 : 1 // multi-word phrases score higher
    }
    if (score > bestScore) {
      bestScore = score
      bestDomain = domain
    }
  }

  return {
    agentId: bestDomain.id,
    agentName: bestDomain.name,
    avatar: bestDomain.avatar,
    reasoning: `Routing to ${bestDomain.name} — ${bestDomain.reason}`,
  }
}
