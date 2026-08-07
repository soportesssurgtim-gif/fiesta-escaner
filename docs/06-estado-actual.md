# Estado Actual del Sistema

## 1. Funcionalidades Implementadas y Operativas

### 1.1 Autenticación y Sesiones
- [x] Login con usuario/contraseña.
- [x] Logout con cierre de sesión server-side.
- [x] Sesiones almacenadas en tabla `sesiones` de Supabase.
- [x] Validación de token en cada request protegido.
- [x] Migración automática de passwords legacy (SHA256 → bcrypt).
- [x] Bundle inicial de catálogos en la respuesta de login.

### 1.2 Escáner QR y Asistencia
- [x] Escaneo en vivo con cámara (`html5-qrcode`).
- [x] Escaneo por foto/imagen del QR.
- [x] Registro de asistencia online.
- [x] Modo offline con IndexedDB (store: `asistencias_pendientes`).
- [x] Sincronización batch de pendientes (`sincronizar-pendientes`).
- [x] Deduplicación por evento + empleado.
- [x] Búsqueda de empleado por DUI, código o ID en el QR.
- [x] Validación de evento activo antes de registrar.

### 1.3 Portal Público de Invitaciones
- [x] Acceso mediante `?invitacion=1`.
- [x] Formulario de DUI + últimos 4 dígitos.
- [x] Validación server-side de últimos 4 dígitos.
- [x] Generación de QR via QuickChart.
- [x] Visualización del QR y datos del empleado.

### 1.4 Catálogos
- [x] **Empleados**: CRUD completo, import/export CSV.
- [x] **Departamentos**: CRUD completo, import/export CSV.
- [x] **Eventos**: CRUD + activación de evento único.
- [x] **Premios**: CRUD completo.
- [x] **Sorteos**: CRUD + ejecución de sorteo aleatorio.
- [x] **Roles**: CRUD completo.
- [x] **Permisos**: Matriz completa por rol y módulo.

### 1.5 Tarjetas de Invitación
- [x] Carga de plantilla de fondo.
- [x] Posicionamiento de QR por drag-and-drop.
- [x] Generación individual por empleado.
- [x] Generación en lote (batch con JSZip).
- [x] Persistencia de config de plantilla.

### 1.6 Interfaz y UX
- [x] Sidebar colapsable con tooltips.
- [x] Botón hamburguesa para mobile/desktop.
- [x] Guía de usuario contextual por vista (LordIcon).
- [x] Notificaciones toast.
- [x] Responsive con breakpoints móvil/tablet/desktop.
- [x] Layout full-width en desktop.

### 1.7 Seguridad
- [x] RBAC por módulo.
- [x] Passwords con bcrypt.
- [x] Protección de endpoints serverless.
- [x] Portal público sin autenticación pero con verificación DUI+last4.

## 2. Funcionalidades Pendientes / No Implementadas

| Funcionalidad | Estado | Nota |
|---------------|--------|------|
| Envío de invitaciones por correo/WhatsApp | Pendiente | Fuera de alcance actual |
| Multi-tenant | Pendiente | No requerido por cliente |
| Reportes analíticos | Pendiente | No requerido por cliente |
| PWA instalable | Parcial | Service worker solo para cache offline |
| Notificaciones push | No iniciado | No requerido por cliente |

## 3. Métricas de Sistema

| Métrica | Valor Actual |
|---------|--------------|
| Serverless Functions | **1 de 12** (Vercel Hobby) — era 11 antes de la v2 |
| Controladores de backend | 11, todos dentro de la única función |
| Vistas SPA | 14 |
| Tablas DB | 13 (con `plantillas_tarjetas`) |
| Módulos con permisos | 11 |
| Roles predefinidos | 3 en la migración inicial (ADMIN, LOGISTICA, LECTOR) |

> El salto de 11 funciones a 1 es el cambio estructural de la v2.
> Ver [12-migracion-v2.md](./12-migracion-v2.md).

---

*Documento vivo. Actualizar con cada release.*
