-- ============================================================
-- FleetTrack - Migration D - Operational locations
-- Fecha: 2026-04-16
-- Objetivo:
--   extender `stores` para cubrir ubicaciones operativas generales
--   sin romper compatibilidad con store portal, perfiles y pedidos.
-- ============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'store'
    CHECK (location_type IN ('store', 'branch', 'warehouse', 'logistics', 'office', 'pickup', 'other')),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rider_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE stores
SET location_type = COALESCE(location_type, 'store');

UPDATE stores
SET is_active = COALESCE(is_active, TRUE),
    rider_visible = COALESCE(rider_visible, TRUE),
    is_temporary = COALESCE(is_temporary, FALSE);
