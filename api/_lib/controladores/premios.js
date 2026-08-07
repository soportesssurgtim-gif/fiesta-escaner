/**
 * Premios y sorteos.
 *
 * Van juntos porque el sorteo es, en la práctica, la operación principal sobre
 * un premio. Un sorteo toma a los asistentes confirmados del evento activo y
 * saca uno al azar entre los que todavía no ganaron.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI, NO } from '../configuracion.js';
import { aTexto, aEntero, aBandera, esVerdadero } from '../valores.js';
import { leerCuerpo, leerParametro } from '../peticion.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoEncontrado
} from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';
import { obtenerEventoActivo } from './eventos.js';

export const repositorioPremios = new Repositorio(TABLAS.premios, {
  ordenarPor: 'nombre'
});

export const repositorioSorteos = new Repositorio(TABLAS.sorteos, {
  ordenarPor: 'fecha_hora_sorteo',
  ascendente: false
});

/** Listado de sorteos con el nombre del premio ya resuelto. */
async function listarSorteos({ res }) {
  const { data, error } = await supabase
    .from(TABLAS.sorteos)
    .select('*, premios(nombre)')
    .order('fecha_hora_sorteo', { ascending: false });
  if (error) throw error;
  return responderOk(res, data || []);
}

/**
 * Extrae un ganador al azar.
 *
 * El orden de las validaciones importa: primero confirmamos que hay evento y
 * sorteo válidos, después que quede gente elegible, y recién ahí escribimos.
 * Así nunca se registra un ganador a medias.
 */
async function sortearGanador({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const sorteoId = aTexto(cuerpo.sorteoId) || leerParametro(req, 'sorteoId');

  if (!sorteoId) {
    return responderSolicitudInvalida(res, 'Falta indicar el sorteo.');
  }

  const evento = await obtenerEventoActivo();
  if (!evento) {
    return responderSolicitudInvalida(res, 'No hay un evento activo configurado.');
  }

  const sorteo = await repositorioSorteos.obtenerPorId(sorteoId);
  if (!sorteo) {
    return responderNoEncontrado(res, 'El sorteo no existe.');
  }
  if (esVerdadero(sorteo.realizado)) {
    return responderSolicitudInvalida(res, 'Este sorteo ya fue realizado.');
  }

  // Solo participan quienes efectivamente registraron asistencia al evento.
  const { data: asistencias, error: errorAsistencias } = await supabase
    .from(TABLAS.asistencias)
    .select('id, empleado, empleados!inner(id, nombres, apellidos, dui, cargo)')
    .eq('evento', evento.id);
  if (errorAsistencias) throw errorAsistencias;

  const participantes = (asistencias || []).map((asistencia) => ({
    asistenciaId: asistencia.id,
    empleadoId: asistencia.empleado,
    empleado: asistencia.empleados
  }));

  if (participantes.length === 0) {
    return responderSolicitudInvalida(res, 'Todavía no hay asistentes registrados en este evento.');
  }

  // Nadie gana dos veces el mismo sorteo.
  const { data: ganadoresPrevios } = await supabase
    .from(TABLAS.ganadores)
    .select('empleado')
    .eq('sorteo', sorteoId);

  const yaGanaron = new Set((ganadoresPrevios || []).map((g) => g.empleado));
  const elegibles = participantes.filter((p) => !yaGanaron.has(p.empleadoId));

  if (elegibles.length === 0) {
    await repositorioSorteos.actualizar(sorteoId, { realizado: SI });
    return responderSolicitudInvalida(res, 'Todos los asistentes ya ganaron en este sorteo.');
  }

  const elegido = elegibles[Math.floor(Math.random() * elegibles.length)];

  const ganador = await new Repositorio(TABLAS.ganadores).insertar({
    sorteo: sorteoId,
    premio: sorteo.premio || null,
    empleado: elegido.empleadoId,
    asistencia: elegido.asistenciaId,
    entregado_por: sesion.usuarioId || null,
    entregado: NO
  });

  // Descontamos una unidad del premio. Si algo falla acá no invalidamos el
  // sorteo: el ganador ya quedó registrado y eso es lo que importa.
  if (sorteo.premio) {
    try {
      const premio = await repositorioPremios.obtenerPorId(sorteo.premio, 'id, cantidad');
      const disponibles = aEntero(premio?.cantidad, 0);
      if (disponibles > 0) {
        await repositorioPremios.actualizar(sorteo.premio, { cantidad: disponibles - 1 });
      }
    } catch (fallo) {
      console.warn('[premios] No se pudo descontar el stock del premio:', fallo);
    }
  }

  const quedanElegibles = elegibles.length - 1;
  if (quedanElegibles <= 0) {
    await repositorioSorteos.actualizar(sorteoId, { realizado: SI });
  }

  return responderOk(res, {
    ganador,
    empleado: elegido.empleado
      ? {
          nombres: elegido.empleado.nombres,
          apellidos: elegido.empleado.apellidos,
          dui: elegido.empleado.dui,
          cargo: elegido.empleado.cargo || ''
        }
      : null,
    sorteoId,
    esUltimo: quedanElegibles <= 0,
    participantes: participantes.length,
    mensaje: '¡Tenemos ganador!'
  });
}

/**
 * Guarda un sorteo.
 *
 * Está acá y no en su propio recurso porque el frontend siempre los pidió por
 * /api/premios. Lo dejamos igual para no romper nada.
 */
async function guardarSorteo({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const evento = await obtenerEventoActivo();

  const datos = {
    nombre: aTexto(cuerpo.nombre),
    premio: aTexto(cuerpo.premio) || null,
    evento: evento ? evento.id : null,
    realizado: aBandera(cuerpo.realizado ?? 'FALSE')
  };

  if (!datos.nombre) {
    return responderSolicitudInvalida(res, 'El nombre del sorteo es obligatorio.');
  }

  const guardado = await repositorioSorteos.guardar(cuerpo.id, datos);
  return responderOk(res, guardado);
}

export const controladorPremios = crearControladorCatalogo({
  repositorio: repositorioPremios,

  mapearFormulario: (cuerpo) => ({
    nombre: aTexto(cuerpo.nombre),
    descripcion: aTexto(cuerpo.descripcion),
    cantidad: Math.max(0, aEntero(cuerpo.cantidad, 1)),
    activo: aBandera(cuerpo.activo ?? 'TRUE')
  }),

  validar: (datos) => (datos.nombre ? null : 'El nombre del premio es obligatorio.'),

  accionesExtra: {
    'GET sorteos': listarSorteos,
    'POST sortear': sortearGanador,
    'POST sorteo': guardarSorteo,
    'PUT sorteo': guardarSorteo
  }
});
