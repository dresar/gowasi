import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BroadcastStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed'
export type ScheduleRepeat = 'once' | 'daily' | 'weekly' | 'monthly'

export interface BroadcastRecipient {
  phone: string
  name?: string
  variables?: Record<string, string>
  status: 'pending' | 'sent' | 'failed'
  sentAt?: string
  error?: string
}

export interface BroadcastJob {
  id: string
  name: string
  status: BroadcastStatus
  message: string
  mediaUrl?: string
  messageType: 'text' | 'image' | 'file' | 'video'
  recipients: BroadcastRecipient[]
  delayMin: number // ms min delay between messages
  delayMax: number // ms max delay
  createdAt: string
  startedAt?: string
  completedAt?: string
  progress: number // 0-100
}

export interface ScheduledMessage {
  id: string
  name: string
  enabled: boolean
  phone: string // or group JID
  message: string
  messageType: 'text' | 'image' | 'file'
  mediaUrl?: string
  scheduledAt: string // ISO datetime for 'once'
  repeat: ScheduleRepeat
  repeatTime: string // HH:MM for daily/weekly
  repeatDay?: number // 0-6 for weekly, 1-31 for monthly
  lastRun?: string
  nextRun?: string
  runCount: number
  createdAt: string
}

export interface Campaign {
  id: string
  name: string
  description: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  trigger: {
    type: 'keyword' | 'new_contact' | 'manual'
    keyword?: string
  }
  steps: CampaignStep[]
  stats: {
    enrolled: number
    completed: number
    replied: number
  }
  createdAt: string
}

export interface CampaignStep {
  id: string
  order: number
  delayHours: number
  message: string
  messageType: 'text' | 'image'
  mediaUrl?: string
  condition?: {
    ifReplied: 'continue' | 'stop' | 'branch'
    branchStepId?: string
  }
}

export interface WebhookLog {
  id: string
  timestamp: string
  eventType: string
  payload: unknown
  status: 'received' | 'processed' | 'failed'
  error?: string
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface BroadcastState {
  // Broadcast
  jobs: BroadcastJob[]
  addJob: (job: Omit<BroadcastJob, 'id' | 'createdAt' | 'progress'>) => string
  updateJob: (id: string, updates: Partial<BroadcastJob>) => void
  deleteJob: (id: string) => void
  updateRecipient: (jobId: string, phone: string, updates: Partial<BroadcastRecipient>) => void

  // Scheduled Messages
  scheduledMessages: ScheduledMessage[]
  addSchedule: (msg: Omit<ScheduledMessage, 'id' | 'createdAt' | 'runCount'>) => void
  updateSchedule: (id: string, updates: Partial<ScheduledMessage>) => void
  deleteSchedule: (id: string) => void
  toggleSchedule: (id: string) => void

  // Campaigns
  campaigns: Campaign[]
  addCampaign: (campaign: Omit<Campaign, 'id' | 'createdAt' | 'stats'>) => void
  updateCampaign: (id: string, updates: Partial<Campaign>) => void
  deleteCampaign: (id: string) => void

  // Webhook Logs
  webhookLogs: WebhookLog[]
  addWebhookLog: (log: Omit<WebhookLog, 'id' | 'timestamp'>) => void
  clearWebhookLogs: () => void
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useBroadcastStore = create<BroadcastState>()(
  persist(
    (set) => ({
      // Broadcast
      jobs: [],
      addJob: (job) => {
        const id = uid()
        set((s) => ({
          jobs: [{ ...job, id, createdAt: new Date().toISOString(), progress: 0 }, ...s.jobs],
        }))
        return id
      },
      updateJob: (id, updates) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)) })),
      deleteJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      updateRecipient: (jobId, phone, updates) =>
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  recipients: j.recipients.map((r) =>
                    r.phone === phone ? { ...r, ...updates } : r,
                  ),
                }
              : j,
          ),
        })),

      // Scheduled
      scheduledMessages: [],
      addSchedule: (msg) =>
        set((s) => ({
          scheduledMessages: [
            ...s.scheduledMessages,
            { ...msg, id: uid(), createdAt: new Date().toISOString(), runCount: 0 },
          ],
        })),
      updateSchedule: (id, updates) =>
        set((s) => ({
          scheduledMessages: s.scheduledMessages.map((m) =>
            m.id === id ? { ...m, ...updates } : m,
          ),
        })),
      deleteSchedule: (id) =>
        set((s) => ({ scheduledMessages: s.scheduledMessages.filter((m) => m.id !== id) })),
      toggleSchedule: (id) =>
        set((s) => ({
          scheduledMessages: s.scheduledMessages.map((m) =>
            m.id === id ? { ...m, enabled: !m.enabled } : m,
          ),
        })),

      // Campaigns
      campaigns: [],
      addCampaign: (campaign) =>
        set((s) => ({
          campaigns: [
            ...s.campaigns,
            {
              ...campaign,
              id: uid(),
              createdAt: new Date().toISOString(),
              stats: { enrolled: 0, completed: 0, replied: 0 },
            },
          ],
        })),
      updateCampaign: (id, updates) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      deleteCampaign: (id) =>
        set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),

      // Webhook Logs
      webhookLogs: [],
      addWebhookLog: (log) =>
        set((s) => ({
          webhookLogs: [
            { ...log, id: uid(), timestamp: new Date().toISOString() },
            ...s.webhookLogs.slice(0, 499),
          ],
        })),
      clearWebhookLogs: () => set({ webhookLogs: [] }),
    }),
    {
      name: 'gowa-ui.broadcast.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
