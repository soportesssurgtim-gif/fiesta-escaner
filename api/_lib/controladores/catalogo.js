/**
 * Fábrica de controladores de catálogo.
 *
 * Departamentos, empleados, premios, roles y usuarios comparten exactamente la
 * misma coreografía: GET lista, POST/PUT guarda, y guardar exige rol de
 * administrador. Cambia solo qué campos se leen del formulario y cómo se
 * validan.
 *
 * Esta función arma ese controlador a partir de esas dos piezas. Un catálogo
 * nuevo son unas quince líneas en vez de un archivo de ciento cincuenta.
 */

import { esAdministrador } from '../seguridad.js';
import { leerCuerpo } from '../peticion.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderSinPermiso,
  responderMetodoNoPermitido
} from '../respuestas.js';

/**
 * @param {Object} config
 * @param {Repositorio} config.repositorio  Acceso a la tabla.
 * @param {Function} config.mapearFormulario (cuerpo, contexto) => objeto listo para la base.
 * @param {Function} [config.validar]        (datos, cuerpo) => string|null. El string es el error.
 * @param {Function} [config.listar]         (contexto) => filas. Por si el listado necesita algo especial.
 * @param {Object}  [config.accionesExtra]   Acciones propias del recurso, ver más abajo.
 */
export function crearControladorCatalogo(config) {
  const {
    repositorio,
    mapearFormulario,
    validar = () => null,
    listar = null,
    accionesExtra = {}
  } = config;

  return {
    async manejar(contexto) {
      const { res, sesion, accion, metodo } = contexto;

      // Las acciones propias del recurso (exportar CSV, sortear, activar
      // evento…) se atienden antes que el CRUD genérico.
      const manejadorExtra = accionesExtra[`${metodo} ${accion}`] || accionesExtra[accion];
      if (manejadorExtra) {
        return manejadorExtra(contexto);
      }

      if (metodo === 'GET') {
        const filas = listar ? await listar(contexto) : await repositorio.listar();
        return responderOk(res, filas);
      }

      if (metodo === 'POST' || metodo === 'PUT') {
        if (!esAdministrador(sesion.rol)) {
          return responderSinPermiso(res, 'No tienes permisos de administrador.');
        }

        const cuerpo = await leerCuerpo(contexto.req);
        const datos = await mapearFormulario(cuerpo, contexto);

        const problema = validar(datos, cuerpo);
        if (problema) return responderSolicitudInvalida(res, problema);

        const guardado = await repositorio.guardar(cuerpo.id, datos);
        return responderOk(res, guardado);
      }

      return responderMetodoNoPermitido(res);
    }
  };
}
