-- ============================================================
-- FleetTrack — Migración v3.3.2
-- Soporte de rol 'store' y columna store_id en profiles
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- PREREQUISITO: tabla 'stores' debe existir en la DB.
-- ============================================================

-- 1. Agregar store_id a profiles (FK opcional hacia stores)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- 2. Actualizar el CHECK de role para incluir 'store'
--    Primero dropeamos el constraint existente, luego lo recreamos.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'driver', 'store'));

-- 3. Índice para consultas por store_id
CREATE INDEX IF NOT EXISTS idx_profiles_store_id ON profiles (store_id)
  WHERE store_id IS NOT NULL;

-- ============================================================
-- DESPUÉS DE APLICAR ESTA MIGRACIÓN:
-- En src/backend/src/middleware/auth.js, cambiar el select a:
--   .select('id, company_id, role, full_name, store_id')
-- ============================================================
