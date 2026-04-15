-- ============================================================
-- FleetTrack — Migración B (Fase 1)
-- super_admin · RLS rewrite · tracking de pedidos
-- ============================================================
-- EJECUCIÓN:
--   Supabase Dashboard → SQL Editor
--   Ejecutar PASO por PASO (B-0 → B-7).
--   NO ejecutar todo el archivo junto.
--
-- PATRÓN NAME-AGNOSTIC:
--   Cada bloque RLS (B-5-*) hace dentro de UN SOLO DO $$:
--     1. Itera pg_policies en runtime y DROPea TODAS las policies
--        actuales de esa tabla (sin depender de nombres teóricos).
--     2. Crea inmediatamente las policies nuevas con is_super_admin().
--   DROP y CREATE ocurren en la misma transacción → ventana sin RLS = cero.
--   Si el bloque falla a mitad, el DROP también se revierte.
--
-- WORKAROUND DE COMPATIBILIDAD (no modelo objetivo):
--   profiles.company_id es NOT NULL → un super_admin debe pertenecer
--   a alguna empresa. Solución transitoria de Fase 1: crear una company
--   "platform" (nombre sugerido) y asignarla al crear el perfil super_admin.
--   El modelo final debería permitir company_id nullable para super_admin
--   o usar una tabla separada de platform_users.
--   Esto NO afecta el comportamiento de las policies: is_super_admin()
--   bypasea company_id en todas las tablas independientemente.
--
-- LEYENDA:
--   [RIESGO-ALTO]  Puede fallar con datos reales. Validar antes.
--   [RIESGO-MEDIO] Puede fallar si schema previo difiere.
--   [INFO]         Operación segura / idempotente.
--   [COLISIÓN]     La columna nueva puede solaparse con una existente.
-- ============================================================


-- ============================================================
-- PASO B-0 — DIAGNÓSTICO PRE-MIGRACIÓN (solo lectura, seguro)
-- Guardar los resultados: se usan para verificar post-migración.
-- ============================================================

-- B-0-A. Policies actuales por tabla
-- ACCIÓN: guardar este output completo antes de correr B-5.
-- CRÍTICO: verificar la columna "permissive".
--   Si TODAS las filas muestran permissive = 'YES' → no hay RESTRICTIVE policies,
--   el patrón name-agnostic es completamente seguro.
--   Si alguna fila muestra permissive = 'NO' → reportarlo antes de continuar.
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- B-0-B. Constraint actual de role en profiles
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
  AND contype = 'c'
  AND conname LIKE '%role%';
-- Esperado actual: CHECK (role IN ('admin', 'driver', 'store'))

-- B-0-C. Columnas Fase 1 en orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN ('client_event_id', 'client_timestamp', 'tracking_token')
ORDER BY column_name;
-- 0 filas → todos ausentes, B-6 es seguro.
-- Filas presentes → ADD COLUMN IF NOT EXISTS los saltea.

-- B-0-D. Columnas Fase 1 en companies y profiles
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'companies' AND column_name IN (
      'legal_name','commercial_name','phone','email',
      'billing_email','address','logo_url','commercial_comment',
      'updated_at','state'
    ))
    OR (table_name = 'profiles' AND column_name IN (
      'email','state','suspended_at','suspended_reason','last_login'
    ))
  )
ORDER BY table_name, column_name;
-- 0 filas → todas ausentes, B-3 y B-4 son seguros.

-- B-0-E. [COLISIÓN] Verificar is_active en companies (puede solapar con state)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'companies'
  AND column_name = 'is_active';
-- Si existe: ver nota de COLISIÓN en PASO B-3.


-- ============================================================
-- PASO B-1 — FUNCIÓN is_super_admin()
-- [INFO] CREATE OR REPLACE → idempotente.
--
-- SECURITY DEFINER: bypasea RLS al leer profiles, igual que
-- get_my_company_id() y get_my_role(). Sin esto la policy de
-- profiles llamaría a is_super_admin() que lee profiles
-- → recursión circular. Con SECURITY DEFINER la lectura es directa.
--
-- EXISTS retorna FALSE (no NULL) cuando el usuario no tiene perfil,
-- que es el comportamiento seguro por defecto.
-- ============================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================
-- PASO B-2 — AMPLIAR profiles.role CHECK
-- [RIESGO-ALTO] DROP + ADD CONSTRAINT escanea TODAS las filas.
--
-- Seguro si ninguna fila tiene role = 'super_admin' (no puede existir:
-- el CHECK anterior lo rechazaría). El riesgo real es valores
-- completamente inesperados fuera de ('admin','driver','store').
-- Verificar: SELECT DISTINCT role FROM profiles;
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'store', 'driver'));


-- ============================================================
-- PASO B-3 — AMPLIAR companies
-- [INFO] ADD COLUMN IF NOT EXISTS → idempotente en todas las líneas.
-- Todas nullable → seguro con filas existentes.
--
-- [COLISIÓN] companies ya tiene is_active BOOLEAN.
--   El nuevo campo state TEXT ('active','suspended','inactive') cubre
--   el mismo concepto con más granularidad.
--   Fase 1: ambas columnas coexisten. El backend debe escribir ambas
--   de forma consistente hasta que se deprece is_active en una
--   migración posterior.
--   No se dropea is_active aquí para no romper código existente.
--
-- updated_at: se agrega con DEFAULT NOW() y un trigger para
-- mantenerse actualizado en cada UPDATE.
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS legal_name          TEXT,
  ADD COLUMN IF NOT EXISTS commercial_name     TEXT,
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS email               TEXT,
  ADD COLUMN IF NOT EXISTS billing_email       TEXT,
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  ADD COLUMN IF NOT EXISTS commercial_comment  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS state               TEXT
    CHECK (state IN ('active', 'suspended', 'inactive'));

-- Trigger para updated_at automático en companies
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Backfill state desde is_active para filas existentes
-- Solo actualiza donde state es NULL (primera ejecución).
UPDATE companies
SET state = CASE WHEN is_active = TRUE THEN 'active' ELSE 'inactive' END
WHERE state IS NULL;


-- ============================================================
-- PASO B-4 — AMPLIAR profiles
-- [INFO] ADD COLUMN IF NOT EXISTS → idempotente.
-- Todas nullable → seguro con perfiles existentes.
--
-- email: el email de auth.users no se copia automáticamente a profiles;
--   este campo permite acceso directo desde la tabla sin join a auth.
-- state: estado operativo del perfil ('active','suspended').
--   Coexiste con esta_bloqueado (bloqueo por intentos de lote).
--   Son conceptos distintos: state es suspensión admin; esta_bloqueado
--   es bloqueo automático por validación de código.
-- last_login: timestamp del último login exitoso.
--   Nombre sin sufijo _at para alinear al plan final.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS state            TEXT
    CHECK (state IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_login       TIMESTAMPTZ;

-- Backfill state: perfiles existentes activos por defecto
UPDATE profiles
SET state = 'active'
WHERE state IS NULL;


-- ============================================================
-- PASO B-5 — RLS: DROP name-agnostic + RECREAR con is_super_admin()
-- ============================================================
-- Cada sub-paso es un DO $$ autocontenido:
--   - DROP itera pg_policies (nombres reales del entorno)
--   - CREATE usa los nombres canónicos nuevos de Fase 1
--   - Todo en una sola transacción → rollback automático si falla
--
-- Bypass: is_super_admin() OR <condición existente>
-- El OR cortocircuita: si is_super_admin() = TRUE, el resto no evalúa.
-- ============================================================

-- ── B-5-A: companies ─────────────────────────────────────────
-- Admin: SELECT y UPDATE propios.
-- INSERT y DELETE reservados a super_admin (nadie más crea/borra empresas).
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON companies', pol.policyname);
  END LOOP;

  CREATE POLICY "companies_select" ON companies
    FOR SELECT USING (
      is_super_admin() OR id = get_my_company_id()
    );

  CREATE POLICY "companies_insert" ON companies
    FOR INSERT WITH CHECK (is_super_admin());

  CREATE POLICY "companies_update" ON companies
    FOR UPDATE
    USING     (is_super_admin() OR id = get_my_company_id())
    WITH CHECK(is_super_admin() OR id = get_my_company_id());

  CREATE POLICY "companies_delete" ON companies
    FOR DELETE USING (is_super_admin());
END $$;

-- ── B-5-B: stores ─────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stores'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON stores', pol.policyname);
  END LOOP;

  CREATE POLICY "stores_all" ON stores
    FOR ALL
    USING     (is_super_admin() OR company_id = get_my_company_id())
    WITH CHECK(is_super_admin() OR company_id = get_my_company_id());
END $$;

-- ── B-5-C: profiles ───────────────────────────────────────────
-- is_super_admin() es SECURITY DEFINER → no hay recursión.
-- super_admin ve todos los perfiles de todas las empresas.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
  END LOOP;

  CREATE POLICY "profiles_all" ON profiles
    FOR ALL
    USING     (is_super_admin() OR company_id = get_my_company_id())
    WITH CHECK(is_super_admin() OR company_id = get_my_company_id());
END $$;

-- ── B-5-D: vehicles ───────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON vehicles', pol.policyname);
  END LOOP;

  CREATE POLICY "vehicles_all" ON vehicles
    FOR ALL
    USING     (is_super_admin() OR company_id = get_my_company_id())
    WITH CHECK(is_super_admin() OR company_id = get_my_company_id());
END $$;

-- ── B-5-E: drivers ────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drivers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON drivers', pol.policyname);
  END LOOP;

  CREATE POLICY "drivers_all" ON drivers
    FOR ALL
    USING     (is_super_admin() OR company_id = get_my_company_id())
    WITH CHECK(is_super_admin() OR company_id = get_my_company_id());
END $$;

-- ── B-5-F: trips ──────────────────────────────────────────────
-- Admin y store: todos los viajes de la empresa.
-- Driver: solo los viajes donde es el conductor asignado.
-- super_admin: bypass total.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trips'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON trips', pol.policyname);
  END LOOP;

  CREATE POLICY "trips_all" ON trips
    FOR ALL
    USING (
      is_super_admin()
      OR (
        company_id = get_my_company_id() AND (
          get_my_role() IN ('admin', 'store')
          OR driver_id IN (
            SELECT id FROM drivers WHERE profile_id = auth.uid()
          )
        )
      )
    )
    WITH CHECK (
      is_super_admin() OR company_id = get_my_company_id()
    );
END $$;

-- ── B-5-G: locations ──────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'locations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON locations', pol.policyname);
  END LOOP;

  CREATE POLICY "locations_all" ON locations
    FOR ALL
    USING (
      is_super_admin()
      OR vehicle_id IN (
        SELECT id FROM vehicles WHERE company_id = get_my_company_id()
      )
    )
    WITH CHECK (
      is_super_admin()
      OR vehicle_id IN (
        SELECT id FROM vehicles WHERE company_id = get_my_company_id()
      )
    );
END $$;

-- ── B-5-H: maintenance ────────────────────────────────────────
-- Solo admin (o super_admin) puede acceder.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'maintenance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON maintenance', pol.policyname);
  END LOOP;

  CREATE POLICY "maintenance_all" ON maintenance
    FOR ALL
    USING (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    )
    WITH CHECK (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );
END $$;

-- ── B-5-I: weight_presets ─────────────────────────────────────
-- Granulares: todos los roles leen; solo admin (o super_admin) escribe.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weight_presets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON weight_presets', pol.policyname);
  END LOOP;

  CREATE POLICY "weight_presets_select" ON weight_presets
    FOR SELECT USING (
      is_super_admin() OR company_id = get_my_company_id()
    );

  CREATE POLICY "weight_presets_insert" ON weight_presets
    FOR INSERT WITH CHECK (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );

  CREATE POLICY "weight_presets_update" ON weight_presets
    FOR UPDATE
    USING (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );

  CREATE POLICY "weight_presets_delete" ON weight_presets
    FOR DELETE USING (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );
END $$;

-- ── B-5-J: bultos ─────────────────────────────────────────────
-- Todos los roles de la empresa leen (rider valida código).
-- Admin (o super_admin) inserta y borra.
-- Empresa completa actualiza (rider actualiza estado en ruta).
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bultos'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bultos', pol.policyname);
  END LOOP;

  CREATE POLICY "bultos_select" ON bultos
    FOR SELECT USING (
      is_super_admin() OR company_id = get_my_company_id()
    );

  CREATE POLICY "bultos_insert" ON bultos
    FOR INSERT WITH CHECK (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );

  CREATE POLICY "bultos_update" ON bultos
    FOR UPDATE
    USING     (is_super_admin() OR company_id = get_my_company_id())
    WITH CHECK(is_super_admin() OR company_id = get_my_company_id());

  CREATE POLICY "bultos_delete" ON bultos
    FOR DELETE USING (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );
END $$;

-- ── B-5-K: orders ─────────────────────────────────────────────
-- Admin y driver: todos los pedidos de la empresa.
-- store: solo los pedidos de su tienda.
-- super_admin: acceso total.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON orders', pol.policyname);
  END LOOP;

  CREATE POLICY "orders_select" ON orders
    FOR SELECT USING (
      is_super_admin()
      OR (
        company_id = get_my_company_id() AND (
          get_my_role() IN ('admin', 'driver')
          OR (get_my_role() = 'store' AND store_id = get_my_store_id())
        )
      )
    );

  CREATE POLICY "orders_insert" ON orders
    FOR INSERT WITH CHECK (
      is_super_admin()
      OR (
        company_id = get_my_company_id()
        AND (
          get_my_role() = 'admin'
          OR (get_my_role() = 'store' AND store_id = get_my_store_id())
        )
      )
    );

  CREATE POLICY "orders_update" ON orders
    FOR UPDATE
    USING (
      is_super_admin()
      OR (
        company_id = get_my_company_id() AND (
          get_my_role() IN ('admin', 'driver')
          OR (get_my_role() = 'store' AND store_id = get_my_store_id())
        )
      )
    )
    WITH CHECK (
      is_super_admin()
      OR (
        company_id = get_my_company_id() AND (
          get_my_role() IN ('admin', 'driver')
          OR (get_my_role() = 'store' AND store_id = get_my_store_id())
        )
      )
    );

  CREATE POLICY "orders_delete" ON orders
    FOR DELETE USING (
      is_super_admin()
      OR (company_id = get_my_company_id() AND get_my_role() = 'admin')
    );
END $$;

-- ── B-5-L: order_items ────────────────────────────────────────
-- Acceso vía orden padre: hereda aislamiento de company_id.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON order_items', pol.policyname);
  END LOOP;

  CREATE POLICY "order_items_all" ON order_items
    FOR ALL
    USING (
      is_super_admin()
      OR order_id IN (
        SELECT id FROM orders WHERE company_id = get_my_company_id()
      )
    )
    WITH CHECK (
      is_super_admin()
      OR order_id IN (
        SELECT id FROM orders WHERE company_id = get_my_company_id()
      )
    );
END $$;

-- ── B-5-M: accesos_lote ───────────────────────────────────────
-- Acceso vía profile_id → company_id.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accesos_lote'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON accesos_lote', pol.policyname);
  END LOOP;

  CREATE POLICY "accesos_lote_all" ON accesos_lote
    FOR ALL
    USING (
      is_super_admin()
      OR profile_id IN (
        SELECT id FROM profiles WHERE company_id = get_my_company_id()
      )
    )
    WITH CHECK (
      is_super_admin()
      OR profile_id IN (
        SELECT id FROM profiles WHERE company_id = get_my_company_id()
      )
    );
END $$;


-- ============================================================
-- PASO B-6 — orders: client_event_id, client_timestamp, tracking_token
-- Orden obligatorio: agregar → backfill → NOT NULL → UNIQUE → índice.
-- ============================================================

-- B-6-A. [INFO] Agregar columnas como nullable (idempotente)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_event_id  TEXT,
  ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_token   TEXT;

-- B-6-B. [RIESGO-MEDIO] Backfill tracking_token en órdenes existentes
-- gen_random_uuid() disponible en Supabase (PostgreSQL 14+, sin pgcrypto).
-- replace() elimina guiones → token de 32 chars hex, URL-safe.
-- No hace nada si orders está vacía.
UPDATE orders
SET tracking_token = replace(gen_random_uuid()::text, '-', '')
WHERE tracking_token IS NULL;

-- Verificar antes de continuar con B-6-C:
--   SELECT COUNT(*) FROM orders WHERE tracking_token IS NULL;
-- Debe devolver 0.

-- B-6-C. [RIESGO-ALTO] NOT NULL en tracking_token
-- Fallará si alguna fila tiene tracking_token IS NULL.
-- Solo correr después de confirmar que B-6-B devuelve 0 filas sin token.
ALTER TABLE orders ALTER COLUMN tracking_token SET NOT NULL;

-- B-6-D. [INFO] UNIQUE constraint en tracking_token (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_tracking_token_unique'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_tracking_token_unique UNIQUE (tracking_token);
  END IF;
END $$;

-- B-6-E. [INFO] Índice para client_event_id — deduplicación de eventos (idempotente)
CREATE INDEX IF NOT EXISTS idx_orders_client_event_id
  ON orders (client_event_id)
  WHERE client_event_id IS NOT NULL;


-- ============================================================
-- PASO B-7 — VALIDACIÓN FINAL (solo lectura)
-- Comparar contra resultados de B-0.
-- ============================================================

-- B-7-A. Función is_super_admin disponible
SELECT is_super_admin();
-- FALSE para usuario sin rol super_admin o sin perfil en DB.

-- B-7-B. Constraint de role actualizado
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_role_check';
-- Esperado: CHECK (role IN ('super_admin', 'admin', 'store', 'driver'))

-- B-7-C. Columnas nuevas en companies
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'companies'
  AND column_name IN (
    'legal_name','commercial_name','phone','email',
    'billing_email','address','logo_url','commercial_comment',
    'updated_at','state'
  )
ORDER BY column_name;
-- Esperado: 10 filas.

-- B-7-D. Columnas nuevas en profiles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('email','state','suspended_at','suspended_reason','last_login')
ORDER BY column_name;
-- Esperado: 5 filas.

-- B-7-E. Columnas nuevas en orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
  AND column_name IN ('client_event_id', 'client_timestamp', 'tracking_token')
ORDER BY column_name;
-- Esperado: 3 filas. tracking_token → is_nullable = 'NO'.

-- B-7-F. Policies por tabla (comparar con B-0-A)
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Las policies viejas deben haber desaparecido.
-- Patrón esperado de nombres:
--   companies: companies_select / companies_insert / companies_update / companies_delete
--   stores, profiles, vehicles, drivers: *_all
--   trips, locations, maintenance: *_all
--   weight_presets: weight_presets_select/insert/update/delete
--   bultos: bultos_select/insert/update/delete
--   orders: orders_select/insert/update/delete
--   order_items, accesos_lote: *_all

-- B-7-G. Trigger updated_at en companies
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'companies'
  AND trigger_name = 'trg_companies_updated_at';
-- Esperado: 1 fila, event_manipulation = UPDATE, action_timing = BEFORE.

-- B-7-H. UNIQUE constraint y NOT NULL en tracking_token
SELECT conname FROM pg_constraint
WHERE conrelid = 'orders'::regclass
  AND conname = 'orders_tracking_token_unique';
SELECT COUNT(*) AS ordenes_sin_token FROM orders WHERE tracking_token IS NULL;
-- Esperado: 1 fila / 0.

-- B-7-I. Backfill de state en companies y profiles
SELECT state, COUNT(*) FROM companies GROUP BY state;
SELECT state, COUNT(*) FROM profiles  GROUP BY state;
-- companies: 'active' o 'inactive' según is_active original. Sin NULLs.
-- profiles: 'active' para todos los existentes. Sin NULLs.


-- ============================================================
-- RIESGOS ESPECIALES DEL PATRÓN NAME-AGNOSTIC
-- ============================================================
--
-- [R1] POLICIES RESTRICTIVE (permissive = 'NO')
--      Si B-0-A muestra alguna policy con permissive = 'NO',
--      el DROP la elimina. Las nuevas son todas PERMISSIVE.
--      Si esa policy era intencional, recrearla manualmente después de B-5.
--      FleetTrack no usa RESTRICTIVE policies → riesgo bajo,
--      pero confirmar con B-0-A antes de ejecutar.
--
-- [R2] VENTANA SIN RLS
--      Mitigado: DROP y CREATE en el mismo DO $$ (una sola transacción).
--      No hay punto expuesto entre ambos.
--
-- [R3] RECURSIÓN EN POLICIES DE profiles
--      is_super_admin() es SECURITY DEFINER → no hay recursión.
--
-- [R4] WORKAROUND company_id PARA super_admin
--      Documentado en el encabezado. No es el modelo objetivo.
--      Acción requerida al crear primer super_admin:
--        INSERT INTO companies (name, plan, state) VALUES ('Platform', 'enterprise', 'active');
--        -- Guardar el UUID devuelto y usarlo como company_id del perfil super_admin.
--
-- [R5] COLISIÓN companies.is_active vs companies.state
--      El backfill de B-3 convierte is_active → state para filas existentes.
--      El backend debe mantener ambas en sincronía hasta deprecar is_active.
--      No se dropea is_active en Fase 1 para no romper código existente.
--
-- ============================================================
-- FIN: migration_b_fase1.sql
-- ============================================================
