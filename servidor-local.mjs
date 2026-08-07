/**
 * Servidor de desarrollo local.
 *
 * Reemplaza a Live Server y suma lo que a Live Server le falta en este
 * proyecto: ejecutar las funciones de /api.
 *
 *   · Sirve el front igual que cualquier servidor estático
 *   · Recarga el navegador solo al guardar un archivo del front
 *   · Reinicia el backend solo al guardar un archivo de /api
 *   · Ejecuta el MISMO api/index.js que se despliega en Vercel
 *   · Todo en un puerto, así que no hay CORS de por medio
 *
 * Un servidor estático no puede hacer lo tercero ni lo cuarto: cuando el
 * navegador manda un POST a /api/auth, responde 405 porque para él eso es un
 * archivo que no existe. De ahí el error clásico al arrancar con Live Server.
 *
 *   npm run dev
 *   node servidor-local.mjs --puerto 8080
 *   node servidor-local.mjs --sin-recarga
 *
 * ---------------------------------------------------------------------------
 * CÓMO ESTÁ ARMADO: supervisor + trabajador
 *
 * El proceso que arrancas es el supervisor. Solo vigila /api y lanza un proceso
 * hijo con el servidor de verdad; cuando cambia un archivo del backend, mata al
 * hijo y lo vuelve a lanzar.
 *
 * Parece rebuscado, pero es la única forma de recargar el backend de verdad.
 * El primer intento fue reimportar api/index.js con un `?v=timestamp` para
 * saltarse la caché de módulos de Node. No sirve: los imports relativos que hay
 * dentro (./_lib/...) NO heredan ese parámetro, así que Node los resuelve a la
 * misma URL de siempre y devuelve la copia vieja. Se recargaba el archivo de
 * entrada y nada más, lo cual es peor que no recargar: parece que funcionó.
 * ---------------------------------------------------------------------------
 */

import http from 'node:http';
import { fork } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const ESTE_ARCHIVO = fileURLToPath(import.meta.url);
const PUERTO_POR_DEFECTO = 3000;

// Marca que distingue al proceso hijo del supervisor.
const ES_TRABAJADOR = process.env.SSSUR_TRABAJADOR === '1';

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

/** Ignora los archivos temporales que dejan los editores al guardar. */
function esArchivoTemporal(archivo) {
  return !archivo || /(~|\.swp|\.tmp|4913)$/.test(archivo);
}

/* ==================================================================== */
/* SUPERVISOR                                                           */
/* ==================================================================== */

function iniciarSupervisor() {
  const conRecarga = !process.argv.includes('--sin-recarga');
  let trabajador = null;
  let reiniciando = false;

  const lanzar = () => {
    trabajador = fork(ESTE_ARCHIVO, process.argv.slice(2), {
      env: { ...process.env, SSSUR_TRABAJADOR: '1' },
      stdio: 'inherit'
    });

    trabajador.on('exit', (codigo) => {
      // Si el hijo murió solo (no porque lo reiniciamos), algo falló de verdad.
      if (!reiniciando && codigo !== null && codigo !== 0) {
        console.error(`\n  El servidor terminó con código ${codigo}.\n`);
        process.exit(codigo);
      }
    });
  };

  const reiniciar = (archivo) => {
    if (reiniciando) return;
    reiniciando = true;

    console.log(`  \x1b[36m↻\x1b[0m  Reiniciando el backend (${archivo})`);
    if (trabajador) trabajador.kill();

    // Un respiro para que el puerto quede libre antes de volver a escuchar.
    setTimeout(() => {
      reiniciando = false;
      lanzar();
    }, 180);
  };

  lanzar();

  if (conRecarga) {
    const rutaApi = join(RAIZ, 'api');
    if (existsSync(rutaApi)) {
      let temporizador = null;
      watch(rutaApi, { recursive: true }, (_tipo, archivo) => {
        if (esArchivoTemporal(archivo)) return;
        clearTimeout(temporizador);
        temporizador = setTimeout(() => reiniciar(archivo), 150);
      });
    }
  }

  // Ctrl+C tiene que llevarse también al hijo.
  const despedirse = () => {
    reiniciando = true;
    if (trabajador) trabajador.kill();
    process.exit(0);
  };
  process.on('SIGINT', despedirse);
  process.on('SIGTERM', despedirse);
}

/* ==================================================================== */
/* TRABAJADOR: el servidor de verdad                                    */
/* ==================================================================== */

// Navegadores conectados esperando el aviso de recarga.
const navegadores = new Set();

/**
 * Carga configuracion.local.mjs y vuelca sus valores en process.env.
 *
 * El backend lee siempre de process.env, igual que en Vercel. Este paso es solo
 * el puente para desarrollo: así no hay dos formas distintas de leer la
 * configuración según dónde corra el código.
 */
async function cargarConfiguracion() {
  const archivo = join(RAIZ, 'configuracion.local.mjs');

  if (!existsSync(archivo)) {
    console.error('\n  Falta el archivo configuracion.local.mjs\n');
    console.error('  Copia la plantilla y completa tus datos de Supabase:\n');
    console.error('      copy configuracion.local.example.mjs configuracion.local.mjs\n');
    console.error('  Está en .gitignore, así que no se sube al repositorio.\n');
    process.exit(1);
  }

  const { configuracion } = await import(pathToFileURL(archivo).href);

  if (!configuracion?.supabaseUrl || !configuracion?.supabaseServiceRoleKey) {
    console.error('\n  configuracion.local.mjs está incompleto.');
    console.error('  Necesita supabaseUrl y supabaseServiceRoleKey.\n');
    process.exit(1);
  }

  process.env.SUPABASE_URL = configuracion.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = configuracion.supabaseServiceRoleKey;

  return configuracion;
}

/**
 * Script que se inyecta en el HTML.
 *
 * Usa Server-Sent Events, que para esto es más simple que un WebSocket: es una
 * conexión HTTP normal. Cubre los dos casos:
 *
 *   · Cambió un archivo del front → llega el evento y se recarga.
 *   · Se reinició el backend      → se corta la conexión; entonces sondeamos
 *                                   hasta que el servidor vuelva y recargamos.
 */
const SCRIPT_RECARGA = `
<script>
  (function () {
    var sondeo = null;

    function esperarQueVuelva() {
      if (sondeo) return;
      sondeo = setInterval(function () {
        fetch('/__vivo', { cache: 'no-store' })
          .then(function () { location.reload(); })
          .catch(function () { /* todavía no vuelve */ });
      }, 400);
    }

    var fuente = new EventSource('/__recarga');

    fuente.addEventListener('cambio', function (evento) {
      console.log('[dev] Cambió ' + evento.data + ', recargando…');
      location.reload();
    });

    fuente.onerror = function () {
      // El servidor se está reiniciando: esperamos y recargamos al volver.
      console.debug('[dev] Servidor de desarrollo no disponible, esperando…');
      esperarQueVuelva();
    };
  })();
</script>`;

/** Avisa a todos los navegadores conectados. */
function avisarCambio(archivo) {
  for (const navegador of navegadores) {
    try {
      navegador.write(`event: cambio\ndata: ${archivo}\n\n`);
    } catch {
      navegadores.delete(navegador);
    }
  }
}

/**
 * Vigila solo el front. El backend lo vigila el supervisor, porque recargarlo
 * requiere reiniciar el proceso entero.
 */
function vigilarFront() {
  let temporizador = null;
  let ultimoArchivo = '';

  const alCambiar = (archivo) => {
    if (esArchivoTemporal(archivo)) return;
    ultimoArchivo = archivo;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => avisarCambio(ultimoArchivo), 120);
  };

  const rutaAssets = join(RAIZ, 'assets');
  if (existsSync(rutaAssets)) {
    try {
      watch(rutaAssets, { recursive: true }, (_tipo, archivo) => alCambiar(archivo));
    } catch (fallo) {
      console.warn(`  No se pudo vigilar assets/: ${fallo.message}`);
    }
  }

  try {
    watch(join(RAIZ, 'index.html'), () => alCambiar('index.html'));
  } catch { /* si no existe, ya habrá fallado antes */ }
}

/**
 * Añade a req/res lo que las funciones de Vercel dan por sentado:
 * `req.query`, `req.body` ya parseado, y los métodos `status`/`json`/`send`.
 *
 * Sin esto el mismo api/index.js que corre en producción no funcionaría acá.
 */
function adaptarAVercel(req, res, url) {
  // req.query, con el recurso que en producción inyecta el rewrite de
  // vercel.json ( /api/:recurso → /api/index?recurso=:recurso ).
  const query = {};
  for (const [clave, valor] of url.searchParams) query[clave] = valor;

  const segmentos = url.pathname.split('/').filter(Boolean);
  if (segmentos[0] === 'api' && segmentos[1]) query.recurso = segmentos[1];

  req.query = query;

  res.status = function (codigo) {
    this.statusCode = codigo;
    return this;
  };

  res.json = function (datos) {
    if (!this.getHeader('Content-Type')) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    this.end(JSON.stringify(datos));
    return this;
  };

  res.send = function (datos) {
    if (Buffer.isBuffer(datos) || typeof datos === 'string') this.end(datos);
    else this.json(datos);
    return this;
  };
}

/** Lee el cuerpo de la petición y lo deja parseado en req.body. */
function leerCuerpo(req) {
  return new Promise((resolver) => {
    const trozos = [];
    req.on('data', (trozo) => trozos.push(trozo));
    req.on('end', () => {
      const crudo = Buffer.concat(trozos).toString('utf8');
      if (!crudo) { resolver({}); return; }
      try { resolver(JSON.parse(crudo)); } catch { resolver({}); }
    });
    req.on('error', () => resolver({}));
  });
}

async function servirEstatico(rutaSolicitada, res, conRecarga) {
  // normalize + resolve evitan que un "../../" se escape de la carpeta del
  // proyecto y sirva archivos del resto del disco.
  const relativa = normalize(decodeURIComponent(rutaSolicitada)).replace(/^([/\\])+/, '');
  const destino = resolve(RAIZ, relativa);

  if (!destino.startsWith(resolve(RAIZ))) {
    res.writeHead(403).end('Fuera del proyecto');
    return;
  }

  const enviarHtml = async (archivo) => {
    let html = await readFile(archivo, 'utf8');
    if (conRecarga) html = html.replace('</body>', `${SCRIPT_RECARGA}\n</body>`);
    res.writeHead(200, { 'Content-Type': TIPOS_MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(html);
  };

  try {
    const info = await stat(destino);
    const archivo = info.isDirectory() ? join(destino, 'index.html') : destino;

    if (extname(archivo).toLowerCase() === '.html') {
      await enviarHtml(archivo);
      return;
    }

    res.writeHead(200, {
      'Content-Type': TIPOS_MIME[extname(archivo).toLowerCase()] || 'application/octet-stream',
      // Sin caché en desarrollo: si no, hay que recargar a mano tras cada cambio.
      'Cache-Control': 'no-store'
    });
    res.end(await readFile(archivo));
  } catch {
    // Cualquier ruta desconocida cae en la aplicación, que es una SPA.
    try {
      await enviarHtml(join(RAIZ, 'index.html'));
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }
}

async function iniciarTrabajador() {
  const configuracion = await cargarConfiguracion();

  // El import va DESPUÉS de poblar process.env: api/_lib/supabase.js lee las
  // variables al cargarse, así que importarlo antes lo dejaría sin credenciales.
  const { default: manejarApi } = await import(
    pathToFileURL(join(RAIZ, 'api', 'index.js')).href
  );

  const indicePuerto = process.argv.indexOf('--puerto');
  const puerto = indicePuerto > -1
    ? Number(process.argv[indicePuerto + 1])
    : (Number(process.env.PORT) || PUERTO_POR_DEFECTO);

  const conRecarga = !process.argv.includes('--sin-recarga');

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Sonda que usa el navegador para saber si el servidor ya volvió.
    if (url.pathname === '/__vivo') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('ok');
      return;
    }

    // Canal de recarga automática.
    if (url.pathname === '/__recarga') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write('retry: 500\n\n');
      navegadores.add(res);
      req.on('close', () => navegadores.delete(res));
      return;
    }

    const inicio = Date.now();

    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      adaptarAVercel(req, res, url);
      req.body = await leerCuerpo(req);

      try {
        await manejarApi(req, res);
      } catch (fallo) {
        console.error('  [api] Error no controlado:', fallo);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
        }
      }

      const ms = Date.now() - inicio;
      const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`  ${color}${res.statusCode}\x1b[0m  ${req.method.padEnd(6)} ${url.pathname}${url.search}  ${ms}ms`);
      return;
    }

    await servirEstatico(url.pathname === '/' ? '/index.html' : url.pathname, res, conRecarga);
  });

  servidor.on('error', (fallo) => {
    if (fallo.code === 'EADDRINUSE') {
      console.error(`\n  El puerto ${puerto} ya está ocupado.`);
      console.error(`  Cierra lo que lo esté usando o arranca en otro:\n`);
      console.error(`      node servidor-local.mjs --puerto 3001\n`);
      process.exit(1);
    }
    throw fallo;
  });

  servidor.listen(puerto, () => {
    if (conRecarga) vigilarFront();

    const proyecto = String(configuracion.supabaseUrl).replace(/^https?:\/\//, '').split('.')[0];
    console.log('');
    console.log('  \x1b[1mControl de Asistencia — desarrollo local\x1b[0m');
    console.log('');
    console.log(`  Aplicación   \x1b[36mhttp://localhost:${puerto}\x1b[0m`);
    console.log(`  Invitaciones \x1b[36mhttp://localhost:${puerto}/?invitacion=1\x1b[0m`);
    console.log(`  Supabase     ${proyecto}`);
    console.log(`  Recarga      ${conRecarga ? 'front y backend, al guardar' : 'desactivada'}`);
    console.log('');
    console.log('  Ctrl+C para detener.');
    console.log('');
  });
}

/* ==================================================================== */

if (ES_TRABAJADOR) {
  iniciarTrabajador().catch((fallo) => {
    console.error('\n  No se pudo iniciar el servidor:\n');
    console.error(fallo);
    process.exit(1);
  });
} else {
  iniciarSupervisor();
}
