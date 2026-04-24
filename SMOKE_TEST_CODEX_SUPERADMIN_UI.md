# Smoke Test - codex/superadmin-ui

## Regla
- Ejecutar estas pruebas solo sobre la rama `codex/superadmin-ui`.
- No mezclar validaciones con `main`.

## Precondiciones
- Backend corriendo
- Frontend corriendo
- Existe un usuario `super_admin` funcional
- Existen endpoints backend de companies/profiles ya operativos

## 1. Acceso a ruta
- Login con `super_admin`
- Verificar que aparece item `Plataforma` en sidebar
- Entrar a `/super-admin`
- Esperado:
  - renderiza la vista sin redirect
  - se listan empresas

## 2. Guard de acceso
- Login con usuario `admin` comun
- Navegar manualmente a `/super-admin`
- Esperado:
  - redirect a `/dashboard`
  - el item `Plataforma` no aparece en sidebar

## 3. Crear empresa
- Entrar a `Plataforma`
- Click en `Nueva empresa`
- Completar:
  - nombre
  - plan
- Esperado:
  - empresa creada
  - aparece en la tabla
  - queda seleccionada

## 4. Editar empresa
- Elegir una empresa
- Click en `Editar`
- Cambiar nombre comercial, email o telefono
- Guardar
- Esperado:
  - se actualiza sin salir de la pagina
  - la empresa sigue seleccionada

## 5. Cambiar estado de empresa
- Sobre una empresa cliente:
  - suspender
  - activar
  - inactivar
- Esperado:
  - badge de estado cambia correctamente
  - no rompe el listado

## 6. Ver perfiles por empresa
- Click en `Ver perfiles`
- Esperado:
  - se carga la tabla inferior
  - solo muestra perfiles de esa empresa

## 7. Crear perfil admin
- Con empresa seleccionada
- Click en `Nuevo perfil`
- Crear perfil `admin`
- Esperado:
  - aparece en el listado
  - backend responde OK

## 8. Crear perfil store
- Con empresa seleccionada
- Click en `Nuevo perfil`
- Elegir rol `store`
- Verificar que `store_id` pasa a ser obligatorio
- Esperado:
  - sin `store_id` no deberia enviarse bien
  - con `store_id` valido se crea

## 9. Suspender / activar perfil
- Sobre un perfil activo:
  - click en `Suspender`
  - escribir motivo
- Esperado:
  - pasa a `Suspendido`
- Luego:
  - click en `Activar`
- Esperado:
  - vuelve a `Activo`

## 10. Errores visibles
- Forzar algun caso invalido:
  - empresa sin nombre
  - perfil store sin `store_id`
- Esperado:
  - el mensaje de error del backend se ve en pantalla

## Limitaciones conocidas
- La suspension de perfil usa `window.prompt`; es funcional pero no es UX final.
- El frontend todavia no expone todos los campos editables de `companies`.
- El build del frontend no es una verificacion confiable del repo en este entorno por deudas previas de toolchain.
