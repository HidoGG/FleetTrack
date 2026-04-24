# FleetTrack — Instrucciones Maestras

## Identidad
**FleetTrack** es una plataforma operativa para logística y delivery con múltiples actores:
- **Admin Web**: monitoreo, auditoría y control operativo
- **Store Portal**: carga de pedidos y operación de tienda
- **Mobile Rider**: ejecución de ruta, entregas y tracking GPS
- **Backend**: API REST, sockets, auth y reglas de negocio
- **Base de datos**: Supabase/PostgreSQL

**Stack real actual**
- Backend: Node.js + Express + Socket.io + Supabase JS
- Frontend: React + Vite + Zustand + React Query + Leaflet
- Mobile: React Native + Expo + Socket.io-client
- Lenguaje real dominante: **JavaScript**

---

## Fuente de Verdad
1. El **código** es la fuente principal de verdad.
2. Si hay conflicto entre código y documentación, seguir el código.
3. La documentación debe ajustarse al estado real del proyecto, no al estado deseado.
4. Corregir documentación solo cuando aporte valor operativo o evite errores futuros.

---

## Protocolo de Trabajo
0. `AGENTS.md` v2.2 es el estandar operativo transversal. Si no entra en conflicto con estas instrucciones maestras, seguirlo para roles, gates, handoffs y definicion de done.
0.1. Antes de actuar, todo agente debe consultar tambien la seccion `Evolucion De Capacidades y Orquestacion Senior` de `AGENTS.md` y ejecutar el bloque con ese piso tecnico.
1. Usar **contexto mínimo suficiente**.
2. Antes de actuar, definir el contrato de la tarea en forma breve:
   - **Input**
   - **Output**
   - **Checks**
3. No usar descripciones de personalidad como guía de ejecución. Usar especificaciones técnicas.
4. Ser breve por defecto.
5. Expandirse solo si hay:
   - riesgo real
   - bloqueo
   - cambio de contrato
   - impacto cruzado no obvio
6. Si falta contexto crítico, marcar la incertidumbre en una línea. No inventar.

---

## Reglas de Dominio FleetTrack
### Consistencia multi-actor
Si un cambio afecta estados, eventos o visibilidad de:
- pedidos
- viajes
- bultos
- tiendas
- riders

verificar sincronía entre:
- backend
- admin web
- store portal
- mobile rider
- sockets/eventos en tiempo real

### Aislamiento por rol/empresa
Verificar siempre visibilidad correcta por actor:
- **Admin**: puede ver el alcance administrativo definido
- **Store**: solo su tienda / su empresa según rol
- **Rider**: solo lo asignado y relevante para su flujo

Esto aplica a:
- queries
- endpoints
- estado UI
- listas
- badges
- alertas
- sockets
- mapas

---

## Contratos por Capa

### Backend Contract
**Alcance**
- `src/backend/`

**Input**
- endpoint, regla de negocio, contrato de datos, contexto de rutas/controladores/db

**Output**
- cambios en rutas, controladores, servicios o acceso a datos alineados al sistema actual

**Checks**
- auth
- aislamiento por rol/empresa
- shape de respuesta
- side effects
- consistencia multi-actor
- impacto en sockets/eventos
- compatibilidad con frontend/mobile existentes
- coherencia de errores: devolver errores consistentes, útiles y compatibles con el consumo de frontend/mobile

### Frontend Contract
**Alcance**
- `src/frontend/`

**Input**
- contrato API, estado actual de páginas/componentes/store, rol visible

**Output**
- UI integrada al flujo real del sistema

**Checks**
- loading / error / empty states
- visibilidad correcta por rol
- consistencia con backend
- sincronía con sockets si aplica
- consistencia multi-actor
- no exponer datos fuera de empresa/rol
- coherencia de errores: capturar y mostrar correctamente errores de backend en la UI

### Mobile Contract
**Alcance**
- `src/mobile/`

**Input**
- flujo actual del rider, estados backend, permisos del dispositivo, servicios activos

**Output**
- comportamiento alineado al flujo operativo real del rider

**Checks**
- permisos
- GPS / tracking
- errores de red
- sincronía de estados con backend/admin/store
- visibilidad correcta de lo asignado
- impacto en sockets y mapa
- coherencia de errores: reflejar fallos de red, permisos o backend sin romper el flujo del rider

### QA Contract
**Alcance**
- `tests/`

**Input**
- flujo crítico, bug reportado, contrato esperado

**Output**
- cobertura o validación del comportamiento crítico

**Checks**
- happy path
- edge cases relevantes
- consistencia de estado
- multi-actor si el flujo cruza módulos
- no testear ficción documental; testear comportamiento real

### DevOps Contract
**Alcance**
- infra, MCPs, deploy, migraciones, variables de entorno

**Input**
- estado real del proyecto, necesidad de entorno, migración o despliegue

**Output**
- entorno o integración consistente con el código actual

**Checks**
- variables requeridas
- orden correcto de migraciones
- consistencia entre entorno y código
- no asumir recursos externos no confirmados

---

## Memoria Operativa
`MEMORY.md` es **estado técnico vivo**, no una bitácora narrativa.

Usar etiquetas:
- `[ST]` estado actual
- `[DEC]` decisión vigente
- `[DEP]` dependencia o impacto cruzado
- `[BRK]` riesgo o ruptura
- `[NEXT]` siguiente acción concreta

Reglas:
- mantenerlo corto
- guardar solo lo que cambia decisiones futuras
- evitar narrativa larga
- priorizar claridad técnica

---

## Plan Vivo
`Plan.md` debe reflejar el estado real del proyecto y los próximos pasos verdaderos.

Reglas:
- no usarlo como wishlist histórica
- no marcar etapas completas si los checks internos siguen desalineados
- reemplazar tareas ya hechas por pendientes reales
- priorizar roadmap operativo sobre promesas viejas

---

## Definition of Done
No cerrar una tarea hasta validar:
1. que el output cumple el contrato definido
2. que no rompe contratos compartidos
3. que no rompe aislamiento por rol/empresa
4. que mantiene consistencia multi-actor
5. que el impacto en sockets, alertas, badges, listas y mapas fue considerado si aplica

Si cambió algo estructural:
- actualizar `MEMORY.md` de forma breve
- actualizar `Plan.md` si cambia el roadmap real

---

## Disciplina de Tokens
1. No repetir stack, visión o contexto conocido si no afecta la tarea.
2. No hacer resúmenes largos por cortesía.
3. Preferir:
   - listas cortas
   - snapshots
   - estado actual
   - riesgos concretos
   - siguiente acción clara
4. Evitar:
   - narrativa larga
   - arquitectura aspiracional
   - recaps redundantes
   - burocracia innecesaria

---

## Herramientas y Entorno
### MCPs disponibles
- `github`
- `supabase`
- `vercel`
- `stripe`

### Archivos operativos
- `CLAUDE.md`: reglas maestras estables
- `MEMORY.md`: estado técnico vivo
- `Plan.md`: roadmap real
- `.claude/settings.json`: configuración local de trabajo
- `.claude/mcp_config.json`: configuración MCP

### Comandos frecuentes
```bash
# Backend
cd src/backend && npm run dev

# Frontend
cd src/frontend && npm run dev

# Mobile
cd src/mobile && npx expo start

# Tests backend
cd src/backend && npm test
```
