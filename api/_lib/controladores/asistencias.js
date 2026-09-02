/**
 * Asistencias: el corazón del sistema durante el evento.
 *
 * Acá llega cada escaneo de QR. Las prioridades, en este orden:
 *   1. Que nunca se pierda un registro (por eso existe el modo offline).
 *   2. Que nadie quede registrado dos veces.
 *   3. Que responda rápido, porque hay una fila de gente esperando en la puerta.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI } from '../configuracion.js';
import { aTexto } from '../valores.js';
import { leerCuerpo, leerParametro } from '../peticion.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoEncontrado,
  responderMetodoNoPermitido
} from '../respuestas.js';
import { repositorioEmpleados, buscarPorIdentificador } from './empleados.js';
import { obtenerEventoActivo } from './eventos.js';

const repositorioAsistencias = new Repositorio(TABLAS.asistencias);

/** Código de Postgres para "violaste un índice único". */
const CHOQUE_DE_UNICIDAD = '23505';

function esRegistroDuplicado(error) {
  return error && (error.code === CHOQUE_DE_UNICIDAD ||
    String(error.message || '').toLowerCase().includes('duplicate'));
}

/**
 * Inserta una asistencia y resuelve el caso "ya estaba".
 *
 * No preguntamos primero si existe y después insertamos: entre esas dos
 * consultas puede colarse otro escáner y meter la misma fila. Insertamos
 * directo y dejamos que el constraint UNIQUE(evento, empleado) haga de árbitro.
 * Esa es la única forma de que dos tablets escaneando a la vez no dupliquen.
 */
async function registrarUno({ evento, empleado, sesion, dispositivo, idCliente }) {
  try {
    await repositorioAsistencias.insertar({
      evento: evento.id,
      empleado: empleado.id,
      escaneado_por: sesion.usuarioId || null,
      dispositivo: dispositivo || 'desconocido',
      fuente: 'qr',
      id_cliente: idCliente || null
    });

    return { duplicado: false };
  } catch (error) {
    if (esRegistroDuplicado(error)) {
      return { duplicado: true };
    }
    throw error;
  }
}

/** Registra la asistencia de un escaneo en vivo. */
async function registrarAsistencia({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const identificador = aTexto(cuerpo.dui || cuerpo.identificador);

  if (!identificador) {
    return responderSolicitudInvalida(res, 'El código escaneado vino vacío.');
  }

  const evento = await obtenerEventoActivo();
  if (!evento) {
    return responderSolicitudInvalida(res, 'No hay un evento activo configurado.');
  }

  const empleados = await repositorioEmpleados.listar(
    { activo: SI },
    'id, nombres, apellidos, dui, codigo, dpto, cargo'
  );
  const empleado = buscarPorIdentificador(identificador, empleados);

  if (!empleado) {
    return responderNoEncontrado(
      res,
      `No se encontró un empleado activo con el código "${identificador}".`
    );
  }

  const { duplicado } = await registrarUno({
    evento,
    empleado,
    sesion,
    dispositivo: aTexto(cuerpo.dispositivo),
    idCliente: aTexto(cuerpo.id_cliente || cuerpo.idCliente)
  });

  return responderOk(res, {
    duplicado,
    empleado: {
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      dui: empleado.dui,
      cargo: empleado.cargo || '',
      dpto: empleado.dpto
    },
    evento: evento.nombre,
    mensaje: duplicado
      ? 'Esta persona ya tenía su asistencia registrada.'
      : 'Asistencia registrada correctamente.'
  });
}

/**
 * Sube en lote lo que se guardó localmente mientras no había señal.
 *
 * La versión anterior consultaba el evento activo y la lista completa de
 * empleados dentro del bucle: con cincuenta pendientes eran cien consultas y la
 * función se pasaba del tiempo límite de Vercel. Ahora las dos cosas se piden
 * una sola vez, antes de empezar.
 */
async function sincronizarPendientes({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const registros = Array.isArray(cuerpo.registros) ? cuerpo.registros : [];

  if (registros.length === 0) {
    return responderSolicitudInvalida(res, 'No hay registros pendientes para sincronizar.');
  }

  const evento = await obtenerEventoActivo();
  if (!evento) {
    return responderSolicitudInvalida(res, 'No hay un evento activo configurado.');
  }

  const empleados = await repositorioEmpleados.listar({ activo: SI }, 'id, nombres, apellidos, dui, codigo');

  const resultado = { sincronizados: 0, duplicados: 0, errores: 0, detalle: [] };

  for (const registro of registros) {
    const idCliente = aTexto(registro.id_cliente || registro.idCliente);
    try {
      const identificador = aTexto(registro.dui || registro.identificador);
      if (!identificador) {
        resultado.errores++;
        resultado.detalle.push({ id_cliente: idCliente, estado: 'error', mensaje: 'Código vacío' });
        continue;
      }

      const empleado = buscarPorIdentificador(identificador, empleados);
      if (!empleado) {
        resultado.errores++;
        resultado.detalle.push({
          id_cliente: idCliente,
          estado: 'error',
          mensaje: `Empleado no encontrado (${identificador})`
        });
        continue;
      }

      const { duplicado } = await registrarUno({
        evento,
        empleado,
        sesion,
        dispositivo: aTexto(registro.dispositivo) || 'sincronizacion-offline',
        idCliente
      });

      if (duplicado) {
        resultado.duplicados++;
        resultado.detalle.push({ id_cliente: idCliente, estado: 'duplicado', mensaje: 'Ya estaba registrado' });
      } else {
        resultado.sincronizados++;
        resultado.detalle.push({
          id_cliente: idCliente,
          estado: 'sincronizado',
          mensaje: `${empleado.nombres} ${empleado.apellidos}`.trim()
        });
      }
    } catch (fallo) {
      resultado.errores++;
      resultado.detalle.push({
        id_cliente: idCliente,
        estado: 'error',
        mensaje: fallo.message || 'Error al sincronizar'
      });
    }
  }

  return responderOk(res, resultado);
}

/**
 * El huso de El Salvador, escrito a mano.
 *
 * Los campos de fecha de la pantalla mandan un dia suelto —2026-12-19— y la
 * columna guarda un instante con huso. Sin decir de que huso es ese dia, el
 * servidor lo lee como UTC y el filtro se corre seis horas: las asistencias de
 * la noche del 19 caen fuera del 19 y aparecen al dia siguiente.
 *
 * Va fijo y no por `Intl` porque tiene que viajar dentro de la consulta como
 * texto. El Salvador no cambia de hora en verano, asi que no se mueve.
 */
const HUSO = '-06:00';

/**
 * Los filtros del listado.
 *
 * Todos son opcionales y se combinan. Van al servidor y no al navegador porque
 * el listado esta acotado a mil filas: filtrando aca, esas mil son mil del
 * evento que se esta mirando; filtrando en el navegador serian las mil ultimas
 * de todos los eventos, recortadas despues.
 */
function leerFiltros(req) {
  return {
    evento: aTexto(leerParametro(req, 'evento')),
    departamento: aTexto(leerParametro(req, 'departamento')),
    distrito: aTexto(leerParametro(req, 'distrito')),
    genero: aTexto(leerParametro(req, 'genero')),
    origen: aTexto(leerParametro(req, 'origen')),
    desde: aTexto(leerParametro(req, 'desde')),
    hasta: aTexto(leerParametro(req, 'hasta'))
  };
}

/** Los que hablan de la persona y no del registro. */
function aplicarFiltrosDePersona(consulta, filtros, prefijo) {
  if (filtros.departamento) consulta = consulta.eq(`${prefijo}dpto`, filtros.departamento);
  if (filtros.distrito) consulta = consulta.eq(`${prefijo}distrito`, filtros.distrito);
  if (filtros.genero) consulta = consulta.eq(`${prefijo}genero`, filtros.genero);
  return consulta;
}

function aplicarFiltros(consulta, filtros) {
  if (filtros.evento) consulta = consulta.eq('evento', filtros.evento);
  if (filtros.origen) consulta = consulta.eq('fuente', filtros.origen);
  if (filtros.desde) {
    consulta = consulta.gte('fecha_hora_asistencia', `${filtros.desde}T00:00:00${HUSO}`);
  }
  if (filtros.hasta) {
    consulta = consulta.lte('fecha_hora_asistencia', `${filtros.hasta}T23:59:59${HUSO}`);
  }
  return aplicarFiltrosDePersona(consulta, filtros, 'empleados.');
}

/** Cuántas filas trae el listado como mucho. */
const TOPE = 1000;

/** Listado para la pantalla de asistencias. */
async function listarAsistencias({ req, res }) {
  const filtros = leerFiltros(req);

  /*
   * `empleados!inner` no es decoración: sin el `!inner` no se puede filtrar por
   * una columna de la tabla enlazada, y el filtro por departamento devolvería
   * la lista entera sin decir nada.
   */
  const consulta = supabase
    .from(TABLAS.asistencias)
    .select(
      'id, fecha_hora_asistencia, fuente, evento, ' +
      'empleados!inner(nombres, apellidos, dui, cargo, distrito, genero, dpto), ' +
      'eventos(nombre)'
    )
    .order('fecha_hora_asistencia', { ascending: false })
    .limit(TOPE);

  const { data, error } = await aplicarFiltros(consulta, filtros);
  if (error) throw error;

  const asistencias = (data || []).map((fila) => ({
    id: fila.id,
    fechaHora: fila.fecha_hora_asistencia || '',
    empleadoNombre: fila.empleados
      ? `${fila.empleados.nombres} ${fila.empleados.apellidos}`.trim()
      : 'Desconocido',
    dui: fila.empleados?.dui || 'N/D',
    cargo: fila.empleados?.cargo || '',
    distrito: fila.empleados?.distrito || '',
    genero: fila.empleados?.genero || '',
    departamento: fila.empleados?.dpto || '',
    fuente: fila.fuente || 'qr',
    eventoId: fila.evento || '',
    eventoNombre: fila.eventos?.nombre || ''
  }));

  /*
   * El total sale de un COUNT y no de `asistencias.length`.
   *
   * El listado esta acotado, asi que pasadas las mil el contador se quedaba
   * clavado en mil y nadie entendia por que dejaba de subir. `limitado` avisa
   * en pantalla que lo que se ve es un recorte, en vez de dejar creer que eso
   * es todo.
   */
  return responderOk(res, {
    asistencias,
    limitado: asistencias.length >= TOPE,
    resumen: {
      total: await contarAsistencias(filtros),
      convocados: await contarConvocados(filtros)
    }
  });
}

/** Cuántas asistencias hay con estos filtros, sin traerse ninguna. */
async function contarAsistencias(filtros = {}) {
  /*
   * El enlace con empleados solo se pide si hace falta.
   *
   * `!inner` deja fuera las asistencias cuyo empleado ya no esté, asi que
   * ponerlo siempre cambiaria en silencio el contador en vivo que sondea la
   * pantalla durante el evento. Sin filtros de persona, esta cuenta es la misma
   * de siempre.
   */
  const porPersona = Boolean(filtros.departamento || filtros.distrito || filtros.genero);

  const consulta = supabase
    .from(TABLAS.asistencias)
    .select(
      porPersona ? 'id, empleados!inner(dpto, distrito, genero)' : 'id',
      { count: 'exact', head: true }
    );

  const { count, error } = await aplicarFiltros(consulta, filtros);
  if (error) throw error;
  return count || 0;
}

/**
 * Cuánta gente estaba convocada, con los mismos filtros de persona.
 *
 * Antes la pantalla dividia por el total de empleados cargados, asi que al
 * filtrar por un departamento el porcentaje seguia comparando contra la
 * municipalidad entera y daba siempre bajisimo. El denominador tiene que
 * moverse con el numerador.
 *
 * Los filtros de fecha y de origen no cuentan acá: hablan del registro, no de
 * la persona. Quien estaba convocado lo estaba independientemente de a qué hora
 * llegó o de si lo escanearon o lo cargaron a mano.
 */
async function contarConvocados(filtros = {}) {
  /*
   * Va por el repositorio y no por una consulta directa.
   *
   * `activo` es texto y en la base conviven «TRUE» y «true»: la carga inicial
   * dejó ochocientos veintiséis en minúscula. Una comparación exacta contra
   * «TRUE» encuentra dieciséis, y el porcentaje de asistencia sale por las
   * nubes —trescientos setenta y uno sobre dieciséis— sin que nada falle.
   *
   * `_filtrar` del repositorio ya lo resuelve con `ilike`, y ese arreglo está
   * ahí porque este mismo problema ya dejó a casi todo el padrón invisible una
   * vez. Consultar Supabase directo salteaba esa capa y volvía a caer en lo
   * mismo. Eso hice, y volvió a pasar.
   */
  const deLaPersona = { activo: SI };
  if (filtros.departamento) deLaPersona.dpto = filtros.departamento;
  if (filtros.distrito) deLaPersona.distrito = filtros.distrito;
  if (filtros.genero) deLaPersona.genero = filtros.genero;

  return repositorioEmpleados.contar(deLaPersona);
}

/**
 * Novedades desde un momento dado.
 *
 * Es lo que sondea la aplicación para que los escaneos de las otras tablets
 * aparezcan casi al instante. Tiene que ser barato: se llama cada pocos
 * segundos en todos los dispositivos abiertos a la vez.
 *
 * Por eso devuelve un COUNT (que Postgres resuelve sin leer filas) y solo las
 * asistencias posteriores a `desde`. En una jornada normal eso son cero o un
 * puñado de filas por llamada, en vez de las mil del listado completo.
 *
 * Sin `desde` no devuelve filas: la primera llamada solo sirve para saber en
 * qué momento está el servidor y desde dónde pedir la próxima vez.
 */
async function listarNovedades({ req, res }) {
  const desde = aTexto(leerParametro(req, 'desde'));

  /*
   * Todo esto es del evento activo, y no de la historia entera.
   *
   * Este contador es el que se ve en el escáner, en la puerta, y el que dice
   * «participan N» en los sorteos. Contando todos los eventos mostraba la suma
   * de todas las fiestas: en la puerta parecía que ya habían entrado
   * trescientas personas antes de escanear a nadie, y el sorteo decía que
   * participaba gente de la fiesta del año pasado.
   *
   * Sin evento activo no hay nada que contar ni que sondear: no se puede
   * registrar una asistencia, así que tampoco puede llegar ninguna.
   */
  const evento = await obtenerEventoActivo();
  if (!evento) {
    return responderOk(res, { total: 0, nuevas: [], desde: new Date().toISOString() });
  }

  const total = await contarAsistencias({ evento: evento.id });

  if (!desde) {
    return responderOk(res, { total, nuevas: [], desde: new Date().toISOString() });
  }

  const { data, error } = await supabase
    .from(TABLAS.asistencias)
    .select('id, fecha_hora_asistencia, fuente, empleados!inner(nombres, apellidos, dui), eventos(nombre)')
    .eq('evento', evento.id)
    .gt('fecha_hora_asistencia', desde)
    .order('fecha_hora_asistencia', { ascending: false })
    .limit(200);

  if (error) throw error;

  const nuevas = (data || []).map((fila) => ({
    id: fila.id,
    fechaHora: fila.fecha_hora_asistencia || '',
    empleadoNombre: fila.empleados
      ? `${fila.empleados.nombres} ${fila.empleados.apellidos}`.trim()
      : 'Desconocido',
    dui: fila.empleados?.dui || 'N/D',
    fuente: fila.fuente || 'qr',
    eventoNombre: fila.eventos?.nombre || ''
  }));

  // La marca para la próxima consulta sale de la fila más reciente, no del
  // reloj de este servidor: si los relojes van corridos, usar la hora local
  // se saltea registros o los repite para siempre.
  const marca = nuevas.length > 0 ? nuevas[0].fechaHora : desde;

  return responderOk(res, { total, nuevas, desde: marca });
}

/**
 * Lo que el código de hoy espera encontrar en la base.
 *
 * Cada entrada es una columna que introdujo alguna migración. Alcanza con una
 * columna por migración: si esa está, la migración corrió entera.
 */
const ESQUEMA_ESPERADO = [
  { tabla: 'sorteo_premios', columna: 'id', migracion: '005_sorteos_multiples_premios' },
  { tabla: 'sorteos', columna: 'permite_repetir_ganador', migracion: '005_sorteos_multiples_premios' },
  { tabla: 'ganadores', columna: 'sorteo_premio', migracion: '005_sorteos_multiples_premios' },
  { tabla: 'roles', columna: 'descripcion', migracion: '004_descripcion_roles' }
];

/**
 * ¿La base está al día con el código?
 *
 * Un desfase acá no se nota hasta que alguien intenta usar la pantalla nueva y
 * le explota en la cara, casi siempre en plena fiesta. Preguntarlo antes de
 * abrir las puertas cuesta unas pocas consultas de conteo.
 */
async function migracionesPendientes() {
  const revisiones = await Promise.all(
    ESQUEMA_ESPERADO.map(async ({ tabla, columna, migracion }) => {
      // Ojo con `head: true`: sobre una tabla que no existe devuelve 204 sin
      // error, así que el chequeo pasaría siempre. Un select normal con
      // limit(1) sí devuelve el 404 y su código. Cuesta una fila.
      const { error } = await supabase.from(tabla).select(columna).limit(1);
      return error ? migracion : null;
    })
  );

  return [...new Set(revisiones.filter(Boolean))];
}

/**
 * Chequeo de salud para antes de abrir las puertas.
 * Responde las tres preguntas que siempre se hacen el día del evento:
 * ¿hay evento activo?, ¿hay empleados cargados?, ¿cuántos entraron ya?
 * Y una cuarta que no se pregunta pero debería: ¿la base está al día?
 */
async function diagnosticar({ res }) {
  const inicio = Date.now();
  const alertas = [];

  const evento = await obtenerEventoActivo();
  if (!evento) alertas.push('No hay ningún evento activo configurado.');

  const empleadosActivos = await repositorioEmpleados.contar({ activo: SI });
  if (empleadosActivos === 0) alertas.push('No hay empleados activos en el catálogo.');

  const pendientes = await migracionesPendientes();
  if (pendientes.length > 0) {
    alertas.push(
      `Falta correr ${pendientes.length === 1 ? 'la migración' : 'las migraciones'} ` +
      `${pendientes.join(', ')} en el SQL Editor de Supabase. ` +
      'Hasta que se corra, las pantallas que dependen de esos campos van a fallar.'
    );
  }

  let registrados = 0;
  if (evento) {
    registrados = await repositorioAsistencias.contar({ evento: evento.id });
  }

  return responderOk(res, {
    ok: alertas.length === 0,
    eventoActivo: evento ? evento.nombre : null,
    empleadosActivos,
    asistentesRegistrados: registrados,
    migracionesPendientes: pendientes,
    alertas,
    latenciaMs: Date.now() - inicio
  });
}

export const controladorAsistencias = {
  async manejar(contexto) {
    const { res, accion, metodo } = contexto;

    if (metodo === 'POST' && (accion === 'registrar' || accion === '')) {
      return registrarAsistencia(contexto);
    }
    if (metodo === 'POST' && accion === 'sincronizar-pendientes') {
      return sincronizarPendientes(contexto);
    }
    if (metodo === 'GET' && accion === 'novedades') {
      return listarNovedades(contexto);
    }
    if (metodo === 'GET' && accion === 'diagnostico') {
      return diagnosticar(contexto);
    }
    if (metodo === 'GET') {
      return listarAsistencias(contexto);
    }

    return responderMetodoNoPermitido(res);
  }
};
