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

import { esAdministrador, puedeEnModulo } from '../seguridad.js';
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
 * @param {string}  [config.modulo]          El módulo de la tabla de permisos.
 */
export function crearControladorCatalogo(config) {
  const {
    repositorio,
    mapearFormulario,
    validar = () => null,
    listar = null,
    accionesExtra = {},
    modulo = null
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
        const cuerpo = await leerCuerpo(contexto.req);

        /*
         * Quien tiene el permiso del módulo puede guardar, no solo un
         * administrador.
         *
         * Esto exigia ser administrador para todo POST y PUT, y dejaba al
         * sistema de permisos diciendo una cosa mientras el servidor hacia
         * otra: la pantalla mostraba el botón de «Agregar» porque el rol tenía
         * el permiso, y al pulsarlo el servidor respondía que no era
         * administrador. El permiso existia, se podia marcar, y no servia para
         * nada.
         *
         * Se distingue alta de edición por el id, igual que hace el
         * repositorio: sin id es un alta. Así un rol puede tener «Agregar» sin
         * tener «Editar», que es justo lo que ofrece la pantalla de permisos.
         *
         * Sin `modulo` declarado se sigue exigiendo administrador. Es el valor
         * por defecto a propósito: un recurso nuevo no queda abierto por
         * olvidarse de decidir quién puede tocarlo.
         */
        if (modulo) {
          const accionPedida = cuerpo.id ? 'editar' : 'agregar';
          if (!(await puedeEnModulo(sesion, modulo, accionPedida))) {
            return responderSinPermiso(
              res, `No tienes permiso para ${accionPedida} en ${modulo}.`
            );
          }
        } else if (!esAdministrador(sesion.rol)) {
          return responderSinPermiso(res, 'No tienes permisos de administrador.');
        }

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
