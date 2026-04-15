# Plan.md — Hoja de Ruta Viva de FleetTrack

> Documento operativo. Refleja el estado real del proyecto y los próximos pasos verdaderos.
> Si el código y este plan no coinciden, priorizar el código y corregir este archivo.

---

## Estado Actual
- Backend operativo con Express + Socket.io + Supabase JS.
- Rutas activas en backend: `auth`, `vehicles`, `drivers`, `trips`, `bultos`, `orders`, `stores`, `weightPresets`.
- Frontend operativo con panel admin (`dashboard`, `map`, `vehicles`, `drivers`, `trips`, `bultos`) y portal de tienda (`/store/*`).
- Mobile implementado: login, home, trip, history, lote, main, notifications, profile, route, vehicleSelect.
- `locationService.js` existe y emite tracking vía socket.
- **DB versionada en el repo:**
  - `schema.sql`: tablas base (companies, profiles, vehicles, drivers, trips, locations, maintenance) — estado inicial, NO refleja DB real actual
  - `migration_v3_3_1.sql`: weight_presets, order_items, is_cod/merchandise_value — PENDIENTE DE APLICAR
  - `migration_v3_3_2.sql`: store_id en profiles, rol 'store' — PENDIENTE DE APLICAR
  - `full_reconstruction_v3.sql`: fuente de verdad completa desde cero (13 tablas)
  - `migration_incremental_v3.sql`: migración incremental sin pérdida de datos
- **Tablas en Supabase real sin SQL versionado previo:** orders, stores, bultos (creadas manualmente)
- Brecha DB vs código: CERRADA en el repo; pendiente validar aplicación en Supabase real.

---

## Prioridades Activas

1. **Aplicar migración incremental en Supabase**
   - Ejecutar `migration_incremental_v3.sql` en Supabase Dashboard → SQL Editor
   - Orden: Pasos 0→10 del archivo
   - Validar contra checklist del Paso 10

2. **Confirmar .env real**
   - Variables necesarias para backend/frontend/mobile aún no confirmadas

3. **Consolidar consistencia multi-actor**
   - Verificar sincronía de estados pedidos/bultos entre backend, admin, store portal, mobile y sockets

4. **Mejorar robustez y manejo de errores**
   - Reforzar errores, estados vacíos, permisos y fallos de red en flujos críticos

5. **Agregar cobertura QA en flujos críticos**
   - Auth, tracking, pedidos, lotes, sincronía de estados, flujos multi-actor

---

## Pendientes por Área

### DB / Infra
- [ ] Aplicar `migration_incremental_v3.sql` en Supabase real
- [ ] Ejecutar validación del Paso 10 y confirmar resultado
- [ ] Confirmar `.env` real y variables necesarias
- [ ] Insertar `weight_presets` iniciales por empresa (ver comentario al final de `full_reconstruction_v3.sql`)

### Backend
- [ ] Verificar robustez de auth y aislamiento por rol/empresa post-migración
- [ ] Confirmar consistencia de eventos socket entre tienda, rider y admin
- [ ] Revisar shape de respuestas y coherencia de errores

### Frontend
- [ ] Revisar manejo de errores y estados `loading / error / empty`
- [ ] Validar visibilidad por rol en admin y store portal
- [ ] Confirmar consistencia UI con estados reales del backend

### Mobile
- [ ] Verificar tracking GPS, permisos y fallos de red
- [ ] Confirmar sincronía de estados con backend/admin/store
- [ ] Validar robustez del flujo de lote, ruta y entrega

### QA
- [ ] Pruebas para auth
- [ ] Pruebas para mapa y tracking
- [ ] Pruebas para flujo de pedidos/lotes
- [ ] Consistencia multi-actor antes que cobertura cosmética

---

## Riesgos Actuales
- `migration_incremental_v3.sql` aún no ejecutado en Supabase real → backend puede fallar en endpoints que usan tablas nuevas
- `.env` real y variables críticas sin confirmar
- Tablas `orders`, `stores`, `bultos` pueden tener datos reales que necesitan validación antes de aplicar constraints nuevos
- Manejo de errores no verificado de punta a punta

---

## Registro Breve
- **2026-04-10**: estructura inicial del proyecto y stack definidos
- **2026-04-10**: backend, frontend y mobile con base funcional creada
- **2026-04-13**: adopción del FleetTrack Agent Protocol v2
- **2026-04-13**: `CLAUDE.md` alineado al estado real y al nuevo protocolo
- **2026-04-13**: `MEMORY.md` consolidado como estado técnico vivo
- **2026-04-13**: `full_reconstruction_v3.sql` + `migration_incremental_v3.sql` generados — brecha DB vs código cerrada en el repo
