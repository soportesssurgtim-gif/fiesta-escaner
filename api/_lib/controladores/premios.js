/**
 * Premios y sorteos.
 *
 * Van juntos porque el sorteo es la operación principal sobre un premio, y
 * porque el frontend siempre los pidió por /api/premios.
 *
 * Sobre el modelo de sorteo, que cambió en la migración 005: un sorteo es la
 * jornada entera, con una lista de premios y su cantidad. No es un premio.
 * El detalle está en el bloque de más abajo.
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

/*
 * ============================== SORTEOS ==================================
 *
 * Un sorteo es la jornada entera, no un premio.
 *
 * Así se hace en la fiesta: alguien con un micrófono va llamando ganadores
 * durante toda la noche, y los premios pueden ser veinte o más. El modelo
 * anterior ataba un sorteo a UN premio y lo cerraba al primer ganador, así que
 * había que crear veinte sorteos y elegirlos de a uno en un desplegable.
 *
 * Ahora el sorteo tiene una lista de premios con su cantidad (diez termos son
 * una línea con cantidad 10, no diez líneas), y cada extracción saca uno o
 * varios ganadores de la línea que quien locuta elija.
 */

export const repositorioSorteoPremios = new Repositorio(TABLAS.sorteoPremios);

/** Cuántos ganadores se pueden sacar de una vez. Más que esto es un error. */
const MAXIMO_POR_EXTRACCION = 20;

/**
 * Los sorteos con su lista de premios y cuánto se lleva repartido.
 *
 * Se arma todo acá y no en el navegador porque el conteo de lo entregado sale
 * de cruzar tres tablas, y hacerlo por fila en el cliente son decenas de
 * pasadas cada vez que se pinta la pantalla.
 */
async function listarSorteos({ res }) {
  const [{ data: sorteos, error }, { data: lineas }, { data: ganadores }] = await Promise.all([
    supabase
      .from(TABLAS.sorteos)
      .select('*, eventos(id, nombre)')
      .order('fecha_hora_sorteo', { ascending: false }),
    supabase
      .from(TABLAS.sorteoPremios)
      .select('id, sorteo, premio, cantidad, orden, premios(id, nombre, descripcion)')
      .order('orden', { ascending: true }),
    supabase
      .from(TABLAS.ganadores)
      .select('id, sorteo, sorteo_premio')
  ]);

  if (error) throw error;

  const entregadosPorLinea = new Map();
  for (const fila of ganadores || []) {
    if (!fila.sorteo_premio) continue;
    entregadosPorLinea.set(fila.sorteo_premio, (entregadosPorLinea.get(fila.sorteo_premio) || 0) + 1);
  }

  const lineasPorSorteo = new Map();
  for (const linea of lineas || []) {
    const entregados = entregadosPorLinea.get(linea.id) || 0;
    const lista = lineasPorSorteo.get(linea.sorteo) || [];

    lista.push({
      id: linea.id,
      premioId: linea.premio,
      premioNombre: linea.premios?.nombre || 'Premio',
      premioDescripcion: linea.premios?.descripcion || '',
      cantidad: linea.cantidad || 0,
      orden: linea.orden || 0,
      entregados,
      // Lo que todavía se puede llamar por el micrófono.
      pendientes: Math.max(0, (linea.cantidad || 0) - entregados)
    });

    lineasPorSorteo.set(linea.sorteo, lista);
  }

  const resultado = (sorteos || []).map((sorteo) => {
    const suyas = lineasPorSorteo.get(sorteo.id) || [];
    const totalPremios = suyas.reduce((suma, l) => suma + l.cantidad, 0);
    const totalEntregados = suyas.reduce((suma, l) => suma + l.entregados, 0);

    return {
      ...sorteo,
      eventoNombre: sorteo.eventos?.nombre || '',
      premios: suyas,
      totalPremios,
      totalEntregados,
      pendientes: Math.max(0, totalPremios - totalEntregados),
      // Un sorteo está terminado cuando se repartió todo, no cuando salió el
      // primer ganador.
      completo: totalPremios > 0 && totalEntregados >= totalPremios
    };
  });

  return responderOk(res, resultado);
}

/** Los ganadores de un sorteo, en el orden en que fueron llamados. */
async function listarGanadores({ req, res }) {
  const sorteoId = aTexto(leerParametro(req, 'sorteoId'));
  if (!sorteoId) return responderSolicitudInvalida(res, 'Falta indicar el sorteo.');

  const { data, error } = await supabase
    .from(TABLAS.ganadores)
    .select('id, orden, entregado, entregado_en, fecha_hora_sorteo, sorteo_premio, ' +
            'empleados(id, nombres, apellidos, dui, cargo), premios(id, nombre)')
    .eq('sorteo', sorteoId)
    .order('orden', { ascending: false });

  if (error) throw error;

  return responderOk(res, (data || []).map((fila) => ({
    id: fila.id,
    orden: fila.orden || 0,
    lineaId: fila.sorteo_premio,
    premioNombre: fila.premios?.nombre || '',
    entregado: esVerdadero(fila.entregado),
    entregadoEn: fila.entregado_en || null,
    momento: fila.fecha_hora_sorteo || '',
    empleado: fila.empleados
      ? {
          id: fila.empleados.id,
          nombre: `${fila.empleados.nombres} ${fila.empleados.apellidos || ''}`.trim(),
          dui: fila.empleados.dui || '',
          cargo: fila.empleados.cargo || ''
        }
      : null
  })));
}

/**
 * Saca uno o varios ganadores de una línea de premio.
 *
 * El orden de las validaciones importa: primero se confirma que el sorteo y la
 * línea existan y tengan unidades por repartir, después que quede gente
 * elegible, y recién ahí se escribe. Así nunca queda un ganador a medias ni se
 * descuenta un premio que no se entregó.
 *
 * Soporte de preasignaciones: antes de elegir aleatoriamente, consume los
 * registros de preasignaciones_sorteo para ese sorteo/premio. Si hay menos
 * preasignaciones que los pedidos, completa con aleatorios. Las preasignaciones
 * consumidas se eliminan silenciosamente.
 */
async function sortearGanador({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const sorteoId = aTexto(cuerpo.sorteoId) || leerParametro(req, 'sorteoId');
  const lineaId = aTexto(cuerpo.lineaId);
  const pedidos = Math.max(1, aEntero(cuerpo.cantidad, 1));

  if (!sorteoId) return responderSolicitudInvalida(res, 'Falta indicar el sorteo.');
  if (!lineaId) return responderSolicitudInvalida(res, 'Falta indicar qué premio se está sorteando.');

  if (pedidos > MAXIMO_POR_EXTRACCION) {
    return responderSolicitudInvalida(
      res,
      `No se pueden sacar más de ${MAXIMO_POR_EXTRACCION} ganadores de una vez.`
    );
  }

  const evento = await obtenerEventoActivo();
  if (!evento) {
    return responderSolicitudInvalida(res, 'No hay un evento activo configurado.');
  }

  const sorteo = await repositorioSorteos.obtenerPorId(sorteoId);
  if (!sorteo) return responderNoEncontrado(res, 'El sorteo no existe.');

  if (String(sorteo.estado || 'ABIERTO').toUpperCase() === 'CERRADO') {
    return responderSolicitudInvalida(res, 'Este sorteo está cerrado. Ábrelo para seguir sorteando.');
  }

  // --- La línea de premio y cuánto le queda -------------------------------
  const { data: linea, error: errorLinea } = await supabase
    .from(TABLAS.sorteoPremios)
    .select('id, sorteo, premio, cantidad, premios(id, nombre)')
    .eq('id', lineaId)
    .maybeSingle();

  if (errorLinea) throw errorLinea;
  if (!linea || linea.sorteo !== sorteoId) {
    return responderNoEncontrado(res, 'Ese premio no pertenece a este sorteo.');
  }

  const { count: yaEntregados } = await supabase
    .from(TABLAS.ganadores)
    .select('id', { count: 'exact', head: true })
    .eq('sorteo_premio', lineaId);

  const disponibles = Math.max(0, (linea.cantidad || 0) - (yaEntregados || 0));
  const nombrePremio = linea.premios?.nombre || 'el premio';

  if (disponibles === 0) {
    return responderSolicitudInvalida(res, `Ya se repartieron todas las unidades de ${nombrePremio}.`);
  }

  const aSortear = Math.min(pedidos, disponibles);

  // --- Prioridad 1: Consumir preasignaciones -------------------------------
  const { data: preasignaciones } = await supabase
    .from(TABLAS.preasignacionesSorteo)
    .select('empleado')
    .eq('sorteo', sorteoId)
    .eq('sorteo_premio', lineaId)
    .order('created_at', { ascending: true })
    .limit(aSortear);

  const idsPreasignados = (preasignaciones || []).map(p => p.empleado);
  const idsElegidos = [...idsPreasignados];
  const faltan = aSortear - idsElegidos.length;

  // --- Cargar asistencias una sola vez (necesarias para aleatorios o para datos) ---
  const { data: asistencias, error: errorAsistencias } = await supabase
    .from(TABLAS.asistencias)
    .select('id, empleado, empleados!inner(id, nombres, apellidos, dui, cargo)')
    .eq('evento', evento.id);

  if (errorAsistencias) throw errorAsistencias;

  const participantes = (asistencias || []).filter((fila) => fila.empleado);
  const mapaEmpleados = new Map();
  for (const p of participantes) {
    mapaEmpleados.set(p.empleado, p);
  }

  // --- Prioridad 2: Completar con aleatorios si faltan cupos ---------------
  if (faltan > 0) {
    if (participantes.length === 0) {
      return responderSolicitudInvalida(
        res,
        'Todavía no hay asistencias registradas en este evento. Nadie puede ganar.'
      );
    }

    // Excluir quienes ya están preasignados y quienes ya ganaron (si no se permite repetir)
    let elegibles = participantes.filter(p => !idsElegidos.includes(p.empleado));

    if (!esVerdadero(sorteo.permite_repetir_ganador)) {
      const { data: previos } = await supabase
        .from(TABLAS.ganadores)
        .select('empleado')
        .eq('sorteo', sorteoId);

      const yaGanaron = new Set((previos || []).map((g) => g.empleado).filter(Boolean));
      elegibles = elegibles.filter((fila) => !yaGanaron.has(fila.empleado));
    }

    if (elegibles.length === 0 && idsElegidos.length === 0) {
      return responderSolicitudInvalida(
        res,
        'Todos los asistentes ya ganaron algo en este sorteo. ' +
        'Si quieres que alguien pueda repetir, activa esa opción al editar el sorteo.'
      );
    }

    // Barajar y tomar los que faltan
    const cuantosAleatorios = Math.min(faltan, elegibles.length);
    const barajados = [...elegibles];
    for (let i = barajados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [barajados[i], barajados[j]] = [barajados[j], barajados[i]];
    }
    const aleatorios = barajados.slice(0, cuantosAleatorios);

    for (const a of aleatorios) {
      idsElegidos.push(a.empleado);
      // Agregar al mapa si no está
      if (!mapaEmpleados.has(a.empleado)) {
        mapaEmpleados.set(a.empleado, a);
      }
    }
  }

  if (idsElegidos.length === 0) {
    return responderSolicitudInvalida(res, 'No hay ganadores posibles en este momento.');
  }

  // --- Construir lista final de elegidos con datos del empleado ------------
  const elegidosFinales = idsElegidos.map(id => {
    const encontrado = mapaEmpleados.get(id);
    if (encontrado) return encontrado;

    // Si es preasignado pero no está en asistencias, buscar sus datos
    return {
      empleado: id,
      empleados: null,
      id: null
    };
  });

  // Para preasignados sin asistencia, obtener datos del empleado
  const idsSinDatos = elegidosFinales
    .filter(e => !e.empleados)
    .map(e => e.empleado);

  if (idsSinDatos.length > 0) {
    const { data: empleadosDatos } = await supabase
      .from(TABLAS.empleados)
      .select('id, nombres, apellidos, dui, cargo')
      .in('id', idsSinDatos);

    const mapaEmpleadosDb = new Map((empleadosDatos || []).map(e => [e.id, e]));
    for (const e of elegidosFinales) {
      if (!e.empleados) {
        const datos = mapaEmpleadosDb.get(e.empleado);
        if (datos) {
          e.empleados = datos;
        }
      }
    }
  }

  // Filtrar los que sí tienen datos de empleado
  const elegidosConDatos = elegidosFinales.filter(e => e.empleados);

  if (elegidosConDatos.length === 0) {
    return responderSolicitudInvalida(res, 'No se pudieron obtener datos de los ganadores.');
  }

  // --- Registrar ganadores ----------------------------------------------
  const { count: totalPrevio } = await supabase
    .from(TABLAS.ganadores)
    .select('id', { count: 'exact', head: true })
    .eq('sorteo', sorteoId);

  const repositorioGanadores = new Repositorio(TABLAS.ganadores);
  const nuevos = [];

  for (let i = 0; i < elegidosConDatos.length; i++) {
    const elegido = elegidosConDatos[i];
    const guardado = await repositorioGanadores.insertar({
      sorteo: sorteoId,
      sorteo_premio: lineaId,
      premio: linea.premio || null,
      empleado: elegido.empleado,
      asistencia: elegido.id || null,
      orden: (totalPrevio || 0) + i + 1,
      entregado_por: sesion.usuarioId || null,
      entregado: NO
    });

    nuevos.push({
      id: guardado.id,
      orden: guardado.orden,
      premioNombre: nombrePremio,
      empleado: {
        id: elegido.empleados.id,
        nombre: `${elegido.empleados.nombres} ${elegido.empleados.apellidos || ''}`.trim(),
        dui: elegido.empleados.dui || '',
        cargo: elegido.empleados.cargo || ''
      }
    });
  }

  // --- Limpiar preasignaciones consumidas --------------------------------
  if (idsPreasignados.length > 0) {
    await supabase
      .from(TABLAS.preasignacionesSorteo)
      .delete()
      .eq('sorteo', sorteoId)
      .eq('sorteo_premio', lineaId)
      .in('empleado', idsPreasignados);
  }

  // Descontar stock del catálogo
  if (linea.premio) {
    try {
      const premio = await repositorioPremios.obtenerPorId(linea.premio, 'id, cantidad');
      const enStock = aEntero(premio?.cantidad, 0);
      if (enStock > 0) {
        await repositorioPremios.actualizar(linea.premio, {
          cantidad: Math.max(0, enStock - nuevos.length)
        });
      }
    } catch (fallo) {
      console.warn('[premios] No se pudo descontar el stock:', fallo);
    }
  }

  const quedanDeEstePremio = disponibles - nuevos.length;
  await sincronizarEstado(sorteoId);

  // --- Muestra para animación (ruleta) ------------------------------------
  // Se construye con TODOS los asistentes elegibles, no solo los ganadores.
  // Así la animación muestra nombres aleatorios reales antes de revelar al ganador.
  let muestra = [];
  if (participantes.length > 0) {
    // Barajar para que la muestra sea aleatoria
    const barajados = [...participantes];
    for (let i = barajados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [barajados[i], barajados[j]] = [barajados[j], barajados[i]];
    }
    muestra = barajados
      .slice(0, 40)
      .map((fila) => `${fila.empleados.nombres} ${fila.empleados.apellidos || ''}`.trim())
      .filter(Boolean);
  }

  // Calcular elegibles restantes
  let elegiblesRestantes = 0;
  if (participantes.length > 0) {
    const idsGanadores = new Set(nuevos.map(n => n.empleado.id));
    elegiblesRestantes = participantes.filter(p => !idsGanadores.has(p.empleado)).length;
  }

  return responderOk(res, {
    ganadores: nuevos,
    muestra,
    premioNombre: nombrePremio,
    lineaId,
    pendientesDeEstePremio: quedanDeEstePremio,
    participantes: participantes.length,
    elegiblesRestantes,
    seSortearonMenos: nuevos.length < pedidos,
    mensaje: nuevos.length === 1
      ? '¡Tenemos ganador!'
      : `¡${nuevos.length} ganadores!`
  });
}

/**
 * Lista preasignaciones de un sorteo/premio.
 * Solo administradores.
 */
async function listarPreasignaciones({ req, res }) {
  const sorteoId = leerParametro(req, 'sorteoId');
  const lineaId = leerParametro(req, 'lineaId');

  let query = supabase
    .from(TABLAS.preasignacionesSorteo)
    .select('id, sorteo, sorteo_premio, empleado, created_at, empleados(id, nombres, apellidos, dui)')
    .order('created_at', { ascending: true });

  if (sorteoId) query = query.eq('sorteo', sorteoId);
  if (lineaId) query = query.eq('sorteo_premio', lineaId);

  const { data, error } = await query;
  if (error) throw error;

  return responderOk(res, data || []);
}

/**
 * Crea una preasignación.
 * Solo administradores.
 */
async function crearPreasignacion({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const sorteoId = aTexto(cuerpo.sorteoId);
  const lineaId = aTexto(cuerpo.lineaId);
  const empleadoId = aTexto(cuerpo.empleadoId);

  if (!sorteoId || !lineaId || !empleadoId) {
    return responderSolicitudInvalida(res, 'Faltan datos: sorteoId, lineaId y empleadoId son obligatorios.');
  }

  const { data, error } = await supabase
    .from(TABLAS.preasignacionesSorteo)
    .upsert(
      { sorteo: sorteoId, sorteo_premio: lineaId, empleado: empleadoId },
      { onConflict: 'sorteo,sorteo_premio,empleado', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (error) throw error;

  return responderOk(res, { ok: true, preasignacion: data });
}

/**
 * Elimina una preasignación.
 * Solo administradores.
 */
async function eliminarPreasignacion({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);

  if (!id) {
    return responderSolicitudInvalida(res, 'Falta el id de la preasignación.');
  }

  const { error } = await supabase
    .from(TABLAS.preasignacionesSorteo)
    .delete()
    .eq('id', id);

  if (error) throw error;

  return responderOk(res, { ok: true });
}

/**
 * Deja `estado` y `realizado` de acuerdo con lo que queda por repartir.
 *
 * `realizado` se mantiene sincronizado aunque ya no se use para decidir nada:
 * es una columna vieja que puede estar siendo consultada desde algún lado, y
 * dejarla mintiendo es peor que actualizarla.
 */
async function sincronizarEstado(sorteoId) {
  const { data: lineas } = await supabase
    .from(TABLAS.sorteoPremios)
    .select('id, cantidad')
    .eq('sorteo', sorteoId);

  const { data: ganadores } = await supabase
    .from(TABLAS.ganadores)
    .select('sorteo_premio')
    .eq('sorteo', sorteoId);

  const total = (lineas || []).reduce((suma, l) => suma + (l.cantidad || 0), 0);
  const entregados = (ganadores || []).length;
  const completo = total > 0 && entregados >= total;

  await repositorioSorteos.actualizar(sorteoId, {
    estado: completo ? 'CERRADO' : 'ABIERTO',
    realizado: completo ? SI : NO
  });

  return { total, entregados, completo };
}

/** Marca un premio como entregado en mano, o revierte la marca. */
async function marcarEntregado({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);
  if (!id) return responderSolicitudInvalida(res, 'Falta indicar el ganador.');

  const entregado = aBandera(cuerpo.entregado ?? 'TRUE') === SI;

  await new Repositorio(TABLAS.ganadores).actualizar(id, {
    entregado: entregado ? SI : NO,
    entregado_en: entregado ? new Date().toISOString() : null,
    entregado_por: entregado ? (sesion.usuarioId || null) : null
  });

  return responderOk(res, { ok: true, entregado });
}

/** Abre o cierra un sorteo a mano. */
async function cambiarEstadoSorteo({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);
  if (!id) return responderSolicitudInvalida(res, 'Falta indicar el sorteo.');

  const abrir = aBandera(cuerpo.abierto ?? 'TRUE') === SI;

  const sorteo = await repositorioSorteos.obtenerPorId(id, 'id, nombre');
  if (!sorteo) return responderNoEncontrado(res, 'El sorteo no existe.');

  await repositorioSorteos.actualizar(id, {
    estado: abrir ? 'ABIERTO' : 'CERRADO',
    realizado: abrir ? NO : SI
  });

  return responderOk(res, {
    ok: true,
    abierto: abrir,
    mensaje: abrir
      ? `"${sorteo.nombre}" quedó abierto.`
      : `"${sorteo.nombre}" se cerró.`
  });
}

/**
 * Guarda un sorteo con toda su lista de premios.
 *
 * La lista llega completa desde la pantalla y se sincroniza de una: se suben o
 * actualizan las líneas que vienen, y se borran las que ya no están. Se hace
 * así, y no con altas y bajas sueltas, porque la pantalla edita la lista entera
 * y mandar cada cambio por separado deja la mitad aplicada si algo falla.
 *
 * Una línea de la que ya salieron ganadores NO se borra ni se le baja la
 * cantidad por debajo de lo entregado: sería negar un premio que ya se anunció
 * por el micrófono.
 */
async function guardarSorteo({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const evento = await obtenerEventoActivo();

  const nombre = aTexto(cuerpo.nombre);
  if (!nombre) {
    return responderSolicitudInvalida(res, 'El nombre del sorteo es obligatorio.');
  }

  const datos = {
    nombre,
    descripcion: aTexto(cuerpo.descripcion),
    evento: aTexto(cuerpo.evento) || (evento ? evento.id : null),
    permite_repetir_ganador: aBandera(cuerpo.permiteRepetirGanador ?? 'FALSE')
  };

  // Al crear queda abierto; al editar no se toca el estado, que se maneja
  // desde su propio botón.
  if (!cuerpo.id) {
    datos.estado = 'ABIERTO';
    datos.realizado = NO;
  }

  const sorteo = await repositorioSorteos.guardar(cuerpo.id, datos);

  const lineasPedidas = Array.isArray(cuerpo.premios) ? cuerpo.premios : [];
  const problema = await sincronizarPremios(sorteo.id, lineasPedidas);
  if (problema) return responderSolicitudInvalida(res, problema);

  await sincronizarEstado(sorteo.id);

  return responderOk(res, { ok: true, id: sorteo.id, nombre: sorteo.nombre });
}

/** Deja la lista de premios del sorteo igual a la que mandó la pantalla. */
async function sincronizarPremios(sorteoId, pedidas) {
  const { data: actuales } = await supabase
    .from(TABLAS.sorteoPremios)
    .select('id, premio, cantidad')
    .eq('sorteo', sorteoId);

  const { data: ganadores } = await supabase
    .from(TABLAS.ganadores)
    .select('sorteo_premio')
    .eq('sorteo', sorteoId);

  const entregadosPorLinea = new Map();
  for (const g of ganadores || []) {
    if (!g.sorteo_premio) continue;
    entregadosPorLinea.set(g.sorteo_premio, (entregadosPorLinea.get(g.sorteo_premio) || 0) + 1);
  }

  const porPremio = new Map((actuales || []).map((l) => [l.premio, l]));
  const premiosPedidos = new Set();

  // --- Altas y cambios ------------------------------------------------------
  const filas = [];
  for (let i = 0; i < pedidas.length; i++) {
    const premioId = aTexto(pedidas[i].premioId || pedidas[i].premio);
    if (!premioId || premiosPedidos.has(premioId)) continue;
    premiosPedidos.add(premioId);

    const cantidad = Math.max(1, aEntero(pedidas[i].cantidad, 1));
    const existente = porPremio.get(premioId);
    const entregados = existente ? (entregadosPorLinea.get(existente.id) || 0) : 0;

    if (cantidad < entregados) {
      return `Ya se entregaron ${entregados} unidades de un premio, así que su cantidad no puede bajar de ahí.`;
    }

    filas.push({ sorteo: sorteoId, premio: premioId, cantidad, orden: i });
  }

  if (filas.length > 0) {
    const { error } = await supabase
      .from(TABLAS.sorteoPremios)
      .upsert(filas, { onConflict: 'sorteo,premio' });
    if (error) throw error;
  }

  // --- Bajas ----------------------------------------------------------------
  const aBorrar = (actuales || []).filter((l) => !premiosPedidos.has(l.premio));
  for (const linea of aBorrar) {
    if ((entregadosPorLinea.get(linea.id) || 0) > 0) {
      return 'No se puede quitar un premio del que ya salieron ganadores. Cierra el sorteo si ya terminó.';
    }
  }

  if (aBorrar.length > 0) {
    const { error } = await supabase
      .from(TABLAS.sorteoPremios)
      .delete()
      .in('id', aBorrar.map((l) => l.id));
    if (error) throw error;
  }

  return null;
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
    'GET ganadores': listarGanadores,
    'POST sortear': sortearGanador,
    'POST sorteo': guardarSorteo,
    'PUT sorteo': guardarSorteo,
    'POST entregado': marcarEntregado,
    'POST estado-sorteo': cambiarEstadoSorteo,
    'GET preasignaciones': listarPreasignaciones,
    'POST preasignaciones': crearPreasignacion,
    'POST preasignacion-eliminar': eliminarPreasignacion
  }
});
