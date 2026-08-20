/**
 * Autenticación y sesiones.
 *
 * El esquema es simple a propósito: al iniciar sesión generamos un token
 * aleatorio, lo guardamos en la tabla `sesiones` junto con los datos del
 * usuario y su fecha de vencimiento, y el navegador lo manda en cada petición
 * dentro del header Authorization.
 *
 * No usamos JWT porque necesitamos poder invalidar una sesión al instante
 * (cerrar sesión, dar de baja a alguien) y con un JWT firmado eso obliga a
 * llevar una lista negra igual de pesada que esta tabla.
 */

import crypto from 'crypto';
import { supabase } from './supabase.js';
import { DURACION_SESION_SEGUNDOS, TABLAS, ROLES_ADMINISTRADORES, SI } from './configuracion.js';

/**
 * Hash SHA-256.
 *
 * Solo sobrevive para reconocer las contraseñas viejas: el sistema original
 * guardaba SHA-256 pelado. Cuando alguien con contraseña legacy inicia sesión
 * se la volvemos a guardar con bcrypt (ver controlador de autenticación).
 * Para contraseñas nuevas siempre bcrypt, nunca esto.
 */
export function sha256(texto) {
  return crypto.createHash('sha256').update(String(texto || '')).digest('hex');
}

/**
 * Saca el token del header Authorization.
 * Devuelve { token } si venía bien, o { error, estado } si no.
 */
export function extraerToken(req) {
  const cabecera = req.headers.authorization || '';
  if (!cabecera.startsWith('Bearer ')) {
    return { token: null, error: 'Sesión requerida.', estado: 401 };
  }
  const token = cabecera.slice(7).trim();
  if (!token) {
    return { token: null, error: 'Sesión requerida.', estado: 401 };
  }
  return { token, error: null, estado: 200 };
}

/**
 * Busca la sesión en la base y la devuelve solo si sigue vigente.
 * Devuelve null tanto si no existe como si ya venció: al que pregunta le da
 * igual el motivo, en ambos casos hay que volver a iniciar sesión.
 */
export async function obtenerSesion(token) {
  if (!token) return null;
  try {
    const ahora = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLAS.sesiones)
      .select('*')
      .eq('token', token)
      .gte('expires_at', ahora)
      .maybeSingle();

    if (error || !data) return null;
    return data.data || {};
  } catch (fallo) {
    console.error('[seguridad] No se pudo leer la sesión:', fallo);
    return null;
  }
}

/** Crea una sesión nueva y devuelve el token que el navegador debe guardar. */
export async function crearSesion(datosUsuario) {
  const token = crypto.randomUUID();
  const venceEn = new Date(Date.now() + DURACION_SESION_SEGUNDOS * 1000).toISOString();

  const { error } = await supabase.from(TABLAS.sesiones).insert({
    token,
    usuario_id: datosUsuario.usuarioId || null,
    data: datosUsuario,
    expires_at: venceEn
  });

  // Si la inserción falla el token no sirve para nada, así que avisamos en vez
  // de devolver algo que va a fallar en la siguiente petición.
  if (error) {
    console.error('[seguridad] No se pudo crear la sesión:', error);
    throw new Error('No se pudo iniciar la sesión. Intenta nuevamente.');
  }

  return token;
}

/** Cierra una sesión borrando su fila. */
export async function eliminarSesion(token) {
  try {
    await supabase.from(TABLAS.sesiones).delete().eq('token', token);
    return true;
  } catch (fallo) {
    console.error('[seguridad] No se pudo cerrar la sesión:', fallo);
    return false;
  }
}

/**
 * Cierra todas las sesiones abiertas de una cuenta.
 *
 * Se llama al desactivar un usuario. Sin esto, dar de baja a alguien no lo saca
 * del sistema: su token sigue vigente hasta seis horas y puede seguir
 * registrando asistencias como si nada. La baja tiene que tener efecto ya.
 */
export async function cerrarSesionesDeUsuario(usuarioId) {
  if (!usuarioId) return 0;
  try {
    const { data, error } = await supabase
      .from(TABLAS.sesiones)
      .delete()
      .eq('usuario_id', usuarioId)
      .select('token');

    if (error) throw error;
    return (data || []).length;
  } catch (fallo) {
    console.error('[seguridad] No se pudieron cerrar las sesiones:', fallo);
    return 0;
  }
}

/**
 * Limpia sesiones vencidas.
 * La llamamos de vez en cuando desde el login para que la tabla no crezca sin
 * control. Es barato y evita tener que montar un cron aparte.
 */
export async function purgarSesionesVencidas() {
  try {
    await supabase.from(TABLAS.sesiones).delete().lt('expires_at', new Date().toISOString());
  } catch {
    // Si falla no pasa nada: es mantenimiento, no parte del flujo del usuario.
  }
}

/** ¿El nombre de rol corresponde a un administrador con acceso total? */
export function esAdministrador(rol) {
  return ROLES_ADMINISTRADORES.includes(String(rol || '').trim().toUpperCase());
}

/**
 * ¿Este rol puede hacer esta acción en este módulo?
 *
 * Hasta ahora el backend solo distinguía administrador de no administrador, y
 * la matriz de permisos servía únicamente para mostrar u ocultar botones. Eso
 * alcanza para pantallas de solo lectura, pero no para una baja: hace falta
 * poder decir "este rol puede dar de baja empleados" y que el servidor lo
 * respete de verdad.
 *
 * Los administradores pasan sin consultar nada: su rol implica acceso total.
 *
 * @param {Object} sesion
 * @param {string} modulo   'empleados', 'eventos'…
 * @param {string} accion   'ver' | 'agregar' | 'editar' | 'eliminar'
 */
export async function puedeEnModulo(sesion, modulo, accion) {
  if (!sesion) return false;
  if (esAdministrador(sesion.rol)) return true;
  if (!sesion.rolId) return false;

  const columna = `puede_${String(accion || '').toLowerCase()}`;

  try {
    const { data, error } = await supabase
      .from(TABLAS.permisos)
      .select(columna)
      .eq('rol', sesion.rolId)
      .eq('modulo', modulo)
      .maybeSingle();

    if (error || !data) return false;
    return String(data[columna] || '').trim().toUpperCase() === SI;
  } catch (fallo) {
    // Ante la duda, no. Un fallo al leer los permisos no puede convertirse en
    // un permiso concedido.
    console.error('[seguridad] No se pudieron leer los permisos:', fallo);
    return false;
  }
}

/**
 * Guard reutilizable: valida el token y devuelve la sesión ya cargada.
 *
 * Esto reemplaza el bloque de diez líneas que estaba copiado al inicio de cada
 * uno de los once endpoints anteriores.
 */
export async function exigirSesion(req) {
  const { token, error, estado } = extraerToken(req);
  if (error) return { sesion: null, token: null, error, estado };

  const sesion = await obtenerSesion(token);
  if (!sesion) {
    return {
      sesion: null,
      token,
      error: 'Sesión expirada, inicia sesión nuevamente.',
      estado: 401
    };
  }

  return { sesion, token, error: null, estado: 200 };
}
