# Migración a la versión 2

> Consolidación del backend en una sola función, rediseño completo de la
> interfaz sobre TailAdmin y refactorización a código modular en español.

---

## 1. Lo que hay que hacer antes de desplegar

Estos dos pasos son **obligatorios**. Sin ellos el sistema arranca pero falla en
partes concretas.

### 1.1 Correr la migración SQL

```
Supabase → SQL Editor → pegar supabase/migrations/003_alineacion_schema.sql → Run
```

Agrega lo que el código ya usaba pero no estaba declarado en ninguna migración:

| Qué | Por qué hace falta |
|-----|--------------------|
| `empleados.codigo` | El escáner lo acepta como identificador y las tarjetas lo imprimen |
| `asistencias.id_cliente` | Es la llave con la que se deduplica la sincronización offline |
| Tabla `plantillas_tarjetas` | El módulo de invitaciones completo |
| Índice único `permisos (rol, modulo)` | **Sin esto, guardar permisos falla**: el upsert necesita esa restricción |
| Filas en `configuracion` | Los interruptores de la pantalla de configuración |

Es idempotente: se puede correr las veces que haga falta. Si esas columnas ya
existían en producción (creadas a mano desde el panel), no rompe nada.

### 1.2 Crear el bucket de Storage

```
Supabase → Storage → New bucket
  Nombre : plantillas
  Público: SÍ
```

Ahí se guardan las imágenes de fondo de las tarjetas. Necesita ser público para
que el navegador pueda mostrarlas mientras se posiciona el QR. No contiene datos
personales.

---

## 2. Backend: de 11 funciones a 1

### El problema

El plan Hobby de Vercel permite 12 Serverless Functions. Cada archivo en la raíz
de `/api` cuenta como una. Había 11. Estábamos a un endpoint del techo.

### La solución

Una sola función (`api/index.js`) que recibe todo `/api/*` y reparte hacia el
controlador correspondiente. Todo lo demás vive bajo `api/_lib/`, que Vercel
**no** cuenta porque empieza con guion bajo.

```
api/
  index.js                     ← la ÚNICA función desplegada
  _lib/
    configuracion.js           constantes compartidas
    supabase.js                cliente (service_role)
    seguridad.js               tokens, sesiones, guards
    respuestas.js              respuestas HTTP estandarizadas
    peticion.js                lectura del body y del query
    valores.js                 conversiones (DUI, banderas TRUE/FALSE)
    csv.js                     importación y exportación
    repositorio.js             CRUD genérico sobre una tabla
    enrutador.js               reparto de peticiones
    controladores/
      catalogo.js              fábrica de controladores CRUD
      importacionCsv.js        motor compartido de importación
      autenticacion.js  asistencias.js  empleados.js
      departamentos.js  eventos.js      premios.js
      roles.js          tarjetas.js     usuarios.js
      configuracion.js  invitacionPublica.js
```

El enrutado lo hace `vercel.json`:

```json
{ "source": "/api/:recurso", "destination": "/api/index?recurso=:recurso" }
```

**Las URLs no cambiaron.** `/api/empleados?accion=exportar-csv` sigue
funcionando igual. Además se registraron alias para las rutas viejas
(`asistencia` en singular, por ejemplo), por si quedó algo en caché.

### Duplicación eliminada

| Qué se repetía | Dónde estaba | Ahora |
|----------------|--------------|-------|
| Guard de sesión (10 líneas) | En los 11 endpoints | `seguridad.js::exigirSesion` |
| CRUD listar/guardar | En 7 catálogos | `repositorio.js` + `catalogo.js` |
| `csvEscape` + exportar + importar | Duplicado literal en 2 archivos | `csv.js` + `importacionCsv.js` |
| Validación de administrador | En 9 lugares | `seguridad.js::esAdministrador` |

Un catálogo nuevo ahora son unas quince líneas en vez de un archivo de ciento
cincuenta.

---

## 3. Errores que salieron a la luz y quedaron corregidos

Al leer el código para consolidarlo aparecieron varios problemas reales. Todos
están arreglados, pero conviene saber que existían porque explican síntomas que
quizá se habían notado sin encontrarles causa.

### 3.1 La sincronización offline nunca funcionó

`assets/js/offline.js` mandaba los pendientes a `/api/asistencias` (plural)
cuando el endpoint se llamaba `/api/asistencia` (singular). El 404 se tragaba en
un `if (!res.ok)` que devolvía un contador de errores sin avisar a nadie.

**Consecuencia:** todo lo que se escaneaba sin señal se guardaba en el
dispositivo y nunca subía.

### 3.2 El service worker inventaba éxitos

Ante un POST fallido a asistencias, `sw.js` devolvía una respuesta fabricada
`{ ok: true, offline: true }` con estado 200.

**Consecuencia:** la aplicación creía que la asistencia se había registrado, no
activaba el respaldo local, y el escaneo se perdía sin dejar rastro. Es el más
grave de los que aparecieron.

### 3.3 Guardar un sorteo creaba un premio

`apiGuardarSorteo()` hacía POST a `/api/premios` sin ninguna acción, así que el
backend lo interpretaba como el alta de un premio.

### 3.4 `getSession` no estaba importado

`api/auth.js` la llamaba en la línea 182 pero no figuraba en el import de la
línea 2. `GET /api/auth?action=datos-iniciales` lanzaba `ReferenceError`.

### 3.5 El módulo de tarjetas estaba roto de raíz

El frontend llamaba a `supabase.storage.from(...)` pero **el cliente de Supabase
nunca se cargó en el navegador**. Guardar plantillas y generar invitaciones
lanzaba `supabase is not defined`.

Ahora la imagen viaja en base64 al backend, que es quien tiene credenciales y la
sube. Es además lo correcto: la llave `service_role` no debe estar en el
navegador bajo ninguna circunstancia.

### 3.6 Archivo con la codificación corrupta

`app.js` tenía caracteres rotos (`Gu�a`, `�ltimos 4 d�gitos`). La función
`limpiarTildes()` tenía sus clases de caracteres destruidas y no quitaba ningún
acento, así que las búsquedas por nombre fallaban con tildes.

### 3.7 Otros

- **CSV partido por comas a ciegas**: un departamento llamado "Obras Públicas,
  Urbanismo" se partía en dos columnas y descuadraba toda la fila.
- **Importador por posición fija**: mover una columna en Excel rompía la carga.
  Ahora se guía por el encabezado.
- **Consultas N+1**: la sincronización pedía el evento activo y la lista completa
  de empleados *dentro del bucle*, una vez por registro.
- **`Number(e.id)` sobre UUIDs**: la búsqueda por ID nunca podía acertar.
- **Kill switches decorativos**: la pantalla de configuración mostraba
  interruptores que eran texto fijo en el HTML, sin nada detrás.
- **Modal de guía duplicado**: existían dos copias con iconografía distinta.

---

## 4. Interfaz: TailAdmin

Basada en [TailAdmin Free](https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template),
licencia MIT. Se tomaron su paleta, su tipografía (Outfit) y sus patrones de
componente; el código está escrito desde cero para este proyecto.

> La demo de `demo.tailadmin.com` corresponde a la versión Pro, que es de pago.
> No se copió nada de ahí.

### Novedades

- **Modo claro y oscuro**, con detección de la preferencia del sistema y
  alternador en el encabezado. Se aplica antes del primer pintado para que no
  haya destello blanco.
- **Barra lateral en tres estados**: completa, colapsada a iconos con tooltip, y
  deslizante en móvil.
- **Evento activo siempre visible** en la barra lateral. Si no hay ninguno, sale
  una advertencia: es la causa número uno de que el escáner no registre.
- **Notificaciones apiladas**. Antes solo cabía una y las siguientes la pisaban,
  cosa que pasaba constantemente escaneando en fila.
- **Paginación en todas las tablas** (antes solo la tenía departamentos).
- **Búsquedas que ignoran tildes y mayúsculas**.

### Sistema de diseño

`assets/css/sistema-diseno.css` contiene los tokens y los componentes
(`.tarjeta`, `.boton-*`, `.campo`, `.tabla`, `.insignia-*`…). Está escrito en CSS
plano y no con `@apply` porque, sirviendo Tailwind desde CDN, `@apply` solo
funciona dentro de un `<style type="text/tailwindcss">` en el HTML, no en una
hoja externa.

**Regla:** si una combinación de clases aparece en más de tres vistas, baja a ese
archivo como componente.

---

## 5. Frontend: del monolito a módulos

`app.js` tenía 65 KB con absolutamente todo dentro. Ahora:

```
assets/js/
  app.js                       ensamblado (solo conecta piezas)
  nucleo/
    clienteHttp.js             clase ClienteHttp + ErrorApi
    almacenSesion.js           persistencia de la sesión
    formato.js                 DUI, fechas, búsquedas sin tildes
    tema.js                    claro / oscuro
    cargadorVistas.js          sistema de inclusión de plantillas
  servicios/
    servicioApi.js             toda la API agrupada por recurso
    servicioOffline.js         IndexedDB
    servicioTarjetas.js        clase DisenadorTarjetas (canvas + QR)
  composables/
    usarCatalogo.js            lista + búsqueda + paginación + modal
    usarPermisos.js            matriz de permisos
    usarEscanerQr.js           cámara, cola, reintentos, respaldo local
    usarImportacionCsv.js      importación con progreso
    usarNotificaciones.js      pila de avisos
  componentes/comunes.js       PaginacionTabla, EstadoVacio, BarraCatalogo…
  contenido/                   guías de usuario y estructura del menú
```

### Las plantillas ahora se incluyen, no se concatenan

Antes había un arreglo con 23 rutas en un orden que no se podía tocar, y
fragmentos como `layout-logueado-inicio.html` que solo abrían un `<div>` que
cerraba otro archivo. Leer una vista suelta era imposible.

Ahora `assets/views/aplicacion.html` es el layout completo con marcadores de
inclusión que resuelve `cargadorVistas.js`. Cada vista es un archivo HTML
completo y válido por su cuenta.

### Nomenclatura

Todo en español latinoamericano: `obtenerSesion`, `repositorioEmpleados`,
`crearControladorCatalogo`, `usarCatalogo`, `notificarExito`. Los comentarios
explican **por qué** se hizo algo, no qué hace la línea siguiente.

---

## 6. Cómo agregar cosas ahora

**Un catálogo nuevo en el backend** — `api/_lib/controladores/loNuevo.js`:

```js
export const controladorLoNuevo = crearControladorCatalogo({
  repositorio: new Repositorio(TABLAS.loNuevo, { ordenarPor: 'nombre' }),
  mapearFormulario: (cuerpo) => ({ nombre: aTexto(cuerpo.nombre) }),
  validar: (datos) => (datos.nombre ? null : 'El nombre es obligatorio.')
});
```

Y registrarlo en `api/index.js`. **No** hace falta tocar `vercel.json` ni
preocuparse por el límite de funciones: sigue siendo una sola.

**Una pantalla nueva en el frontend:**

1. Agregar la entrada en `assets/js/contenido/menu.js`
2. Crear `assets/views/vistas/loNuevo.html`
3. Incluirla en `assets/views/aplicacion.html`

La barra lateral la muestra sola y respeta los permisos.

---

## 7. Desarrollo local

### Un solo comando

```bash
copy configuracion.local.example.mjs configuracion.local.mjs   # una vez
npm run dev                                                    # cada vez
```

Abre **http://localhost:3000**.

`servidor-local.mjs` sirve el front y ejecuta la API en el mismo puerto. No
necesita la CLI de Vercel ni una cuenta: es Node puro, con los módulos que ya
trae. Emula el contrato de Vercel (`req.query`, `req.body`, `res.status().json()`)
y aplica el mismo rewrite de `vercel.json`, así que corre **exactamente el mismo
`api/index.js`** que se despliega en producción.

La configuración sale de `configuracion.local.mjs` (en `.gitignore`), que el
servidor vuelca a `process.env` antes de cargar el backend. Así el código lee
siempre de `process.env`, igual que en Vercel: no hay dos formas de leer la
configuración según dónde corra.

### Por qué no alcanza con Live Server

Es la duda razonable: en otros proyectos basta un `configuracion.js` y el
navegador habla directo con Supabase. Aquí no, por tres motivos:

1. La migración 001 activa **RLS con políticas `USING (false)`** para `anon` y
   `authenticated`. Desde el navegador no se lee ni se escribe nada.
2. Las contraseñas se verifican con **bcrypt en el servidor**; no hay forma de
   hacerlo en el cliente sin exponer los hashes.
3. La única llave que abre esa base es `service_role`, y **no puede estar en el
   navegador**: salta todo el RLS.

Live Server solo sirve archivos, así que un POST a `/api/auth` responde
**405 Method Not Allowed**. Si ves ese error, es esto.

Si prefieres su recarga automática, deja `npm run dev` corriendo en paralelo y
abre el front desde Live Server: `clienteHttp.js` detecta que está en un puerto
local distinto del 3000 y redirige las peticiones, y el enrutador responde las
cabeceras CORS (restringidas a `localhost` y `127.0.0.1`; en producción nunca se
activan porque front y API comparten dominio).

### `"type": "module"` en package.json

Se agregó para que Node trate los archivos de `/api` como módulos ES, que es lo
que ya eran por sintaxis. Es también lo que propone
[08-mejoras-propuestas.md](./08-mejoras-propuestas.md) §1.1.

Verificado en local: el servidor levanta, importa `api/index.js` y responde
correctamente contra Supabase. **No se verificó el build de Vercel**, que
requiere desplegar.

---

## 8. Qué quedó sin verificar

Se comprobó automáticamente que todo el JavaScript parsea, que los imports y las
inclusiones resuelven, que cada identificador usado en las plantillas está
expuesto, y que no hay clases CSS inventadas. El enrutador se probó con
peticiones simuladas (18 casos, todos correctos).

**No se probó contra la base de datos real ni en un navegador**, porque eso
requiere las credenciales de Supabase y un despliegue. Antes de usarlo en un
evento conviene recorrer a mano:

- [ ] Iniciar sesión con un usuario existente
- [ ] Escanear un QR real y ver que la asistencia queda registrada
- [ ] Cortar la señal, escanear, recuperarla y confirmar que sube
- [ ] Guardar una plantilla de tarjeta y generar un lote
- [ ] Guardar la matriz de permisos de un rol (necesita la migración 003)
- [ ] Consultar una invitación desde el portal público

---

*Actualizado en la migración a v2.*
