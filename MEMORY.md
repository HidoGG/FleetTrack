# FleetTrack — Estado Técnico Vivo
> Protocolo v2 — Código es fuente de verdad

## [ST] Estado actual (2026-04-13)
- **Backend**: Express + Socket.io corriendo. Rutas activas: auth, vehicles, drivers, trips, bultos, orders, stores, weightPresets
- **Frontend**: Admin portal funcional (dashboard, map, vehicles, drivers, trips, bultos) + Store portal (/store/*)
- **Mobile**: 10 pantallas implementadas (login, home, trip, history, lote, main, notifications, profile, route, vehicleSelect). `locationService.js` existe.
- **DB (schema.sql)**: companies, profiles, vehicles, drivers, trips, locations, maintenance + RLS definidos
- **DB (migration_v3_3_1.sql)**: weight_presets, order_items, columnas `is_cod`/`merchandise_value` en orders — **pendiente aplicar en Supabase**

## [DEC] Decisiones vigentes
- Proyecto expandido de fleet tracking a delivery management: orders (COD), stores, bultos, weight_presets
- Store portal con auth separada (StoreGuard / StoreLayout) en ruta `/store/*`
- Socket emite `store:{id}:driver_nearby` cuando vehículo < 500m de tienda con pedido ACCEPTED (cooldown 2min, haversine)
- Frontend llama solo al backend API (nunca Supabase directo, excepto auth via `supabase.js`)
- JS (no TS) en backend y frontend — decisión de facto del código actual

## [DEP] Dependencias críticas
- `migration_v3_3_1.sql` depende de tabla `orders` ya existente en Supabase (no está en schema.sql del repo)
- `locationService.js` en mobile → Socket `location:update` → backend → `vehicle:{id}` + `store:{id}:driver_nearby`
- `StoreGuard` depende de rol store en auth — verificar que el check de rol esté alineado con `profiles.role`

## [BRK] Riesgos
- Tablas `orders`, `stores`, `bultos` **no tienen SQL en el repo** — solo existen si fueron creadas manualmente en Supabase
- `.env` real no confirmado — credenciales de Supabase pueden estar vacías aún
- `VITE_GOOGLE_MAPS_API_KEY` ausente en frontend .env — Places API cae a input libre como fallback

## [NEXT]
1. Aplicar `migration_v3_3_1.sql` en Supabase Dashboard
2. Agregar SQL de tablas `orders`, `stores`, `bultos` al repo
3. Completar `.env` con credenciales reales de Supabase
