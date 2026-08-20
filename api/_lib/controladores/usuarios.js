/**
 * Usuarios del sistema (los que inician sesión).
 *
 * Un usuario puede estar vinculado a un empleado, pero no es obligatorio: hay
 * cuentas operativas que no corresponden a nadie del catálogo.
 */

import bcrypt from 'bcryptjs';
import { Repositorio } from '../repositorio.js';
import { TABLAS, SI, NO } from '../configuracion.js';
import { aTexto, aBandera } from '../valores.js';
import { leerCuerpo } from '../peticion.js';
import { sha256, esAdministrador, cerrarSesionesDeUsuario } from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoAutenticado,
  responderNoEncontrado,
  responderSinPermiso
} from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';
import { repositorioEmpleados } from './empleados.js';
import { repositorioRoles } from './roles.js';

// Diez rondas es el estándar razonable: seguro y rápido para el plan gratuito.
const RONDAS_BCRYPT = 10;

const LARGO_MINIMO_CLAVE = 8;

export const repositorioUsuarios = new Repositorio(TABLAS.usuarios, {
  mensajeDuplicado: 'Ese nombre de usuario ya está tomado.'
});

/**
 * Arma el listado para la pantalla de administración.
 *
 * Resolvemos los nombres de empleado y rol acá, en el servidor, para que la
 * tabla del frontend no tenga que cruzar tres listas por cada fila.
 *
 * Importante: nunca incluimos `password` ni `temp_pass` en la respuesta.
 */
export async function listarUsuariosConDetalle() {
  const [empleados, roles, usuarios] = await Promise.all([
    repositorioEmpleados.listar({}, 'id, nombres, apellidos'),
    repositorioRoles.listar({}, 'id, nombre_rol'),
    repositorioUsuarios.listar({}, 'id, empleado, telefono, correo, usuario, rol, activo, configurado')
  ]);

  const nombrePorEmpleado = new Map(
    empleados.map((e) => [e.id, `${e.nombres} ${e.apellidos}`.trim()])
  );
  const nombrePorRol = new Map(roles.map((r) => [r.id, r.nombre_rol]));

  return usuarios.map((usuario) => ({
    id: usuario.id,
    empleadoId: usuario.empleado || '',
    empleadoNombre: nombrePorEmpleado.get(usuario.empleado) || 'Sin empleado vinculado',
    telefono: usuario.telefono || '',
    correo: usuario.correo || '',
    usuario: usuario.usuario || '',
    rolId: usuario.rol || '',
    rolNombre: nombrePorRol.get(usuario.rol) || 'Sin rol',
    activo: usuario.activo || 'TRUE',
    configurado: usuario.configurado || 'FALSE'
  }));
}

/**
 * Cambio de la contraseña propia.
 *
 * Distinto del guardado que hace un administrador sobre otra cuenta: acá la
 * persona actúa sobre sí misma, así que se le exige la contraseña actual. Sin
 * eso, cualquiera que agarrara una sesión abierta podría dejar al dueño fuera.
 *
 * El id del usuario sale de la sesión, nunca del cuerpo de la petición: si lo
 * tomáramos del cuerpo, alguien podría mandar el id de otra persona y cambiarle
 * la clave.
 */
async function cambiarClavePropia({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const claveActual = String(cuerpo.claveActual || '');
  const claveNueva = String(cuerpo.claveNueva || '');

  if (!claveActual || !claveNueva) {
    return responderSolicitudInvalida(res, 'Escribe tu contraseña actual y la nueva.');
  }
  if (claveNueva.length < LARGO_MINIMO_CLAVE) {
    return responderSolicitudInvalida(
      res,
      `La contraseña nueva debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`
    );
  }
  if (claveNueva === claveActual) {
    return responderSolicitudInvalida(res, 'La contraseña nueva debe ser distinta de la actual.');
  }

  const cuenta = await repositorioUsuarios.obtenerPorId(sesion.usuarioId, 'id, usuario, password');
  if (!cuenta) {
    return responderNoAutenticado(res, 'La cuenta de la sesión ya no existe.');
  }

  // Aceptamos la contraseña actual tanto en bcrypt como en el SHA-256 heredado:
  // alguien que nunca inició sesión desde la migración todavía la tiene así.
  let actualEsCorrecta = false;
  try {
    actualEsCorrecta = await bcrypt.compare(claveActual, cuenta.password || '');
  } catch {
    actualEsCorrecta = false;
  }
  if (!actualEsCorrecta && sha256(claveActual.trim()) === cuenta.password) {
    actualEsCorrecta = true;
  }

  if (!actualEsCorrecta) {
    return responderSolicitudInvalida(res, 'La contraseña actual no es correcta.');
  }

  await repositorioUsuarios.actualizar(cuenta.id, {
    password: await bcrypt.hash(claveNueva, RONDAS_BCRYPT),
    // Se limpia la temporal y se marca como configurada: ya no es una clave
    // que alguien más conozca.
    temp_pass: null,
    configurado: SI
  });

  console.info(`[usuarios] ${cuenta.usuario} cambió su contraseña.`);
  return responderOk(res, { ok: true, mensaje: 'Tu contraseña quedó actualizada.' });
}

/**
 * Activa o desactiva una cuenta.
 *
 * No es un borrado: la fila queda, con su historial y su vínculo al empleado.
 * Una cuenta desactivada no puede entrar, y si estaba dentro se la saca en el
 * acto cerrando sus sesiones.
 *
 * Tres cosas que el servidor no deja hacer, porque cada una deja el sistema
 * peor de lo que estaba:
 *
 *   · Desactivarse a uno mismo. Es un pie de bala: se cierra la sesión y hay
 *     que entrar con otra cuenta para revertirlo.
 *   · Dejar al sistema sin ningún administrador activo. Sin eso no habría
 *     forma de volver a entrar a administrar nada.
 *   · Tocar cuentas sin ser administrador.
 */
async function cambiarEstadoDeUsuario({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'Solo un administrador puede activar o desactivar cuentas.');
  }

  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);
  const activar = aBandera(cuerpo.activo) === SI;

  if (!id) return responderSolicitudInvalida(res, 'Falta indicar la cuenta.');

  if (id === sesion.usuarioId) {
    return responderSolicitudInvalida(
      res,
      'No puedes desactivar tu propia cuenta. Pídeselo a otro administrador.'
    );
  }

  const cuenta = await repositorioUsuarios.obtenerPorId(id, 'id, usuario, rol, activo');
  if (!cuenta) return responderNoEncontrado(res, 'Esa cuenta ya no existe.');

  if (!activar && (await esElUltimoAdministrador(cuenta))) {
    return responderSolicitudInvalida(
      res,
      `${cuenta.usuario} es el único administrador activo. ` +
      'Asigna ese rol a otra cuenta antes de desactivarla, o el sistema se queda sin quien lo administre.'
    );
  }

  await repositorioUsuarios.actualizar(id, { activo: activar ? SI : NO });

  let sesionesCerradas = 0;
  if (!activar) {
    // Sin esto, la baja no tiene efecto hasta que le venza el token.
    sesionesCerradas = await cerrarSesionesDeUsuario(id);
  }

  console.info(
    `[usuarios] ${sesion.usuario || 'desconocido'} ${activar ? 'activó' : 'desactivó'} a ${cuenta.usuario}`
  );

  return responderOk(res, {
    ok: true,
    activo: activar,
    usuario: cuenta.usuario,
    sesionesCerradas,
    mensaje: activar
      ? `${cuenta.usuario} puede volver a entrar.`
      : `${cuenta.usuario} quedó desactivado` +
        (sesionesCerradas > 0 ? ' y se cerró su sesión.' : '.')
  });
}

/** ¿Esta cuenta es la única administradora que queda activa? */
async function esElUltimoAdministrador(cuenta) {
  const roles = await repositorioRoles.listar({}, 'id, nombre_rol');
  const idsDeAdministrador = new Set(
    roles.filter((rol) => esAdministrador(rol.nombre_rol)).map((rol) => rol.id)
  );

  if (!idsDeAdministrador.has(cuenta.rol)) return false;

  const activos = await repositorioUsuarios.listar({ activo: SI }, 'id, rol');
  const otros = activos.filter(
    (fila) => fila.id !== cuenta.id && idsDeAdministrador.has(fila.rol)
  );

  return otros.length === 0;
}

export const controladorUsuarios = crearControladorCatalogo({
  repositorio: repositorioUsuarios,

  accionesExtra: {
    'POST cambiar-clave': cambiarClavePropia,
    'POST estado': cambiarEstadoDeUsuario
  },

  listar: async ({ res }) => listarUsuariosConDetalle(),

  mapearFormulario: async (cuerpo) => {
    const datos = {
      empleado: aTexto(cuerpo.empleado) || null,
      telefono: aTexto(cuerpo.telefono),
      correo: aTexto(cuerpo.correo),
      usuario: aTexto(cuerpo.usuario),
      rol: aTexto(cuerpo.rol) || null,
      activo: aBandera(cuerpo.activo ?? 'TRUE')
    };

    const contrasenaNueva = aTexto(cuerpo.passwordPlano);

    // La contraseña solo se toca si vino una nueva. Así, editar el teléfono de
    // alguien no le resetea el acceso.
    if (contrasenaNueva) {
      datos.password = await bcrypt.hash(contrasenaNueva, RONDAS_BCRYPT);
      datos.temp_pass = contrasenaNueva;
      // Queda marcado como "no configurado" para obligarlo a cambiarla.
      datos.configurado = NO;
    }

    return datos;
  },

  validar: (datos, cuerpo) => {
    if (!datos.usuario) return 'El nombre de usuario es obligatorio.';
    // Al crear sí o sí hay que definir una contraseña; al editar es opcional.
    if (!cuerpo.id && !aTexto(cuerpo.passwordPlano)) {
      return 'La contraseña es obligatoria para crear un usuario.';
    }
    if (cuerpo.passwordPlano && aTexto(cuerpo.passwordPlano).length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres.';
    }
    return null;
  }
});
