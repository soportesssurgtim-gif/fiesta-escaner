/**
 * Empleados.
 *
 * Es el catálogo central: de acá salen las asistencias, las invitaciones y los
 * sorteos. El DUI es la clave natural y tiene índice único en la base.
 */

import { Repositorio } from '../repositorio.js';
import { TABLAS } from '../configuracion.js';
import { aTexto, aBandera, normalizarDui } from '../valores.js';
import { generarCsv } from '../csv.js';
import { responderOk, responderDescargaCsv } from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';
import { crearImportadorCsv } from './importacionCsv.js';

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

async function exportarCsv({ res }) {
  const filas = await repositorioEmpleados.listar({}, COLUMNAS_CSV.join(', '));
  return responderDescargaCsv(res, 'empleados.csv', generarCsv(filas, COLUMNAS_CSV));
}

const importarCsv = crearImportadorCsv({
  repositorio: repositorioEmpleados,
  mapearFila: (fila) => ({
    distrito: aTexto(fila.distrito),
    dpto: aTexto(fila.dpto) || null,
    cargo: aTexto(fila.cargo),
    nombres: aTexto(fila.nombres),
    apellidos: aTexto(fila.apellidos),
    fecha_nacimiento: aTexto(fila.fecha_nacimiento),
    telefono: aTexto(fila.telefono),
    correo: aTexto(fila.correo),
    dui: normalizarDui(fila.dui),
    codigo: aTexto(fila.codigo),
    activo: aBandera(fila.activo ?? 'TRUE')
  }),
  validarFila: (datos) => {
    if (!datos.nombres || !datos.apellidos) return 'nombres y apellidos son obligatorios';
    if (!datos.dui) return 'el DUI es obligatorio';
    if (datos.dui.length !== 9) return `el DUI "${datos.dui}" no tiene 9 dígitos`;
    return null;
  },
  claveNatural: (datos) => ({ dui: datos.dui }),
  describir: (datos) => `${datos.nombres} ${datos.apellidos}`.trim(),
  camposNoActualizables: ['dui']
});

export const controladorEmpleados = crearControladorCatalogo({
  repositorio: repositorioEmpleados,

  mapearFormulario: (cuerpo) => ({
    distrito: aTexto(cuerpo.distrito),
    dpto: aTexto(cuerpo.dpto) || null,
    cargo: aTexto(cuerpo.cargo),
    nombres: aTexto(cuerpo.nombres),
    apellidos: aTexto(cuerpo.apellidos),
    fecha_nacimiento: aTexto(cuerpo.fechaNacimiento || cuerpo.fecha_nacimiento),
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
    'PUT importar-csv': importarCsv
  }
});
