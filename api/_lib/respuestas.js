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
 * Se pidió de más en poco tiempo.
 *
 * `Retry-After` va en segundos y es la parte que le sirve a un cliente honesto:
 * le dice cuándo volver, en lugar de dejarlo reintentando a ciegas.
 */
export function responderDemasiadasSolicitudes(res, mensaje, esperaSegundos) {
  if (esperaSegundos && typeof res.setHeader === 'function') {
    res.setHeader('Retry-After', String(Math.ceil(esperaSegundos)));
  }
  return responderJson(res, 429, {
    error: mensaje || 'Demasiadas consultas seguidas. Espera un momento y vuelve a intentar.'
  });
}

/**
 * Códigos con los que Postgres y PostgREST avisan que el esquema no tiene algo.
 *
 * Los cuatro significan lo mismo para nosotros: el código va más adelantado que
 * la base. Casi siempre es una migración que quedó sin correr.
 */
const FALTA_EN_EL_ESQUEMA = {
  '42P01': 'tabla',   // Postgres: la tabla no existe
  '42703': 'columna', // Postgres: la columna no existe
  PGRST205: 'tabla',  // PostgREST: la tabla no está en su caché de esquema
  PGRST204: 'columna' // PostgREST: la columna no está en su caché de esquema
};

/**
 * Saca el nombre de lo que falta del mensaje de Postgres.
 *
 * Los mensajes vienen en dos formatos: «column sorteos.descripcion does not
 * exist» y «Could not find the table 'public.sorteo_premios' in the schema
 * cache». De ahí se recorta el identificador y nada más: el mensaje crudo puede
 * traer fragmentos de la consulta.
 */
function nombreDeLoQueFalta(mensaje) {
  const texto = String(mensaje || '');
  const entreComillas = texto.match(/'(?:public\.)?([A-Za-z0-9_.]+)'/);
  if (entreComillas) return entreComillas[1];

  const suelto = texto.match(/(?:column|table|relation)\s+"?([A-Za-z0-9_.]+)"?/i);
  return suelto ? suelto[1] : '';
}

/**
 * Algo se rompió del lado del servidor.
 *
 * Registramos el detalle completo en los logs de Vercel pero al cliente solo le
 * devolvemos un mensaje corto: los errores crudos de Postgres pueden filtrar
 * nombres de tablas y columnas.
 *
 * La excepción es cuando falta algo del esquema. Ahí el mensaje genérico hace
 * perder el tiempo a quien administra: manda a revisar el código cuando lo único
 * que pasa es que hay una migración pendiente. Ese caso sí se dice claro.
 */
export function responderErrorInterno(res, contexto, error) {
  console.error(`[${contexto}]`, error);

  const tipo = error && FALTA_EN_EL_ESQUEMA[error.code];
  if (tipo) {
    const nombre = nombreDeLoQueFalta(error.message);
    return responderJson(res, 500, {
      error: `La base de datos no tiene ${nombre ? `la ${tipo} «${nombre}»` : `una ${tipo} que el sistema necesita`}. ` +
             'Falta correr una migración pendiente en Supabase (carpeta supabase/migrations).',
      faltaMigracion: true
    });
  }

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
