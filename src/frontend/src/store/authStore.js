import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function normalizeMapAccess(user = null, mapAccess = null) {
  const resolved = mapAccess ?? user?.map_access ?? null

  return {
    role: resolved?.role ?? user?.profile?.role ?? null,
    company_id: resolved?.company_id ?? user?.profile?.company_id ?? null,
    location_id: resolved?.location_id ?? user?.profile?.location_id ?? user?.profile?.store_id ?? null,
    capabilities: Array.isArray(resolved?.capabilities) ? resolved.capabilities : [],
  }
}

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      profile: null,
      mapAccess: normalizeMapAccess(),

      login: (token, user, mapAccess = null) =>
        set({
          token,
          user,
          profile: user.profile,
          mapAccess: normalizeMapAccess(user, mapAccess),
        }),

      logout: () =>
        set({ token: null, user: null, profile: null, mapAccess: normalizeMapAccess() }),

      isAdmin: () => {
        const state = useAuthStore.getState()
        return state.profile?.role === 'admin'
      },

      hasMapCapability: (capability) => {
        const state = useAuthStore.getState()
        return state.mapAccess?.capabilities?.includes(capability) ?? false
      },

      canAccessCompanyMap: () => {
        const state = useAuthStore.getState()
        return state.mapAccess?.capabilities?.includes('map.view.company') ?? false
      },
    }),
    { name: 'fleettrack-auth' }
  )
)
