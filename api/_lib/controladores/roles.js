/**
 * Roles y matriz de permisos.
 *
 * Un permiso es la combinación (rol, módulo) con cuatro banderas: ver, agregar,
 * editar y eliminar. La pantalla de permisos manda la matriz completa de un rol
 * de una sola vez, por eso existe la acción de guardado masivo.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, MODULOS } from '../configuracion.js';
import { aTexto, aBandera } from '../valores.js';
import { leerCuerpo } from '../peticion.js';
import { esAdministrador } from '../seguridad.js';
import { responderOk, responderSolicitudInvalida, responderSinPermiso } from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';

export const repositorioRoles = new Repositorio(TABLAS.roles, {
  ordenarPor: 'nombre_rol',
  mensajeDuplicado: 'Ya existe un rol con ese nombre.',
  // `descripcion` llega con la migración 004. Hasta que se corra, guardar un rol
  // sigue funcionando: se ignora ese campo en lugar de fallar.
  columnasOpcionales: ['descripcion']
});

export const repositorioPermisos = new Repositorio(TABLAS.permisos);

/** Normaliza el permiso que llega del formulario al formato de la base. */
function mapearPermiso(entrada) {
  return {
    rol: aTexto(entrada.rol) || null,
    modulo: aTexto(entrada.modulo),
    puede_ver: aBandera(entrada.puedeVer ?? entrada.puede_ver),
    puede_agregar: aBandera(entrada.puedeAgregar ?? entrada.puede_agregar),
    puede_editar: aBandera(entrada.puedeEditar ?? entrada.puede_editar),
    puede_eliminar: aBandera(entrada.puedeEliminar ?? entrada.puede_eliminar)
  };
}

/** Devuelve la matriz completa de permisos. */
async function listarPermisos({ res }) {
  const filas = await repositorioPermisos.listar();
  return responderOk(res, filas);
}

/** Devuelve la lista de módulos sobre los que se puede dar permiso. */
async function listarModulos({ res }) {
  return responderOk(res, MODULOS);
}

/** Alta o edición de un permiso suelto. */
async function guardarPermiso({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);
  const datos = mapearPermiso(cuerpo);

  if (!datos.rol || !datos.modulo) {
    return responderSolicitudInvalida(res, 'Rol y módulo son obligatorios.');
  }

  const guardado = await repositorioPermisos.guardar(cuerpo.id, datos);
  return responderOk(res, guardado);
}

/**
 * Guarda de golpe toda la matriz de permisos de un rol.
 *
 * El código anterior recorría fila por fila haciendo UPDATE y, si fallaba,
 * intentaba un INSERT dentro de un catch anidado dentro de otro catch. Con una
 * matriz de once módulos eran veintidós viajes a la base y errores silenciados.
 *
 * Acá usamos un upsert único sobre la llave (rol, modulo): una sola consulta,
 * y si algo falla el error sube en vez de perderse.
 *
 * ---
 * Sobre el `id`, que estuvo rompiendo esto:
 *
 * La pantalla manda la matriz completa, con `id` en los módulos que ya tenían
 * permiso guardado y `id: null` en los que no. La versión anterior conservaba
 * ese id solo cuando venía, así que el lote quedaba con objetos de claves
 * distintas: unos con `id`, otros sin.
 *
 * PostgREST exige que en un upsert por lotes TODOS los objetos tengan
 * exactamente las mismas claves, y responde PGRST102 "All object keys must
 * match". Ese error se relanzaba y llegaba al navegador como un 500 sin
 * explicación: guardar permisos fallaba siempre que el rol tuviera al menos un
 * módulo nuevo, que es el caso corriente.
 *
 * La solución es no mandar el id en absoluto. El conflicto se resuelve por
 * (rol, modulo), que es único gracias al índice de la migración 003: si la
 * fila existe se actualiza, y si no, se inserta con el id que genera la base.
 * El id del cliente no aportaba nada y encima abría la puerta a un choque por
 * llave primaria.
 */
async function guardarMatrizDeRol({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);
  const entradas = Array.isArray(cuerpo) ? cuerpo : (cuerpo.permisos || []);

  if (entradas.length === 0) {
    return responderSolicitudInvalida(res, 'No se recibió ningún permiso para guardar.');
  }

  const permisos = entradas.map(mapearPermiso).filter((p) => p.rol && p.modulo);

  if (permisos.length === 0) {
    return responderSolicitudInvalida(res, 'Los permisos recibidos no traen rol o módulo.');
  }

  const { error } = await supabase
    .from(TABLAS.permisos)
    .upsert(permisos, { onConflict: 'rol,modulo' });

  if (error) throw error;

  return responderOk(res, { ok: true, guardados: permisos.length });
}

export const controladorRoles = crearControladorCatalogo({
  repositorio: repositorioRoles,

  mapearFormulario: (cuerpo) => ({
    nombre_rol: aTexto(cuerpo.nombreRol || cuerpo.nombre_rol),
    descripcion: aTexto(cuerpo.descripcion),
    activo: aBandera(cuerpo.activo ?? 'TRUE')
  }),

  validar: (datos) => (datos.nombre_rol ? null : 'El nombre del rol es obligatorio.'),

  accionesExtra: {
    'GET permisos': listarPermisos,
    'GET modulos': listarModulos,
    'POST permiso': guardarPermiso,
    'PUT permiso': guardarPermiso,
    // "rol" es el nombre que usaba el frontend viejo para el guardado masivo.
    // Mantenemos el alias para no romper cachés del navegador.
    'POST permisos-rol': guardarMatrizDeRol,
    'POST rol': guardarMatrizDeRol
  }
});
