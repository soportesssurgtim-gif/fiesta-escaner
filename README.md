# Control de Asistencia - Fiesta de Empleados (Alcaldía SSSur)

Sistema web para registro de asistencia mediante escaneo de QR, gestión de empleados, eventos, sorteos y premios en fiestas institucionales.

## Stack

- **Frontend**: Vue.js 3 + Tailwind CSS + Font Awesome + html5-qrcode
- **Backend**: Vercel Serverless Functions (Node.js)
- **Base de datos**: Supabase (PostgreSQL + RLS)
- **Auth**: bcryptjs + sesiones server-side (TTL 6h)

## Estructura

```
├── index.html                 # Entry point SPA
├── assets/
│   ├── js/
│   │   ├── app.js            # Lógica Vue.js
│   │   └── api.js            # Cliente HTTP hacia /api/*
│   └── views/                # Componentes HTML parciales
├── api/
│   ├── _lib/supabase.js      # Cliente Supabase + helpers sesión
│   ├── login.js              # POST /api/login
│   ├── logout.js             # POST /api/logout
│   ├── empleados.js          # CRUD empleados
│   ├── departamentos.js      # CRUD departamentos
│   ├── eventos.js            # CRUD eventos
│   ├── premios.js            # CRUD premios
│   ├── sorteos.js            # CRUD sorteos
│   ├── asistencias.js        # Registro/consulta asistencias
│   ├── ganadores.js          # Registro ganadores
│   ├── usuarios.js           # CRUD usuarios
│   ├── roles.js              # CRUD roles
│   ├── permisos.js           # CRUD permisos por módulo
│   ├── configuracion.js      # Configuración general
│   ├── datos-iniciales.js    # Bundle inicial post-login
│   └── health.js             # Health check
├── supabase/
│   └── migrations/
│       └── 001_init_schema.sql  # Schema + RLS + seeds
├── vercel.json               # Rewrites + headers seguridad
├── .env.example              # Variables de entorno
└── package.json
```

## Configuración

1. Clonar repositorio
2. Copiar `.env.example` → `.env` y completar:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
3. Ejecutar migración SQL en Supabase (`supabase/migrations/001_init_schema.sql`)
4. Instalar dependencias: `npm install`
5. Desarrollo local: `npm run dev` (requiere Vercel CLI)
6. Producción: `npm run deploy`

## Seguridad

- **RLS activo** en todas las tablas (Supabase)
- **Service Role Key** solo en serverless functions (nunca en cliente)
- **Sesiones server-side** con tokens UUID + TTL
- **Passwords** hasheados con bcrypt (migración automática desde SHA256 legacy)
- **CORS + headers** restrictivos en `vercel.json`
- **Permisos granulares** por módulo y rol (ADMIN, LOGISTICA, LECTOR)

## Roles

| Rol | Descripción |
|-----|-------------|
| ADMIN | Acceso total a todos los módulos |
| LOGISTICA | Gestión de empleados, departamentos, eventos, asistencias |
| LECTOR | Solo escaneo QR y visualización de asistencias |

## Despliegue

El proyecto está configurado para desplegar en Vercel. Las API routes se exponen automáticamente bajo `/api/*` según `vercel.json`.

## Licencia

Uso interno - Alcaldía San Salvador Sur (SSSur)
Desarrollador: **Richard Peraza**