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
  purgarSesionesVencidas
} from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoAutenticado,
  responderMetodoNoPermitido
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
      .select('id, fecha_hora_asistencia, fuente, empleado')
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

export const controladorAutenticacion = {
  // El enrutador no exige sesión: cada acción decide por su cuenta.
  publico: true,

  async manejar(contexto) {
    const { res, accion, metodo, req } = contexto;

    if (metodo === 'GET' && (accion === 'datos-iniciales' || accion === 'catalogos')) {
      return recargarDatos(contexto);
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
