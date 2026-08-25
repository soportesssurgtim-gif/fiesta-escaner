/**
 * Eventos (las fiestas).
 *
 * Regla de negocio central: solo puede haber un evento activo a la vez. El
 * escáner, las invitaciones y los sorteos trabajan siempre contra ese evento.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI, NO } from '../configuracion.js';
import { aTexto, aBandera, esVerdadero, aCoordenada } from '../valores.js';
import { leerCuerpo, leerParametro } from '../peticion.js';
import { esAdministrador, puedeEnModulo } from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderSinPermiso,
  responderNoEncontrado
} from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';

/*
 * La misma comprobacion que hace el navegador, importada y no copiada.
 *
 * Es el unico sitio donde el servidor toma algo de `assets/`. Vale la pena: son
 * las reglas de lo que puede llevar una plantilla que despues se muestra en una
 * pagina publica, y dos copias de esas reglas se separan en la primera prisa.
 *
 * El modulo no toca el DOM al cargarse —`sanear` lo usa adentro de la funcion,
 * y aca no se llama— asi que corre igual en una funcion sin navegador.
 */
import { motivoDeRechazo, LARGO_MAXIMO as LARGO_PLANTILLA } from '../../../assets/js/nucleo/plantillaHtml.js';

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
 * Un objeto, o nada.
 *
 * Una lista tambien es un objeto para JavaScript, y una configuracion nunca es
 * una lista: por eso se descarta aparte.
 */
function aObjeto(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor;
}

/**
 * Guarda solo el diseño de la invitación de un evento.
 *
 * Tiene su propia acción y no viaja con el resto del formulario por dos
 * razones.
 *
 * La primera es de quién hace qué: el evento lo administra Recursos Humanos y
 * el diseño lo configura quien mantiene el sistema. Son dos personas distintas
 * en dos pantallas distintas.
 *
 * La segunda es que si el diseño viajara en el formulario general, guardar un
 * evento desde una pantalla que no lo incluye lo borraría: el campo llegaría
 * vacío y se guardaría como nada. Acá se escribe una sola columna y el resto
 * del evento no se toca.
 *
 * Se guarda tal como llega, sin mirar qué campos trae. Quien lo lee completa lo
 * que falte y descarta lo que no entienda; validar acá sería repetir esa lógica
 * en un segundo lugar y arriesgarse a que los dos se separen.
 */
async function guardarDiseno({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'Solo un administrador puede cambiar el diseño de la invitación.');
  }

  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);

  if (!id) return responderSolicitudInvalida(res, 'Falta el evento.');

  const configuracion = aObjeto(cuerpo.invitacionConfig);

  /*
   * La plantilla HTML se rechaza, no se limpia.
   *
   * Se guarda una vez y se muestra despues a cualquiera que consulte su
   * invitacion, sin sesion. Guardar a medias lo que alguien escribio es peor
   * que decirle que no: creeria que quedo como lo dejo.
   *
   * Que solo un administrador llegue hasta aca protege de un extrano, no de un
   * descuido ni de una sesion prestada. El navegador ademas limpia al mostrar,
   * asi que una plantilla vieja guardada antes de esto tampoco puede ejecutar
   * nada.
   */
  const plantilla = configuracion && typeof configuracion.html === 'string'
    ? configuracion.html
    : '';

  if (plantilla.length > LARGO_PLANTILLA) {
    return responderSolicitudInvalida(
      res, `La plantilla no puede pasar de ${LARGO_PLANTILLA} caracteres.`
    );
  }

  const motivo = motivoDeRechazo(plantilla);
  if (motivo) return responderSolicitudInvalida(res, motivo);

  const { data, error } = await supabase
    .from(TABLAS.eventos)
    .update({ invitacion_config: configuracion })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (!data) return responderNoEncontrado(res, 'Ese evento ya no existe.');

  return responderOk(res, data);
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
      // El nombre del lugar sirve para leerlo; las coordenadas, para llegar.
      // Las dos van juntas o ninguna: media coordenada no ubica nada.
      latitud: aCoordenada(cuerpo.latitud, 90),
      longitud: aCoordenada(cuerpo.longitud, 180),
      activo: aBandera(cuerpo.activo ?? 'FALSE')
    };

    if (datos.latitud === null || datos.longitud === null) {
      datos.latitud = null;
      datos.longitud = null;
    }
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
    'POST eliminar': eliminarEvento,
    'POST diseno': guardarDiseno
  }
});
