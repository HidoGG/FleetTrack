-- ============================================================
-- FleetTrack — Esquema de Base de Datos (Supabase / PostgreSQL)
-- Etapa 1: Contract-First
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ---- EXTENSIONES ----
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: companies
-- Empresas clientes (multi-tenant)
-- ============================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: profiles
-- Extiende auth.users de Supabase con datos del negocio
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'driver')),
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: vehicles
-- Flota de vehículos
-- ============================================================
CREATE TABLE vehicles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plate       TEXT NOT NULL UNIQUE,
  brand       TEXT NOT NULL,
  model       TEXT NOT NULL,
  year        INT,
  color       TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  odometer_km NUMERIC(10, 2) DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: drivers
-- Conductores (complementa el perfil con datos de licencia)
-- ============================================================
CREATE TABLE drivers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  license_number  TEXT NOT NULL,
  license_expiry  DATE NOT NULL,
  assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: trips
-- Viajes / recorridos
-- ============================================================
CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  start_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time        TIMESTAMPTZ,
  start_lat       NUMERIC(10, 7),
  start_lng       NUMERIC(10, 7),
  end_lat         NUMERIC(10, 7),
  end_lng         NUMERIC(10, 7),
  km_total        NUMERIC(10, 2) DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: locations
-- Posiciones GPS en tiempo real (alta frecuencia)
-- ============================================================
CREATE TABLE locations (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES trips(id) ON DELETE SET NULL,
  lat         NUMERIC(10, 7) NOT NULL,
  lng         NUMERIC(10, 7) NOT NULL,
  speed_kmh   NUMERIC(6, 2) DEFAULT 0,
  heading     NUMERIC(6, 2),
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas de posición reciente por vehículo
CREATE INDEX idx_locations_vehicle_timestamp ON locations (vehicle_id, timestamp DESC);

-- ============================================================
-- TABLA: maintenance
-- Registros de mantenimiento preventivo y correctivo
-- ============================================================
CREATE TABLE maintenance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('oil_change', 'tire', 'brake', 'inspection', 'other')),
  description     TEXT,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  cost            NUMERIC(10, 2) DEFAULT 0,
  odometer_at_service NUMERIC(10, 2),
  next_due_km     NUMERIC(10, 2),
  next_due_date   DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Aislamiento de datos por empresa (multi-tenant)
-- ============================================================

ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance      ENABLE ROW LEVEL SECURITY;

-- Helper: obtener company_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- companies: solo ven la suya
CREATE POLICY "company_isolation" ON companies
  FOR ALL USING (id = get_my_company_id());

-- profiles: solo ven perfiles de su empresa
CREATE POLICY "profiles_company_isolation" ON profiles
  FOR ALL USING (company_id = get_my_company_id());

-- vehicles: solo ven los de su empresa
CREATE POLICY "vehicles_company_isolation" ON vehicles
  FOR ALL USING (company_id = get_my_company_id());

-- drivers: solo ven los de su empresa
CREATE POLICY "drivers_company_isolation" ON drivers
  FOR ALL USING (company_id = get_my_company_id());

-- trips: admins ven todos los de su empresa; conductores solo los suyos
CREATE POLICY "trips_admin_isolation" ON trips
  FOR ALL USING (
    company_id = get_my_company_id() AND (
      get_my_role() = 'admin'
      OR driver_id IN (SELECT id FROM drivers WHERE profile_id = auth.uid())
    )
  );

-- locations: misma lógica que trips
CREATE POLICY "locations_company_isolation" ON locations
  FOR ALL USING (
    vehicle_id IN (SELECT id FROM vehicles WHERE company_id = get_my_company_id())
  );

-- maintenance: solo admins de la empresa
CREATE POLICY "maintenance_admin_only" ON maintenance
  FOR ALL USING (
    company_id = get_my_company_id() AND get_my_role() = 'admin'
  );

-- ============================================================
-- REALTIME
-- Habilitar para la tabla locations (mapa en vivo)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE locations;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
