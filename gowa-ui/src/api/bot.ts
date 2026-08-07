import { http, results } from '@/lib/http'
import type { AutoReplyRule, AIConfig, ActivityLog } from '@/stores/bot'

export async function fetchBotRules(): Promise<AutoReplyRule[]> {
  try {
    return await results<AutoReplyRule[]>(http.get('/bot/rules'))
  } catch {
    return []
  }
}

export async function createBotRule(rule: Partial<AutoReplyRule>): Promise<AutoReplyRule> {
  return results<AutoReplyRule>(http.post('/bot/rules', rule))
}

export async function updateBotRule(id: string, updates: Partial<AutoReplyRule>): Promise<AutoReplyRule> {
  return results<AutoReplyRule>(http.put(`/bot/rules/${id}`, updates))
}

export async function deleteBotRule(id: string): Promise<void> {
  await http.delete(`/bot/rules/${id}`)
}

export async function fetchAIConfig(): Promise<AIConfig | null> {
  try {
    return await results<AIConfig>(http.get('/bot/ai-config'))
  } catch {
    return null
  }
}

export async function saveAIConfig(config: Partial<AIConfig>): Promise<AIConfig> {
  return results<AIConfig>(http.post('/bot/ai-config', config))
}

export async function fetchBotLogs(limit = 100): Promise<ActivityLog[]> {
  try {
    return await results<ActivityLog[]>(http.get(`/bot/logs?limit=${limit}`))
  } catch {
    return []
  }
}
