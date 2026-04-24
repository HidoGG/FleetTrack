-- ============================================================
-- FleetTrack — Reconstrucción Completa v3
-- Fuente de Verdad Única: alineada al código actual (2026-04-13)
-- ============================================================
-- USO:
--   ► RECONSTRUCCIÓN DESDE CERO: ejecutar este archivo completo
--     en un proyecto Supabase vacío (SQL Editor).
--   ► MIGRACIÓN INCREMENTAL: ver migration_incremental_v3.sql
--
-- DECISIONES ASUMIDAS (code-first):
--   [D1] stores se crea ANTES que profiles porque profiles.store_id → stores.id
--   [D2] bultos se crea ANTES que orders porque orders.bulto_id → bultos.id
--   [D3] profiles incluye intentos_fallidos/esta_bloqueado/ultimo_codigo_lote
--        (usados en bultosController, ausentes en schema.sql original)
--   [D4] rol 'store' incluido en profiles.role CHECK (migration_v3_3_2)
--   [D5] orders.status usa mayúsculas: 'PENDING', 'READY_FOR_PICKUP', etc.
--        (alineado al código; migration_v3_3_1 no especificaba los valores)
--   [D6] bultos.codigo_lote es UNIQUE por empresa (enforced con constraint)
--   [D7] accesos_lote no tiene company_id directo; RLS vía profile_id → profiles
--   [D8] payment_amount en orders es nullable (puede ser 0 si !is_cod)
-- ============================================================

-- ── EXTENSIONES ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNCIONES HELPER (RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- TABLA: companies
-- Empresas clientes (multi-tenant)
-- ============================================================
CREATE TABLE companies (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL,
  plan       TEXT        NOT NULL DEFAULT 'basic'
               CHECK (plan IN ('basic', 'pro', 'enterprise')),
  commercial_status TEXT  NOT NULL DEFAULT 'trial'
               CHECK (commercial_status IN ('trial', 'active', 'past_due', 'paused', 'cancelled')),
  feature_flags JSONB     NOT NULL DEFAULT '{}'::jsonb,
  limits_config JSONB     NOT NULL DEFAULT '{}'::jsonb,
  addons     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: stores
-- Tiendas/sucursales que originan pedidos
-- DEBE crearse antes de profiles (profiles.store_id → stores.id) [D1]
-- ============================================================
CREATE TABLE stores (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  location_type TEXT     NOT NULL DEFAULT 'store'
               CHECK (location_type IN ('store', 'branch', 'warehouse', 'logistics', 'office', 'pickup', 'other')),
  address    TEXT,
  lat        NUMERIC(10, 7),
  lng        NUMERIC(10, 7),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  rider_visible BOOLEAN  NOT NULL DEFAULT TRUE,
  is_temporary BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: profiles
-- Extiende auth.users con datos de negocio
-- Incluye: store_id (v3.3.2), intentos_fallidos/esta_bloqueado/ultimo_codigo_lote [D3]
-- ============================================================
CREATE TABLE profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role                TEXT        NOT NULL DEFAULT 'driver'
                        CHECK (role IN ('admin', 'driver', 'store')),  -- [D4]
  full_name           TEXT,
  phone               TEXT,
  avatar_url          TEXT,
  store_id            UUID        REFERENCES stores(id) ON DELETE SET NULL,  -- [D1]
  -- Campos de seguridad para validación de lotes [D3]
  intentos_fallidos   INT         NOT NULL DEFAULT 0,
  esta_bloqueado      BOOLEAN     NOT NULL DEFAULT FALSE,
  ultimo_codigo_lote  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: vehicles
-- Flota de vehículos
-- ============================================================
CREATE TABLE vehicles (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plate       TEXT        NOT NULL UNIQUE,
  brand       TEXT        NOT NULL,
  model       TEXT        NOT NULL,
  year        INT,
  color       TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'maintenance', 'inactive')),
  odometer_km NUMERIC(10, 2) DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: drivers
-- Conductores (complementa profiles con datos de licencia)
-- ============================================================
CREATE TABLE drivers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  license_number      TEXT NOT NULL,
  license_expiry      DATE NOT NULL,
  assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: trips
-- Viajes/recorridos
-- ============================================================
CREATE TABLE trips (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id  UUID        NOT NULL REFERENCES drivers(id)  ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time   TIMESTAMPTZ,
  start_lat  NUMERIC(10, 7),
  start_lng  NUMERIC(10, 7),
  end_lat    NUMERIC(10, 7),
  end_lng    NUMERIC(10, 7),
  km_total   NUMERIC(10, 2) DEFAULT 0,
  status     TEXT        NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: locations
-- Posiciones GPS (alta frecuencia, realtime)
-- ============================================================
CREATE TABLE locations (
  id         BIGSERIAL   PRIMARY KEY,
  vehicle_id UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  trip_id    UUID        REFERENCES trips(id) ON DELETE SET NULL,
  lat        NUMERIC(10, 7) NOT NULL,
  lng        NUMERIC(10, 7) NOT NULL,
  speed_kmh  NUMERIC(6,  2) DEFAULT 0,
  heading    NUMERIC(6,  2),
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: maintenance
-- Mantenimiento preventivo y correctivo
-- ============================================================
CREATE TABLE maintenance (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id          UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type                TEXT        NOT NULL
                        CHECK (type IN ('oil_change', 'tire', 'brake', 'inspection', 'other')),
  description         TEXT,
  date                DATE        NOT NULL DEFAULT CURRENT_DATE,
  cost                NUMERIC(10, 2) DEFAULT 0,
  odometer_at_service NUMERIC(10, 2),
  next_due_km         NUMERIC(10, 2),
  next_due_date       DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: weight_presets
-- Master data de pesos (editables solo por admin)
-- Fuente: migration_v3_3_1.sql
-- ============================================================
CREATE TABLE weight_presets (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  weight_kg  NUMERIC(8, 3) NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: bultos
-- Lotes/agrupaciones de pedidos asignados a riders
-- DEBE crearse antes de orders (orders.bulto_id → bultos.id) [D2]
-- ============================================================
CREATE TABLE bultos (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  codigo_lote             TEXT        NOT NULL,
  cantidad_esperada       INT         NOT NULL CHECK (cantidad_esperada > 0),
  clave_desbloqueo        TEXT        NOT NULL,
  descripcion             TEXT,
  estado                  TEXT        NOT NULL DEFAULT 'CREADO'
                            CHECK (estado IN ('CREADO', 'EN_RUTA', 'COMPLETADO')),
  active_driver_profile_id UUID       REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- [D6] codigo_lote único por empresa
  CONSTRAINT bultos_codigo_lote_company_unique UNIQUE (company_id, codigo_lote)
);

-- ============================================================
-- TABLA: orders
-- Pedidos a entregar
-- Combina base + columnas de migration_v3_3_1 + store_id
-- ============================================================
CREATE TABLE orders (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bulto_id          UUID        REFERENCES bultos(id) ON DELETE SET NULL,
  store_id          UUID        REFERENCES stores(id) ON DELETE SET NULL,
  customer_name     TEXT        NOT NULL,
  customer_phone    TEXT,
  notes             TEXT,
  delivery_address  TEXT        NOT NULL,
  delivery_lat      NUMERIC(10, 7),
  delivery_lng      NUMERIC(10, 7),
  -- Cobro en destino (migration_v3_3_1) [D5]
  is_cod            BOOLEAN     NOT NULL DEFAULT TRUE,
  payment_amount    NUMERIC(10, 2),                  -- [D8] nullable; 0 si !is_cod
  merchandise_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- Campos legacy (retrocompatibilidad con mobile actual)
  product_brand     TEXT,
  product_weight    TEXT,
  -- Estado del flujo de entrega [D5]
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN (
                        'PENDING', 'READY_FOR_PICKUP', 'ACCEPTED',
                        'IN_TRANSIT', 'DELIVERED', 'FAILED'
                      )),
  -- Proof of Delivery y factura
  pod_photo_url     TEXT,
  invoice_photo_url TEXT,
  -- Timestamps de transición de estado
  accepted_at       TIMESTAMPTZ,
  picked_up_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: order_items
-- Líneas de producto por pedido (multi-producto)
-- Fuente: migration_v3_3_1.sql
-- ============================================================
CREATE TABLE order_items (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  brand            TEXT,
  product          TEXT        NOT NULL,
  quantity         INT         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_preset_id UUID        REFERENCES weight_presets(id) ON DELETE SET NULL,
  weight_label     TEXT,       -- Copia desnormalizada del label al momento de crear
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: accesos_lote
-- Log de auditoría de intentos de validación de lotes
-- ============================================================
CREATE TABLE accesos_lote (
  id                  BIGSERIAL   PRIMARY KEY,
  profile_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  codigo_lote         TEXT        NOT NULL,
  conteo_ingresado    INT         NOT NULL DEFAULT 0,
  conteo_esperado     INT         NOT NULL DEFAULT 0,
  tiene_diferencia    BOOLEAN     NOT NULL DEFAULT FALSE,
  bloqueado_por_codigo BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY — ENABLE
-- ============================================================
ALTER TABLE companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips          ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bultos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE accesos_lote   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROW LEVEL SECURITY — POLICIES
-- ============================================================

-- ── companies ────────────────────────────────────────────────
CREATE POLICY "companies_isolation" ON companies
  FOR ALL USING (id = get_my_company_id());

-- ── stores ───────────────────────────────────────────────────
CREATE POLICY "stores_company_isolation" ON stores
  FOR ALL USING (company_id = get_my_company_id());

-- ── profiles ─────────────────────────────────────────────────
CREATE POLICY "profiles_company_isolation" ON profiles
  FOR ALL USING (company_id = get_my_company_id());

-- ── vehicles ─────────────────────────────────────────────────
CREATE POLICY "vehicles_company_isolation" ON vehicles
  FOR ALL USING (company_id = get_my_company_id());

-- ── drivers ──────────────────────────────────────────────────
CREATE POLICY "drivers_company_isolation" ON drivers
  FOR ALL USING (company_id = get_my_company_id());

-- ── trips ────────────────────────────────────────────────────
-- Admin ve todos; conductor solo los suyos
CREATE POLICY "trips_isolation" ON trips
  FOR ALL USING (
    company_id = get_my_company_id() AND (
      get_my_role() = 'admin'
      OR driver_id IN (SELECT id FROM drivers WHERE profile_id = auth.uid())
    )
  );

-- ── locations ────────────────────────────────────────────────
CREATE POLICY "locations_company_isolation" ON locations
  FOR ALL USING (
    vehicle_id IN (SELECT id FROM vehicles WHERE company_id = get_my_company_id())
  );

-- ── maintenance ──────────────────────────────────────────────
CREATE POLICY "maintenance_admin_only" ON maintenance
  FOR ALL USING (
    company_id = get_my_company_id() AND get_my_role() = 'admin'
  );

-- ── weight_presets ───────────────────────────────────────────
-- Todos los roles pueden leer; solo admin puede escribir
CREATE POLICY "weight_presets_select" ON weight_presets
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "weight_presets_insert" ON weight_presets
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'admin');

CREATE POLICY "weight_presets_update" ON weight_presets
  FOR UPDATE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');

CREATE POLICY "weight_presets_delete" ON weight_presets
  FOR DELETE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');

-- ── bultos ───────────────────────────────────────────────────
-- Todos los roles de la empresa pueden leer (rider necesita validar código)
-- Escritura solo admin (app-level enforcement adicional en rutas)
CREATE POLICY "bultos_select" ON bultos
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "bultos_insert" ON bultos
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'admin');

CREATE POLICY "bultos_update" ON bultos
  FOR UPDATE USING (company_id = get_my_company_id());

CREATE POLICY "bultos_delete" ON bultos
  FOR DELETE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');

-- ── orders ───────────────────────────────────────────────────
-- Admin: todos los pedidos de su empresa
-- Store: solo los pedidos de su tienda
-- Driver/rider: todos los de la empresa (el controller filtra por bulto)
CREATE POLICY "orders_select" ON orders
  FOR SELECT USING (
    company_id = get_my_company_id() AND (
      get_my_role() IN ('admin', 'driver')
      OR (get_my_role() = 'store' AND store_id = get_my_store_id())
    )
  );

CREATE POLICY "orders_insert" ON orders
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id() AND (
      get_my_role() = 'admin'
      OR (get_my_role() = 'store' AND store_id = get_my_store_id())
    )
  );

CREATE POLICY "orders_update" ON orders
  FOR UPDATE USING (
    company_id = get_my_company_id() AND (
      get_my_role() IN ('admin', 'driver')
      OR (get_my_role() = 'store' AND store_id = get_my_store_id())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id() AND (
      get_my_role() IN ('admin', 'driver')
      OR (get_my_role() = 'store' AND store_id = get_my_store_id())
    )
  );

CREATE POLICY "orders_delete" ON orders
  FOR DELETE USING (
    company_id = get_my_company_id() AND get_my_role() = 'admin'
  );

-- ── order_items ──────────────────────────────────────────────
CREATE POLICY "order_items_company_isolation" ON order_items
  FOR ALL USING (
    order_id IN (SELECT id FROM orders WHERE company_id = get_my_company_id())
  );

-- ── accesos_lote ─────────────────────────────────────────────
-- Todos en la empresa pueden ver el log; riders insertan los suyos
CREATE POLICY "accesos_lote_company_isolation" ON accesos_lote
  FOR ALL USING (
    profile_id IN (SELECT id FROM profiles WHERE company_id = get_my_company_id())
  );

-- ============================================================
-- ÍNDICES
-- ============================================================

-- locations: consultas de posición reciente por vehículo
CREATE INDEX idx_locations_vehicle_timestamp
  ON locations (vehicle_id, timestamp DESC);

-- weight_presets: dropdown por empresa
CREATE INDEX idx_weight_presets_company
  ON weight_presets (company_id, active, sort_order);

-- order_items: join desde orders
CREATE INDEX idx_order_items_order_id
  ON order_items (order_id);

-- orders: dashboard financiero COD
CREATE INDEX idx_orders_is_cod_status
  ON orders (company_id, is_cod, status)
  WHERE is_cod = TRUE AND status IN ('ACCEPTED', 'IN_TRANSIT');

-- orders: filtros frecuentes
CREATE INDEX idx_orders_company_status
  ON orders (company_id, status, created_at DESC);

CREATE INDEX idx_orders_bulto_id
  ON orders (bulto_id) WHERE bulto_id IS NOT NULL;

CREATE INDEX idx_orders_store_id
  ON orders (store_id) WHERE store_id IS NOT NULL;

-- bultos: búsqueda por driver activo
CREATE INDEX idx_bultos_active_driver
  ON bultos (active_driver_profile_id, estado)
  WHERE active_driver_profile_id IS NOT NULL;

-- profiles: consultas de riders bloqueados
CREATE INDEX idx_profiles_blocked
  ON profiles (company_id, esta_bloqueado)
  WHERE esta_bloqueado = TRUE;

-- profiles: store_id para filtrar pedidos por tienda
CREATE INDEX idx_profiles_store_id
  ON profiles (store_id) WHERE store_id IS NOT NULL;

-- accesos_lote: auditoría por perfil
CREATE INDEX idx_accesos_lote_profile
  ON accesos_lote (profile_id, created_at DESC);

-- stores: búsqueda por empresa
CREATE INDEX idx_stores_company
  ON stores (company_id);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE locations;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- ============================================================
-- DATOS INICIALES OPCIONALES
-- Reemplazar <COMPANY_ID> con el UUID real de la empresa antes
-- de ejecutar este bloque. Omitir si ya existen presets.
-- ============================================================
-- INSERT INTO weight_presets (company_id, label, weight_kg, sort_order)
-- VALUES
--   ('<COMPANY_ID>', 'Pequeño',    0.5,  1),
--   ('<COMPANY_ID>', 'Mediano',    5.0,  2),
--   ('<COMPANY_ID>', 'Grande',    15.0,  3),
--   ('<COMPANY_ID>', 'Muy Grande', 30.0, 4);

-- ============================================================
-- FIN: full_reconstruction_v3.sql
-- ============================================================
