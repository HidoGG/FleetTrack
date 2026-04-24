# FleetTrack - Estado Tecnico Vivo
> Memoria tecnica viva. Protocolo operativo vigente: `AGENTS.md` v2.2.

## [ST] Estado actual (2026-04-22)
- `Fase 1` cerrada funcionalmente en `codex/superadmin-ui`.
- `Fase 2` queda cerrada oficialmente sobre `ubicaciones operativas generales` y `paneles administrativos iniciales`.
- Backend operativo con Express + Socket.io + Supabase JS.
- Frontend operativo con panel admin (`/dashboard`, `/locations`, `/vehicles`, `/drivers`, `/trips`, `/bultos`, `/super-admin`) y portal tienda (`/store/*`).
- Mobile operativo sobre la base funcional actual.
- `/locations` ya es la superficie admin canonica para CRUD de ubicaciones.
- `stores` sigue siendo la base tecnica actual de ubicaciones operativas.
- Pedidos, auth/sesion, profiles y parte de `/super-admin` ya conviven con `location_id <-> store_id`.
- La base del contrato canonico ya esta operativa en backend: helpers compartidos, responses normalizadas con `location_id`, compatibilidad de entrada `store_id/location_id` y smokes ajustados para validar ambos caminos.
- Frontend ya consume `location_id` como referencia preferida y encapsula el fallback `store_id` solo como compatibilidad temporal.
- Realtime ya quedo endurecido con handshake autenticado, rooms server-side por `company` / `location` y clientes web/mobile tokenizados.
- `auth`, `orders` y `stores` ya evitan bleed de sesion compartida en el frente cubierto por aislamiento multi-tenant mediante lookup de perfil por admin client y cliente Supabase request-scoped.
- `weight_presets` ya tambien usa cliente request-scoped en superficies autenticadas.
- `/map` ya quedo cubierto con authz dedicada: lectura de ultima ubicacion tenant-bound, publicacion GPS ownership-bound y smoke reusable API + socket contra spoofing y fuga cross-tenant.
- `FT-F3-RBAC-MAP-001` queda cerrado: `map_access` via backend, capacidades sincronizadas en frontend, gating server-side de `/vehicles`, `cash-by-vehicle`, `active-orders` y bloqueo validado en UI/URL/backend para perfiles `store`.
- `FT-F3-CLEAN-CONTRACT-001` inicia la normalizacion formal del contrato `store_id -> location_id`: `location_id` pasa a ser el estandar interno y `store_id` queda solo como alias legacy de compatibilidad.
- `/bultos` opera pedidos con ubicaciones canonicas y ya no funciona como CRUD paralelo de ubicaciones.
- `/drivers` y `/vehicles` ya tienen panel inicial operativo con smoke real reusable.
- `driver_nearby` ya no recorre todos los pedidos aceptados de la empresa: el path realtime queda acotado a conductor asignado -> bultos activos del conductor -> pedidos aceptados de esos bultos -> stores batcheados, dejando el N+1 de sockets bajo control en el frente actual.

## [DEC] Decisiones vigentes
- `AGENTS.md` v2.2 es el estandar operativo transversal; `CLAUDE.md` manda si hay conflicto de proceso.
- `Plan.md` refleja roadmap y estado; `MEMORY.md` guarda decisiones tecnicas y glosario; `BRANCH_CODEX_SUPERADMIN_UI.md` guarda contexto operativo de rama.
- `location_id` es el campo canonico semantico hacia adelante; `store_id` sigue solo como compatibilidad temporal mientras dure la migracion.
- En codigo nuevo o tocado, variables, comentarios, mensajes y payloads deben hablar en `location_id` / `ubicacion` / `Punto de Despacho`; `store_id` queda reservado a compatibilidad de persistencia o consumidores legacy.
- La compatibilidad temporal debe probarse explicitamente: endpoints y smokes del frente operativo deben aceptar `store_id` legacy y `location_id` canonico mientras dure la deprecacion.
- `/locations` es la unica superficie canonica de alta/edicion/baja de ubicaciones.
- `/bultos` integra ubicaciones y pedidos; no debe reabrir CRUD de ubicaciones.
- `Zero-Trust Client`: no confiar en `company_id`, `store_id` o `location_id` enviados por cliente para authz; resolver siempre via RLS o server-side.
- En endpoints multiusuario con RLS, usar cliente Supabase request-scoped atado al bearer token; no reutilizar `supabase` anon compartido para queries de request.
- Para publicacion GPS, `company_id` no alcanza: el backend debe exigir ownership del vehiculo via `drivers.profile_id -> assigned_vehicle_id` y, si existe, consistencia con `trip_id`.
- Eventos tenant-scoped no deben salir por broadcast global si requieren aislamiento.
- El laboratorio RBAC de `/map` arranca con capacidades server-side y helper extensible (`canViewCompanyMap`) en lugar de hardcodear permisos por pantalla.
- `store` no debe ver flota ni stream company-wide del mapa solo por pertenecer a la empresa; el acceso a `/map` se autoriza por capability, no por rol asumido en cliente.
- Los bloques se cierran con cambios chicos pero completos: implementacion + validacion real + cleanup QA + update de docs si corresponde.
- Para validar localmente en este entorno, `npm start` del backend es mas confiable que `npm run dev`.
- La salida de `Fase 2` exige: contrato canonico operativo, paneles iniciales estables, realtime tenant-safe sin N+1 obvio y docs vivas sincronizadas.

## [GLO] Glosario vivo
- `trazabilidad de datos`: termino preferido frente a `reportabilidad` cuando hay tradeoff funcional o tecnico.
- `operaciones de campo`: termino operativo preferido para flujos territoriales y ejecucion en terreno.
- `servicios de pozo`: termino preferido cuando el contexto funcional corresponda a ese dominio; evitar caer por defecto en wording informal o ambiguo.
- `ubicacion`: termino canonico para logistica y operacion; usar `location_id` como referencia tecnica semantica hacia adelante.
- `tenant / company`: scope de aislamiento multiempresa; no mezclar datos ni eventos entre empresas.

## [DEP] Dependencias criticas
- Supabase real con migraciones ya aplicadas para bloque comercial y ubicaciones operativas.
- Usuario `super_admin` real activo para QA y smokes.
- Scripts E2E de `tests/e2e/` como evidencia funcional reusable.
- `frontend/package.json` todavia usa `tsc && vite build`; falta estabilizar ese golden path con `tsconfig` o ajuste de script.

## [BRK] Riesgos abiertos
- Contrato dual `store_id / location_id` todavia vive en persistencia y compatibilidad temporal, pero ya no bloquea salida de `Fase 2` porque el contrato canonico y la cobertura dual quedaron formalizados.
- El patron request-scoped ya cubre las superficies autenticadas criticas del frente operativo actual; queda como auditoria continua para nuevos controladores, no como blocker de `Fase 2`.
- `FT-F3-RBAC-MAP-001` deja resuelto el RBAC minimo de `/map` para `admin/super_admin` vs `store`, pero queda como residual extender capabilities persistidas y modelado fino para futuros roles intra-tenant.
- Patron realtime ya no tiene N+1 evidente en `driver_nearby` dentro del frente actual; queda como residual medir bajo carga real p95/p99 y observabilidad mas fina.
- Pipeline local/CI todavia no esta estabilizado en torno a build/test reproducibles.
- La validacion manual final de UX `store -> sin mapa / bloqueo por URL` ya se ejecuto en verde; el residual ahora pasa a evidencia automatizada adicional, no a comportamiento pendiente.
- El contrato dual `store_id / location_id` sigue existiendo en persistencia y algunos consumidores legacy; el frente operativo actual ya prioriza `location_id`, pero la deprecacion total todavia requiere auditoria sobre mobile y superficies fuera del bloque actual.
- Riesgo de deriva documental si no se actualizan `Plan.md`, `MEMORY.md` y nota de rama al cerrar bloques.

## [NEXT]
1. Consolidar smoke reusable de acceso al mapa por capability para complementar el cierre ya validado manualmente de `FT-F3-RBAC-MAP-001`.
2. Continuar la deprecacion formal `store_id -> location_id` sobre mobile y controladores residuales hasta dejar el alias legacy encapsulado.
3. Extender el modelo RBAC del mapa a capabilities mas finas y futuros roles intra-tenant sin romper el helper base.
4. Medir p95/p99 y costo por evento del bloque realtime con carga controlada.
5. Estabilizar golden path de build/test.
6. Mantener glosario y decisiones sincronizados con el protocolo `v2.2`.

## [CHK] Checklist de salida de Fase 2
- `location_id` queda formalizado como campo canonico y `store_id` como compatibilidad temporal documentada.
- Paneles operativos iniciales (`/locations`, `/bultos`, `/drivers`, `/vehicles`, portal tienda) quedan operativos y validados.
- Realtime del frente operativo actual queda tenant-safe y con `driver_nearby` sin N+1 obvio por evento.
- Smokes criticos del cierre ejecutados en verde: `bultos_locations_canonical`, `store_realtime_bridge`, `tenant_isolation`, `store_driver_nearby`, `map_authz`.
- `Plan.md`, `MEMORY.md` y nota de rama quedan sincronizados con la salida oficial de la fase.
