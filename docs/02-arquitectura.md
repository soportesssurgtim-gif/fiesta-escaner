# Arquitectura del Sistema

> **Actualizado en la v2.** El backend pasó de 11 Serverless Functions a una
> sola con enrutador interno, y el frontend se reorganizó en módulos ES.
> Ver [12-migracion-v2.md](./12-migracion-v2.md) para el detalle del cambio.

## 1. Visión General de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL EDGE                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  index.html │  │  assets/    │  │  api/ (Serverless Fns)  │  │
│  │  (SPA root) │  │  (static)   │  │  ≤12 endpoints          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE CLOUD                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ PostgreSQL  │  │   Auth /     │  │   Storage (opcional)    │  │
│  │   (DB)      │  │  Realtime    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTES / USUARIOS                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Navegador   │  │  Móvil      │  │  QR Impreso              │  │
│  │ (Desktop)   │  │  (Tablet)    │  │  (QuickChart)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Flujo de Escaneo y Registro de Asistencia

```
Empleado presenta QR
        │
        ▼
html5-qrcode (cámara o foto)
        │
        ▼
app.js :: registrarAsistencia(dui)
        │
        ▼
api/asistencia?action=registrar  (POST)
        │
        ▼
buscarEmpleadoPorIdentificador()
  ├── Por ID numérico
  ├── Por DUI normalizado
  └── Por código de empleado
        │
        ▼
Validar evento activo
        │
        ▼
Verificar duplicado (evento + empleado)
        │
        ▼
Insertar asistencia ─────────────────────────┐
        │                                    │
        ▼                                    ▼
  Respuesta 200 (éxito)              Si no hay red:
  { duplicado, empleado, mensaje }    app.js :: _guardarAsistenciaOffline()
                                         │
                                         ▼
                                   IndexedDB (store: asistencias_pendientes)
                                         │
                                         ▼
                                   api/asistencia?action=sincronizar-pendientes
                                   (POST batch con id_cliente por dispositivo)
```

## 3. Flujo de Portal Público de Invitaciones

```
Empleado abre /?invitacion=1
        │
        ▼
app.js detecta modoPublico = true
        │
        ▼
Vista: vista-invitacion-publica.html
        │
        ▼
Ingresa DUI + últimos 4 dígitos
        │
        ▼
GET /api/invitacion-publica?dui=...&ultimos4=...
        │
        ▼
Validar últimos 4 dígitos contra DUI registrado
        │
        ▼
Generar URL QR: QuickChart
        │
        ▼
Mostrar QR + datos del empleado
```

## 4. Capas de la Aplicación

### 4.1 Frontend (SPA sin framework de build)
- **Vue 3** (runtime + compiler desde CDN)
- **Tailwind CSS** (CDN) + sistema de diseño propio en `assets/css/sistema-diseno.css`
- **Módulos ES nativos**: `app.js` es el único punto de entrada e importa el resto.
- **Vistas como plantillas HTML** con un sistema de inclusión
  (`assets/views/aplicacion.html` + marcadores que resuelve `cargadorVistas.js`).
- **Sin enrutador**: cambio de vista mediante variable reactiva `vista`.
- **IndexedDB**: persistencia offline de asistencias pendientes.
- **Modo claro / oscuro** con preferencia persistida.

### 4.2 Backend (una sola Serverless Function)
- `api/index.js` es la **única** función desplegada. Recibe todo `/api/*` y
  reparte hacia el controlador correspondiente.
- El reparto lo habilita un rewrite en `vercel.json` que inyecta el recurso
  como parámetro: `/api/:recurso` → `/api/index?recurso=:recurso`.
- Todo el código compartido vive en `api/_lib/`. Vercel **no** lo cuenta como
  función porque la carpeta empieza con guion bajo.
- **ESM nativo**; Vercel lo transpila a CommonJS en el build.
- Consumo actual: **1 de 12 funciones**. El límite dejó de ser un factor.

### 4.3 Base de Datos
- **Supabase** (PostgreSQL gestionado).
- Acceso mediante cliente Supabase JS con `service_role` en backend.
- **Row Level Security** desactivado o bypasseado por service_role; la seguridad se maneja en la capa de aplicación.

## 5. Recursos de la API

Las rutas públicas **no cambiaron** respecto de la v1: lo que cambió es que
todas las atiende la misma función. Los controladores viven en
`api/_lib/controladores/`.

| Recurso | Ruta | Métodos | Responsabilidad |
|---------|------|---------|-----------------|
| `autenticacion` | `/api/auth` | POST login/logout, GET `?accion=datos-iniciales` | Sesión y bundle inicial de catálogos |
| `asistencias` | `/api/asistencias` | POST `?accion=registrar`, POST `?accion=sincronizar-pendientes`, GET listar / `?accion=diagnostico` | Registro y sincronización offline |
| `empleados` | `/api/empleados` | CRUD + `?accion=exportar-csv` / `importar-csv` | Padrón de personal |
| `departamentos` | `/api/departamentos` | CRUD + CSV | Unidades organizativas |
| `eventos` | `/api/eventos` | CRUD + POST `?accion=set-activo` | Eventos y activación exclusiva |
| `premios` | `/api/premios` | CRUD, GET `?accion=sorteos`, POST `?accion=sortear`, POST `?accion=sorteo` | Premios y sorteos |
| `roles` | `/api/roles` | CRUD, GET `?accion=permisos` / `modulos`, POST `?accion=permiso` / `permisos-rol` | Roles y matriz de permisos |
| `tarjetas` | `/api/tarjetas` | GET listar / `?accion=empleados`, POST guardar / `?accion=eliminar` | Plantillas de invitación |
| `usuarios` | `/api/usuarios` | CRUD | Cuentas de acceso |
| `configuracion` | `/api/configuracion` | GET, POST | Interruptores del sistema |
| `invitacion-publica` | `/api/invitacion-publica` | GET | Portal público (sin sesión) |

**Alias mantenidos por compatibilidad:** `asistencia` (singular), `autenticacion`,
`dpto`, `sorteos`, `permisos`, `plantillas`, `invitacion`.

**Parámetro de acción:** se acepta tanto `?accion=` como `?action=`, para no
romper nada que hubiera quedado en caché del navegador.

## 6. Modelo de Seguridad

- **Backend-only**: todas las operaciones sensibles pasan por funciones serverless.
- **Token de sesión**: generado en login, almacenado en `localStorage`, enviado en headers.
- **Permisos por módulo**: matriz `(rol, modulo, puede_ver, puede_agregar, puede_editar, puede_eliminar)`.
- **Portal público**: sin autenticación, pero protegido por conocimiento de DUI + últimos 4 dígitos.

## 7. Consideraciones de Performance

- **Bundle inicial**: `auth.js` carga todos los catálogos en una sola llamada al login.
- **Sin paginación en backend**: listados se traen completos y se paginan en frontend.
- **QR via CDN**: QuickChart genera QR en tiempo real sin procesamiento local.
- **Offline-first para asistencias**: escritura garantizada incluso sin red.

---

*Documento vivo. Actualizar con cada cambio arquitectónico.*
