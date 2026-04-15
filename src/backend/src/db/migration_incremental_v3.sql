-- ============================================================
-- FleetTrack — Migración Incremental v3 (revisado 2026-04-13)
-- Para llevar una DB existente al estado de full_reconstruction_v3.sql
-- SIN PÉRDIDA DE DATOS
-- ============================================================
-- EJECUCIÓN:
--   Supabase Dashboard → SQL Editor
--   Ejecutar PASO por PASO, nunca todo junto.
--   Leer los comentarios [RIESGO] antes de cada bloque.
--
-- LEYENDA:
--   [RIESGO-ALTO]  Puede fallar con datos reales. Validar antes.
--   [RIESGO-MEDIO] Puede fallar si el schema previo difiere.
--   [INFO]         Operación segura / idempotente.
--   [VALIDAR]      Query de diagnóstico para correr antes del paso.
--   [FIX]          Si falla, qué hacer.
-- ============================================================


-- ============================================================
-- PASO 0 — DIAGNÓSTICO (solo lectura, seguro sobre base parcial)
-- Correr este bloque completo ANTES de cualquier cambio.
-- Guarda los resultados: son la base para decidir en cada paso.
--
-- Las queries que tocan tablas opcionales (orders, bultos) usan
-- to_regclass() o information_schema para no fallar si no existen.
-- Los resultados de 0-D y 0-E aparecen en la pestaña "Messages".
-- ============================================================

-- 0-A. Tablas existentes en el schema public
-- Referencia para saber qué ya está y qué va a crear la migración.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 0-B. Columnas actuales de profiles (siempre existe)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 0-C. Roles en profiles — seguro, profiles siempre existe
-- [Decisión PASO 3] Si hay valores fuera de ('admin','driver','store') → corregir antes
SELECT role, COUNT(*) AS total
FROM profiles
GROUP BY role
ORDER BY role;

-- 0-D. Status en orders — seguro aunque orders no exista
-- [Decisión PASO 5c] Todos los valores deben estar en el conjunto esperado.
-- Resultado aparece en pestaña "Messages" de Supabase SQL Editor.
DO $$
DECLARE
  rec          RECORD;
  tiene_datos  BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE '0-D: orders NO EXISTE → se creará en PASO 5 (sin riesgo)';
  ELSE
    FOR rec IN
      SELECT status, COUNT(*) AS n
      FROM orders
      GROUP BY status
      ORDER BY status
    LOOP
      tiene_datos := TRUE;
      IF rec.status NOT IN ('PENDING','READY_FOR_PICKUP','ACCEPTED','IN_TRANSIT','DELIVERED','FAILED') THEN
        RAISE WARNING '0-D [PROBLEMA] orders.status=''%'' (% filas) — valor fuera del CHECK esperado', rec.status, rec.n;
      ELSE
        RAISE NOTICE '0-D [OK]      orders.status=''%'' (% filas)', rec.status, rec.n;
      END IF;
    END LOOP;
    IF NOT tiene_datos THEN
      RAISE NOTICE '0-D: orders existe pero está vacía — PASO 5c sin riesgo';
    END IF;
  END IF;
END $$;

-- 0-E. Duplicados en bultos — seguro aunque bultos no exista
-- [Decisión PASO 4c] Si hay DUPLICADOS, resolver antes de agregar el UNIQUE.
-- Resultado aparece en pestaña "Messages".
DO $$
DECLARE
  rec           RECORD;
  tiene_dupes   BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.bultos') IS NULL THEN
    RAISE NOTICE '0-E: bultos NO EXISTE → se creará en PASO 4 (sin riesgo)';
  ELSE
    FOR rec IN
      SELECT company_id, codigo_lote, COUNT(*) AS n
      FROM bultos
      GROUP BY company_id, codigo_lote
      HAVING COUNT(*) > 1
    LOOP
      tiene_dupes := TRUE;
      RAISE WARNING '0-E [PROBLEMA] company_id=% codigo_lote=''%'' aparece % veces', rec.company_id, rec.codigo_lote, rec.n;
    END LOOP;
    IF NOT tiene_dupes THEN
      RAISE NOTICE '0-E [OK] Sin duplicados en bultos — PASO 4c sin riesgo';
    ELSE
      RAISE WARNING '0-E: Hay duplicados. Resolver antes de ejecutar PASO 4c (ver instrucciones en ese paso)';
    END IF;
  END IF;
END $$;

-- 0-F. Columnas de orders — seguro aunque no exista (devuelve 0 filas)
-- Usá este resultado para decidir qué ADD COLUMN IF NOT EXISTS son necesarios en PASO 5b.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- 0-G. Columnas de bultos — seguro aunque no exista (devuelve 0 filas)
-- Usá este resultado para decidir qué ADD COLUMN IF NOT EXISTS son necesarios en PASO 4b.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bultos'
ORDER BY ordinal_position;

-- 0-H. Constraints existentes en tablas afectadas
-- Seguro: usa to_regclass para filtrar solo las tablas que existen.
SELECT conname, contype, conrelid::regclass AS tabla
FROM pg_constraint
WHERE conrelid IN (
  SELECT oid FROM pg_class
  WHERE relname IN ('profiles','orders','bultos','order_items','weight_presets')
    AND relnamespace = 'public'::regnamespace
)
AND contype IN ('c','u')   -- 'c'=CHECK, 'u'=UNIQUE
ORDER BY tabla, conname;

-- 0-I. Políticas RLS existentes
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 0-J. Tablas ya en supabase_realtime
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';


-- ============================================================
-- PASO 1 — TABLA stores
-- [INFO] Si ya existe, CREATE TABLE IF NOT EXISTS la saltea.
-- Si ya existe pero le faltan columnas, ver PASO 1b.
-- ============================================================

-- 1a. Crear si no existe
CREATE TABLE IF NOT EXISTS stores (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  address    TEXT,
  lat        NUMERIC(10, 7),
  lng        NUMERIC(10, 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1b. [RIESGO-MEDIO] Si la tabla ya existía con columnas distintas,
--     agregar las que falten. Omitir las que ya existen.
--     Verificar resultado del 0-A y 0-F antes de correr estas líneas.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lat        NUMERIC(10, 7);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lng        NUMERIC(10, 7);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 1c. [INFO] RLS — idempotente
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stores' AND policyname = 'stores_company_isolation'
  ) THEN
    CREATE POLICY "stores_company_isolation" ON stores
      FOR ALL USING (company_id = get_my_company_id());
  END IF;
END $$;

-- 1d. [INFO] Índice — idempotente
CREATE INDEX IF NOT EXISTS idx_stores_company ON stores (company_id);


-- ============================================================
-- PASO 2 — COLUMNAS NUEVAS EN profiles (parte 1)
-- Agregar store_id, intentos_fallidos, esta_bloqueado, ultimo_codigo_lote
-- NOTA: get_my_store_id() se crea en PASO 2d, DESPUÉS de agregar la columna.
-- ============================================================

-- 2a. [INFO] store_id: FK nullable → no afecta filas existentes
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- 2b. [INFO] Columnas con NOT NULL + DEFAULT → filas existentes reciben el default
--     PostgreSQL 11+ aplica esto sin reescribir la tabla (operación en metadata).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intentos_fallidos  INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esta_bloqueado     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultimo_codigo_lote TEXT;

-- 2c. [INFO] Índices — idempotentes
CREATE INDEX IF NOT EXISTS idx_profiles_store_id
  ON profiles (store_id) WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_blocked
  ON profiles (company_id, esta_bloqueado) WHERE esta_bloqueado = TRUE;

-- 2d. [INFO] get_my_store_id() creada AQUÍ, después de que store_id existe en profiles.
--     (Si se crea antes de agregar la columna, PostgreSQL falla al validar el cuerpo SQL.)
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================
-- PASO 3 — CHECK de rol en profiles
-- [RIESGO-ALTO] Escanea todos los perfiles para verificar el constraint.
-- Si hay algún valor de role fuera de ('admin','driver','store') → FALLA.
--
-- ANTES de correr: revisar resultado de 0-C.
-- Si hay valores inesperados → corregirlos primero:
--   UPDATE profiles SET role = 'driver' WHERE role NOT IN ('admin','driver','store');
--
-- [FIX si falla] No hay rollback automático. El constraint no se aplicó.
--   Corregir los datos y volver a correr este paso.
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'driver', 'store'));


-- ============================================================
-- PASO 4 — TABLA bultos
-- ============================================================

-- 4a. [INFO] Crear si no existe
CREATE TABLE IF NOT EXISTS bultos (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  codigo_lote              TEXT        NOT NULL,
  cantidad_esperada        INT         NOT NULL CHECK (cantidad_esperada > 0),
  clave_desbloqueo         TEXT        NOT NULL,
  descripcion              TEXT,
  estado                   TEXT        NOT NULL DEFAULT 'CREADO'
                             CHECK (estado IN ('CREADO', 'EN_RUTA', 'COMPLETADO')),
  active_driver_profile_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4b. [RIESGO-MEDIO] Si la tabla ya existía, agregar columnas que pueden faltar.
--     Las columnas NOT NULL con DEFAULT son seguras en PostgreSQL 11+.
--     Revisar resultado de 0-G antes de correr.
ALTER TABLE bultos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE bultos ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'CREADO';
ALTER TABLE bultos ADD COLUMN IF NOT EXISTS active_driver_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 4c. [RIESGO-ALTO] UNIQUE (company_id, codigo_lote)
--     Fallará si existen duplicados. Revisar resultado de 0-E primero.
--     Si hay duplicados: decidir cuál conservar y eliminar el resto antes de correr.
--     [FIX si falla] Resolver duplicados:
--       DELETE FROM bultos WHERE id IN (
--         SELECT id FROM (
--           SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, codigo_lote ORDER BY created_at DESC) AS rn
--           FROM bultos
--         ) t WHERE rn > 1
--       );
--     Luego volver a correr este bloque.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bultos_codigo_lote_company_unique'
  ) THEN
    ALTER TABLE bultos
      ADD CONSTRAINT bultos_codigo_lote_company_unique UNIQUE (company_id, codigo_lote);
  END IF;
END $$;

-- 4d. [INFO] RLS — idempotente
ALTER TABLE bultos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bultos' AND policyname = 'bultos_select') THEN
    CREATE POLICY "bultos_select" ON bultos
      FOR SELECT USING (company_id = get_my_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bultos' AND policyname = 'bultos_insert') THEN
    CREATE POLICY "bultos_insert" ON bultos
      FOR INSERT WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bultos' AND policyname = 'bultos_update') THEN
    CREATE POLICY "bultos_update" ON bultos
      FOR UPDATE USING (company_id = get_my_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bultos' AND policyname = 'bultos_delete') THEN
    CREATE POLICY "bultos_delete" ON bultos
      FOR DELETE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');
  END IF;
END $$;

-- 4e. [INFO] Índice — idempotente
CREATE INDEX IF NOT EXISTS idx_bultos_active_driver
  ON bultos (active_driver_profile_id, estado)
  WHERE active_driver_profile_id IS NOT NULL;


-- ============================================================
-- PASO 5 — TABLA orders (crear o completar)
-- ============================================================

-- 5a. [INFO] Crear si no existe
CREATE TABLE IF NOT EXISTS orders (
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
  is_cod            BOOLEAN     NOT NULL DEFAULT TRUE,
  payment_amount    NUMERIC(10, 2),
  merchandise_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  product_brand     TEXT,
  product_weight    TEXT,
  status            TEXT        NOT NULL DEFAULT 'PENDING',
  pod_photo_url     TEXT,
  invoice_photo_url TEXT,
  accepted_at       TIMESTAMPTZ,
  picked_up_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5b. [INFO] Si orders ya existía, agregar columnas faltantes.
--     NOT NULL + DEFAULT: seguro (PostgreSQL 11+, sin reescritura de tabla).
--     FK nullable: seguro (filas existentes quedan con NULL).
--     Revisar resultado de 0-F antes de correr.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_cod            BOOLEAN        NOT NULL DEFAULT TRUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchandise_value NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id          UUID           REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bulto_id          UUID           REFERENCES bultos(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_brand     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_weight    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pod_photo_url     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at      TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ;

-- 5c. [RIESGO-ALTO] CHECK de status
--     Fallará si hay filas con valores fuera del conjunto esperado.
--     También fallará si ya existe CUALQUIER constraint CHECK sobre status
--     (aunque sea anónimo o con nombre distinto).
--
--     ANTES de correr: revisar resultado de 0-D y 0-H.
--
--     Si hay valores inesperados en status:
--       SELECT DISTINCT status FROM orders;  → qué valores hay
--       Corregirlos antes:
--       UPDATE orders SET status = 'PENDING' WHERE status NOT IN
--         ('PENDING','READY_FOR_PICKUP','ACCEPTED','IN_TRANSIT','DELIVERED','FAILED');
--
--     Si ya hay un CHECK anónimo en status (visible en 0-H como contype='c'):
--       Hacer DROP de ese constraint por nombre primero:
--       ALTER TABLE orders DROP CONSTRAINT IF EXISTS <nombre_del_constraint>;
--
--     [FIX si falla] No hay rollback. Solo el CHECK no se aplicó.
--       Resolver datos y repetir.
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
  -- Verificar si ya existe algún CHECK sobre la columna status
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'orders'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
  ) INTO constraint_exists;

  IF NOT constraint_exists THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('PENDING','READY_FOR_PICKUP','ACCEPTED','IN_TRANSIT','DELIVERED','FAILED'));
  END IF;
END $$;

-- 5d. [INFO] RLS — idempotente
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_select') THEN
    CREATE POLICY "orders_select" ON orders
      FOR SELECT USING (
        company_id = get_my_company_id() AND (
          get_my_role() IN ('admin', 'driver')
          OR (get_my_role() = 'store' AND store_id = get_my_store_id())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_insert') THEN
    CREATE POLICY "orders_insert" ON orders
      FOR INSERT WITH CHECK (
        company_id = get_my_company_id() AND get_my_role() IN ('admin', 'store')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_update') THEN
    CREATE POLICY "orders_update" ON orders
      FOR UPDATE USING (
        company_id = get_my_company_id() AND get_my_role() IN ('admin', 'driver', 'store')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_delete') THEN
    CREATE POLICY "orders_delete" ON orders
      FOR DELETE USING (
        company_id = get_my_company_id() AND get_my_role() = 'admin'
      );
  END IF;
END $$;

-- 5e. [INFO] Índices — idempotentes
CREATE INDEX IF NOT EXISTS idx_orders_is_cod_status
  ON orders (company_id, is_cod, status)
  WHERE is_cod = TRUE AND status IN ('ACCEPTED', 'IN_TRANSIT');

CREATE INDEX IF NOT EXISTS idx_orders_company_status
  ON orders (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_bulto_id
  ON orders (bulto_id) WHERE bulto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_store_id
  ON orders (store_id) WHERE store_id IS NOT NULL;


-- ============================================================
-- PASO 6 — TABLA weight_presets
-- [INFO] Totalmente idempotente si migration_v3_3_1 ya fue aplicada.
-- ============================================================

CREATE TABLE IF NOT EXISTS weight_presets (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  weight_kg  NUMERIC(8, 3) NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE weight_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weight_presets' AND policyname = 'weight_presets_select') THEN
    CREATE POLICY "weight_presets_select" ON weight_presets
      FOR SELECT USING (company_id = get_my_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weight_presets' AND policyname = 'weight_presets_insert') THEN
    CREATE POLICY "weight_presets_insert" ON weight_presets
      FOR INSERT WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weight_presets' AND policyname = 'weight_presets_update') THEN
    CREATE POLICY "weight_presets_update" ON weight_presets
      FOR UPDATE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weight_presets' AND policyname = 'weight_presets_delete') THEN
    CREATE POLICY "weight_presets_delete" ON weight_presets
      FOR DELETE USING (company_id = get_my_company_id() AND get_my_role() = 'admin');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weight_presets_company
  ON weight_presets (company_id, active, sort_order);


-- ============================================================
-- PASO 7 — TABLA order_items
-- [INFO] Totalmente idempotente. Depende de orders (PASO 5) y
--        weight_presets (PASO 6). No correr antes que esos pasos.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  brand            TEXT,
  product          TEXT        NOT NULL,
  quantity         INT         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_preset_id UUID        REFERENCES weight_presets(id) ON DELETE SET NULL,
  weight_label     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'order_items_company_isolation') THEN
    CREATE POLICY "order_items_company_isolation" ON order_items
      FOR ALL USING (
        order_id IN (SELECT id FROM orders WHERE company_id = get_my_company_id())
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);


-- ============================================================
-- PASO 8 — TABLA accesos_lote
-- [INFO] Totalmente idempotente. Depende de profiles (ya existe).
-- ============================================================

CREATE TABLE IF NOT EXISTS accesos_lote (
  id                   BIGSERIAL   PRIMARY KEY,
  profile_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  codigo_lote          TEXT        NOT NULL,
  conteo_ingresado     INT         NOT NULL DEFAULT 0,
  conteo_esperado      INT         NOT NULL DEFAULT 0,
  tiene_diferencia     BOOLEAN     NOT NULL DEFAULT FALSE,
  bloqueado_por_codigo BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accesos_lote ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accesos_lote' AND policyname = 'accesos_lote_company_isolation') THEN
    CREATE POLICY "accesos_lote_company_isolation" ON accesos_lote
      FOR ALL USING (
        profile_id IN (SELECT id FROM profiles WHERE company_id = get_my_company_id())
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accesos_lote_profile
  ON accesos_lote (profile_id, created_at DESC);


-- ============================================================
-- PASO 9 — REALTIME
-- [RIESGO-MEDIO] ALTER PUBLICATION falla si la tabla ya está registrada.
--   El DO $$ la protege: si ya está, no hace nada.
--   Verificar estado actual con 0-J antes de correr.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  END IF;
END $$;


-- ============================================================
-- PASO 10 — VALIDACIÓN FINAL (solo lectura)
-- Correr estas queries para confirmar que todo quedó bien.
-- Comparar contra los resultados del PASO 0.
-- ============================================================

-- 10-A. Tablas actuales (deben aparecer las 13 esperadas)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Esperado: accesos_lote, bultos, companies, drivers, locations,
--           maintenance, order_items, orders, profiles, stores,
--           trips, vehicles, weight_presets

-- 10-B. Columnas de profiles (deben aparecer las nuevas)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
-- Esperado incluye: store_id, intentos_fallidos, esta_bloqueado, ultimo_codigo_lote

-- 10-C. Constraints en tablas críticas
SELECT conname, contype, conrelid::regclass AS tabla
FROM pg_constraint
WHERE conrelid::regclass::text IN ('profiles','orders','bultos','order_items','weight_presets')
  AND contype IN ('c','u')
ORDER BY tabla, conname;
-- Esperado: profiles_role_check, orders_status_check,
--           bultos_codigo_lote_company_unique, entre otros

-- 10-D. Políticas RLS (contar por tabla)
SELECT tablename, COUNT(*) AS num_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 10-E. Tablas en realtime
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
-- Esperado: locations, order_items, orders, trips

-- ============================================================
-- FIN: migration_incremental_v3.sql
-- ============================================================
