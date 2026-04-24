# Plan.md - Hoja de Ruta Viva de FleetTrack

> Documento operativo. Refleja el estado real del proyecto y los proximos pasos verdaderos.
> Si el codigo y este plan no coinciden, priorizar el codigo y corregir este archivo.

---

## Norte Actual
- Fuente funcional maestra: `Documento-Maestro-Funcional.md`
- Protocolo operativo vigente: `AGENTS.md` v2.2
- Frente activo real: `Fase 3 abierta sobre RBAC intra-tenant del mapa`
- Rama de trabajo mas avanzada para este frente: `codex/superadmin-ui`
- Objetivo inmediato: ejecutar `FT-F3-CLEAN-CONTRACT-001` para formalizar `location_id` como contrato canonico interno y dejar `store_id` solo como alias legacy
- Regla de foco: abrir `Fase 3` con bloques chicos y verificables, sin sobredisenar un RBAC global antes de validar el laboratorio del mapa

---

## Estado Actual
- Backend operativo con Express + Socket.io + Supabase JS.
- Frontend operativo con panel admin, portal tienda y capa inicial de `super_admin`.
- Mobile implementado sobre la base funcional existente.
- `Fase 1` ya quedo cerrada funcionalmente en esta rama.

### Fase 1 cerrada en esta rama
- `/super-admin` operativo y revalidado con smoke real.
- Empresas y perfiles cubiertos con CRUD operativo minimo.
- Bloque comercial de companies cerrado sin fallback legacy.
- Cleanup QA reusable ya probado en Supabase real.

### Estado vivo de Fase 2
- `stores` sigue siendo la base tecnica actual de ubicaciones operativas.
- `/locations` ya es la superficie admin canonica para CRUD de ubicaciones.
- Pedidos, auth/sesion, profiles y parte de `/super-admin` ya conviven con `location_id <-> store_id`.
- Realtime ya convive con eventos duales `store:{id}` y `location:{id}`.
- Socket.io ya exige handshake autenticado y rooms server-side por `company` / `location` para el frente operativo actual.
- `orders` y `stores` ya usan cliente Supabase request-scoped en requests autenticados cubiertos por aislamiento multi-tenant.
- `/map` ya quedo endurecido en authz para lectura/publicacion de GPS y sus superficies operativas usan ownership de vehiculo + request-scoped client en el frente cubierto.
- `/bultos` ya dejo de gestionar CRUD de ubicaciones y hoy opera pedidos sobre la superficie canonica.
- `/drivers` ya tiene CRUD inicial real y smoke reusable.
- `/vehicles` ya tiene CRUD inicial real, manejo de `status` / `odometer_km`, consulta liviana de ultima ubicacion y smoke reusable.
- `weight_presets` ya quedo alineado al patron request-scoped en superficie autenticada.
- `driver_nearby` ya no barre todos los pedidos aceptados de la empresa por evento: el path actual queda acotado a conductor asignado, bultos activos del conductor, pedidos aceptados de esos bultos y stores batcheados.

### Salida oficial de Fase 2
- `Fase 2` queda cerrada oficialmente en `codex/superadmin-ui`.
- El contrato canonico de ubicaciones queda operativo en backend, frontend, realtime y smokes.
- Los paneles administrativos iniciales exigidos por la fase ya quedaron funcionalmente cubiertos.
- El frente realtime operativo actual queda endurecido en aislamiento y sin N+1 obvio en `driver_nearby`.
- El residual que pasa fuera de la fase queda explicitado en vez de esconderse como “pendiente menor”.

### Lectura de las criticas recibidas
- `store_id / location_id`: critica valida y todavia abierta. El contrato dual existe de verdad y ya amerita plan de deprecacion formal.
- Duplicacion UI de ubicaciones: parcialmente resuelta. El riesgo bajo bastante en `/bultos`, pero falta cerrar la desduplicacion tecnica y de componentes.
- Build / pipeline: critica valida. La validacion real mejoro mucho, pero el golden path de tooling todavia no esta cerrado.
- Seguridad realtime por tenant/rol: critica valida y no estaba explicitada como bloque formal.
- Performance realtime: critica valida y tampoco estaba explicitada como bloque formal.
- Gobernanza documental: critica valida. `MEMORY.md` y notas de rama quedaron desfasados mas de una vez.

---

## Prioridades Activas

1. **Ejecutar residuals post-Fase 2**
   - deprecacion formal `store_id -> location_id`
   - RBAC fino intra-tenant para `/map` iniciado con `FT-F3-RBAC-MAP-001`
   - baseline p95/p99 y observabilidad realtime

2. **Estabilizar tooling y pipeline**
   - definir comandos golden path por paquete
   - corregir scripts de build/test para entorno limpio
   - dejar minima reproducibilidad local/CI sin falsos fallos de setup

3. **Mantener documentacion viva y consistente**
   - seguir `AGENTS.md` v2.2 como estandar operativo
   - `Plan.md` para roadmap y estado
   - `MEMORY.md` para decisiones tecnicas vigentes
   - `BRANCH_CODEX_SUPERADMIN_UI.md` para contexto de rama y ejecucion
   - update gate obligatorio al cerrar bloques

---

## Fase 3 - Operacion Avanzada

### FT-F3-RBAC-MAP-001 - Control de acceso fino y permisos internos
- [x] Definir capa de policy/capabilities server-side para `/map` con helper extensible `canViewCompanyMap`
- [x] Exponer `map_access` desde auth backend y sincronizarlo en `authStore`
- [x] Bloquear `/vehicles`, `GET /vehicles/:id`, `GET /vehicles/:id/location`, `cash-by-vehicle` y `active-orders` por capability de mapa
- [x] Evitar que sockets sin capability entren al `company room` del mapa
- [x] Ocultar acceso al mapa en navegacion cuando el perfil no tenga `map.view.company`
- [x] Hacer que `MapPage` degrade por capability: sin cash cuando falte `map.view.cash`, sin socket cuando falte `map.realtime.company`
- [x] Ejecutar gate manual final con usuario `store`: sin acceso visible al mapa, bloqueo por URL y rechazo backend

#### Residual actual del bloque
- El laboratorio cubre `admin/super_admin` vs `store`; todavia no modela un rol `driver` persistido en `profiles`.
- Falta convertir la validacion manual `store` en smoke reusable estable para dejar evidencia automatizada adicional, pero el bloque queda `DONE`.

### FT-F3-CLEAN-CONTRACT-001 - Deprecacion formal `store_id -> location_id`
- [x] Declarar `location_id` como contrato canonico interno para pedidos, perfiles y scopes operativos
- [x] Reforzar helpers compartidos para exponer `location_id` primero y sostener `store_id` solo como alias legacy
- [x] Renombrar variables y comentarios server-side en `locationScope`, `orders` y `profiles` hacia lenguaje canonico
- [x] Ajustar respuestas del frente operativo para priorizar `location_id` sin romper consumidores legacy
- [x] Actualizar UX visible del portal `store/*` hacia `Punto de Despacho` / `Sucursal`
- [ ] Auditar controladores y mobile fuera del frente actual para retirar referencias legacy no justificadas en la siguiente etapa

## Pendientes Reales de Fase 2

### Ubicaciones Operativas y Contrato
- [x] Extender `stores` con contrato minimo de ubicacion operativa inicial
- [x] Aplicar/verificar schema nativo en Supabase real para `location_type`, `is_active`, `rider_visible` y `is_temporary`
- [x] Abrir panel admin inicial de `Ubicaciones`
- [x] Validar create / edit / delete real del panel de ubicaciones
- [x] Canonizar `/bultos` como integracion de ubicaciones y no como CRUD paralelo
- [x] Implementar bridge realtime `store:{id}` <-> `location:{id}` con smoke real
- [x] Definir `location_id` como campo canonico con deprecacion formal documentada para `store_id`
- [x] Armar checklist de impacto y migracion por endpoint/capa: orders, profiles, auth, stores, sockets, frontend store portal y tests
- [x] Decidir que `stores` sigue como base operativa temporal de ubicaciones durante la migracion
- [ ] Eliminar referencias legacy no justificadas una vez cerrada la capa temporal de compatibilidad

#### Etapas de deprecacion `store_id -> location_id`
- Etapa 1 `actual`: backend, frontend, realtime y smokes usan `location_id` como referencia preferida y aceptan `store_id` como compatibilidad temporal.
- Etapa 2 `siguiente bloque`: remover escrituras nuevas que todavia dependan semantica o visualmente de `store_id`, dejando el alias solo como adaptador de entrada/salida.
- Etapa 3 `corte`: retirar referencias legacy no justificadas cuando mobile, tests y contratos compartidos ya no necesiten compatibilidad temporal.

### Paneles Admin Empresa
- [x] Sacar de Fase 1 la gestion de ubicaciones como capacidad separada del frente `super_admin`
- [x] Reducir la duplicacion funcional de ubicaciones en `BultosPage` y moverla a integracion sobre `/locations`
- [x] Cerrar panel inicial de `DriversPage` con CRUD real y smoke reusable
- [x] Cerrar panel inicial de `VehiclesPage` con CRUD real, estado, odometro y consulta liviana de ultima ubicacion
- [ ] Extraer componentes compartidos, validaciones y enums cuando la duplicacion real entre paneles lo justifique
- [x] Declarar suficiente el set inicial de paneles de Fase 2 para cierre oficial

### Realtime: Seguridad y Performance
- [x] Validar flujos reales de `order_*` y `driver_nearby` sobre bridge store/location
- [x] Implementar handshake autenticado en Socket.io con JWT
- [x] Resolver scope server-side (`user_id`, `role`, `company_id`, `location_id`) y rooms autorizadas por servidor
- [x] Sacar eventos tenant-scoped de broadcast global en el frente operativo actual
- [x] Agregar smoke reusable de aislamiento multi-tenant (`tenant_isolation_smoke.py`)
- [x] Cubrir `/map` con smoke authz dedicado para `vehicle:*`, `order:status_update` y `bulto:activated`
- [x] Dejar baseline funcional del path `driver_nearby`: costo acotado, sin lookup por store por cada pedido aceptado
- [x] Reducir round-trips y N+1 en `src/backend/src/index.js` con consultas prefiltradas y stores batcheados
- [ ] Medir latencia p95/p99 y definir smoke/perf test basico con carga simulada para realtime

### QA y Pipeline
- [x] Mantener verificacion real reusable para `/super-admin`
- [x] Mantener verificacion real reusable para `/locations`
- [x] Mantener verificacion real reusable para canonicalizacion de `/bultos`
- [x] Mantener verificacion real reusable para `/drivers`
- [x] Mantener verificacion real reusable para `/vehicles`
- [x] Mantener verificacion real reusable para bridge realtime de portal tienda
- [x] Mantener verificacion real reusable para `driver_nearby`
- [x] Crear smoke reusable de aislamiento multi-tenant
- [x] Ejecutar set critico de cierre de Fase 2 en verde: `bultos_locations_canonical`, `store_realtime_bridge`, `tenant_isolation`, `store_driver_nearby`, `map_authz`
- [ ] Consolidar smoke reusable de `/locations` si el frente sigue creciendo
- [ ] Definir comandos golden path por paquete: backend, frontend y tests
- [ ] Corregir scripts para que `npm run build` / `npm test` no dependan de setup faltante o tooling no configurado
- [ ] Dejar pipeline minima reproducible: lint + build + smoke critico
- [ ] Documentar matriz de entorno local/CI para problemas de `EPERM`, `nodemon` y puertos ocupados

### Gobernanza Documental
- [x] Adoptar `AGENTS.md` v2.2 como estandar operativo transversal
- [x] Mantener sin contradicciones `Plan.md`, `MEMORY.md` y `BRANCH_CODEX_SUPERADMIN_UI.md` al cierre de Fase 2
- [x] Definir update gate obligatorio al cerrar bloques: `ST`, `DEC`, `NEXT`
- [x] Reducir tiempo de retome de contexto a menos de 10 minutos con lectura minima consistente

## Checklist de salida de Fase 2
- [x] `location_id` formalizado como canonico y `store_id` relegado a compatibilidad temporal documentada
- [x] Paneles administrativos iniciales operativos y validados
- [x] Realtime del frente operativo actual aislado por tenant y sin N+1 obvio en `driver_nearby`
- [x] Set critico de smokes de cierre en verde
- [x] Residuals explicitados para no contaminar el cierre de la fase

---

## Lo Que No Es Prioridad Ahora
- Volver a polish visual de `/super-admin`
- Abrir `MapPage` como frente grande mientras sigan abiertos contrato de ubicaciones, authz realtime y pipeline
- Diseñar paneles finales de fases posteriores antes de cerrar el contrato operativo minimo de Fase 2
- Hacer optimizaciones de performance sin baseline ni metricas visibles

---

## Riesgos Actuales
- Mantener demasiado tiempo el contrato dual `store_id / location_id`
- Reabrir duplicacion de ubicaciones en frontend mientras `/locations` ya es la superficie canonica
- Exponer eventos realtime sin aislamiento formal por tenant/rol
- Escalar `driver_nearby` con patron de consultas costoso antes de medirlo
- Dar por cerrado `FT-F3-CLEAN-CONTRACT-001` sin completar la auditoria residual sobre mobile y superficies fuera del frente actual
- Seguir validando solo con criterio manual si el pipeline local/CI no se estabiliza
- Dejar documentacion atrasada respecto del cambio de fase real y de los bloques ya cerrados

---

## Registro Breve
- **2026-04-16**: se declara cerrado el frente funcional de `Fase 1` en `codex/superadmin-ui`
- **2026-04-16**: inicia `Fase 2` con ubicaciones operativas generales; `stores` se extiende con tipo, estado y visibilidad operativa
- **2026-04-16**: se agrega el panel admin inicial `/locations`, se aplica `migration_d_operational_locations.sql` en Supabase real y se valida create/edit/delete real sobre la nueva superficie
- **2026-04-16**: se canoniza el bridge semantico `location_id <-> store_id` en pedidos, auth/sesion, profiles y parte de `/super-admin`
- **2026-04-16**: se valida el bridge realtime `store:{id}` <-> `location:{id}` con smoke real sobre `order_*` y `driver_nearby`
- **2026-04-16**: `/bultos` queda reencuadrado como integracion sobre ubicaciones canonicas y se agrega smoke reusable del flujo
- **2026-04-16**: `/drivers` pasa a CRUD operativo inicial con smoke reusable real
- **2026-04-16**: `/vehicles` pasa a CRUD operativo inicial, luego suma `status`, `odometer_km` y consulta liviana de ultima ubicacion con smoke reusable real
- **2026-04-20**: se incorporan al plan vivo frentes tecnicos transversales que ya merecen seguimiento formal: deprecacion `store_id`, desduplicacion UI restante, pipeline/tooling, seguridad/performance realtime y gobernanza documental
- **2026-04-20**: se adopta `AGENTS.md` v2.2 como estandar operativo transversal y se actualiza `MEMORY.md` con glosario vivo y mandatos terminologicos
- **2026-04-20**: se endurece Socket.io con handshake autenticado, rooms autorizadas y compatibilidad de clientes web/mobile en el frente operativo actual
- **2026-04-20**: se agrega `tenant_isolation_smoke.py`, se valida aislamiento API + realtime para `orders` / `stores` y se corrige bleed de sesion compartida en esas superficies con cliente request-scoped
- **2026-04-20**: se cierra `FT-MAP-AUTHZ-001` con `map_authz_smoke.py`, ownership de GPS en `location:update` / `POST /trips/location`, bind explicito de ultima ubicacion por tenant y request-scoped client en superficies operativas del mapa
- **2026-04-21**: se cierra `FT-F2-CLOSE-001`, se formaliza la salida oficial de `Fase 2`, se alinea `weight_presets` a request-scoped y se deja `driver_nearby` con costo acotado por evento en el frente operativo actual
- **2026-04-22**: `FT-F3-RBAC-MAP-001` implementa capabilities RBAC iniciales de `/map` en backend/frontend, filtra `/vehicles` y company room realtime por capability
- **2026-04-23**: se valida manualmente el gate final del perfil `store` y `FT-F3-RBAC-MAP-001` queda `DONE`
- **2026-04-23**: inicia `FT-F3-CLEAN-CONTRACT-001` para unificar `location_id` como contrato canonico interno y relegar `store_id` a alias legacy
