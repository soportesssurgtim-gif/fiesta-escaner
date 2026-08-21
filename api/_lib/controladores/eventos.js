/**
 * Eventos (las fiestas).
 *
 * Regla de negocio central: solo puede haber un evento activo a la vez. El
 * escáner, las invitaciones y los sorteos trabajan siempre contra ese evento.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI, NO } from '../configuracion.js';
import { aTexto, aBandera, esVerdadero } from '../valores.js';
import { leerCuerpo, leerParametro } from '../peticion.js';
import { esAdministrador, puedeEnModulo } from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderSinPermiso,
  responderNoEncontrado
} from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';

export const repositorioEventos = new Repositorio(TABLAS.eventos, {
  ordenarPor: 'created_at',
  ascendente: false
});

/** El evento que está corriendo ahora mismo, o null si no hay ninguno. */
export async function obtenerEventoActivo() {
  return repositorioEventos.buscarUno({ activo: SI });
}

/**
 * Marca un evento como activo y apaga todos los demás.
 *
 * La versión anterior traía todos los eventos y lanzaba un UPDATE por cada uno
 * en paralelo. Con veinte eventos eran veinte consultas y, si alguna fallaba a
 * medias, quedaban dos activos al mismo tiempo.
 *
 * Ahora son dos consultas: apagar todo, prender el elegido. En ese orden, para
 * que si la segunda falla quede cero activos (estado seguro) y no dos.
 */
async function activarEvento({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);
  const eventoId = aTexto(cuerpo.eventoId) || leerParametro(req, 'eventoId');

  if (!eventoId) {
    return responderSolicitudInvalida(res, 'Falta indicar cuál evento activar.');
  }

  const evento = await repositorioEventos.obtenerPorId(eventoId, 'id, nombre');
  if (!evento) {
    return responderSolicitudInvalida(res, 'El evento indicado no existe.');
  }

  const { error: errorApagado } = await supabase
    .from(TABLAS.eventos)
    .update({ activo: NO })
    .neq('id', eventoId);
  if (errorApagado) throw errorApagado;

  await repositorioEventos.actualizar(eventoId, { activo: SI });

  return responderOk(res, {
    ok: true,
    eventoActivo: evento.nombre,
    mensaje: `"${evento.nombre}" quedó como evento activo.`
  });
}

/**
 * Apaga el evento activo sin poner otro en su lugar.
 *
 * Queda el sistema sin evento activo, que es un estado valido: entre una fiesta
 * y la siguiente no hay ninguna en curso. Con el escaner apagado nadie registra
 * entradas por error en el evento del anio pasado.
 */
async function desactivarEvento({ req, res, sesion }) {
  if (!(await puedeEnModulo(sesion, 'eventos', 'editar'))) {
    return responderSinPermiso(res, 'No tienes permiso para cambiar el evento activo.');
  }

  const cuerpo = await leerCuerpo(req);
  const eventoId = aTexto(cuerpo.eventoId) || leerParametro(req, 'eventoId');

  if (!eventoId) {
    return responderSolicitudInvalida(res, 'Falta indicar cual evento desactivar.');
  }

  const evento = await repositorioEventos.obtenerPorId(eventoId, 'id, nombre');
  if (!evento) {
    return responderNoEncontrado(res, 'Ese evento ya no existe.');
  }

  await repositorioEventos.actualizar(eventoId, { activo: NO });

  return responderOk(res, {
    ok: true,
    mensaje: `"${evento.nombre}" ya no esta activo. No hay ningun evento en curso.`
  });
}

/**
 * Cuantos registros dependen de un evento.
 *
 * Se cuenta antes de borrar porque las llaves foraneas rechazarian el borrado
 * con un error de base de datos que no le dice nada a nadie. Mejor explicar que
 * hay colgando y cuanto.
 */
async function contarDependencias(eventoId) {
  const contar = async (tabla, etiqueta) => {
    const { count } = await supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('evento', eventoId);
    return { etiqueta, cantidad: count || 0 };
  };

  return Promise.all([
    contar(TABLAS.asistencias, 'asistencias registradas'),
    contar(TABLAS.sorteos, 'sorteos'),
    contar(TABLAS.ganadores, 'ganadores')
  ]);
}

/**
 * Borra un evento.
 *
 * Solo un administrador, y solo si no tiene nada colgando: un evento con
 * asistencias es el registro de quienes entraron a esa fiesta, y borrarlo se
 * lleva esa historia. Para sacarlo de en medio esta desactivarlo.
 */
async function eliminarEvento({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'Solo un administrador puede borrar un evento.');
  }

  const cuerpo = await leerCuerpo(req);
  const eventoId = aTexto(cuerpo.id) || aTexto(cuerpo.eventoId);

  if (!eventoId) {
    return responderSolicitudInvalida(res, 'Falta indicar cual evento borrar.');
  }

  const evento = await repositorioEventos.obtenerPorId(eventoId, 'id, nombre, activo');
  if (!evento) {
    return responderNoEncontrado(res, 'Ese evento ya no existe.');
  }

  if (esVerdadero(evento.activo)) {
    return responderSolicitudInvalida(
      res,
      `"${evento.nombre}" es el evento activo. Desactivalo antes de borrarlo.`
    );
  }

  const dependencias = await contarDependencias(eventoId);
  const total = dependencias.reduce((suma, d) => suma + d.cantidad, 0);

  if (total > 0) {
    const detalle = dependencias
      .filter((d) => d.cantidad > 0)
      .map((d) => `${d.cantidad} ${d.etiqueta}`)
      .join(', ');

    return responderSolicitudInvalida(
      res,
      `No se puede borrar "${evento.nombre}": tiene ${detalle}. ` +
      'Esos registros son la historia de esa fiesta. Si de verdad hay que borrarlos, ' +
      'vacialos primero desde Configuracion.'
    );
  }

  await repositorioEventos.eliminar(eventoId);

  console.info(`[eventos] ${sesion.usuario || 'desconocido'} borro el evento "${evento.nombre}"`);

  return responderOk(res, {
    ok: true,
    nombre: evento.nombre,
    mensaje: `"${evento.nombre}" se borro.`
  });
}

export const controladorEventos = crearControladorCatalogo({
  repositorio: repositorioEventos,

  mapearFormulario: (cuerpo, contexto) => {
    const datos = {
      nombre: aTexto(cuerpo.nombre),
      fecha_evento: aTexto(cuerpo.fechaEvento || cuerpo.fecha_evento),
      ubicacion: aTexto(cuerpo.ubicacion),
      activo: aBandera(cuerpo.activo ?? 'FALSE')
    };
    // Solo al crear registramos quién lo hizo; en una edición se conserva el
    // autor original.
    if (!cuerpo.id) datos.creado_por = contexto.sesion.usuarioId || null;
    return datos;
  },

  validar: (datos) => (datos.nombre ? null : 'El nombre del evento es obligatorio.'),

  accionesExtra: {
    'POST set-activo': activarEvento,
    'POST activar': activarEvento,
    'POST desactivar': desactivarEvento,
    'POST eliminar': eliminarEvento
  }
});
