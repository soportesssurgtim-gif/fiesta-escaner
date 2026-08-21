/**
 * Motor compartido de importación desde CSV.
 *
 * Empleados y departamentos importan igual: se lee el archivo, se recorre fila
 * por fila, y por cada una se decide si es alta o actualización según una clave
 * natural (el DUI para empleados, el nombre para departamentos).
 *
 * El controlador solo aporta esas tres reglas y el motor hace el resto,
 * incluyendo el reporte de resultados que el frontend muestra en la barra de
 * progreso.
 */

import { leerCuerpo } from '../peticion.js';
import { parsearCsv } from '../csv.js';
import { esAdministrador } from '../seguridad.js';
import { responderOk, responderSolicitudInvalida, responderSinPermiso } from '../respuestas.js';

/**
 * @param {Object} config
 * @param {Repositorio} config.repositorio
 * @param {Function} config.mapearFila   (fila) => objeto para la base.
 * @param {Function} config.validarFila  (datos, fila) => string|null.
 * @param {Function} config.claveNatural (datos) => objeto de filtro para detectar duplicados.
 * @param {Function} config.describir    (datos) => texto que se muestra en el detalle.
 * @param {string[]} [config.camposNoActualizables] Campos que se escriben al crear
 *                   pero no se pisan al actualizar (ej: el DUI, que es la clave).
 * @param {Function} [config.prepararContexto] Se ejecuta UNA vez antes de
 *                   recorrer las filas y lo que devuelve llega como segundo
 *                   argumento de mapearFila. Sirve para traer catálogos que
 *                   hacen falta para traducir columnas: empleados lo usa para
 *                   resolver el nombre del departamento a su id. Va acá y no
 *                   dentro de mapearFila porque consultarlo por cada fila serían
 *                   cientos de viajes a la base y la función se pasaría del
 *                   tiempo límite de Vercel.
 */
/**
 * Cuántas filas se aceptan por envío.
 *
 * La pantalla manda por bloques, así que el archivo entero nunca llega junto.
 * El límite existe porque cada fila son una o dos consultas y la función tiene
 * un tiempo máximo: con novecientas de una vez se corta a la mitad y quedan
 * empleados a medio importar sin que nadie sepa cuáles.
 */
const MAXIMO_POR_BLOQUE = 250;

/** Quita los campos de trabajo (los que empiezan con guion bajo). */
function sinCamposAuxiliares(datos) {
  const limpio = {};
  for (const [campo, valor] of Object.entries(datos)) {
    if (!campo.startsWith('_')) limpio[campo] = valor;
  }
  return limpio;
}

export function crearImportadorCsv(config) {
  const {
    repositorio,
    mapearFila,
    validarFila,
    claveNatural,
    describir,
    camposNoActualizables = [],
    prepararContexto = null
  } = config;

  return async function importar(contexto) {
    const { req, res, sesion } = contexto;

    if (!esAdministrador(sesion.rol)) {
      return responderSinPermiso(res, 'No tienes permisos de administrador.');
    }

    const cuerpo = await leerCuerpo(req);

    /*
     * Las filas llegan de dos formas.
     *
     * La nueva es un arreglo de objetos, que es lo que manda la pantalla desde
     * que lee el Excel en el navegador. Le hacía falta para poder revisar y
     * corregir los departamentos antes de enviar nada, y de paso evita armar y
     * volver a partir un CSV en el medio, que son dos lugares más donde se
     * pueden romper las comillas de un nombre con coma.
     *
     * La vieja es el texto CSV. Se conserva para no romper nada que todavía lo
     * mande.
     */
    const filas = Array.isArray(cuerpo.filas)
      ? cuerpo.filas.filter((fila) => fila && typeof fila === 'object')
      : parsearCsv(String(cuerpo.csv || '').trim()).filas;

    if (filas.length === 0) {
      return responderSolicitudInvalida(res, 'No se recibió ninguna fila para importar.');
    }

    if (filas.length > MAXIMO_POR_BLOQUE) {
      return responderSolicitudInvalida(
        res,
        `Se reciben hasta ${MAXIMO_POR_BLOQUE} filas por envío. Divide el archivo en bloques más chicos.`
      );
    }

    const contextoExtra = prepararContexto ? await prepararContexto() : null;

    const resultado = { insertados: 0, actualizados: 0, errores: [], detalle: [] };

    for (const fila of filas) {
      // El número de renglón lo manda la pantalla, que es la que leyó el Excel
      // y sabe en qué fila estaba cada dato. Si no viene, se numera de corrido.
      const numeroLinea = fila._linea ?? '?';
      try {
        const datos = mapearFila(fila, contextoExtra);

        const problema = validarFila(datos, fila);
        if (problema) {
          const mensaje = `Fila ${numeroLinea}: ${problema}`;
          resultado.errores.push(mensaje);
          resultado.detalle.push({ linea: numeroLinea, accion: 'error', mensaje });
          continue;
        }

        const existente = await repositorio.buscarUno(claveNatural(datos), 'id');

        // Los campos que empiezan con guion bajo son de trabajo, no columnas:
        // mapearFila los usa para pasarle información a validarFila (empleados
        // manda ahí el problema al resolver el departamento). Si se colaran al
        // insert, Postgres rechazaría la fila entera por una columna inexistente.
        const paraGuardar = sinCamposAuxiliares(datos);

        if (existente && existente.id) {
          // Al actualizar no pisamos la clave natural: si alguien edita el DUI
          // en el CSV lo que quiere es crear a otra persona, no renombrar a esta.
          const paraActualizar = { ...paraGuardar };
          for (const campo of camposNoActualizables) delete paraActualizar[campo];

          await repositorio.actualizar(existente.id, paraActualizar);
          resultado.actualizados++;
          resultado.detalle.push({
            linea: numeroLinea,
            accion: 'actualizado',
            mensaje: describir(datos)
          });
        } else {
          await repositorio.insertar(paraGuardar);
          resultado.insertados++;
          resultado.detalle.push({
            linea: numeroLinea,
            accion: 'insertado',
            mensaje: describir(datos)
          });
        }
      } catch (fallo) {
        // Una fila mala no debe abortar el archivo entero: se anota y seguimos.
        const mensaje = `Fila ${numeroLinea}: ${fallo.message || 'error al procesar'}`;
        resultado.errores.push(mensaje);
        resultado.detalle.push({ linea: numeroLinea, accion: 'error', mensaje });
      }
    }

    return responderOk(res, resultado);
  };
}
