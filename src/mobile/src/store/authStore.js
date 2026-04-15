import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const useAuthStore = create(
  persist(
    (set) => ({
      token:        null,
      refreshToken: null,
      user:         null,
      profile:      null,
      driver:       null,

      login: (token, refreshToken, user, driver) =>
        set({ token, refreshToken, user, profile: user.profile, driver }),

      setToken: (token, refreshToken) =>
        set({ token, refreshToken }),

      logout: () =>
        set({ token: null, refreshToken: null, user: null, profile: null, driver: null }),
    }),
    {
      name: 'fleettrack-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
