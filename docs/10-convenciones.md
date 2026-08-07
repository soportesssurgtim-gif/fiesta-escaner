# Convenciones y Estándares

## 1. Convenciones de Código

### 1.1 Backend (`/api/*.js`)
- **Estilo:** JavaScript moderno (ES6+).
- **Imports:** Siempre desde `'./_lib/supabase.js'`.
- **Export:** `export default async function handler(req, res)`.
- **Nombres de funciones:** `camelCase` para handlers, `PascalCase` para componentes Vue.
- **Manejo de errores:** `try/catch` en todas las funciones async, `console.error` con prefijo del módulo.
- **Response helper:** Usar `jsonResponse(res, status, data)` desde `_lib/supabase.js`.

### 1.2 Frontend (`assets/js/*.js`)
- **Vue 3 Composition API:** `setup()` como función principal.
- **Refs:** `const nombre = ref(valorInicial)`.
- **Reactive objects:** `const estado = reactive({ ... })`.
- **Computed:** `const calculado = computed(() => ...)`.
- **Funciones:** `function nombreFuncion() { ... }` dentro de `setup()`.
- **Return:** Todas las variables/funciones usadas en templates deben estar en el objeto de retorno.

### 1.3 Templates HTML (`assets/views/*.html`)
- **Indentación:** 2 espacios.
- **Atributos Vue:** Usar sintaxis corta (`@click`, `:class`, `v-if`).
- **Clases CSS:** Tailwind utility-first, evitar CSS custom en templates.
- **Eventos:** Usar prefijos semánticos (`guardar*`, `cargar*`, `abrir*`, `cerrar*`).

## 2. Estructura de Carpetas

```
fiesta-empleados/
├── api/                      # Serverless Functions (Vercel)
│   ├── _lib/                 # Librerías compartidas backend
│   │   └── supabase.js       # Cliente Supabase + helpers
│   ├── auth.js               # Login/logout + datos iniciales
│   ├── asistencia.js         # Asistencias y sincronización
│   ├── empleados.js          # CRUD empleados + CSV
│   ├── departamentos.js      # CRUD departamentos + CSV
│   ├── eventos.js            # CRUD eventos
│   ├── premios.js            # CRUD premios + sorteos
│   ├── roles.js              # CRUD roles + permisos
│   ├── tarjetas.js           # Plantillas de tarjetas
│   ├── usuarios.js           # CRUD usuarios
│   └── invitacion-publica.js # Portal público QR
├── assets/
│   ├── js/
│   │   ├── api.js            # Cliente HTTP frontend
│   │   ├── app.js            # Lógica principal SPA
│   │   ├── offline.js        # IndexedDB offline
│   │   ├── tarjetas.js       # Lógica de tarjetas
│   │   └── guias.js          # Contenido de guías
│   ├── views/                # Templates HTML (Vue SFC-like)
│   │   ├── login.html
│   │   ├── sidebar.html
│   │   ├── navbar.html
│   │   ├── main-inicio.html
│   │   └── ...
│   └── (css, images)         # Assets estáticos
├── docs/                     # Documentación técnica
│   ├── README.md
│   ├── 01-proposito.md
│   └── ...
├── supabase/
│   └── migrations/           # SQL migrations
│       ├── 001_init_schema.sql
│       └── 002_tarjetas_permisos.sql
├── index.html                # Entry point SPA
├── sw.js                     # Service Worker
├── package.json              # Dependencias backend + metadatos
└── vercel.json               # Configuración de Vercel
```

## 3. Convenciones de Commits

Usar **Conventional Commits**:

```
<tipo>(<alcance>): <descripción>

[tipo opcional body]
```

**Tipos:**
- `feat`: Nueva funcionalidad.
- `fix`: Corrección de bug.
- `docs`: Cambios en documentación.
- `refactor`: Refactorización sin cambio de comportamiento.
- `chore`: Tareas de mantenimiento (deps, config).

**Ejemplos:**
```
feat: add public invitation portal with DUI + last4 verification
fix: correct IDBKeyRange.only(false) error in offline mode
docs: create technical documentation in /docs
refactor: merge serverless functions to stay under Vercel Hobby limit
```

## 4. Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos JS | `kebab-case` | `asistencia.js`, `offline.js` |
| Archivos HTML | `kebab-case` | `vista-empleados.html` |
| Variables JS | `camelCase` | `sidebarAbierto`, `listaEmpleados` |
| Constantes | `UPPER_SNAKE_CASE` | `QR_CONTAINER_ID` |
| Componentes Vue | `PascalCase` | `setup()` (no componentes nombrados) |
| Clases CSS | Tailwind utilities | `bg-white`, `rounded-2xl` |
| IDs HTML | `kebab-case` | `lector-qr`, `app-skeleton` |

## 5. Seguridad

- **Nunca** exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend.
- **Siempre** validar `auth.token` en endpoints protegidos.
- **Siempre** usar `bcrypt` para passwords, nunca texto plano.
- **Nunca** confiar en datos del cliente sin validación backend.
- **Preferir** parámetros de query para filtros no sensibles.

## 6. Performance

- **Bundle inicial:** Mantener <5 llamadas HTTP en login.
- **Listados:** Paginar en frontend si >100 registros.
- **Imágenes:** Usar WebP cuando sea posible (no implementado actualmente).
- **CDNs:** Preferir versiones pinneadas (`@2.3.8`) para estabilidad.

## 7. Testing (Pendiente)

Actualmente sin tests automatizados. Se recomienda:
- **Unit tests:** Jest para lógica de backend (servicios).
- **E2E tests:** Playwright para flujos críticos (login, escaneo, sincronización).
- **Visual tests:** Percy o similar para regresiones de UI.

---

*Documento vivo. Actualizar con cada convención nueva.*
