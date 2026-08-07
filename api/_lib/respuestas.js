/**
 * Respuestas HTTP estandarizadas.
 *
 * Antes cada controlador armaba su propio objeto de error y terminamos con
 * cinco formas distintas de decir "no tenés permiso". Acá queda una sola.
 */

/**
 * Envía un JSON con el status que se le indique.
 * Siempre declara charset utf-8 porque los mensajes llevan tildes y eñes.
 */
export function responderJson(res, estado, cuerpo) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(estado).json(cuerpo);
}

/** Todo salió bien. */
export function responderOk(res, datos) {
  return responderJson(res, 200, datos);
}

/** El cliente mandó algo mal: falta un campo, el formato no sirve, etc. */
export function responderSolicitudInvalida(res, mensaje) {
  return responderJson(res, 400, { error: mensaje || 'La solicitud no es válida.' });
}

/** No hay sesión o el token ya venció. */
export function responderNoAutenticado(res, mensaje) {
  return responderJson(res, 401, { error: mensaje || 'Sesión requerida.' });
}

/** Hay sesión válida, pero el rol no alcanza para esta operación. */
export function responderSinPermiso(res, mensaje) {
  return responderJson(res, 403, { error: mensaje || 'No tienes permisos para esta acción.' });
}

/** El recurso pedido no existe. */
export function responderNoEncontrado(res, mensaje) {
  return responderJson(res, 404, { error: mensaje || 'Recurso no encontrado.' });
}

/** La ruta existe pero no acepta ese verbo HTTP. */
export function responderMetodoNoPermitido(res) {
  return responderJson(res, 405, { error: 'Método no permitido.' });
}

/**
 * Algo se rompió del lado del servidor.
 *
 * Registramos el detalle completo en los logs de Vercel pero al cliente solo le
 * devolvemos un mensaje corto: los errores crudos de Postgres pueden filtrar
 * nombres de tablas y columnas.
 */
export function responderErrorInterno(res, contexto, error) {
  console.error(`[${contexto}]`, error);
  return responderJson(res, 500, { error: `Ocurrió un error al procesar ${contexto}.` });
}

/**
 * Descarga de archivo (lo usamos para los CSV).
 * El BOM inicial es para que Excel en Windows respete los acentos; sin él,
 * "Panchimalco" se ve como "PanchimalcoÂ".
 */
export function responderDescargaCsv(res, nombreArchivo, contenido) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  return res.status(200).send('﻿' + contenido);
}
