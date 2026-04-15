import { createClient } from '@supabase/supabase-js'

// Cliente público — usa anon key, respeta RLS
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Cliente admin — usa service_role key, bypasea RLS (solo para operaciones internas del servidor)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
