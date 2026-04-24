# E2E Super Admin

Esta carpeta concentra los scripts operativos para validar `/super-admin` en FleetTrack. La prioridad es testear comportamiento real, no solo estructura.

## Orden operativo
1. Levantar frontend si hace falta.
2. Correr smoke basico.
3. Si hubo cambios relevantes, correr smoke extendido.
4. Si el smoke extendido creo datos QA, ejecutar cleanup.
5. Revisar `artifacts/` solo como evidencia, no como fuente de verdad unica.

## Scripts principales

### `super_admin_smoke.py`
- Uso: chequeo rapido de login y carga base del panel.
- Correr cuando: queres validar que `/super-admin` sigue vivo despues de un cambio chico.

### `super_admin_extended_smoke.py`
- Uso: flujo mas completo sobre empresas, perfiles y estados.
- Correr cuando: cambiaste UX, formularios, tablas, modales o comportamiento operativo del panel.
- Nota: puede crear datos QA temporales.

### `cleanup_super_admin_qa.mjs`
- Uso: elimina empresas/perfiles QA creados durante pruebas.
- Correr cuando: el smoke extendido o QA manual dejaron registros `Codex QA*` o correos `codex.superadmin.qa.*`.

### `store_realtime_bridge_smoke.py`
- Uso: valida el portal tienda sobre el bridge realtime `store:{id}` <-> `location:{id}`.
- Correr cuando: cambiaste eventos Socket.io del dashboard de tienda, payloads `location_id` o listeners duales legacy/canonicos.
- Nota: crea empresa/perfil/location QA temporales y despues conviene correr `cleanup_super_admin_qa.mjs`.

### `store_driver_nearby_smoke.py`
- Uso: valida el flujo realtime de `driver_nearby` del portal tienda con emision simulada de `location:update`.
- Correr cuando: cambiaste proximidad GPS, dedupe de `driver_nearby`, radar del store dashboard o el bridge `store:{id}` <-> `location:{id}`.
- Nota: crea location, perfiles QA, vehiculo, driver, lote y pedido temporales; al final limpia por API y conviene correr `cleanup_super_admin_qa.mjs` para borrar perfiles QA.

### `bultos_locations_canonical_smoke.py`
- Uso: valida que `/bultos` opere pedidos sobre la superficie canónica de `Ubicaciones`.
- Correr cuando: cambiaste el formulario de pedidos en `BultosPage`, el vínculo con `location_id` o la lectura del origen en tabla.
- Nota: crea una ubicación QA temporal, genera un pedido real desde la UI y luego limpia por API.

### `drivers_crud_smoke.py`
- Uso: valida que `/drivers` permita alta real de conductor con perfil y vehiculo asignados.
- Correr cuando: cambiaste `DriversPage`, el CRUD de conductores, la asignacion de `profile_id` / `assigned_vehicle_id` o hooks de QA del formulario.
- Nota: crea perfil QA temporal, vehiculo temporal y conductor real desde la UI; limpia conductor y vehiculo por API y luego conviene correr `cleanup_super_admin_qa.mjs` para borrar el perfil QA.

### `vehicles_crud_smoke.py`
- Uso: valida que `/vehicles` permita alta real de vehiculo y edicion operativa de estado / odometro.
- Correr cuando: cambiaste `VehiclesPage`, el CRUD de vehiculos o los hooks de QA del panel.
- Nota: crea un vehiculo QA real desde la UI, lo edita para validar `status` y `odometer_km`, consulta el empty state de ultima ubicacion y luego limpia por API.

### `tenant_isolation_smoke.py`
- Uso: valida aislamiento multi-tenant sobre `stores` / `orders` y rooms realtime de pedidos sin usar UI.
- Correr cuando: cambiaste authz de `orders`, `stores`, `location_id`, middleware de scope o rooms Socket.io por `company` / `location`.
- Nota: crea dos empresas QA con admin y store propios, valida lecturas/mutaciones cruzadas por API, captura eventos Socket.io de ambos tenants y luego limpia por API + `cleanup_super_admin_qa.mjs`.

### `map_authz_smoke.py`
- Uso: valida aislamiento authz del frente `/map` sobre `vehicles`, `drivers`, `cash-by-vehicle`, `active-orders`, lectura de ultima ubicacion y stream realtime `vehicle:{id}`.
- Correr cuando: cambiaste `vehicleController`, `driverController`, `tripController`, `bultosController`, ownership de GPS o wiring realtime del mapa.
- Nota: crea dos empresas QA con admins y drivers propios, valida listas y lecturas por API, prueba `POST /trips/location` y `location:update` contra spoofing same-tenant/cross-tenant, captura eventos Socket.io y luego limpia por API + `cleanup_super_admin_qa.mjs`.

## Scripts de debug
- `super_admin_inspect.py`
- `super_admin_login_debug.py`
- `super_admin_post_login_inspect.py`

Estos scripts no reemplazan a los smoke principales. Usarlos solo para diagnostico puntual cuando QA detecta un fallo ambiguo.

## Convencion multiagente
- `QA Browser` es el owner de los smoke y de `artifacts/`.
- `Data Cleanup` es el owner del cleanup QA.
- Si un smoke falla, separar primero si el problema es:
  - backend caido
  - auth o bootstrap
  - selector del test
  - bug real de UI
- Si el fallo no es claramente de test o UI, derivar a `Debug/Backend Triage`.

## Skills recomendados
- `fleettrack-superadmin-qa` para corridas de validacion de `/super-admin`.
- `webapp-testing` para evidencia de navegador y exploracion guiada.
- `fleettrack-cleanup-qa` para limpieza segura de datos temporales.
- `verification-before-completion` antes de dar un bloque por cerrado.
