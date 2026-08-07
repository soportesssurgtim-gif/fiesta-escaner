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
import { sha256 } from '../seguridad.js';
import { responderOk, responderSolicitudInvalida, responderNoAutenticado } from '../respuestas.js';
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

export const controladorUsuarios = crearControladorCatalogo({
  repositorio: repositorioUsuarios,

  accionesExtra: {
    'POST cambiar-clave': cambiarClavePropia
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
