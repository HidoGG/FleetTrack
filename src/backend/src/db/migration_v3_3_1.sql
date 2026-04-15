-- ============================================================
-- FleetTrack — Migración v3.3.1
-- Estructura Multi-Producto y Dashboard Financiero
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── TABLA: weight_presets (Master Data de Pesos) ─────────────────────────────
-- Solo editables por admins. Consumidos como dropdown en el formulario de tienda.
CREATE TABLE IF NOT EXISTS weight_presets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,          -- Ej: "Pequeño", "Mediano", "Grande"
  weight_kg  NUMERIC(8, 3) NOT NULL, -- Peso en kilogramos
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABLA: order_items (Líneas de producto por pedido) ───────────────────────
-- Un pedido puede tener N productos (relación 1:N con orders).
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  brand            TEXT,                    -- Marca del producto (opcional)
  product          TEXT NOT NULL,           -- Descripción del producto
  quantity         INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_preset_id UUID REFERENCES weight_presets(id) ON DELETE SET NULL,
  weight_label     TEXT,   -- Copia desnormalizada del label al momento de crear
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MODIFICAR TABLA: orders ───────────────────────────────────────────────────
-- is_cod: TRUE = "cobrar en destino" (COD). FALSE = producto ya pagado.
-- merchandise_value: valor estimado de la mercadería (para KPI del dashboard).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_cod             BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS merchandise_value  NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── RLS: weight_presets ───────────────────────────────────────────────────────
ALTER TABLE weight_presets ENABLE ROW LEVEL SECURITY;

-- Todos los roles pueden leer los presets de su empresa (form de tienda los necesita)
CREATE POLICY "weight_presets_read" ON weight_presets
  FOR SELECT USING (company_id = get_my_company_id());

-- Solo admins pueden crear/modificar/eliminar (SUPER_ADMIN = rol 'admin')
CREATE POLICY "weight_presets_admin_insert" ON weight_presets
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'admin');

CREATE POLICY "weight_presets_admin_update" ON weight_presets
  FOR UPDATE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');

CREATE POLICY "weight_presets_admin_delete" ON weight_presets
  FOR DELETE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');

-- ── RLS: order_items ─────────────────────────────────────────────────────────
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Acceso basado en el pedido padre: hereda el aislamiento por empresa
CREATE POLICY "order_items_company_isolation" ON order_items
  FOR ALL USING (
    order_id IN (SELECT id FROM orders WHERE company_id = get_my_company_id())
  );

-- ── Índice de performance ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_weight_presets_company ON weight_presets (company_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_is_cod_status ON orders (company_id, is_cod, status)
  WHERE is_cod = TRUE AND status IN ('ACCEPTED', 'IN_TRANSIT');

-- ── Datos iniciales: 4 presets por defecto (reemplazar <COMPANY_ID>) ──────────
-- Ejecutar MANUALMENTE después de la migración con el UUID real de la empresa:
--
-- INSERT INTO weight_presets (company_id, label, weight_kg, sort_order)
-- VALUES
--   ('<COMPANY_ID>', 'Pequeño',    0.5,   1),
--   ('<COMPANY_ID>', 'Mediano',    5.0,   2),
--   ('<COMPANY_ID>', 'Grande',    15.0,   3),
--   ('<COMPANY_ID>', 'Muy Grande', 30.0,  4);

-- ── Realtime para order_items ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
