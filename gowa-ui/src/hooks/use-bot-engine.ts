import { useEffect } from 'react'
import { fetchBotRules, fetchAIConfig, fetchBotLogs, saveAIConfig } from '@/api/bot'
import { useBotStore, deduplicateRules } from '@/stores/bot'

/**
 * useBotEngine syncs rules, AI config, and logs with the server-side Go Bot Engine.
 * Does not overwrite local user-entered API keys with stale server keys.
 */
export function useBotEngine() {
  useEffect(() => {
    let active = true

    async function syncServerState() {
      try {
        const [serverRules, serverAI, serverLogs] = await Promise.all([
          fetchBotRules(),
          fetchAIConfig(),
          fetchBotLogs(50),
        ])

        if (!active) return

        if (serverRules && serverRules.length > 0) {
          useBotStore.setState({ autoReplyRules: deduplicateRules(serverRules) })
        }

        if (serverAI) {
          const localAI = useBotStore.getState().aiConfig
          // If local has an API key that differs from server, auto-save local to server!
          if (localAI.apiKey && localAI.apiKey !== serverAI.apiKey) {
            void saveAIConfig(localAI)
          } else if (serverAI.apiKey && !localAI.apiKey) {
            useBotStore.setState({ aiConfig: serverAI })
          }
        }

        if (serverLogs && serverLogs.length > 0) {
          useBotStore.setState({ logs: serverLogs })
        }
      } catch {
        // Fallback to local store
      }
    }

    void syncServerState()

    const timer = setInterval(() => {
      void syncServerState()
    }, 10_000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
}
