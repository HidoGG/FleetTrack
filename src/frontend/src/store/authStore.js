import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      profile: null,

      login: (token, user) =>
        set({ token, user: user, profile: user.profile }),

      logout: () =>
        set({ token: null, user: null, profile: null }),

      isAdmin: () => {
        const state = useAuthStore.getState()
        return state.profile?.role === 'admin'
      },
    }),
    { name: 'fleettrack-auth' }
  )
)
