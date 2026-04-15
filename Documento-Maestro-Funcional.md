# Documento Maestro Funcional - FleetTrack

## 1. Vision General

FleetTrack deja de ser solamente una app de fleet tracking o delivery simple y pasa a ser una plataforma operativa multiempresa para gestionar:

- empresas clientes
- usuarios por rol
- tiendas, sucursales y ubicaciones operativas
- repartidores y rutas
- pedidos, retiros y traslados
- incidentes y alertas
- metricas y herramientas segun plan

El sistema debe permitir operar varias empresas distintas dentro de una misma plataforma, manteniendo aislamiento entre clientes y control total por parte de los duenos de la app.

## 2. Actores Principales

### Super Admin

Usuarios propietarios de la plataforma:

- `gabriel@admin.com`
- `gaston@admin.com`

Responsabilidades:

- acceso total a todas las empresas
- crear, editar, suspender y eliminar empresas
- crear, editar, suspender y eliminar usuarios
- definir roles, accesos, planes, limites y features por empresa
- ingresar como observador o soporte a cualquier empresa
- corregir problemas operativos o administrativos
- ver incidentes, operacion, auditoria y estado comercial global

### Admin de Empresa

Responsable de una empresa cliente.

Responsabilidades:

- administrar solo su empresa
- ver usuarios, tiendas, repartidores, operacion e incidentes de su empresa
- gestionar operacion segun plan contratado
- editar configuraciones permitidas de su empresa
- usar dashboards operativos y metricos

Limitaciones:

- no crea usuarios salvo futura excepcion premium si se habilita
- no suspende usuarios
- no puede tocar configuracion global ni otras empresas

### Usuario de Tienda

Responsable operativo de una sola tienda.

Responsabilidades:

- crear operaciones
- ver y editar operaciones de su tienda
- volver estados hacia atras cuando haga falta
- recibir alertas operativas
- ver historial de su tienda
- usar mini metricas simples

Limitaciones:

- no ve otras tiendas
- no ve mapa global
- no ve usuarios ni estructura general

### Rider

Responsable de retiro, traslado y entrega.

Responsabilidades:

- ver su jornada
- ver su ruta y operaciones asignadas
- ver puntos operativos necesarios
- reportar incidentes
- marcar avances operativos

Limitaciones:

- no ve operaciones ajenas
- no ve configuracion administrativa
- no gestiona estructura ni usuarios

## 3. Multiempresa

Cada usuario operativo pertenece a una sola empresa.

Cada usuario de tienda pertenece a una sola tienda.

Cada empresa puede tener:

- varias tiendas o sucursales
- uno o mas depositos
- uno o mas puntos logisticos
- oficinas operativas
- puntos de retiro temporales o permanentes

Los `super_admin` no dependen funcionalmente de una empresa cliente y deben poder ver todas.

## 4. Roles del Sistema

Roles activos definidos:

- `super_admin`
- `company_admin`
- `store`
- `driver`

El sistema debe quedar preparado para sumar otros roles en el futuro sin redisenar toda la base:

- `supervisor`
- `auditor`
- `support_readonly`
- otros segun crecimiento

## 5. Empresas y Branding

Cada empresa debe sentirse como un cliente propio dentro de la plataforma.

Cada empresa debe poder tener:

- nombre legal
- nombre visible o comercial
- telefono principal
- email principal
- direccion principal
- logo opcional a futuro
- branding visible en interfaz

La app debe poder mostrar algo como:

- `FleetTrack | Nombre Empresa`

La direccion principal maestra de la empresa solo la modifica `super_admin`.

## 6. Planes Comerciales

FleetTrack se vende por plan.

Planes base sugeridos:

- `basic`
- `pro`
- `enterprise`

Pero el sistema no debe depender solo del nombre del plan. Cada empresa debe tener configuracion personalizable:

- plan base
- estado comercial
- features habilitadas
- limites
- addons

Estados comerciales sugeridos:

- `trial`
- `active`
- `past_due`
- `suspended`
- `archived`

Cada empresa debe poder tener:

- features activadas o desactivadas manualmente
- limites configurables
- addons opcionales
- comentarios internos comerciales

## 7. Features y Limites

Ejemplos de features configurables por empresa:

- mapa en vivo
- incidentes
- historial avanzado
- dashboard financiero
- fotos de factura y entrega
- multiples ubicaciones
- trazabilidad completa
- rollback operativo
- metricas avanzadas

Ejemplos de limites:

- cantidad de usuarios
- cantidad de tiendas
- cantidad de riders
- cantidad de ubicaciones
- cantidad de operaciones por mes

Regla:

- si una empresa supera un limite, se bloquean nuevas altas o nuevas creaciones
- no se debe romper la operacion ya existente

## 8. Ubicaciones Operativas

FleetTrack no debe depender solo de tiendas.

Debe existir una estructura general de ubicaciones operativas.

Tipos de lugar contemplados:

- tienda
- sucursal
- deposito
- logistica
- oficina o admin
- punto de retiro
- otros

Cada ubicacion debe poder tener:

- empresa
- nombre
- tipo
- direccion
- coordenadas
- activa o inactiva
- visible o no para riders
- permanente o temporal

### Visibilidad

Super Admin:

- ve todas las ubicaciones

Admin Empresa:

- ve todas las ubicaciones de su empresa

Rider:

- ve las ubicaciones necesarias para su operacion
- algunas siempre visibles
- otras segun contexto operativo

## 9. Operacion General

FleetTrack debe soportar una operacion dinamica.

Tipos de movimiento u operacion deseados:

- tienda a cliente final
- deposito a tienda
- tienda a tienda
- logistica a cliente
- retiro a cliente
- otros movimientos internos

La idea funcional es dejar de pensar todo solamente como "pedido" y pasar a una estructura unificada de "operacion", aunque en interfaz se puedan seguir usando nombres amigables distintos.

## 10. Tipos de Operacion

Tipos funcionales sugeridos:

- entrega a cliente
- retiro
- traslado interno
- traslado entre tiendas
- traslado desde deposito
- logistica

Esto permite que el sistema sea flexible sin depender de un unico flujo.

## 11. Estados Operativos

Para tienda, los estados clave visibles siguen siendo:

- en preparacion
- esperando retiro por repartidor

En backend y operacion general se contempla una evolucion mayor:

- borrador
- en preparacion
- listo para retiro
- aceptado
- en camino
- entregado
- fallido
- cancelado

## 12. Rollback Operativo

Debe existir rollback operativo real.

Caso prioritario:

- de `esperando retiro` a `en preparacion`

Reglas:

- lo puede ejecutar tienda, admin empresa y super admin
- puede hacerse multiples veces
- motivo opcional
- si la operacion vuelve para atras, desaparece del flujo del rider
- si el rider ya iba en camino a buscarla, debe recibir aviso claro
- todo cambio queda registrado

## 13. Edicion de Operaciones

La tienda debe poder editar completamente las operaciones de su tienda.

Incluso si el rider ya acepto, el sistema debe manejar:

- seguir igual
- se modifico informacion
- no venir, se cancelo

Toda edicion debe registrar:

- estado anterior
- contenido anterior
- contenido nuevo
- hora del cambio

## 14. Alertas y Notificaciones

La plataforma debe tener alertas operativas persistentes.

### Para tienda

Debe recibir alertas de:

- rider cerca
- pedido aceptado
- pedido retirado
- pedido entregado
- cambios relevantes
- incidentes relacionados a sus operaciones

### Para rider

Debe recibir alertas de:

- operacion nueva o actualizada
- no ir
- seguir igual
- cambio de direccion
- cancelacion
- cambios relevantes en una operacion ya comprometida

### Regla

Las alertas no deben vivir solo por socket. Deben poder quedar registradas.

## 15. Historial

El sistema debe tener historial real de operacion.

Debe registrar al menos:

- hora
- accion realizada
- descripcion o nota
- estado anterior y posterior
- actor que hizo el cambio
- contenido antes y despues cuando hubo edicion

### Historial visible por actor

Tienda:

- historial de sus operaciones
- cambios de estado
- correcciones
- alertas relevantes

Admin Empresa:

- historial de toda su empresa

Super Admin:

- historial global y auditoria avanzada

## 16. Incidentes

Los incidentes deben ir separados del historial de la operacion.

Tipos de incidente deseados:

- cliente ausente
- direccion incorrecta
- tienda cerrada
- no entregaron el paquete
- producto danado
- demora
- problema mecanico
- otros

### Reglas

- los incidentes los reporta el rider
- los ve `super_admin` y `company_admin`
- no bloquean automaticamente la operacion
- algunos requieren foto
- otros requieren nota
- otros requieren ubicacion
- debe quedar preparado para seguimiento posterior

## 17. Trazabilidad Entre Tiendas

Cuando una tienda vende producto de otra tienda y el rider va directo a la segunda tienda a buscar el pedido, FleetTrack debe recordar a ambas tiendas que tienen que hacer el traspaso interno en su propio sistema para mantener trazabilidad y no romper stock.

Esto no debe bloquear la operacion.

Debe mostrarse como:

- banner operativo no invasivo
- visible
- contextual

Debe aparecer para:

- tienda que vendio
- tienda que entrega o prepara

La plataforma debe recordar:

- registrar traspaso interno
- registrar egreso/recepcion segun corresponda

## 18. Panel de Super Admin

Debe existir un panel global con estas secciones:

- dashboard
- empresas
- usuarios
- ubicaciones
- operacion global
- incidentes
- auditoria

### Dashboard Super Admin

Debe mostrar:

- empresas activas
- empresas en prueba
- empresas suspendidas
- usuarios totales
- riders
- operacion diaria
- incidentes abiertos
- alertas globales

### Ficha de empresa

Debe incluir:

- datos generales
- plan y permisos
- estado comercial
- comentarios internos
- usuarios
- ubicaciones
- operacion
- incidentes
- acceso como observador
- acceso como soporte

### Ingreso a empresa

Super Admin puede entrar:

- como observador
- como soporte

Solo el modo soporte debe quedar auditado.

## 19. Panel de Admin Empresa

Secciones recomendadas:

- dashboard
- operacion
- mapa
- riders
- ubicaciones
- incidentes
- usuarios
- empresa/configuracion
- metricas

### Dashboard

Debe mezclar:

- operacion diaria
- indicadores simples
- metricas
- informacion comercial y estadistica segun plan

### Permisos

Puede:

- gestionar su operacion
- ver usuarios
- gestionar riders segun plan
- gestionar ubicaciones segun plan
- responder incidentes
- usar metricas segun plan

No puede:

- tocar otras empresas
- tocar configuracion global
- tocar planes globales
- suspender usuarios

## 20. Panel de Tienda

Secciones recomendadas:

- inicio
- nueva operacion
- operaciones
- alertas
- historial
- mini metricas

### Debe poder

- crear operaciones
- crear entregas a cliente
- crear envios a otros lugares
- editar todo en su operacion
- hacer rollback
- recibir alertas
- ver historial de su tienda

### No debe poder

- ver otras tiendas
- ver mapa global
- ver estructura completa de la empresa
- ver usuarios

## 21. Panel del Rider

Secciones recomendadas:

- mi jornada
- ruta
- operaciones
- incidentes
- historial
- perfil

### Experiencia buscada

Debe parecer una herramienta de trabajo rapida, visual y clara, inspirada en apps de reparto profesionales, pero adaptada a FleetTrack.

### Debe mostrar

- proxima operacion
- resumen del dia
- ruta
- lista de tareas
- puntos operativos
- alertas de cambios
- acceso rapido a incidentes

### Debe soportar

- retiro
- entrega
- traslado
- logistica
- cambios en tiempo real
- avisos de cancelacion o modificacion

## 22. Metricas

FleetTrack debe diferenciarse por las metricas.

### Super Admin

- metricas globales del sistema
- empresas activas
- actividad general
- incidentes
- estado comercial

### Admin Empresa

- metricas basicas y avanzadas segun plan
- rendimiento por tienda
- rendimiento por rider
- tiempos de entrega
- valor en transito
- efectivo a rendir
- actividad por zona

### Tienda

- mini metricas simples
- pedidos del dia
- preparados
- retirados
- entregados

## 23. Auditoria

Debe existir una seccion especifica de auditoria.

Debe registrar:

- altas y cambios de empresa
- altas y cambios de usuario
- cambios de rol
- cambios de plan
- cambios de features y limites
- suspensiones
- ingresos en modo soporte
- acciones sensibles

## 24. Principios de Producto

FleetTrack debe cumplir estos principios:

- multiempresa real
- control global para super admin
- operacion flexible
- trazabilidad
- alertas utiles
- permisos por rol
- permisos por empresa
- funciones por plan
- crecimiento gradual sin reescritura total

## 25. Principios Tecnicos

La evolucion del sistema debe seguir estas reglas:

- no romper lo que ya funciona
- migrar por fases
- mantener compatibilidad temporal donde haga falta
- separar identidad de pertenencia operativa
- separar operacion de asignacion del rider
- separar historial de incidentes
- validar planes y permisos en backend y frontend

## 26. Fases Recomendadas

### Fase 1

- super admin real
- empresas
- usuarios
- memberships
- planes y permisos

### Fase 2

- ubicaciones operativas generales
- paneles administrativos iniciales

### Fase 3

- historial
- alertas persistidas
- incidentes
- rollback completo
- banners operativos

### Fase 4

- evolucion de pedidos hacia operaciones dinamicas
- asignaciones mas ricas para riders

### Fase 5

- refinamiento total de paneles
- metricas avanzadas
- mejoras comerciales y addons

## 27. Decision Estrategica Final

FleetTrack no debe seguir creciendo a base de parches.

Debe evolucionar como una plataforma SaaS multiempresa, con:

- administracion global
- operacion flexible
- permisos por rol y plan
- trazabilidad real
- paneles especializados por actor

Este documento funciona como base funcional maestra para la siguiente etapa:

- definicion tecnica
- migraciones nuevas
- rediseño de backend
- rediseño de frontend
