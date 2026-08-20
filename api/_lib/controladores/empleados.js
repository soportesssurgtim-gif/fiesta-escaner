/**
 * Empleados.
 *
 * Es el catálogo central: de acá salen las asistencias, las invitaciones y los
 * sorteos. El DUI es la clave natural y tiene índice único en la base.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, NO } from '../configuracion.js';
import { aTexto, aBandera, esVerdadero, normalizarDui, aFechaIso } from '../valores.js';
import { generarCsv } from '../csv.js';
import { leerCuerpo } from '../peticion.js';
import { esAdministrador, puedeEnModulo } from '../seguridad.js';
import {
  responderOk,
  responderDescargaCsv,
  responderSolicitudInvalida,
  responderNoEncontrado,
  responderSinPermiso
} from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';
import { crearImportadorCsv } from './importacionCsv.js';
import { repositorioDepartamentos } from './departamentos.js';

const COLUMNAS_CSV = [
  'id', 'distrito', 'dpto', 'cargo', 'nombres', 'apellidos',
  'fecha_nacimiento', 'telefono', 'correo', 'dui', 'codigo', 'activo'
];

export const repositorioEmpleados = new Repositorio(TABLAS.empleados, {
  ordenarPor: 'apellidos',
  mensajeDuplicado: 'El DUI ya está registrado para otro empleado.'
});

/**
 * Encuentra a un empleado a partir de lo que venga en el QR.
 *
 * Los QR del sistema no son homogéneos: los primeros se generaron con el id,
 * después se pasó al DUI y algunos gafetes viejos traen el código interno. Para
 * que el escáner nunca falle probamos las tres formas, en ese orden.
 *
 * Vive acá porque tanto el escáner como el portal público la necesitan.
 */
export function buscarPorIdentificador(identificador, empleados) {
  const crudo = aTexto(identificador);
  if (!crudo) return null;

  const lista = empleados || [];

  // 1) ¿Es el id directo?
  const porId = lista.find((empleado) => String(empleado.id) === crudo);
  if (porId) return porId;

  // 2) ¿Es un DUI? Comparamos normalizado para que dé igual el cero inicial
  //    y los guiones.
  const duiBuscado = normalizarDui(crudo);
  if (duiBuscado) {
    const porDui = lista.find((empleado) => normalizarDui(empleado.dui) === duiBuscado);
    if (porDui) return porDui;
  }

  // 3) ¿Es el código interno que asigna TI?
  const porCodigo = lista.find((empleado) => aTexto(empleado.codigo) === crudo);
  if (porCodigo) return porCodigo;

  return null;
}

/** Versión liviana para los selectores del módulo de tarjetas. */
async function listarParaTarjetas({ res }) {
  const filas = await repositorioEmpleados.listar(
    { activo: 'TRUE' },
    'id, nombres, apellidos, dui, codigo'
  );
  return responderOk(res, filas);
}

/**
 * Traduce el departamento que viene en el archivo a su id.
 *
 * La exportación muestra el NOMBRE del departamento, no su UUID: un archivo
 * lleno de "9f3c8a12-…" es ilegible y nadie puede corregirlo en Excel. Pero la
 * columna `dpto` de la base guarda el id, así que al reimportar hay que
 * traducir de vuelta.
 *
 * Se aceptan las dos formas. Si el valor es un UUID se usa tal cual, para que
 * los archivos exportados antes de este cambio sigan sirviendo. Si no, se busca
 * por nombre ignorando mayúsculas y tildes, que es como la gente lo escribe.
 *
 * Devuelve `{ id }` si se resolvió, o `{ error }` con una explicación. No se
 * inventa un departamento ni se deja en blanco en silencio: un empleado en el
 * departamento equivocado es peor que una fila que falla y se puede corregir.
 */
function resolverDepartamento(valor, departamentos) {
  const crudo = aTexto(valor);
  if (!crudo) return { id: null };

  if (ES_UUID.test(crudo)) return { id: crudo };

  const buscado = normalizarNombre(crudo);
  const encontrado = (departamentos || []).find(
    (fila) => normalizarNombre(fila.nombre_dpto) === buscado ||
              normalizarNombre(fila.cod_dpto) === buscado
  );

  if (encontrado) return { id: encontrado.id };

  return { error: `el departamento "${crudo}" no existe en el catálogo` };
}

/** Para comparar nombres escritos a mano: sin tildes, sin dobles espacios. */
function normalizarNombre(valor) {
  return aTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function exportarCsv({ res }) {
  const filas = await repositorioEmpleados.listar({}, COLUMNAS_CSV.join(', '));
  return responderDescargaCsv(res, 'empleados.csv', generarCsv(filas, COLUMNAS_CSV));
}

const importarCsv = crearImportadorCsv({
  repositorio: repositorioEmpleados,

  // El catálogo de departamentos se trae una sola vez, antes de recorrer las
  // filas: buscarlo por cada empleado serían cientos de consultas y la función
  // se pasaría del tiempo límite de Vercel.
  prepararContexto: async () => ({
    departamentos: await repositorioDepartamentos.listar({}, 'id, cod_dpto, nombre_dpto')
  }),

  mapearFila: (fila, contexto) => {
    // Se acepta el nombre en cualquiera de las formas en que puede venir el
    // encabezado, porque la exportación lo llama "departamento" y los archivos
    // viejos lo llamaban "dpto".
    const departamento = resolverDepartamento(
      fila.departamento ?? fila.nombre_dpto ?? fila.dpto,
      contexto && contexto.departamentos
    );

    return {
      distrito: aTexto(fila.distrito),
      dpto: departamento.id ?? null,
      _errorDepartamento: departamento.error || null,
      cargo: aTexto(fila.cargo),
      nombres: aTexto(fila.nombres),
      apellidos: aTexto(fila.apellidos),
      // Se normaliza a ISO: a la importación llega en dd/mm/yyyy, en ISO, o
      // como el número de días de Excel.
      fecha_nacimiento: aFechaIso(fila.fecha_nacimiento),
      telefono: aTexto(fila.telefono),
      correo: aTexto(fila.correo),
      dui: normalizarDui(fila.dui),
      codigo: aTexto(fila.codigo),
      activo: aBandera(fila.activo ?? 'TRUE')
    };
  },
  validarFila: (datos) => {
    if (!datos.nombres || !datos.apellidos) return 'nombres y apellidos son obligatorios';
    if (!datos.dui) return 'el DUI es obligatorio';
    if (datos.dui.length !== 9) return `el DUI "${datos.dui}" no tiene 9 dígitos`;
    if (datos._errorDepartamento) return datos._errorDepartamento;
    return null;
  },
  claveNatural: (datos) => ({ dui: datos.dui }),
  describir: (datos) => `${datos.nombres} ${datos.apellidos}`.trim(),
  camposNoActualizables: ['dui']
});

/**
 * Da de baja a un empleado, o lo borra del todo.
 *
 * Son dos operaciones muy distintas y por eso conviven en la misma acción con
 * una bandera, en vez de esconderse detrás del mismo botón:
 *
 *   · Baja (lo normal)  → `activo = FALSE`. La persona deja de aparecer en el
 *     escáner y en las tarjetas, pero su historial de asistencias sigue en pie.
 *     Alcanza con tener el permiso de eliminar sobre el módulo.
 *
 *   · Borrado definitivo → se va la fila. Solo administradores, porque no tiene
 *     vuelta atrás.
 *
 * El borrado definitivo se niega si la persona tiene algo colgando. Tres tablas
 * apuntan a empleados (asistencias, ganadores y usuarios), así que borrarla
 * rompería la integridad o, peor, se llevaría por delante el registro de que
 * asistió a un evento pasado. Un evento no se repite para reconstruir eso, así
 * que se explica y no se borra.
 */
async function eliminarEmpleado({ req, res, sesion }) {
  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);

  if (!id) {
    return responderSolicitudInvalida(res, 'Falta indicar a quién dar de baja.');
  }

  const definitivo = esVerdadero(cuerpo.definitivo);

  if (definitivo && !esAdministrador(sesion.rol)) {
    return responderSinPermiso(
      res,
      'Solo un administrador puede borrar a un empleado de forma definitiva.'
    );
  }

  if (!definitivo && !(await puedeEnModulo(sesion, 'empleados', 'eliminar'))) {
    return responderSinPermiso(res, 'No tienes permiso para dar de baja empleados.');
  }

  const empleado = await repositorioEmpleados.obtenerPorId(id, 'id, nombres, apellidos, activo');
  if (!empleado) {
    return responderNoEncontrado(res, 'Ese empleado ya no existe.');
  }

  const nombre = `${empleado.nombres || ''} ${empleado.apellidos || ''}`.trim();

  if (!definitivo) {
    await repositorioEmpleados.actualizar(id, { activo: NO });
    return responderOk(res, {
      ok: true,
      definitivo: false,
      nombre,
      mensaje: `${nombre} quedó dado de baja.`
    });
  }

  const dependencias = await contarDependencias(id);
  const total = dependencias.reduce((suma, d) => suma + d.cantidad, 0);

  if (total > 0) {
    const detalle = dependencias
      .filter((d) => d.cantidad > 0)
      .map((d) => `${d.cantidad} ${d.etiqueta}`)
      .join(', ');

    return responderSolicitudInvalida(
      res,
      `No se puede borrar a ${nombre}: tiene ${detalle}. ` +
      'Dale de baja en lugar de borrarlo, o vacía esos registros desde Configuración.'
    );
  }

  await repositorioEmpleados.eliminar(id);

  console.info(`[empleados] ${sesion.usuario || 'desconocido'} borró definitivamente a ${nombre}`);

  return responderOk(res, {
    ok: true,
    definitivo: true,
    nombre,
    mensaje: `${nombre} se borró definitivamente.`
  });
}

/** Qué hay colgando de este empleado y no deja borrarlo. */
async function contarDependencias(idEmpleado) {
  const contar = async (tabla, columna, etiqueta) => {
    const { count, error } = await supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq(columna, idEmpleado);

    if (error) throw error;
    return { etiqueta, cantidad: count || 0 };
  };

  return Promise.all([
    contar(TABLAS.asistencias, 'empleado', 'asistencias registradas'),
    contar(TABLAS.ganadores, 'empleado', 'premios ganados'),
    contar(TABLAS.usuarios, 'empleado', 'cuentas de acceso')
  ]);
}

export const controladorEmpleados = crearControladorCatalogo({
  repositorio: repositorioEmpleados,

  mapearFormulario: (cuerpo) => ({
    distrito: aTexto(cuerpo.distrito),
    dpto: aTexto(cuerpo.dpto) || null,
    cargo: aTexto(cuerpo.cargo),
    nombres: aTexto(cuerpo.nombres),
    apellidos: aTexto(cuerpo.apellidos),
    fecha_nacimiento: aFechaIso(cuerpo.fechaNacimiento || cuerpo.fecha_nacimiento),
    telefono: aTexto(cuerpo.telefono),
    correo: aTexto(cuerpo.correo),
    dui: normalizarDui(cuerpo.dui),
    codigo: aTexto(cuerpo.codigo),
    activo: aBandera(cuerpo.activo ?? 'TRUE')
  }),

  validar: (datos) => {
    if (!datos.nombres || !datos.apellidos) {
      return 'Nombres y apellidos son obligatorios.';
    }
    if (!datos.dui) return 'El DUI es obligatorio.';
    if (datos.dui.length !== 9) return 'El DUI debe tener 9 dígitos.';
    if (datos.telefono && !/^\d{8}$/.test(datos.telefono)) {
      return 'El teléfono debe tener exactamente 8 dígitos, sin guiones.';
    }
    return null;
  },

  accionesExtra: {
    'GET tarjetas': listarParaTarjetas,
    'GET exportar-csv': exportarCsv,
    'POST importar-csv': importarCsv,
    'PUT importar-csv': importarCsv,
    'POST eliminar': eliminarEmpleado
  }
});
