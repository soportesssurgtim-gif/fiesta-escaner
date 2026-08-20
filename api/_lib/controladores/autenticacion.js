/**
 * Inicio y cierre de sesión, y carga inicial de catálogos.
 *
 * Este recurso está marcado como público en el enrutador porque el login, por
 * definición, ocurre antes de tener sesión. Las otras dos acciones sí validan
 * el token a mano.
 */

import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { TABLAS, SI } from '../configuracion.js';
import { aTexto } from '../valores.js';
import { leerCuerpo } from '../peticion.js';
import {
  sha256,
  crearSesion,
  eliminarSesion,
  exigirSesion,
  purgarSesionesVencidas,
  esAdministrador,
  extraerToken,
  obtenerSesion
} from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoAutenticado,
  responderMetodoNoPermitido,
  responderSinPermiso,
  responderNoEncontrado
} from '../respuestas.js';
import { repositorioEmpleados } from './empleados.js';
import { repositorioDepartamentos } from './departamentos.js';
import { repositorioPremios, repositorioSorteos } from './premios.js';
import { repositorioRoles, repositorioPermisos } from './roles.js';
import { repositorioEventos } from './eventos.js';
import { listarUsuariosConDetalle } from './usuarios.js';

const RONDAS_BCRYPT = 10;

/**
 * Verifica la contraseña y, si hace falta, la migra a bcrypt.
 *
 * El sistema original guardaba SHA-256 pelado. En vez de forzar a todos a
 * resetear su clave, aprovechamos que en el login tenemos la contraseña en
 * claro: si coincide con el hash viejo, la volvemos a guardar con bcrypt y el
 * usuario ni se entera. La próxima vez ya entra por el camino nuevo.
 */
async function verificarContrasena(cuenta, contrasenaIngresada) {
  // Camino normal: bcrypt.
  try {
    if (await bcrypt.compare(contrasenaIngresada, cuenta.password || '')) {
      return true;
    }
  } catch {
    // El hash guardado no tiene formato bcrypt; seguimos con el legacy.
  }

  // Camino legacy: SHA-256.
  if (sha256(contrasenaIngresada.trim()) === cuenta.password) {
    const migrado = await bcrypt.hash(contrasenaIngresada, RONDAS_BCRYPT);
    await supabase.from(TABLAS.usuarios).update({ password: migrado }).eq('id', cuenta.id);
    console.info(`[auth] Contraseña migrada a bcrypt para el usuario ${cuenta.usuario}.`);
    return true;
  }

  return false;
}

/**
 * Trae de una sola vez todo lo que la aplicación necesita para arrancar.
 *
 * Son nueve consultas en paralelo. Se hace así, y no con llamadas separadas por
 * pantalla, porque el evento se opera desde tablets con señal irregular: es
 * preferible un viaje grande al inicio que veinte chicos durante la jornada.
 */
export async function armarBundleInicial() {
  const [
    empleados,
    departamentos,
    premios,
    roles,
    eventos,
    sorteos,
    permisos,
    usuarios,
    asistenciasCrudas
  ] = await Promise.all([
    repositorioEmpleados.listar(),
    repositorioDepartamentos.listar(),
    repositorioPremios.listar(),
    repositorioRoles.listar(),
    repositorioEventos.listar(),
    repositorioSorteos.listar(),
    repositorioPermisos.listar(),
    listarUsuariosConDetalle(),
    supabase
      .from(TABLAS.asistencias)
      // `evento` viaja para poder decir si alguien ya marcó en el evento
      // activo: sin él, todas las asistencias del histórico se ven iguales.
      .select('id, fecha_hora_asistencia, fuente, empleado, evento')
      .order('fecha_hora_asistencia', { ascending: false })
      .then(({ data }) => data || [])
  ]);

  // Resolvemos nombre y DUI del asistente con un índice en memoria: hacer un
  // join por cada asistencia sería mucho más caro.
  const empleadoPorId = new Map(empleados.map((e) => [e.id, e]));

  const asistencias = asistenciasCrudas.map((registro) => {
    const empleado = empleadoPorId.get(registro.empleado);
    return {
      id: registro.id,
      fechaHora: registro.fecha_hora_asistencia || '',
      evento: registro.evento || null,
      empleadoNombre: empleado
        ? `${empleado.nombres} ${empleado.apellidos}`.trim()
        : 'Desconocido',
      dui: empleado?.dui || 'N/D',
      fuente: registro.fuente || 'qr'
    };
  });

  return {
    empleados,
    departamentos,
    premios,
    roles,
    eventos,
    sorteos,
    permisos,
    usuarios,
    asistencias,
    eventoActivo: eventos.find((evento) => String(evento.activo).toUpperCase() === SI) || null,
    resumen: { total: asistencias.length }
  };
}

async function iniciarSesion({ req, res }) {
  const cuerpo = await leerCuerpo(req);
  const identificador = aTexto(cuerpo.usuario).toLowerCase();
  const contrasena = String(cuerpo.password || '');

  if (!identificador || !contrasena) {
    return responderSolicitudInvalida(res, 'Ingresa tu usuario o correo y tu contraseña.');
  }

  // Se puede entrar con el nombre de usuario o con el correo, lo que la gente
  // recuerde primero.
  const { data: cuentas, error } = await supabase
    .from(TABLAS.usuarios)
    .select('*, roles(id, nombre_rol), empleado(id, nombres, apellidos)')
    .or(`usuario.ilike.${identificador},correo.ilike.${identificador}`)
    .eq('activo', SI)
    .limit(1);

  if (error) throw error;

  const cuenta = (cuentas || [])[0];

  // Mismo mensaje para "no existe" y "clave incorrecta": si distinguimos, le
  // estamos confirmando a un atacante qué usuarios son válidos.
  const credencialesInvalidas = () =>
    responderNoAutenticado(res, 'Usuario o contraseña incorrectos.');

  if (!cuenta) return credencialesInvalidas();
  if (!(await verificarContrasena(cuenta, contrasena))) return credencialesInvalidas();

  const empleado = cuenta.empleado;
  const nombreMostrar = empleado?.nombres
    ? `${empleado.nombres} ${empleado.apellidos || ''}`.trim()
    : (cuenta.correo || cuenta.usuario);

  const datosSesion = {
    usuarioId: cuenta.id,
    empleadoId: empleado?.id || null,
    nombreMostrar,
    correo: cuenta.correo,
    usuario: cuenta.usuario,
    rol: cuenta.roles?.nombre_rol || null,
    rolId: cuenta.rol || null
  };

  const token = await crearSesion(datosSesion);

  // Aprovechamos el login para limpiar sesiones vencidas. No esperamos el
  // resultado: es mantenimiento y no debe demorar la entrada del usuario.
  purgarSesionesVencidas();

  return responderOk(res, {
    token,
    usuario: cuenta.usuario,
    correo: cuenta.correo,
    nombreMostrar,
    rol: datosSesion.rol,
    rolId: datosSesion.rolId,
    debeCambiarContrasena: String(cuenta.configurado || '').toUpperCase() !== SI,
    datosIniciales: await armarBundleInicial()
  });
}

async function cerrarSesion({ req, res }) {
  const { token, error } = await exigirSesion(req);
  // Si el token ya no valía, el objetivo igual se cumplió: no hay sesión.
  if (error) return responderOk(res, { ok: true });

  await eliminarSesion(token);
  return responderOk(res, { ok: true });
}

async function recargarDatos({ req, res }) {
  const { error } = await exigirSesion(req);
  if (error) return responderNoAutenticado(res, error);

  return responderOk(res, await armarBundleInicial());
}

/*
 * ============================ IMPERSONACIÓN ==============================
 *
 * Sirve para una pregunta concreta que aparece siempre: "¿por qué esta persona
 * no ve el botón de sorteos?". Responderla creando una cuenta de prueba con el
 * mismo rol es lento y nunca reproduce el caso exacto.
 *
 * Es una función peligrosa, así que tiene límites duros en el servidor y no
 * solo en la interfaz:
 *
 *   · Solo administradores.
 *   · No a uno mismo: no aporta nada y confunde el registro.
 *   · No a otro administrador. Un administrador ya ve todo, así que no hay
 *     nada que depurar, y en cambio permitiría actuar en nombre de un par sin
 *     que quede claro quién hizo qué.
 *   · No desde una sesión que ya es prestada. Encadenarlas haría imposible
 *     saber quién empezó la cadena.
 *   · La sesión prestada lleva escrito quién la abrió, y eso viaja a la
 *     interfaz para que se vea una franja de aviso todo el tiempo. Nadie
 *     debería olvidarse de que está actuando como otra persona.
 *
 * Todo queda en el log del servidor, que en Vercel es lo más parecido a una
 * auditoría que hay hoy.
 */

/** Empieza a actuar en nombre de otra cuenta. */
async function impersonar({ req, res, sesion, token }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'Solo un administrador puede usar otra cuenta.');
  }

  if (sesion.impersonadoPor) {
    return responderSolicitudInvalida(
      res,
      'Ya estás usando una cuenta prestada. Vuelve a la tuya antes de cambiar a otra.'
    );
  }

  const cuerpo = await leerCuerpo(req);
  const usuarioId = aTexto(cuerpo.usuarioId);
  if (!usuarioId) return responderSolicitudInvalida(res, 'Falta indicar la cuenta.');

  if (usuarioId === sesion.usuarioId) {
    return responderSolicitudInvalida(res, 'Esa ya es tu cuenta.');
  }

  const { data: destino, error } = await supabase
    .from(TABLAS.usuarios)
    .select('id, usuario, correo, activo, empleado, rol, roles(id, nombre_rol)')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error) throw error;
  if (!destino) return responderNoEncontrado(res, 'Esa cuenta ya no existe.');

  if (String(destino.activo || '').toUpperCase() !== SI) {
    return responderSolicitudInvalida(
      res,
      `La cuenta ${destino.usuario} está desactivada. Actívala primero si quieres verla por dentro.`
    );
  }

  const rolDestino = destino.roles?.nombre_rol || null;
  if (esAdministrador(rolDestino)) {
    return responderSolicitudInvalida(
      res,
      `${destino.usuario} también es administrador, así que ve exactamente lo mismo que tú. ` +
      'Usar su cuenta no mostraría nada nuevo y enturbiaría el registro de quién hizo qué.'
    );
  }

  let empleado = null;
  if (destino.empleado) {
    const { data } = await supabase
      .from(TABLAS.empleados)
      .select('id, nombres, apellidos')
      .eq('id', destino.empleado)
      .maybeSingle();
    empleado = data;
  }

  const nombreMostrar = empleado?.nombres
    ? `${empleado.nombres} ${empleado.apellidos || ''}`.trim()
    : (destino.correo || destino.usuario);

  const datosSesion = {
    usuarioId: destino.id,
    empleadoId: destino.empleado || null,
    nombreMostrar,
    correo: destino.correo,
    usuario: destino.usuario,
    rol: rolDestino,
    rolId: destino.rol || null,
    // La marca que hace visible el préstamo, acá y en la interfaz.
    impersonadoPor: {
      usuarioId: sesion.usuarioId,
      usuario: sesion.usuario,
      nombreMostrar: sesion.nombreMostrar
    }
  };

  const tokenPrestado = await crearSesion(datosSesion);

  console.warn(
    `[auth] ${sesion.usuario} empezó a usar la cuenta de ${destino.usuario} (rol ${rolDestino || 'sin rol'})`
  );

  return responderOk(res, {
    token: tokenPrestado,
    usuario: destino.usuario,
    correo: destino.correo,
    nombreMostrar,
    rol: rolDestino,
    rolId: datosSesion.rolId,
    impersonadoPor: datosSesion.impersonadoPor,
    datosIniciales: await armarBundleInicial()
  });
}

/** Vuelve a la cuenta del administrador que empezó el préstamo. */
async function volverDeImpersonar({ res, sesion, token }) {
  if (!sesion.impersonadoPor || !sesion.impersonadoPor.usuarioId) {
    return responderSolicitudInvalida(res, 'No estás usando una cuenta prestada.');
  }

  const { data: original, error } = await supabase
    .from(TABLAS.usuarios)
    .select('id, usuario, correo, activo, empleado, rol, roles(id, nombre_rol)')
    .eq('id', sesion.impersonadoPor.usuarioId)
    .maybeSingle();

  if (error) throw error;

  // Si la cuenta original ya no sirve, no se puede volver a ella: lo correcto
  // es cerrar todo y que vuelva a entrar, no dejar viva la sesión prestada.
  if (!original || String(original.activo || '').toUpperCase() !== SI) {
    await eliminarSesion(token);
    return responderSolicitudInvalida(
      res,
      'Tu cuenta original ya no está disponible. Vuelve a iniciar sesión.'
    );
  }

  let empleado = null;
  if (original.empleado) {
    const { data } = await supabase
      .from(TABLAS.empleados)
      .select('id, nombres, apellidos')
      .eq('id', original.empleado)
      .maybeSingle();
    empleado = data;
  }

  const nombreMostrar = empleado?.nombres
    ? `${empleado.nombres} ${empleado.apellidos || ''}`.trim()
    : (original.correo || original.usuario);

  const tokenPropio = await crearSesion({
    usuarioId: original.id,
    empleadoId: original.empleado || null,
    nombreMostrar,
    correo: original.correo,
    usuario: original.usuario,
    rol: original.roles?.nombre_rol || null,
    rolId: original.rol || null
  });

  // La sesión prestada se cierra: dejarla viva sería dejar por ahí un token
  // que actúa como otra persona.
  await eliminarSesion(token);

  console.warn(`[auth] ${original.usuario} volvió a su cuenta (dejó ${sesion.usuario})`);

  return responderOk(res, {
    token: tokenPropio,
    usuario: original.usuario,
    correo: original.correo,
    nombreMostrar,
    rol: original.roles?.nombre_rol || null,
    rolId: original.rol || null,
    impersonadoPor: null,
    datosIniciales: await armarBundleInicial()
  });
}

export const controladorAutenticacion = {
  // El enrutador no exige sesión: cada acción decide por su cuenta.
  publico: true,

  async manejar(contexto) {
    const { res, accion, metodo, req } = contexto;

    if (metodo === 'GET' && (accion === 'datos-iniciales' || accion === 'catalogos')) {
      return recargarDatos(contexto);
    }

    // Estas dos exigen sesión, aunque el recurso sea público: el enrutador no
    // la carga porque `publico: true`, así que se valida acá.
    if (metodo === 'POST' && (accion === 'impersonar' || accion === 'volver')) {
      const { token, error, estado } = extraerToken(req);
      if (error) return responderNoAutenticado(res, error);

      const sesion = await obtenerSesion(token);
      if (!sesion) return responderNoAutenticado(res, 'Sesión expirada, inicia sesión nuevamente.');

      const contextoConSesion = { ...contexto, sesion, token };
      return accion === 'impersonar'
        ? impersonar(contextoConSesion)
        : volverDeImpersonar(contextoConSesion);
    }

    if (metodo === 'POST') {
      const cuerpo = await leerCuerpo(req);
      // Distinguimos login de logout por la presencia de credenciales, que es
      // como lo hacía el frontend original.
      const traeCredenciales = Boolean(cuerpo.usuario && cuerpo.password);
      return traeCredenciales ? iniciarSesion(contexto) : cerrarSesion(contexto);
    }

    return responderMetodoNoPermitido(res);
  }
};
