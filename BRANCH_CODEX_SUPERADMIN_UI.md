# Branch Notes - codex/superadmin-ui

## Regla de trabajo
- Esta rama es exclusiva para trabajo de Codex.
- No tocar `main` desde esta linea de trabajo.
- Todo cambio experimental, de UI, documentacion o refactor va solo en esta rama o en ramas hijas futuras de Codex.
- Si algo gusta, luego se mergea manualmente a `main`.
- Si algo no gusta, esta rama se puede descartar sin afectar la base estable.

## Contexto funcional base
- Proyecto: FleetTrack
- Fase activa: apertura de Fase 2 desde la rama que cerro `super_admin`
- Documento funcional principal:
  - `C:\Users\Usuario\OneDrive\Desktop\FleetTrack\Documento-Maestro-Funcional.md`
- Base estable esperada en `main`:
  - backend Fase 1 ya validado
  - migracion B aplicada
  - capa backend `super_admin / company management` implementada

## Objetivo de esta rama
Continuar la evolucion funcional sin tocar `main`: Fase 1 ya cerrada, Fase 2 abierta desde paneles administrativos iniciales y ubicaciones operativas.

## Estado vivo 2026-04-21
- Esta seccion manda sobre reencuadres mas viejos del archivo cuando haya contradiccion.
- `/locations` ya es la superficie admin canonica de ubicaciones.
- `/bultos` ya quedo reencuadrado como integracion sobre ubicaciones canonicas y no como CRUD paralelo.
- `orders`, auth/sesion, profiles y parte de `/super-admin` ya conviven con `location_id <-> store_id`.
- Realtime ya tiene bridge `store:{id}` / `location:{id}` validado con smoke real.
- Ya existe `tenant_isolation_smoke.py` para `orders` / `stores` + rooms realtime de pedidos, y esas superficies quedaron protegidas con cliente Supabase request-scoped para evitar bleed de sesion compartida.
- `/map` ya quedo endurecido con `map_authz_smoke.py`, ownership de publicacion GPS y lectura tenant-bound de ultima ubicacion.
- `/drivers` ya tiene CRUD inicial real y smoke reusable.
- `/vehicles` ya tiene CRUD inicial real, `status`, `odometer_km`, consulta liviana de ultima ubicacion y smoke reusable.
- `weight_presets` ya tambien usa request-scoped client en superficie autenticada.
- `driver_nearby` ya no barre todos los pedidos aceptados de la empresa por evento; la corrida actual queda acotada a conductor asignado, bultos activos del conductor, pedidos aceptados de esos bultos y stores batcheados.
- Los siguientes frentes tecnicos ya merecen seguimiento formal junto a Fase 2:
  - deprecacion `store_id -> location_id`
  - RBAC fino `/map`
  - performance/observabilidad realtime bajo carga
  - estabilizacion de build/pipeline
  - gobernanza documental

## Cierre oficial de Fase 2
- `Fase 2` queda cerrada oficialmente en esta rama.
- El contrato canonico `location_id` queda operativo en backend, frontend, realtime y smokes.
- El set inicial de paneles administrativos exigido por la fase queda cubierto:
  - `/locations`
  - `/bultos`
  - `/drivers`
  - `/vehicles`
  - `/store/dashboard`
- El residual que no bloquea esta salida queda explicitado:
  - deprecacion ejecutiva final de `store_id`
  - RBAC fino intra-tenant de `/map`
  - baseline p95/p99 y observabilidad realtime
  - pipeline/build reproducible

## Checklist de salida de Fase 2
- `location_id` formalizado como canonico y `store_id` solo como compatibilidad temporal
- paneles iniciales operativos validados
- realtime tenant-safe y `driver_nearby` sin N+1 obvio
- smokes criticos ejecutados en verde:
  - `bultos_locations_canonical_smoke.py`
  - `store_realtime_bridge_smoke.py`
  - `tenant_isolation_smoke.py`
  - `store_driver_nearby_smoke.py`
  - `map_authz_smoke.py`
- docs vivas sincronizadas

## Estado actual de esta rama
- Ruta `/super-admin` agregada al frontend
- `SuperAdminGuard` agregado
- item "Plataforma" visible solo para `super_admin`
- cliente API ampliado con endpoints de companies/profiles
- `SuperAdminPage` implementada con:
  - listado de empresas
  - creacion de empresa
  - edicion basica de empresa
  - cambio de estado de empresa
  - listado de perfiles por empresa
  - creacion de perfil
  - suspension / activacion de perfil
- Segunda pasada UX ya aplicada sobre `SuperAdminPage.jsx`:
  - modal propio para suspension de perfiles con motivo obligatorio
  - confirmacion explicita para suspender o inactivar empresas
  - `Activar` de empresa queda directo para no volver pesado el flujo
  - bloque superior con metricas rapidas
  - filtros y busqueda para empresas
  - filtros y busqueda para perfiles
  - resumen contextual de perfiles visibles en empresa seleccionada
  - senales visuales para filas seleccionadas, suspendidas e inactivas
  - tablas con mejor scroll horizontal para anchos medios
  - labels/id/htmlFor mejorados para accesibilidad y testing
  - separacion visual mas clara entre empresas y perfiles
  - widgets operativos iniciales para perfiles:
    - `Sin Login Todavia`
    - `Ultimos Suspendidos`
    - `Actividad Reciente`
  - atajos rapidos desde widgets hacia filtros de la tabla de perfiles
  - mejor lectura responsive para mobile/tablet en la zona de perfiles

## Reencuadre de fase
- Esta rama sigue alineada a `Fase 1` del repo:
  - `super admin real`
  - `empresas`
  - `usuarios`
  - `memberships`
  - `planes y permisos`
- Lo ya implementado en `/super-admin` cubre bien la base operativa minima de `super admin`, empresas y usuarios/perfiles.
- El refinamiento UX reciente fue util para hacer la pantalla operable de verdad, pero ya no conviene seguir agregando polish fino como eje principal.
- A partir de este punto, la prioridad debe volver a cerrar lo que el repo marca como pendiente funcional de `Fase 1`.

## Trabajo en curso
- Donde estamos hoy:
  - `/super-admin` ya dejo de ser solo una pantalla tecnica y hoy funciona como base operativa minima validada con smoke real.
  - La UX ya llego a un nivel suficiente para continuar `Fase 1` sin que el panel bloquee trabajo funcional.
  - No conviene seguir puliendo UX de mas por ahora porque eso empieza a parecer refinamiento de paneles de fases posteriores, mientras en `Fase 1` todavia quedan piezas funcionales por cerrar.
- Reencuadre aplicado en este bloque:
  - Para cerrar `memberships`, `planes` y `permisos` en `Fase 1`, se tomo una decision practica:
    - en esta etapa `membership` se trata como la configuracion comercial activa de la empresa
    - incluye `plan`, `commercial_status`, `feature_flags`, `limits_config` y `addons`
    - no se abrio todavia una entidad separada de billing/subscription
- Ultimos avances cerrados:
  - edicion basica de empresa desde la propia UI
  - bloque visual de "empresa seleccionada" arriba de perfiles
  - modal de suspension de perfil
  - confirmacion de cambios sensibles de estado en empresa
  - filtros activos con reset rapido
  - resumen de actividad reciente en perfiles
  - widgets operativos iniciales y quick filters para perfiles
  - mejora mobile/tablet suficiente para seguir avanzando sin retrabajo inmediato
- Lo que sigue exactamente de `Fase 1` segun el repo:
  - cerrar `memberships` desde la superficie `super_admin`
  - cerrar `planes` desde la superficie `super_admin`
  - cerrar `permisos` desde la superficie `super_admin`
  - usar la UI actual como base suficiente, evitando sumar mas polish salvo que destrabe alguno de esos puntos

## Avance nuevo del bloque memberships / planes / permisos (2026-04-16)
- Backend:
  - `src/backend/src/controllers/companiesController.js` ahora arma y sanea configuracion comercial minima por empresa:
    - `commercial_status`
    - `feature_flags`
    - `limits_config`
    - `addons`
  - se agregaron defaults por `plan` (`basic`, `pro`, `enterprise`)
  - se dejo compatibilidad transitoria con la base real:
    - si la tabla `companies` todavia no tiene columnas nativas para ese bloque, el backend persiste la configuracion comercial en `commercial_comment`
    - al listar o editar, la reconstruye desde ahi para que `/super-admin` siga funcionando sin depender de una migracion ya aplicada
- Frontend:
  - `src/frontend/src/pages/SuperAdminPage.jsx` ahora permite editar desde `/super-admin`:
    - `estado comercial`
    - features
    - limites
    - addons
  - la tabla de empresas y el resumen de empresa seleccionada ya muestran senales del bloque comercial
- Infra/validacion:
  - `src/frontend/vite.config.js` ahora acepta `VITE_API_PROXY_TARGET` para poder validar contra un backend aislado en otro puerto sin depender de procesos viejos locales
  - `tests/e2e/super_admin_smoke.py` y `tests/e2e/super_admin_extended_smoke.py` aceptan `BASE_URL` por entorno
  - el smoke extendido se ajusto para no asumir que siempre existe al menos una empresa al entrar al panel

## Verificacion real ya hecha en este bloque
- Se corrio smoke real aislado contra backend y frontend de esta rama usando puertos temporales.
- Resultado:
  - `tests/e2e/super_admin_extended_smoke.py` paso completo
  - cubrio:
    - creacion de empresa
    - edicion de empresa
    - roundtrip del bloque comercial
    - creacion de perfil `admin`
    - suspension/reactivacion de perfil
    - suspension/reactivacion de empresa
    - chequeo mobile basico
- Artifacts recientes:
  - `tests/e2e/artifacts/super-admin-extended-smoke.png`
  - `tests/e2e/artifacts/super-admin-mobile-smoke.png`

## Debugging importante para no repetir en otro chat
- El entorno local tenia procesos viejos ocupando puertos (`3001`, despues `3002`).
- Para validar esta rama de verdad hubo que aislar:
  - backend con `npm start` en un puerto alternativo
  - frontend con `npm run dev -- --port <otro puerto>`
  - `VITE_API_PROXY_TARGET` apuntando al backend aislado
  - `BASE_URL` apuntando al frontend aislado para los smoke
- `npm run dev` del backend no es buena base de verificacion en este entorno porque `nodemon` puede fallar por `spawn EPERM`.
- `npm start` del backend fue la forma estable para validar el codigo actual.
- Tambien se detecto y corrigio durante este bloque:
  - un join inseguro en `src/backend/src/middleware/auth.js` que intentaba leer columnas comerciales inexistentes y rompia auth en entornos sin migracion aplicada
  - un bug en `createCompany` por referencia incorrecta a `current`
  - supuestos fragiles en el smoke extendido sobre empty state inicial del panel

## Pendiente real que queda
- Estado actualizado 2026-04-16 (cierre de este bloque):
  - la migracion `src/backend/src/db/migration_c_super_admin_commercial.sql` ya fue aplicada en Supabase real
  - se confirmo en remoto que `companies` ya expone columnas nativas:
    - `commercial_status`
    - `feature_flags`
    - `limits_config`
    - `addons`
  - el backend dejo de depender del fallback de escritura en `commercial_comment`
  - `/super-admin` fue revalidado con smoke extendido real aislado y luego cleanup QA
- Estado actualizado 2026-04-16 (cierre fallback legacy):
  - se verifico en Supabase real que no quedan empresas usando shadow `__fleettrack_commercial_v1` en `commercial_comment`
  - `src/backend/src/controllers/companiesController.js` ya no reconstruye configuracion comercial desde `commercial_comment`
  - el bloque comercial queda cerrado solo sobre columnas nativas de `companies`
  - `/super-admin` fue revalidado otra vez con smoke extendido real despues de remover esa lectura legacy
  - el cleanup QA se corrio al final y se confirmo que no quedaron registros temporales de esa corrida
- Pendiente funcional que sigue abierto:
  1. decidir si `membership` debe seguir como configuracion comercial embebida o si ya conviene abrir entidad explicita

## Apertura de Fase 2 (2026-04-16)
- Se toma como cerrado el bloque de `Fase 1` desde `/super-admin`.
- El frente activo pasa a `Fase 2`:
  - `ubicaciones operativas generales`
  - `paneles administrativos iniciales`
- Primer bloque abierto en esta rama:
  - `stores` se extiende sin romper compatibilidad para funcionar como base inicial de ubicaciones operativas
  - nueva migracion: `src/backend/src/db/migration_d_operational_locations.sql`
  - nuevos campos sobre `stores`:
    - `location_type`
    - `is_active`
    - `rider_visible`
    - `is_temporary`
  - nuevo panel admin inicial:
    - ruta `/locations`
    - pagina `src/frontend/src/pages/LocationsPage.jsx`
    - item `Ubicaciones` en sidebar
- Validacion real del bloque:
  - migracion aplicada en Supabase real
  - schema remoto verificado
  - flujo real aislado validado en UI:
    - crear ubicacion
    - editar ubicacion
    - eliminar ubicacion
- Criterio de continuidad:
  - seguir profundizando Fase 2 sobre la base de ubicaciones y panel admin empresa
  - evitar volver a polish de `/super-admin` salvo regresion real

## Limitaciones conocidas
- El script `npm run build` del frontend sigue mal alineado porque llama a `tsc` y el proyecto no tiene `tsconfig.json`.
- `npm exec vite build` ya paso en esta rama, pero en este entorno puede requerir correr fuera del sandbox por `spawn EPERM`.
- Backend y frontend siguen necesitando puertos aislados cuando hay procesos viejos ocupados.

## Hallazgos de investigacion (2026-04-15)
- Backend y frontend apuntan al mismo proyecto Supabase real que se esta mirando en dashboard.
- Los mails `gabriel@admin.com` y `gaston@admin.com` aparecen en `Documento-Maestro-Funcional.md`, pero no aparece ningun seed, migracion ni script que cree esos usuarios reales en Auth.
- La propia `migration_b_fase1.sql` documenta que el primer `super_admin` requiere bootstrap manual con empresa `platform`; no hay automatizacion en el repo para ese alta inicial.
- El backend actual si tiene la capa `super_admin` conectada:
  - rutas `/api/companies` y `/api/profiles`
  - guard `superAdminOnly`
  - creacion de perfiles via `supabaseAdmin.auth.admin.createUser`
- La creacion de perfiles desde backend solo permite `admin` y `store`; no crea `super_admin`.
- `MEMORY.md` del repo quedo desalineado y todavia describe un estado pre-Fase 1, por lo que no sirve como unica fuente para este tema.

## Pendiente operativo inmediato
- Ya se creo manualmente la empresa `Platform` en Supabase real con id `d22967a3-123d-41dc-b711-62afe1656d7d`.
- El perfil `ae589f5f-51c1-4e20-bcc2-9ab0cdd8bb44` (`gabriel@gabriel.com`) ya fue convertido correctamente a `super_admin` y asociado a `Platform`.
- Se valido relogin real y aparicion de `Plataforma` en sidebar.
- Hoy no hay pendiente de bootstrap bloqueando la UI de `/super-admin`.

## Skills externos evaluados
- `obra/superpowers`: util como marco de proceso y disciplina para ramas tematicas, debugging sistematico, verificacion antes de cerrar y trabajo por worktrees. No conviene adoptar el framework entero de forma rigida, pero si tomar skills puntuales de proceso.
- `anthropics/skills`: util como repositorio de ejemplos y skills tecnicos concretos. Lo mas alineado con FleetTrack hoy parece ser testing web apps, generacion MCP y patrones de skills productivos.
- `ComposioHQ/awesome-claude-skills`: sirve mas como catalogo para descubrir skills utiles que como instalacion completa. Priorizar de ahi skills de `webapp-testing`, `test-driven-development`, `using-git-worktrees` y `mcp-builder`.
- `PleasePrompto/notebooklm-skill`: potencialmente util mas adelante para consultar documentacion interna, SOPs, contratos y decisiones de producto desde una base de conocimiento. No es prioridad para implementar Fase 1 tecnica.
- `coreyhaines31/marketingskills`: util para etapa comercial/landing/pricing/onboarding, no para cerrar backend o panel `super_admin`.

## Skills instalados para este entorno
- `systematic-debugging` (desde `obra/superpowers`)
- `verification-before-completion` (desde `obra/superpowers`)
- `using-git-worktrees` (desde `obra/superpowers`)
- `webapp-testing` (desde `anthropics/skills`)
- Skills propios agregados para este flujo:
  - `fleettrack-retomar-rama`
  - `fleettrack-superadmin-qa`
  - `fleettrack-cleanup-qa`

## Criterio de uso
- Usar `systematic-debugging` cuando haya fallas reales de backend, auth, RLS o UI que no esten claras.
- Usar `verification-before-completion` antes de dar por cerrados cambios grandes en la rama.
- Usar `using-git-worktrees` si mas adelante abrimos varias ramas hijas de Codex en paralelo.
- Usar `webapp-testing` para validar `/super-admin` y otros flujos frontend sin depender solo de chequeos manuales.
- Usar `fleettrack-retomar-rama` al cambiar de chat para reconstruir contexto chico antes de tocar codigo.
- Usar `fleettrack-superadmin-qa` para cualquier validacion de `/super-admin`.
- Usar `fleettrack-cleanup-qa` para borrar empresas/perfiles QA `Codex QA*` y correos `codex.superadmin.qa.*`.

## Protocolo de Subagentes
- `Lead/Synth`: coordina bloques, decide si un fallo pertenece a UI, QA o backend y consolida cierre. Debe usar `fleettrack-retomar-rama` al retomar contexto y `verification-before-completion` antes de dar un bloque por cerrado.
- `Frontend Product`: toca solo la experiencia de `/super-admin` y su UI cercana. En esta rama es el owner natural de `SuperAdminPage.jsx` para responsive, separacion visual y widgets operativos.
- `QA Browser`: valida cada cambio de `/super-admin` con `fleettrack-superadmin-qa` y, si hace falta, `webapp-testing`. Su salida esperada es evidencia concreta: smoke, extended smoke, screenshots o selector roto bien aislado.
- `Data Cleanup`: corre `fleettrack-cleanup-qa` despues de smokes extendidos o QA manual que cree datos temporales. No deberia tocar UI ni backend.
- `Debug/Backend Triage`: entra solo cuando QA no puede atribuir el problema a selector o comportamiento visual. Debe usar `systematic-debugging` antes de proponer cambios.
- Regla de ownership: cada subagente toca solo su area y deja handoff corto con que cambio, que valido y que queda pendiente para evitar pisarse en paralelo.
- Flujo recomendado para esta rama: `Lead/Synth` define bloque, `Frontend Product` implementa, `QA Browser` valida, `Data Cleanup` limpia y `Debug/Backend Triage` entra solo bajo demanda.

## Metodologia de trabajo ya probada en esta rama
- Mantener todo solo en `codex/superadmin-ui`, nunca en `main`.
- Hacer cambios chicos pero completos: implementacion + smoke real + cleanup QA.
- Preferir validar con `webapp-testing` y scripts en `tests/e2e/` antes que con chequeo manual.
- Cuando un smoke falla, separar primero si el problema es:
  - backend caido
  - bootstrap/auth
  - selector del test
  - comportamiento real de UI
- Persistir herramientas utiles en el repo para no volver a improvisar:
  - `tests/e2e/super_admin_smoke.py`
  - `tests/e2e/super_admin_extended_smoke.py`
  - `tests/e2e/cleanup_super_admin_qa.mjs`
- Limpiar siempre los datos QA al terminar una corrida extendida.

## Validacion ya realizada en esta rama
- Smoke basico de `/super-admin` validado con login real.
- Smoke extendido validado varias veces con:
  - creacion de empresa
  - edicion de empresa
  - creacion de perfil `admin`
  - suspension/reactivacion de perfil
  - suspension/reactivacion de empresa
- Cleanup QA reusable ya probado contra Supabase real.

## Proxima recomendacion al retomar en otro chat
1. Leer este archivo.
2. Confirmar que la rama activa sea `codex/superadmin-ui`.
3. Usar `fleettrack-retomar-rama`.
4. Revisar `SuperAdminPage.jsx`, `tests/e2e/super_admin_extended_smoke.py` y `tests/e2e/cleanup_super_admin_qa.mjs`.
5. Si se toca `/super-admin`, volver a validar con `fleettrack-superadmin-qa` o con los scripts de `tests/e2e/`.
6. Seguir mejorando solo esta rama, nunca `main`.
