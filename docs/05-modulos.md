# Módulos del Sistema

## 1. Catálogo de Vistas

| Vista | ID | Descripción | Permisos Requeridos |
|-------|----|-------------|---------------------|
| Escáner QR | `scanner` | Escaneo de códigos QR para registro de asistencia | `asistencias.ver` (implícito) |
| Asistencias | `asistentes` | Listado y búsqueda de asistencias registradas | `asistencias.ver` |
| Sorteos y Rifas | `rifa` | Ejecución de sorteos y visualización de ganadores | `sorteos.ver` |
| Tarjetas | `tarjetas` | Diseño y generación de invitaciones con QR | `tarjetas.ver` |
| Departamentos | `departamentos` | CRUD de departamentos/unidades | `departamentos.ver` |
| Empleados | `empleados` | CRUD de empleados y export/import CSV | `empleados.ver` |
| Eventos/Fiestas | `eventos` | CRUD de eventos y activación | `eventos.ver` |
| Sorteos | `sorteos` | CRUD de sorteos y selección de ganadores | `sorteos.ver` |
| Premios | `premios` | CRUD de premios | `premios.ver` |
| Configuración | `configuracion` | Parámetros generales del sistema | `configuracion.ver` |
| Usuarios y Roles | `usuarios` | CRUD de usuarios del sistema | `usuarios.ver` |
| Permisos | `permisos` | Matriz de permisos por rol y módulo | `permisos.ver` |
| Portal Invitación | `invitacion-publica` | Consulta pública de QR por DUI | Sin autenticación |

## 2. Módulos de Backend (API)

### 2.1 auth
- **Ruta:** `/api/auth`
- **Métodos:** POST (login/logout), GET `?action=datos-iniciales`
- **Responsabilidad:** Autenticación, manejo de sesiones, bundle inicial de catálogos.
- **Dependencias:** `bcryptjs`, `supabase`.

### 2.2 asistencia
- **Ruta:** `/api/asistencia`
- **Métodos:** POST `?action=registrar`, POST `?action=sincronizar-pendientes`, GET (listar/diagnostico)
- **Responsabilidad:** Registro de asistencias, deduplicación, sincronización offline.
- **Dependencias:** `supabase`.

### 2.3 empleados
- **Ruta:** `/api/empleados`
- **Métodos:** CRUD + CSV import/export
- **Responsabilidad:** Gestión completa de empleados.
- **Dependencias:** `supabase`.

### 2.4 departamentos
- **Ruta:** `/api/departamentos`
- **Métodos:** CRUD + CSV import/export
- **Responsabilidad:** Gestión de departamentos.
- **Dependencias:** `supabase`.

### 2.5 eventos
- **Ruta:** `/api/eventos`
- **Métodos:** CRUD + POST `?action=set-activo`
- **Responsabilidad:** Eventos y activación de evento único.
- **Dependencias:** `supabase`.

### 2.6 premios
- **Ruta:** `/api/premios`
- **Métodos:** CRUD, GET `?action=sorteos`, POST `?action=sortear`
- **Responsabilidad:** Premios y lógica de sorteos/rifas.
- **Dependencias:** `supabase`.

### 2.7 roles
- **Ruta:** `/api/roles`
- **Métodos:** CRUD, GET `?action=permisos`, POST `?action=rol`, POST `?action=permiso`
- **Responsabilidad:** Roles y matriz de permisos.
- **Dependencias:** `supabase`.

### 2.8 tarjetas
- **Ruta:** `/api/tarjetas`
- **Métodos:** GET `?action=listar`, POST `?action=guardar`, POST `?action=eliminar`
- **Responsabilidad:** Plantillas de tarjetas de invitación.
- **Dependencias:** `supabase`.

### 2.9 usuarios
- **Ruta:** `/api/usuarios`
- **Métodos:** CRUD
- **Responsabilidad:** Usuarios del sistema.
- **Dependencias:** `supabase`.

### 2.10 invitacion-publica
- **Ruta:** `/api/invitacion-publica`
- **Métodos:** GET
- **Responsabilidad:** Portal público de consulta de QR.
- **Dependencias:** `supabase`.

## 3. Módulos Frontend

> Reorganizado en la v2. Antes todo esto vivía en un único `app.js` de 65 KB.

| Archivo | Responsabilidad |
|---------|-----------------|
| `assets/js/app.js` | Ensamblado: conecta las piezas y monta Vue |
| **Núcleo** | |
| `nucleo/clienteHttp.js` | Clase `ClienteHttp` y `ErrorApi`: fetch, token, errores |
| `nucleo/almacenSesion.js` | Persistencia de la sesión, con respaldo en memoria |
| `nucleo/formato.js` | DUI, fechas, comparación sin tildes |
| `nucleo/tema.js` | Modo claro / oscuro |
| `nucleo/cargadorVistas.js` | Resuelve las inclusiones de plantillas |
| **Servicios** | |
| `servicios/servicioApi.js` | Toda la API agrupada por recurso |
| `servicios/servicioOffline.js` | IndexedDB y sincronización |
| `servicios/servicioTarjetas.js` | Clase `DisenadorTarjetas`: canvas, QR y ZIP |
| **Composables** | |
| `composables/usarCatalogo.js` | Lista + búsqueda + paginación + modal |
| `composables/usarPermisos.js` | Matriz de permisos y `tienePermiso()` |
| `composables/usarEscanerQr.js` | Cámara, cola, reintentos y respaldo local |
| `composables/usarImportacionCsv.js` | Importación con barra de progreso |
| `composables/usarNotificaciones.js` | Pila de avisos |
| **Componentes y contenido** | |
| `componentes/comunes.js` | `PaginacionTabla`, `EstadoVacio`, `BarraCatalogo`, `InterruptorSimple` |
| `contenido/menu.js` | Estructura del menú lateral y distritos |
| `contenido/guias.js` | Guías de usuario por vista |
| **Plantillas** | |
| `assets/views/aplicacion.html` | Layout principal con marcadores de inclusión |
| `assets/views/parciales/*.html` | Login, barra lateral, encabezado, modales |
| `assets/views/vistas/*.html` | Una por pantalla del sistema |

## 4. Matriz de Permisos

Cada módulo tiene hasta 4 permisos:
- `puede_ver`
- `puede_agregar`
- `puede_editar`
- `puede_eliminar`

La función `tienePermiso(modulo, accion)` en frontend valida contra la matriz cargada en el bundle inicial.

## 5. Dependencias entre Módulos

```
auth (login)
  └── datos-iniciales (carga todos los catálogos)
       ├── empleados
       ├── departamentos
       ├── premios
       ├── roles
       ├── eventos
       ├── sorteos
       ├── permisos
       └── usuarios

asistencia (escaneo)
  └── auth (validar token)
  └── empleados (buscar por DUI/código/ID)
  └── eventos (validar evento activo)

tarjetas (generación)
  └── empleados (listar para selección)
  └── auth (validar token)

invitacion-publica (portal)
  └── empleados (buscar por DUI)
  └── eventos (validar evento activo)
```

---

*Documento vivo. Actualizar con cada nuevo módulo.*
