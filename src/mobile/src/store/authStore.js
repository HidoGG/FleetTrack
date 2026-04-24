import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

function normalizeProfile(user = null) {
  const profile = user?.profile ?? null
  if (!profile) return null

  const locationId = profile.location_id ?? profile.store_id ?? null

  return {
    ...profile,
    location_id: locationId,
    store_id: profile.store_id ?? locationId,
  }
}

export const useAuthStore = create(
  persist(
    (set) => ({
      token:        null,
      refreshToken: null,
      user:         null,
      profile:      null,
      driver:       null,

      login: (token, refreshToken, user, driver) =>
        set({ token, refreshToken, user, profile: normalizeProfile(user), driver }),

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
