# Control de Asistencia — Fiesta de Empleados

Sistema web de la **Alcaldía Municipal de San Salvador Sur** para registrar
asistencia por código QR, generar invitaciones digitales y realizar sorteos en
eventos institucionales.

Documentación técnica completa en [`docs/`](./docs/README.md).
Si retomas el proyecto después de la v2, empieza por
[`docs/12-migracion-v2.md`](./docs/12-migracion-v2.md).

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Vue 3 (CDN) · Tailwind CSS · Font Awesome · html5-qrcode · JSZip |
| Diseño | Sistema propio basado en [TailAdmin Free](https://github.com/TailAdmin) (MIT) |
| Backend | Una Serverless Function en Vercel (Node.js, ESM) |
| Base de datos | Supabase (PostgreSQL con RLS) |
| Autenticación | bcryptjs + sesiones en servidor (6 h de vigencia) |
| QR | QuickChart.io para generar · html5-qrcode para leer |

**Sin build tools.** No hay webpack ni vite: el navegador carga módulos ES
nativos y las librerías vienen de CDN.

---

## Estructura

```
├── index.html                     Punto de entrada
├── sw.js                          Service worker (caché de estáticos)
│
├── api/
│   ├── index.js                   LA ÚNICA Serverless Function
│   └── _lib/                      Nada de aquí cuenta contra el límite de Vercel
│       ├── enrutador.js           Reparte cada petición a su controlador
│       ├── repositorio.js         CRUD genérico sobre Supabase
│       ├── seguridad.js           Tokens, sesiones y guards
│       ├── respuestas.js          Respuestas HTTP estandarizadas
│       ├── peticion.js            Lectura del body y del query
│       ├── valores.js             DUI, banderas TRUE/FALSE
│       ├── csv.js                 Importar y exportar
│       ├── configuracion.js       Constantes compartidas
│       ├── supabase.js            Cliente con service_role
│       └── controladores/         Uno por recurso (11 en total)
│
├── assets/
│   ├── css/sistema-diseno.css     Tokens y componentes
│   ├── js/
│   │   ├── app.js                 Ensamblado y montaje de Vue
│   │   ├── nucleo/                HTTP, sesión, formato, tema, plantillas
│   │   ├── servicios/             API, offline (IndexedDB), tarjetas
│   │   ├── composables/           Catálogo, permisos, escáner, CSV, avisos
│   │   ├── componentes/           Componentes Vue globales
│   │   └── contenido/             Menú y guías de usuario
│   └── views/
│       ├── aplicacion.html        Layout con marcadores de inclusión
│       ├── parciales/             Login, barra lateral, encabezado, modales
│       └── vistas/                Una por pantalla
│
├── supabase/migrations/           001, 002 y 003 (alineación del schema)
├── docs/                          Documentación técnica
└── vercel.json                    Rewrites y cabeceras de seguridad
```

---

## Puesta en marcha

1. **Variables de entorno** en Vercel → Settings → Environment Variables:
   ```
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   ```
   La `service_role` es sensible: nunca debe llegar al navegador.

2. **Migraciones** en Supabase → SQL Editor, en orden:
   `001_init_schema.sql` → `002_tarjetas_permisos.sql` → `003_alineacion_schema.sql`

3. **Bucket de Storage** llamado `plantillas`, público. Guarda las imágenes de
   fondo de las tarjetas.

4. **Dependencias**: `npm install`

---

## Desarrollo local

### Preparar la configuración (una sola vez)

```bash
copy configuracion.local.example.mjs configuracion.local.mjs
```

Y completar los dos valores de Supabase. El archivo está en `.gitignore`: **no
se sube nunca**, porque contiene la llave `service_role`.

### Levantar el proyecto

```bash
npm run dev
```

Abre **http://localhost:3000**. `servidor-local.mjs` reemplaza a Live Server y
hace lo que a Live Server le falta en este proyecto:

- Sirve el front igual que cualquier servidor estático
- **Recarga el navegador solo** al guardar un archivo
- Ejecuta el mismo `api/index.js` que se despliega en Vercel
- Todo en un puerto, así que no hay CORS de por medio
- No necesita la CLI de Vercel ni una cuenta: es Node puro

```bash
node servidor-local.mjs --puerto 8080    # si el 3000 está ocupado
node servidor-local.mjs --sin-recarga    # desactivar la recarga automática
```

> **Live Server a secas no funciona aquí.** Solo sirve archivos: cuando el
> navegador manda un POST a `/api/auth`, responde **405 Method Not Allowed**
> porque para él eso es un archivo inexistente. No hay forma de que un servidor
> estático ejecute código de servidor.
>
> Si aun así lo prefieres, deja `npm run dev` corriendo en paralelo y abre el
> front desde Live Server: el cliente HTTP detecta que está en otro puerto local
> y redirige las peticiones al 3000, y el backend responde las cabeceras CORS
> (solo para `localhost` y `127.0.0.1`).

### Si ves código viejo tras editar

El service worker guarda los archivos en caché y los sirve desde ahí, así que en
desarrollo puede hacerte depurar código que ya cambiaste. Por eso **en
`localhost` no se registra**, y además se da de baja cualquiera que hubiera
quedado de antes junto con su caché.

Si vienes de una versión anterior y algo sigue raro: **Ctrl + Shift + R**.

### Por qué hace falta un backend aquí

En otros proyectos alcanza con un `configuracion.js` y el navegador habla
directo con Supabase usando la llave `anon`. Aquí no se puede:

- La migración 001 deja **RLS con `USING (false)`** para `anon` y
  `authenticated`: desde el navegador no se lee ni se escribe nada.
- Las contraseñas se verifican con **bcrypt del lado del servidor**.
- La única llave que abre esa base es `service_role`, y **no puede estar en el
  navegador**: con ella se lee y escribe toda la base de datos.

### Despliegue

```bash
npm run deploy
```

En producción no se usa `configuracion.local.mjs`: las variables salen de
Vercel → Settings → Environment Variables (`SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`).

---

## Contraseñas

Cada persona cambia la suya desde **el menú de usuario → Cambiar mi contraseña**.
Se le pide la actual para confirmar, y el servidor toma la cuenta de la sesión,
no del cuerpo de la petición: así nadie puede cambiarle la clave a otro.

Si alguien inicia sesión con una contraseña temporal (la que le puso un
administrador), el cambio se abre solo y no se puede saltar.

### Si nadie recuerda la contraseña

Dos caminos, según qué tengas a mano:

**Desde la terminal**, si el proyecto está configurado:

```bash
node herramientas/restablecer-clave.mjs --listar
node herramientas/restablecer-clave.mjs --correo alguien@dominio.sv --clave "Temporal2026#"
```

**Desde Supabase**, sin necesidad de tener el proyecto corriendo:
ejecuta [`supabase/restablecer-clave-admin.sql`](supabase/restablecer-clave-admin.sql)
en el SQL Editor. Usa `pgcrypto` para generar un hash bcrypt compatible, e
incluye una consulta final que confirma que la clave quedó válida.

> Un `UPDATE` normal con la contraseña en texto **no funciona**: la columna
> guarda un hash, no el texto. Por eso hacen falta estas dos vías.

`--listar` muestra las cuentas con su rol y estado, y avisa de lo que impediría
iniciar sesión: cuenta inactiva, sin rol asignado, o con un hash heredado de
SHA-256.

> **Este proyecto no usa Supabase Auth.** El panel Authentication → Users
> aparecerá siempre vacío, y eso es correcto: las cuentas viven en la tabla
> `usuarios` y las sesiones en la tabla `sesiones`. Crear un usuario desde ese
> panel no sirve para entrar al sistema.

---

## Seguridad

- **RLS activo** en todas las tablas, con políticas que niegan todo a `anon` y
  `authenticated`. El backend entra con `service_role`, que pasa por encima.
- **Toda la autorización vive en la capa de aplicación** (`api/_lib/seguridad.js`).
  El frontend oculta botones por comodidad, pero el servidor vuelve a validar
  cada operación.
- **Contraseñas** con bcrypt, y migración automática de los hashes SHA-256
  heredados la primera vez que la persona inicia sesión.
- **Sesiones** con token UUID en la tabla `sesiones`, revocables al instante.
- **Portal público** sin sesión, protegido por DUI + últimos 4 dígitos. Solo
  devuelve nombre y QR: ningún dato de contacto.

---

## Roles

| Rol | Alcance |
|-----|---------|
| `ADMIN` / `ADMINISTRADOR` | Acceso total, sin importar la matriz de permisos |
| Cualquier otro | Lo que diga la matriz `(rol, módulo, ver/agregar/editar/eliminar)` |

Los permisos se configuran desde la pantalla **Permisos** del sistema.

---

## Licencia

Uso interno — Alcaldía Municipal de San Salvador Sur.
Desarrollador: **Richard Peraza** · Gerencia de Tecnología.

El sistema de diseño se basa en TailAdmin Free, distribuido bajo licencia MIT.
