/**
 * Eventos (las fiestas).
 *
 * Regla de negocio central: solo puede haber un evento activo a la vez. El
 * escáner, las invitaciones y los sorteos trabajan siempre contra ese evento.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI, NO } from '../configuracion.js';
import { aTexto, aBandera } from '../valores.js';
import { leerCuerpo, leerParametro } from '../peticion.js';
import { esAdministrador } from '../seguridad.js';
import { responderOk, responderSolicitudInvalida, responderSinPermiso } from '../respuestas.js';
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
    'POST activar': activarEvento
  }
});
