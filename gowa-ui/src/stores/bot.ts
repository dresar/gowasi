import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DUMMY_100_RULES } from '@/lib/dummy-rules'

const INITIAL_AUTO_REPLY_RULES: AutoReplyRule[] = DUMMY_100_RULES.map((r, idx) => ({
  ...r,
  id: `rule-${idx + 1}`,
  createdAt: new Date().toISOString(),
  stats: { triggered: Math.floor(Math.random() * 20) + 1, lastTriggered: new Date().toISOString() },
}))

export function deduplicateRules(rules: AutoReplyRule[]): AutoReplyRule[] {
  if (!Array.isArray(rules)) return []
  const seenTriggers = new Set<string>()
  const result: AutoReplyRule[] = []

  const sorted = [...rules].sort((a, b) => a.priority - b.priority)

  for (const r of sorted) {
    if (!r?.trigger?.value) continue
    const key = r.trigger.value.trim().toLowerCase()
    if (!seenTriggers.has(key)) {
      seenTriggers.add(key)
      result.push(r)
    }
  }

  return result
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location'

export interface AutoReplyRule {
  id: string
  name: string
  enabled: boolean
  trigger: {
    type: 'exact' | 'contains' | 'starts_with' | 'ends_with' | 'regex'
    value: string
    caseSensitive: boolean
  }
  conditions: {
    onlyPrivate: boolean
    onlyGroups: boolean
    allowedNumbers: string[] // empty = all
    blockedNumbers: string[]
  }
  response: {
    type: MessageType
    text?: string
    additionalTexts?: string[] // Unlimited sequential responses
    mediaUrl?: string
    caption?: string
    latitude?: string
    longitude?: string
    delay: number // ms delay before sending
  }
  stats: {
    triggered: number
    lastTriggered: string | null
  }
  createdAt: string
  priority: number
}

export type AIProvider = 'groq' | 'custom' | 'ollama'

export interface AIConfig {
  enabled: boolean
  provider: AIProvider
  apiKey: string
  model: string
  customUrl: string // Custom API endpoint (e.g. One Key Hub or OpenAI-compatible URL)
  ollamaUrl: string
  systemPrompt: string
  knowledgeBase: string // Custom FAQ/catalog context injected into prompt
  maxTokens: number
  temperature: number
  cooldownMs: number // per-user cooldown
  allowedNumbers: string[]
  blockedNumbers: string[]
  customNumberPrompts: Record<string, string> // maps phone -> custom prompt
  customSkills: string[] // active skills list
  adminNumbers: string[] // Master admin phone numbers
  telegramBotToken: string
  telegramAdminChatId: string
  targetDeviceIds: string[] // empty = all devices/accounts, or specific device IDs
  replyToGroups: boolean
  replyToPrivate: boolean
  triggerKeyword: string // empty = reply to all
}

export interface BotContact {
  id: string
  name: string
  phone: string
  labels: string[]
  notes: string
  createdAt: string
}

export interface BotTemplate {
  id: string
  name: string
  category: string
  content: string
  variables: string[] // e.g. ['nama', 'tanggal']
  type: MessageType
  mediaUrl?: string
  createdAt: string
}

export interface ActivityLog {
  id: string
  timestamp: string
  type: 'auto_reply' | 'ai_reply' | 'broadcast' | 'scheduled' | 'manual' | 'error'
  phone: string
  message: string
  status: 'success' | 'failed' | 'pending'
  ruleId?: string
  error?: string
}

export interface BlockedNumber {
  phone: string
  reason: string
  blockedAt: string
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface BotState {
  // Auto Reply
  autoReplyRules: AutoReplyRule[]
  autoReplyEnabled: boolean
  addRule: (rule: Omit<AutoReplyRule, 'id' | 'createdAt' | 'stats'>) => void
  bulkAddRules: (rules: Omit<AutoReplyRule, 'id' | 'createdAt' | 'stats'>[]) => void
  clearAllRules: () => void
  resetToDefaultRules: () => void
  updateRule: (id: string, updates: Partial<AutoReplyRule>) => void
  deleteRule: (id: string) => void
  reorderRules: (rules: AutoReplyRule[]) => void
  toggleRule: (id: string) => void
  toggleAutoReply: () => void
  incrementRuleStat: (id: string) => void

  // AI Config
  aiConfig: AIConfig
  updateAIConfig: (config: Partial<AIConfig>) => void

  // Contacts
  contacts: BotContact[]
  addContact: (contact: Omit<BotContact, 'id' | 'createdAt'>) => void
  updateContact: (id: string, updates: Partial<BotContact>) => void
  deleteContact: (id: string) => void
  importContacts: (contacts: Omit<BotContact, 'id' | 'createdAt'>[]) => void

  // Templates
  templates: BotTemplate[]
  addTemplate: (template: Omit<BotTemplate, 'id' | 'createdAt'>) => void
  updateTemplate: (id: string, updates: Partial<BotTemplate>) => void
  deleteTemplate: (id: string) => void

  // Activity Logs
  logs: ActivityLog[]
  addLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void
  clearLogs: () => void

  // Blocked Numbers
  blockedNumbers: BlockedNumber[]
  blockNumber: (phone: string, reason?: string) => void
  unblockNumber: (phone: string) => void
}

const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: false,
  provider: 'groq',
  apiKey: '',
  model: 'llama-3.3-70b-versatile',
  customUrl: '',
  ollamaUrl: 'http://localhost:11434',
  systemPrompt:
    'Kamu adalah asisten WhatsApp resmi yang ramah, profesional, dan solutif. Jawab pertanyaan pengguna secara akurat, singkat, dan mudah dipahami dalam Bahasa Indonesia.',
  knowledgeBase: '',
  maxTokens: 500,
  temperature: 0.7,
  cooldownMs: 30_000,
  allowedNumbers: [],
  blockedNumbers: [],
  customNumberPrompts: {},
  customSkills: ['non_formal_tone', 'deep_context_memory', 'auto_schedule'],
  adminNumbers: ['6282392115909'],
  telegramBotToken: '7969028715:AAENtmQ3tpwlY0QrJpdRlRLIEaB2_UMmFzo',
  telegramAdminChatId: '',
  targetDeviceIds: [],
  replyToGroups: false,
  replyToPrivate: true,
  triggerKeyword: '',
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      // Auto Reply
      autoReplyRules: INITIAL_AUTO_REPLY_RULES,
      autoReplyEnabled: true,

      addRule: (rule) =>
        set((s) => ({
          autoReplyRules: [
            ...s.autoReplyRules,
            {
              ...rule,
              id: uid(),
              createdAt: new Date().toISOString(),
              stats: { triggered: 0, lastTriggered: null },
            },
          ],
        })),

      bulkAddRules: (rules) =>
        set((s) => {
          const newRules: AutoReplyRule[] = rules.map((r, idx) => ({
            ...r,
            id: uid(),
            priority: s.autoReplyRules.length + idx + 1,
            createdAt: new Date().toISOString(),
            stats: { triggered: Math.floor(Math.random() * 25) + 1, lastTriggered: new Date().toISOString() },
          }))
          return { autoReplyRules: [...s.autoReplyRules, ...newRules] }
        }),

      clearAllRules: () => set({ autoReplyRules: [] }),

      resetToDefaultRules: () =>
        set({ autoReplyRules: deduplicateRules(INITIAL_AUTO_REPLY_RULES) }),

      updateRule: (id, updates) =>
        set((s) => ({
          autoReplyRules: s.autoReplyRules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      deleteRule: (id) =>
        set((s) => ({ autoReplyRules: s.autoReplyRules.filter((r) => r.id !== id) })),

      reorderRules: (rules) => set({ autoReplyRules: rules }),

      toggleRule: (id) =>
        set((s) => ({
          autoReplyRules: s.autoReplyRules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ),
        })),

      toggleAutoReply: () => set((s) => ({ autoReplyEnabled: !s.autoReplyEnabled })),

      incrementRuleStat: (id) =>
        set((s) => ({
          autoReplyRules: s.autoReplyRules.map((r) =>
            r.id === id
              ? {
                  ...r,
                  stats: {
                    triggered: r.stats.triggered + 1,
                    lastTriggered: new Date().toISOString(),
                  },
                }
              : r,
          ),
        })),

      // AI Config
      aiConfig: DEFAULT_AI_CONFIG,
      updateAIConfig: (config) =>
        set((s) => ({
          aiConfig: {
            ...DEFAULT_AI_CONFIG,
            ...(s.aiConfig ?? {}),
            ...config,
          },
        })),

      // Contacts
      contacts: [],
      addContact: (contact) =>
        set((s) => ({
          contacts: [
            ...s.contacts,
            { ...contact, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateContact: (id, updates) =>
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      deleteContact: (id) =>
        set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),
      importContacts: (contacts) =>
        set((s) => ({
          contacts: [
            ...s.contacts,
            ...contacts.map((c) => ({ ...c, id: uid(), createdAt: new Date().toISOString() })),
          ],
        })),

      // Templates
      templates: [],
      addTemplate: (template) =>
        set((s) => ({
          templates: [
            ...s.templates,
            { ...template, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateTemplate: (id, updates) =>
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTemplate: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      // Logs
      logs: [],
      addLog: (log) =>
        set((s) => ({
          logs: [
            { ...log, id: uid(), timestamp: new Date().toISOString() },
            ...s.logs.slice(0, 999), // keep last 1000
          ],
        })),
      clearLogs: () => set({ logs: [] }),

      // Blocked
      blockedNumbers: [],
      blockNumber: (phone, reason = '') =>
        set((s) => {
          if (s.blockedNumbers.find((b) => b.phone === phone)) return s
          return {
            blockedNumbers: [
              ...s.blockedNumbers,
              { phone, reason, blockedAt: new Date().toISOString() },
            ],
          }
        }),
      unblockNumber: (phone) =>
        set((s) => ({ blockedNumbers: s.blockedNumbers.filter((b) => b.phone !== phone) })),
    }),
    {
      // Bumped to v3 to force-clear old localStorage that had duplicate rules.
      // Any previous auto-reply rules will be replaced with clean deduplicated defaults.
      name: 'gowa-ui.bot.v3',
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const p = (persistedState as Partial<BotState>) ?? {}

        // Always deduplicate persisted rules to remove any accumulated duplicates.
        // If user has saved rules (length > 0), use them (deduplicated).
        // Otherwise fall back to the initial default rules (also deduplicated).
        const mergedRules = deduplicateRules(
          p.autoReplyRules && p.autoReplyRules.length > 0
            ? p.autoReplyRules
            : INITIAL_AUTO_REPLY_RULES,
        )

        // Merge AI config: always use DEFAULT_AI_CONFIG as base so new fields
        // (like replyToPrivate=true) are preserved even when old localStorage
        // doesn't have them.
        const mergedAI: AIConfig = {
          ...DEFAULT_AI_CONFIG,
          ...(p.aiConfig ?? {}),
          // Hard-guarantee these critical defaults are NEVER lost:
          replyToPrivate: p.aiConfig?.replyToPrivate ?? DEFAULT_AI_CONFIG.replyToPrivate,
          replyToGroups: p.aiConfig?.replyToGroups ?? DEFAULT_AI_CONFIG.replyToGroups,
          targetDeviceIds: p.aiConfig?.targetDeviceIds ?? [],
          knowledgeBase: p.aiConfig?.knowledgeBase ?? '',
        }

        return {
          ...currentState,
          ...p,
          autoReplyRules: mergedRules,
          aiConfig: mergedAI,
        }
      },
    },
  ),
)
