/**
 * Service worker.
 *
 * Su única responsabilidad es cachear los archivos estáticos para que la
 * aplicación abra rápido y siga abriendo sin señal. NO se mete con la API.
 *
 * ---
 * Sobre un error grave que tenía la versión anterior:
 *
 * Ante un POST fallido a /api/asistencias devolvía una respuesta inventada
 * `{ ok: true, offline: true }` con estado 200. El resultado era que la
 * aplicación creía que la asistencia se había registrado, no la guardaba en
 * IndexedDB, y el escaneo se perdía para siempre sin que nadie se enterara.
 *
 * Justo lo contrario de lo que hace falta: el fetch TIENE que fallar para que
 * el código de la aplicación active su respaldo local. Por eso ahora las
 * peticiones a la API pasan derecho a la red y, si fallan, fallan de verdad.
 */

/*
 * VERSION_CACHE es lo que dispara la actualización en los dispositivos.
 *
 * SUBIRLA EN CADA DESPLIEGUE. El navegador compara el sw.js byte a byte; si el
 * archivo no cambió, no instala nada y la gente se queda con la versión vieja
 * hasta que borre el caché a mano. Cambiar este número cambia el archivo, y con
 * eso arranca todo el ciclo: install → skipWaiting → activate → clients.claim,
 * que junto con el recargador de index.html deja la versión nueva corriendo sin
 * que nadie tenga que tocar nada.
 */
const VERSION_CACHE = 'v3.6.0';
const NOMBRE_CACHE = `asistencia-sssur-${VERSION_CACHE}`;

/**
 * Archivos que se guardan al instalar.
 *
 * Van solo los propios y los de terceros que sí permiten CORS. El CDN de
 * Tailwind queda fuera a propósito: responde sin cabeceras CORS y hace fallar
 * el cache.addAll() entero.
 */
const ARCHIVOS_BASE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/sistema-diseno.css',

  // Iconos de la aplicación instalada. Van cacheados porque el sistema los
  // vuelve a pedir al instalar y al mostrar la pantalla de inicio.
  '/assets/iconos/icono-192.png',
  '/assets/iconos/icono-512.png',
  '/assets/iconos/icono-192-maskable.png',
  '/assets/iconos/icono-512-maskable.png',

  // El logo institucional. Va en dos variantes de color porque el azul es
  // ilegible sobre fondo oscuro, y en dos formas porque el horizontal no entra
  // en la barra lateral plegada.
  '/assets/iconos/logo-horizontal-azul.png',
  '/assets/iconos/logo-horizontal-blanco.png',
  '/assets/iconos/logo-escudo-azul.png',
  '/assets/iconos/logo-escudo-blanco.png',
  '/assets/iconos/logo-vertical-azul.png',
  '/assets/iconos/logo-vertical-blanco.png',

  // Punto de entrada y núcleo
  '/assets/js/app.js',
  '/assets/js/nucleo/almacenSesion.js',
  '/assets/js/nucleo/cargadorVistas.js',
  '/assets/js/nucleo/clienteHttp.js',
  '/assets/js/nucleo/formato.js',
  '/assets/js/nucleo/tema.js',
  '/assets/js/nucleo/marca.js',

  // Servicios
  '/assets/js/servicios/servicioApi.js',
  '/assets/js/servicios/servicioExcel.js',
  '/assets/js/servicios/servicioInvitacion.js',
  '/assets/js/servicios/servicioOffline.js',
  '/assets/js/servicios/servicioTarjetas.js',

  // Composables
  '/assets/js/composables/usarBuscadorPersonas.js',
  '/assets/js/composables/usarCatalogo.js',
  '/assets/js/composables/usarEscanerQr.js',
  '/assets/js/composables/usarImportacionCsv.js',
  '/assets/js/composables/usarNotificaciones.js',
  '/assets/js/composables/usarInstalacionPwa.js',
  '/assets/js/composables/usarPendientes.js',
  '/assets/js/composables/usarSincronizacion.js',
  '/assets/js/composables/usarPermisos.js',
  '/assets/js/composables/usarSorteos.js',
  '/assets/js/composables/usarManual.js',
  '/assets/js/composables/usarLectura.js',

  // Componentes y contenido
  '/assets/js/componentes/comunes.js',
  '/assets/js/contenido/menu.js',
  '/assets/js/contenido/manual.js',
  '/assets/js/contenido/diagramas.js',

  // Plantillas
  '/assets/views/aplicacion.html',
  '/assets/views/parciales/barra-lateral.html',
  '/assets/views/parciales/encabezado.html',
  '/assets/views/parciales/login.html',
  '/assets/views/parciales/modal-buscar-persona.html',
  '/assets/views/parciales/modal-cambiar-clave.html',
  '/assets/views/parciales/modal-cierre-sesion.html',
  '/assets/views/parciales/modal-importacion.html',
  '/assets/views/parciales/modal-instalar.html',
  '/assets/views/parciales/modal-pendientes.html',
  '/assets/views/parciales/manual-opciones-voz.html',
  '/assets/views/parciales/notificaciones.html',
  '/assets/views/vistas/asistencias.html',
  '/assets/views/vistas/configuracion.html',
  '/assets/views/parciales/manual.html',
  '/assets/views/vistas/departamentos.html',
  '/assets/views/vistas/empleados.html',
  '/assets/views/vistas/escaner.html',
  '/assets/views/vistas/eventos.html',
  '/assets/views/vistas/invitacion-publica.html',
  '/assets/views/vistas/permisos.html',
  '/assets/views/vistas/premios.html',
  '/assets/views/vistas/rifas.html',
  '/assets/views/vistas/sorteos.html',
  '/assets/views/vistas/tarjetas.html',
  '/assets/views/vistas/usuarios.html',

  // Librerías externas que sí permiten CORS
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(NOMBRE_CACHE);

      // Guardamos uno por uno en lugar de con addAll: si un solo archivo falla,
      // addAll descarta TODO el lote y la aplicación queda sin caché. Así, lo
      // que se pueda guardar se guarda.
      await Promise.all(
        ARCHIVOS_BASE.map((ruta) =>
          cache.add(ruta).catch((fallo) => {
            console.warn('[sw] No se pudo cachear', ruta, fallo);
          })
        )
      );
    })()
  );

  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Fuera las versiones viejas del caché.
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith('asistencia-sssur-') && nombre !== NOMBRE_CACHE)
          .map((nombre) => caches.delete(nombre))
      );

      // Y también las del nombre anterior del proyecto.
      await Promise.all(
        nombres.filter((nombre) => nombre.startsWith('fiesta-escaner-')).map((n) => caches.delete(n))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  // Lo que no sea GET (los POST de asistencias, por ejemplo) no se toca.
  if (peticion.method !== 'GET') return;

  // La API nunca se cachea ni se intercepta: si no hay red, el fetch debe
  // fallar para que la aplicación guarde el registro localmente.
  if (url.pathname.startsWith('/api/')) return;

  // Las plantillas van primero a la red, para que un cambio de diseño se vea
  // sin tener que borrar el caché a mano. Si no hay red, sale la copia guardada.
  if (url.pathname.startsWith('/assets/views/')) {
    evento.respondWith(redPrimero(peticion));
    return;
  }

  // El resto de estáticos: primero el caché, que es lo más rápido.
  evento.respondWith(cachePrimero(peticion));
});

/** Devuelve lo cacheado y, si no está, lo busca en la red y lo guarda. */
async function cachePrimero(peticion) {
  const guardado = await caches.match(peticion);
  if (guardado) return guardado;

  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const cache = await caches.open(NOMBRE_CACHE);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (fallo) {
    // Si era una navegación, al menos devolvemos la aplicación.
    if (peticion.mode === 'navigate') {
      const inicio = await caches.match('/index.html');
      if (inicio) return inicio;
    }
    throw fallo;
  }
}

/** Intenta la red y cae al caché solo si falla. */
async function redPrimero(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const cache = await caches.open(NOMBRE_CACHE);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (fallo) {
    const guardado = await caches.match(peticion);
    if (guardado) return guardado;
    throw fallo;
  }
}

self.addEventListener('message', (evento) => {
  if (!evento.data) return;

  // Permite que la aplicación fuerce la activación de una versión nueva.
  if (evento.data.type === 'ACTUALIZAR_AHORA') {
    self.skipWaiting();
    return;
  }

  // La pantalla de configuración pregunta qué versión está corriendo, para
  // poder confirmar de un vistazo que el dispositivo ya recibió el despliegue.
  if (evento.data.type === 'VERSION' && evento.ports && evento.ports[0]) {
    evento.ports[0].postMessage({ version: VERSION_CACHE });
  }
});
