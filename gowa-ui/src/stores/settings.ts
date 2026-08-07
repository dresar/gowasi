import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface AppSettingsState {
  customBackendUrl: string // Empty means default window.location.origin
  neonDbUrl: string // Neon Postgres Database connection URL
  setCustomBackendUrl: (url: string) => void
  resetCustomBackendUrl: () => void
  setNeonDbUrl: (url: string) => void
  resetNeonDbUrl: () => void
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      customBackendUrl: '',
      neonDbUrl: '',
      setCustomBackendUrl: (url: string) => set({ customBackendUrl: url.trim().replace(/\/+$/, '') }),
      resetCustomBackendUrl: () => set({ customBackendUrl: '' }),
      setNeonDbUrl: (url: string) => set({ neonDbUrl: url.trim() }),
      resetNeonDbUrl: () => set({ neonDbUrl: '' }),
    }),
    {
      name: 'gowa-ui.settings.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
