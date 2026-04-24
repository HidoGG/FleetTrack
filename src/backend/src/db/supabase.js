import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Cliente público — usa anon key, respeta RLS
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

// Cliente admin — usa service_role key, bypasea RLS (solo para operaciones internas del servidor)
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
)

export function createRequestClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {},
  })
}
