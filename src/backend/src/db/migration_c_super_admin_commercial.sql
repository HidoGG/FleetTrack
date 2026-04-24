-- ============================================================
-- FleetTrack - Migration C - Super Admin commercial config
-- Fecha: 2026-04-16
-- Objetivo:
--   agregar configuracion comercial minima por empresa para cerrar
--   Fase 1 desde /super-admin sin introducir una capa de billing compleja.
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (commercial_status IN ('trial', 'active', 'past_due', 'paused', 'cancelled')),
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{
    "live_tracking": true,
    "incidents": false,
    "advanced_history": false,
    "financial_dashboard": false,
    "invoice_capture": true,
    "multi_location": false,
    "full_traceability": false,
    "operational_rollback": false,
    "advanced_metrics": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS limits_config JSONB NOT NULL DEFAULT '{
    "profiles": 3,
    "stores": 1,
    "drivers": 5,
    "vehicles": 5
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE companies
SET commercial_status = COALESCE(commercial_status, 'trial');

UPDATE companies
SET feature_flags = CASE plan
  WHEN 'enterprise' THEN '{
    "live_tracking": true,
    "incidents": true,
    "advanced_history": true,
    "financial_dashboard": true,
    "invoice_capture": true,
    "multi_location": true,
    "full_traceability": true,
    "operational_rollback": true,
    "advanced_metrics": true
  }'::jsonb
  WHEN 'pro' THEN '{
    "live_tracking": true,
    "incidents": true,
    "advanced_history": true,
    "financial_dashboard": true,
    "invoice_capture": true,
    "multi_location": true,
    "full_traceability": false,
    "operational_rollback": false,
    "advanced_metrics": true
  }'::jsonb
  ELSE '{
    "live_tracking": true,
    "incidents": false,
    "advanced_history": false,
    "financial_dashboard": false,
    "invoice_capture": true,
    "multi_location": false,
    "full_traceability": false,
    "operational_rollback": false,
    "advanced_metrics": false
  }'::jsonb
END
WHERE feature_flags IS NULL OR feature_flags = '{}'::jsonb;

UPDATE companies
SET limits_config = CASE plan
  WHEN 'enterprise' THEN '{"profiles":50,"stores":20,"drivers":100,"vehicles":100}'::jsonb
  WHEN 'pro' THEN '{"profiles":12,"stores":4,"drivers":20,"vehicles":20}'::jsonb
  ELSE '{"profiles":3,"stores":1,"drivers":5,"vehicles":5}'::jsonb
END
WHERE limits_config IS NULL OR limits_config = '{}'::jsonb;

UPDATE companies
SET addons = CASE plan
  WHEN 'enterprise' THEN '["priority_support","white_label","extra_integrations"]'::jsonb
  WHEN 'pro' THEN '["priority_support"]'::jsonb
  ELSE '[]'::jsonb
END
WHERE addons IS NULL OR addons = '[]'::jsonb;
