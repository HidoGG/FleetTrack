# FleetTrack Protocol v2.2 - Standard Operativo

Este protocolo rige toda actividad de desarrollo en FleetTrack a partir de su adopcion.
Es la instruccion principal de trabajo multiagente y complementa `CLAUDE.md` sin reemplazarlo.

## Precedencia Documental
- Si hay conflicto de proceso, manda `CLAUDE.md`.
- Despues manda `AGENTS.md` como estandar operativo transversal.
- `BRANCH_*.md`, `Plan.md` y `MEMORY.md` no redefinen proceso; agregan contexto, estado o excepciones temporales explicitas.

## Principios rectores
- Velocidad de entrega sin comprometer aislamiento multi-tenant ni estabilidad realtime.
- Ningun cambio llega a la rama de integracion sin gate acorde a su nivel de impacto.
- Zero-trust client: nunca confiar en `company_id`, `store_id` o `location_id` enviados por cliente para autorizacion.
- Los cierres de bloque requieren evidencia fresca, cleanup QA y documentacion viva actualizada.
- No tocar `main` desde trabajo de Codex; usar ramas `codex/*`.

## Evolucion De Capacidades y Orquestacion Senior
Este proyecto eleva el piso tecnico de todos los agentes al nivel `Solution Architect / Senior Engineer`.
Esta configuracion es obligatoria para cualquier bloque ejecutado bajo `FleetTrack Protocol v2.2`.

### Regla de interpretacion
- Subir el piso tecnico no habilita sobrediseño.
- Mantener bloques chicos, completos y verificables sigue siendo obligatorio.
- Si aparece una inconsistencia arquitectonica real, el flujo debe pausarse, explicitar el riesgo y reencuadrar el bloque antes de seguir.

### `Orquestador` - estandar `Solution Architect`
- No actua solo como gestor de turnos; actua como estratega del bloque.
- Antes de iniciar un flujo debe aplicar pensamiento sistemico:
  - impacto en escalabilidad
  - integridad multi-tenant
  - estabilidad realtime
  - costo de mantenimiento futuro
- Tiene mandato de detener el proceso si detecta inconsistencia arquitectonica, conflicto de invariantes o deuda que vuelva riesgoso el bloque actual.

### `Planner` - estandar `Lead Engineer`
- Todo plan debe incluir analisis de impacto.
- Debe definir como protegera invariantes de:
  - seguridad
  - performance
  - backward compatibility
  - terminologia canonica
- Debe verificar que el alcance respete principios `SOLID` cuando aplique, sin forzar abstracciones innecesarias.

### `Executor` - estandar `Senior Developer`
- El codigo debe seguir `Clean Code` y priorizar mantenibilidad real.
- En frontend React:
  - separar logica reusable en custom hooks cuando el bloque lo justifique
  - evitar mezclar logica de negocio, IO y rendering sin necesidad
- En backend:
  - privilegiar modularidad, limites claros de responsabilidad y validacion server-side
- No alcanza con “funciona”; la entrega debe ser mantenible, legible y alineada a contratos vigentes.

### `Security Reviewer` - estandar `OWASP`
- Auditoria obligatoria y activa frente a `Broken Access Control`, fugas de datos e inconsistencias de authz.
- Queda prohibido aceptar validacion de IDs criticos solo en cliente.
- `tenant_id`, `company_id`, `store_id` y `location_id` deben validarse via server-side authz, RLS o resolucion confiable en servidor.
- Debe revisar especialmente:
  - aislamiento multi-tenant
  - scope por rol
  - exposicion en sockets
  - contratos de lectura/mutacion

### `Performance Reviewer` - estandar `Expert Database & Realtime`
- Debe revisar queries Supabase por costo, filtro y riesgo de N+1.
- En realtime debe exigir filtros y scopes granulares para evitar saturacion de canales.
- Debe evaluar impacto probable en latencia y ruido operativo antes de aceptar el bloque.
- Cuando el bloque no incluya medicion formal, debe dejar residual explicito en lugar de asumir performance sana.

### `QA Runner` - estandar `SDET / Boundary Testing`
- No se limita al camino feliz.
- Debe intentar romper el sistema con:
  - limites de datos
  - estados inconsistentes
  - errores de red o temporizacion cuando aplique
  - aserciones negativas de aislamiento y permisos
- La evidencia de QA debe servir para detectar regresiones reales, no solo para confirmar que “algo cargo”.

### Mandato de cierre
- Ningun bloque se marca `done` si no cumple con estos estandares industriales ademas de los gates del protocolo.
- Si el bloque queda por debajo del estandar por decision consciente de alcance, debe quedar asentado como `Residual` explicito en el cierre.

## Roles Base

### `Planner`
- Owner natural: `Lead/Synth`.
- Define alcance, archivos impactados, nivel de impacto y criterios de exito.
- Debe usar `fleettrack-retomar-rama` al retomar contexto.

### `Executor`
- Owner natural: `Frontend Product` o `Debug/Backend Triage`, segun dominio.
- Implementa el cambio tecnico.
- No puede salirse del alcance sin handoff explicito.

### `Reviewer`
- Revisa logica, consistencia de contratos y alineacion con el bloque definido.
- Obligatorio para cualquier cambio de impacto `critico`, `medio` o `bajo`.

### `Security Reviewer`
- Obligatorio en `Auth`, `RLS`, `Sockets`, `multitenancy` o contratos con riesgo de aislamiento.
- Valida server-side authz, RLS y que no haya fugas de datos entre empresas.

### `Performance Reviewer`
- Obligatorio en `Sockets`, queries sensibles o cambios con riesgo de latencia / N+1.
- Valida costo de consultas, ruido realtime y uso de recursos.

### `QA Runner`
- Owner natural: `QA Browser`.
- Ejecuta smokes, recolecta evidencia y aísla si el fallo es UI, selector o contrato.
- Skills base: `webapp-testing` y los smokes del proyecto.

### `Cleanup`
- Owner natural: `Data Cleanup`.
- Elimina datos QA temporales luego de smokes o pruebas manuales.
- Skill base: `fleettrack-cleanup-qa`.

### `Lead / Synth`
- Cierra formalmente el bloque.
- Actualiza `Plan.md`, `MEMORY.md` y, si hace falta, la nota de rama.
- Debe usar `verification-before-completion` antes de declarar cierre.

## Gates Por Impacto

### Nivel `CRITICO`
Aplica a:
- `Auth`
- `RLS`
- `Sockets`
- `multitenancy`

Gate obligatorio:
- `Reviewer`
- `Security Reviewer`
- `Performance Reviewer`
- `QA Runner` con suite completa o set critico equivalente

### Nivel `MEDIO` / `BAJO`
Aplica a:
- API, CRUD y logica de negocio no critica
- UI, copy, layout y estilos

Gate obligatorio:
- `Reviewer` focalizado
- smoke relevante al bloque

## Mapeo Con El Equipo Actual
- `Lead/Synth` cubre `Planner` y cierre final.
- `Frontend Product` o `Debug/Backend Triage` cubren `Executor`.
- `QA Browser` cubre `QA Runner`.
- `Data Cleanup` cubre `Cleanup`.
- `Reviewer`, `Security Reviewer` y `Performance Reviewer` pueden resolverse con agentes dedicados o con sidecars de exploracion, pero deben existir como gate explicito cuando el nivel de impacto lo exige.

## Terminologia Canonica (Glosario Vivo)
Fuentes, en este orden:
1. `Documento-Maestro-Funcional.md`
2. `MEMORY.md` (glosario y decisiones vigentes)

Mandatos actuales:
- `trazabilidad de datos` > `reportabilidad`
- `operaciones de campo` / `servicios de pozo` > terminos informales o ambiguos
- `ubicacion` / `location_id` como termino canonico de logistica hacia adelante

Reglas:
- Si un termino no esta definido, no se inventa por inercia.
- Si un bloque introduce o fuerza un termino nuevo, debe quedar asentado en `MEMORY.md` antes del cierre.
- Evitar reintroducir wording legacy como termino principal si ya existe uno canonico aprobado.

## Invariantes De Seguridad y Datos
- `Zero-Trust Client`: no confiar en IDs o scope enviados por cliente para authz.
- Validar aislamiento siempre via RLS o resolucion server-side.
- Eventos tenant-scoped no deben salir por broadcast global si requieren aislamiento.
- Cambios de esquema o contrato deben mantener `backward compatibility` hasta cerrar el ciclo de migracion.
- Contratos como `store_id -> location_id` requieren plan de deprecacion formal antes de remover compatibilidad.

## Smokes Criticos Minimos
No son obligatorios en todos los bloques; se exigen segun impacto.

Set critico actual:
- `tests/e2e/super_admin_smoke.py`
- `tests/e2e/store_realtime_bridge_smoke.py`
- `tests/e2e/store_driver_nearby_smoke.py`
- `tests/e2e/bultos_locations_canonical_smoke.py`

Pendiente deseado:
- `tests/e2e/tenant_isolation_smoke.py`

## Handoff Estructurado (JSON v2)
Todo bloque debe dejar este handoff como salida minima:

```json
{
  "block_id": "FT-XXX",
  "status": "done",
  "scope": "...",
  "artifacts": ["lista de archivos creados/modificados"],
  "commands_run": ["lista de comandos ejecutados con exito"],
  "risks": "...",
  "terminology_check": "Verified vs MEMORY.md",
  "next_agent": "..."
}
```

## Definicion De Done (DoD)
Un bloque no se marca terminado si falta alguno de estos puntos:
- funcionalidad validada contra el objetivo del `Planner`
- smokes en verde segun el nivel de impacto
- cleanup QA ejecutado cuando hubo datos temporales
- `Plan.md` y `MEMORY.md` actualizados
- compatibilidad/migracion respetada si hubo cambio de contrato o schema
- trabajo mantenido en rama `codex/*`

## Formato De Cierre Humano
Ademas del JSON, el cierre resumido debe usar:
- `Input`
- `Output`
- `Checks`
- `Residual`
- `Next`

## Reglas Practicas
- Si dos agentes necesitan el mismo archivo, dividir por turnos o usar `using-git-worktrees`.
- No usar `npm run build` como unica senal de cierre en frentes operativos; priorizar smoke real y cleanup.
- Si cambia realtime o auth, volver a validar aislamiento y no solo UX.
- Si cambia terminologia canonica, reflejarla en `MEMORY.md` antes de cerrar.
