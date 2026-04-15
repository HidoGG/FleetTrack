# Branch Notes - codex/superadmin-ui

## Regla de trabajo
- Esta rama es exclusiva para trabajo de Codex.
- No tocar `main` desde esta linea de trabajo.
- Todo cambio experimental, de UI, documentacion o refactor va solo en esta rama o en ramas hijas futuras de Codex.
- Si algo gusta, luego se mergea manualmente a `main`.
- Si algo no gusta, esta rama se puede descartar sin afectar la base estable.

## Contexto funcional base
- Proyecto: FleetTrack
- Fase activa: cierre de Fase 1 tecnica + superficie operativa minima para `super_admin`
- Documento funcional principal:
  - `C:\Users\Usuario\OneDrive\Desktop\FleetTrack\Documento-Maestro-Funcional.md`
- Base estable esperada en `main`:
  - backend Fase 1 ya validado
  - migracion B aplicada
  - capa backend `super_admin / company management` implementada

## Objetivo de esta rama
Construir y refinar la UI minima de `super_admin` sin tocar la rama principal.

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

## Trabajo en curso
- Segunda pasada de UX del panel `super_admin`
- En esta pasada ya se agrego:
  - edicion basica de empresa desde la propia UI
- Proxima mejora probable:
  - refinar feedback visual de empresa seleccionada
  - evaluar modal propio para suspension en vez de `window.prompt`
  - mantener la pagina simple, sin abrir tabs ni layouts nuevos

## Limitaciones conocidas
- El script `npm run build` del frontend hoy falla porque llama a `tsc` y el proyecto no tiene `tsconfig.json`.
- `vite build` en este entorno puede fallar por `spawn EPERM`; no tomar eso como prueba funcional definitiva del panel.

## Proxima recomendacion al retomar en otro chat
1. Leer este archivo.
2. Confirmar que la rama activa sea `codex/superadmin-ui`.
3. Revisar `SuperAdminPage.jsx`, `App.jsx`, `Sidebar.jsx`, `services/api.js`.
4. Seguir mejorando solo esta rama, nunca `main`.
