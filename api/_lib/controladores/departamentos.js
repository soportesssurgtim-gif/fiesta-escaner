/**
 * Departamentos (tabla `dpto`).
 *
 * Catálogo simple: código, nombre y estado. Sirve para clasificar empleados.
 */

import { Repositorio } from '../repositorio.js';
import { TABLAS } from '../configuracion.js';
import { aTexto, aBandera } from '../valores.js';
import { generarCsv } from '../csv.js';
import { responderDescargaCsv } from '../respuestas.js';
import { crearControladorCatalogo } from './catalogo.js';
import { crearImportadorCsv } from './importacionCsv.js';

const COLUMNAS_CSV = ['id', 'cod_dpto', 'nombre_dpto', 'activo'];

export const repositorioDepartamentos = new Repositorio(TABLAS.departamentos, {
  ordenarPor: 'nombre_dpto',
  mensajeDuplicado: 'Ya existe un departamento con ese nombre.'
});

/** Descarga el catálogo completo para editarlo en Excel. */
async function exportarCsv({ res }) {
  const filas = await repositorioDepartamentos.listar({}, COLUMNAS_CSV.join(', '));
  return responderDescargaCsv(res, 'departamentos.csv', generarCsv(filas, COLUMNAS_CSV));
}

const importarCsv = crearImportadorCsv({
  repositorio: repositorioDepartamentos,
  mapearFila: (fila) => ({
    cod_dpto: aTexto(fila.cod_dpto || fila.codigo || fila.cod),
    nombre_dpto: aTexto(fila.nombre_dpto || fila.nombre),
    activo: aBandera(fila.activo ?? 'TRUE')
  }),
  validarFila: (datos) => (datos.nombre_dpto ? null : 'el nombre del departamento es obligatorio'),
  claveNatural: (datos) => ({ nombre_dpto: datos.nombre_dpto }),
  describir: (datos) => datos.nombre_dpto,
  camposNoActualizables: ['nombre_dpto']
});

export const controladorDepartamentos = crearControladorCatalogo({
  repositorio: repositorioDepartamentos,

  mapearFormulario: (cuerpo) => ({
    cod_dpto: aTexto(cuerpo.codDpto || cuerpo.cod_dpto),
    nombre_dpto: aTexto(cuerpo.nombreDpto || cuerpo.nombre_dpto),
    activo: aBandera(cuerpo.activo ?? 'TRUE')
  }),

  validar: (datos) =>
    datos.nombre_dpto ? null : 'El nombre del departamento es obligatorio.',

  accionesExtra: {
    'GET exportar-csv': exportarCsv,
    'POST importar-csv': importarCsv,
    'PUT importar-csv': importarCsv
  }
});
