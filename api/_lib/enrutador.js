/**
 * Enrutador del backend.
 *
 * El plan Hobby de Vercel permite 12 Serverless Functions y llegamos a tener 11
 * archivos sueltos en /api, uno por recurso. Estábamos a un endpoint de chocar
 * contra el techo.
 *
 * La solución: una sola función (api/index.js) que recibe todo y reparte hacia
 * el controlador que corresponde. Vercel solo cuenta archivos en la raíz de
 * /api, y todo lo que está bajo /api/_lib queda fuera de esa cuenta por empezar
 * con guion bajo. Resultado: 1 función desplegada en lugar de 11, y ya no
 * importa cuántos recursos agreguemos después.
 */

import { leerAccion } from './peticion.js';
import { exigirSesion } from './seguridad.js';
import {
  responderNoEncontrado,
  responderNoAutenticado,
  responderErrorInterno
} from './respuestas.js';

export class Enrutador {
  constructor() {
    this.controladores = new Map();
  }

  /**
   * Registra un controlador bajo uno o varios nombres de recurso.
   *
   * @param {string|string[]} nombres  Cómo se llega al recurso desde la URL.
   *                                   Acepta varios para mantener compatibilidad
   *                                   con rutas viejas (ver más abajo).
   * @param {Object} controlador
   * @param {boolean} controlador.publico  Si es true no se exige sesión.
   * @param {Function} controlador.manejar (contexto) => respuesta
   */
  registrar(nombres, controlador) {
    for (const nombre of [].concat(nombres)) {
      this.controladores.set(nombre, controlador);
    }
  }

  /**
   * Averigua a qué recurso apunta la petición.
   *
   * Primero mira el parámetro `recurso`, que es el que inyecta el rewrite de
   * vercel.json. Si no está (por ejemplo cuando se llama directo a
   * /api/index?recurso=…, o en desarrollo local), lo saca de la propia URL.
   */
  _resolverRecurso(req) {
    const desdeQuery = req.query && req.query.recurso;
    if (desdeQuery) {
      return String(Array.isArray(desdeQuery) ? desdeQuery[0] : desdeQuery).toLowerCase();
    }

    const ruta = String(req.url || '').split('?')[0];
    const segmentos = ruta.split('/').filter(Boolean);
    const indiceApi = segmentos.indexOf('api');
    const candidato = indiceApi >= 0 ? segmentos[indiceApi + 1] : segmentos[0];

    return String(candidato || '').toLowerCase();
  }

  /**
   * Permite que un front servido en otro puerto local hable con esta API.
   *
   * Pasa cuando se trabaja con Live Server (puerto 5500) para el front y
   * `vercel dev` (puerto 3000) para el backend: son orígenes distintos y el
   * navegador bloquea la petición salvo que respondamos las cabeceras CORS.
   *
   * Solo se habilita para localhost y 127.0.0.1. En producción el front y la
   * API comparten dominio, así que esto nunca llega a activarse.
   */
  _permitirOrigenLocal(req, res) {
    const origen = req.headers.origin || '';
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen)) return;

    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /** Punto de entrada: lo llama api/index.js con cada petición. */
  async despachar(req, res) {
    this._permitirOrigenLocal(req, res);

    // El preflight se contesta antes que nada: no lleva token y no debe pasar
    // por el guard de sesión, que lo rechazaría con un 401.
    if (String(req.method || '').toUpperCase() === 'OPTIONS') {
      return res.status(204).end();
    }

    const recurso = this._resolverRecurso(req);
    const controlador = this.controladores.get(recurso);

    if (!controlador) {
      return responderNoEncontrado(res, `El recurso "${recurso || '(vacío)'}" no existe en la API.`);
    }

    // Los recursos públicos (login, portal de invitaciones) se atienden sin
    // sesión. Todo lo demás pasa por el guard antes de tocar el controlador.
    let sesion = null;
    if (!controlador.publico) {
      const resultado = await exigirSesion(req);
      if (resultado.error) {
        return responderNoAutenticado(res, resultado.error);
      }
      sesion = resultado.sesion;
    }

    // Contexto único que reciben todos los controladores. Si mañana hace falta
    // pasarles algo más (idioma, trazas, lo que sea) se agrega acá y aparece en
    // los diez de una sola vez.
    const contexto = {
      req,
      res,
      sesion,
      accion: leerAccion(req),
      metodo: String(req.method || 'GET').toUpperCase()
    };

    try {
      return await controlador.manejar(contexto);
    } catch (fallo) {
      // Red de seguridad: si a un controlador se le escapa una excepción, la
      // atajamos acá en vez de devolver el stack trace crudo de Vercel.
      if (fallo && fallo.esDeUsuario) {
        return res.status(400).json({ error: fallo.message });
      }
      return responderErrorInterno(res, `el recurso ${recurso}`, fallo);
    }
  }
}
