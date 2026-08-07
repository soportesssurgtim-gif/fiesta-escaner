/**
 * Cliente HTTP de la aplicación.
 *
 * Una sola clase que sabe hablar con nuestra API: pone el token, arma el
 * query string, interpreta los errores y avisa cuando la sesión venció.
 *
 * Antes esto eran veinte funciones sueltas (apiGuardarEmpleado,
 * apiGuardarPremio, apiGuardarRol…) que repetían las mismas seis líneas de
 * fetch. Cada endpoint nuevo obligaba a copiar y pegar una más.
 */

import { almacenSesion } from './almacenSesion.js';

/** Error con la información que el frontend necesita para reaccionar. */
export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.datos = datos;
  }

  /** ¿El servidor nos está diciendo que hay que volver a iniciar sesión? */
  get esSesionVencida() {
    return this.estado === 401;
  }

  /** ¿Es un problema de red y no una respuesta del servidor? */
  get esFallaDeRed() {
    return this.estado === 0;
  }
}

// Puerto en el que `vercel dev` levanta las funciones serverless.
const PUERTO_API_LOCAL = '3000';

/**
 * Decide contra qué URL hablar según dónde esté servida la página.
 *
 * En producción es siempre `/api`: el front y las funciones viven en el mismo
 * dominio de Vercel.
 *
 * En desarrollo hay dos formas de trabajar:
 *
 *   a) `npm run dev` (vercel dev) sirve TODO en el 3000. Ahí `/api` relativo
 *      funciona solo y no hace falta nada especial.
 *
 *   b) El front desde Live Server u otro servidor estático (puerto 5500, por
 *      ejemplo) y `vercel dev` aparte en el 3000. En ese caso la ruta relativa
 *      apunta al servidor estático, que no sabe nada de la API y responde 405.
 *      Por eso, si estamos en local y en un puerto que no es el 3000, mandamos
 *      las peticiones al 3000 explícitamente.
 */
function resolverBaseApi() {
  const { protocol, hostname, port } = window.location;

  const esLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (esLocal && port && port !== PUERTO_API_LOCAL) {
    return `${protocol}//${hostname}:${PUERTO_API_LOCAL}/api`;
  }

  return '/api';
}

export class ClienteHttp {
  constructor(base = resolverBaseApi()) {
    this.base = base;
    // Quien quiera enterarse de que la sesión venció se suscribe acá. Lo usa
    // app.js para cerrar sesión y mandar al login sin acoplar las dos capas.
    this.alVencerSesion = null;
  }

  /** Arma la URL final con sus parámetros. */
  _construirUrl(recurso, parametros = {}) {
    const url = new URL(`${this.base}/${recurso}`, window.location.origin);
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        url.searchParams.set(clave, valor);
      }
    }
    return url.toString();
  }

  _cabeceras(incluirJson = true) {
    const cabeceras = {};
    if (incluirJson) cabeceras['Content-Type'] = 'application/json';

    const token = almacenSesion.token();
    if (token) cabeceras.Authorization = `Bearer ${token}`;

    return cabeceras;
  }

  /**
   * Interpreta la respuesta.
   * Si el servidor mandó un error, lo convierte en ErrorApi con el mensaje que
   * escribió el backend, que ya está redactado para el usuario final.
   */
  async _interpretar(respuesta) {
    let datos = null;
    try {
      datos = await respuesta.json();
    } catch {
      // Hay respuestas sin cuerpo (204) y eso está bien.
    }

    if (!respuesta.ok) {
      const mensaje = (datos && datos.error) || `Error ${respuesta.status} del servidor.`;
      const error = new ErrorApi(mensaje, respuesta.status, datos);

      if (error.esSesionVencida && typeof this.alVencerSesion === 'function') {
        this.alVencerSesion();
      }

      throw error;
    }

    return datos;
  }

  /** Petición genérica. Todo lo demás son atajos sobre esta. */
  async peticion(recurso, { metodo = 'GET', parametros = {}, cuerpo = null } = {}) {
    const opciones = {
      method: metodo,
      headers: this._cabeceras(cuerpo !== null)
    };
    if (cuerpo !== null) opciones.body = JSON.stringify(cuerpo);

    let respuesta;
    try {
      respuesta = await fetch(this._construirUrl(recurso, parametros), opciones);
    } catch (fallo) {
      // fetch solo rechaza por problemas de red, no por códigos 4xx/5xx.
      // Distinguirlo importa: sin señal guardamos en local en vez de avisar
      // de un error del servidor que no ocurrió.
      throw new ErrorApi(
        'No hay conexión con el servidor. Revisa tu señal.',
        0,
        { causaOriginal: fallo.message }
      );
    }

    // Un 405 en la ruta de la API casi siempre significa que quien respondió
    // fue un servidor de archivos estáticos, no nuestro backend. Sin este aviso
    // el mensaje que ve el usuario ("método no permitido") no ayuda en nada.
    if (respuesta.status === 405) {
      console.warn(
        `[api] ${this.base} respondió 405. ¿Está corriendo el backend?\n` +
        'Un servidor estático (Live Server, npx serve) no puede ejecutar las ' +
        'funciones de /api. Levanta el backend con: npm run dev'
      );
    }

    return this._interpretar(respuesta);
  }

  obtener(recurso, parametros) {
    return this.peticion(recurso, { metodo: 'GET', parametros });
  }

  enviar(recurso, cuerpo, parametros) {
    return this.peticion(recurso, { metodo: 'POST', parametros, cuerpo });
  }

  actualizar(recurso, cuerpo, parametros) {
    return this.peticion(recurso, { metodo: 'PUT', parametros, cuerpo });
  }

  /**
   * Guarda un registro: elige POST o PUT según tenga id o no.
   * Es el patrón de todos los formularios del sistema.
   */
  guardar(recurso, datos, parametros) {
    return datos && datos.id
      ? this.actualizar(recurso, datos, parametros)
      : this.enviar(recurso, datos, parametros);
  }

  /**
   * Descarga un archivo y dispara el "Guardar como" del navegador.
   * Se usa para los CSV de empleados y departamentos.
   */
  async descargar(recurso, parametros, nombreArchivo) {
    const respuesta = await fetch(this._construirUrl(recurso, parametros), {
      headers: this._cabeceras(false)
    });

    if (!respuesta.ok) {
      throw new ErrorApi('No se pudo generar el archivo.', respuesta.status, null);
    }

    const contenido = await respuesta.blob();
    const url = URL.createObjectURL(contenido);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();

    // Limpiamos el enlace temporal y liberamos la memoria del blob; si no, cada
    // exportación deja un objeto colgado hasta que se recargue la página.
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  }
}

/** Instancia única que usa toda la aplicación. */
export const http = new ClienteHttp();
