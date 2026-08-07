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
import { leerCuerpo } from '../peticion.js';
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

/** Listado para la pantalla de asistencias. */
async function listarAsistencias({ res }) {
  const { data, error } = await supabase
    .from(TABLAS.asistencias)
    .select('id, fecha_hora_asistencia, fuente, empleados!inner(nombres, apellidos, dui), eventos(nombre)')
    .order('fecha_hora_asistencia', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const asistencias = (data || []).map((fila) => ({
    id: fila.id,
    fechaHora: fila.fecha_hora_asistencia || '',
    empleadoNombre: fila.empleados
      ? `${fila.empleados.nombres} ${fila.empleados.apellidos}`.trim()
      : 'Desconocido',
    dui: fila.empleados?.dui || 'N/D',
    fuente: fila.fuente || 'qr',
    eventoNombre: fila.eventos?.nombre || ''
  }));

  return responderOk(res, { asistencias, resumen: { total: asistencias.length } });
}

/**
 * Chequeo de salud para antes de abrir las puertas.
 * Responde las tres preguntas que siempre se hacen el día del evento:
 * ¿hay evento activo?, ¿hay empleados cargados?, ¿cuántos entraron ya?
 */
async function diagnosticar({ res }) {
  const inicio = Date.now();
  const alertas = [];

  const evento = await obtenerEventoActivo();
  if (!evento) alertas.push('No hay ningún evento activo configurado.');

  const empleadosActivos = await repositorioEmpleados.contar({ activo: SI });
  if (empleadosActivos === 0) alertas.push('No hay empleados activos en el catálogo.');

  let registrados = 0;
  if (evento) {
    registrados = await repositorioAsistencias.contar({ evento: evento.id });
  }

  return responderOk(res, {
    ok: alertas.length === 0,
    eventoActivo: evento ? evento.nombre : null,
    empleadosActivos,
    asistentesRegistrados: registrados,
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
    if (metodo === 'GET' && accion === 'diagnostico') {
      return diagnosticar(contexto);
    }
    if (metodo === 'GET') {
      return listarAsistencias(contexto);
    }

    return responderMetodoNoPermitido(res);
  }
};
