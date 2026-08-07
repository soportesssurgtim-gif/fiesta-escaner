/**
 * Importación y exportación de CSV.
 *
 * Antes este código estaba duplicado tal cual en empleados.js y en
 * departamentos.js. Cualquier arreglo había que hacerlo dos veces y siempre se
 * olvidaba uno. Ahora vive acá y los controladores solo describen sus columnas.
 */

import { aTexto } from './valores.js';

/**
 * Escapa un valor para que no rompa el CSV.
 * Si trae coma, comilla o salto de línea, va entre comillas y las comillas
 * internas se duplican, que es lo que manda el estándar.
 */
export function escaparCelda(valor) {
  const texto = String(valor ?? '');
  if (texto.includes(',') || texto.includes('"') || texto.includes('\n') || texto.includes('\r')) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

/**
 * Arma el CSV completo a partir de las filas de la base.
 *
 * @param {Array<Object>} filas     Lo que devolvió Supabase.
 * @param {Array<string>} columnas  Nombres de columna, en el orden deseado.
 *                                  Son también las llaves que se leen de cada fila.
 */
export function generarCsv(filas, columnas) {
  const lineas = [columnas.join(',')];
  for (const fila of filas || []) {
    lineas.push(columnas.map((columna) => escaparCelda(fila[columna] ?? '')).join(','));
  }
  return lineas.join('\n');
}

/**
 * Parte una línea de CSV respetando las comillas.
 *
 * El código anterior hacía `linea.split(',')` a secas, así que un departamento
 * llamado "Obras Públicas, Urbanismo" se partía en dos columnas y corría todo
 * lo demás. Este recorrido carácter por carácter lo resuelve.
 */
export function separarLinea(linea) {
  const celdas = [];
  let actual = '';
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i];

    if (caracter === '"') {
      // Dos comillas seguidas dentro de un campo entrecomillado = una comilla literal.
      if (dentroDeComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        dentroDeComillas = !dentroDeComillas;
      }
      continue;
    }

    if (caracter === ',' && !dentroDeComillas) {
      celdas.push(actual);
      actual = '';
      continue;
    }

    actual += caracter;
  }

  celdas.push(actual);
  return celdas;
}

/**
 * Convierte el texto de un CSV en una lista de objetos.
 *
 * Toma la primera línea como encabezado y usa esos nombres como llaves, así que
 * el orden de las columnas en el archivo deja de importar: lo que manda es cómo
 * se llaman. Eso arregla el otro problema que tenía el importador viejo, que
 * asumía posiciones fijas y se descuadraba si alguien movía una columna.
 *
 * @returns {{ encabezados: string[], filas: Array<Object> }}
 */
export function parsearCsv(texto) {
  const lineas = String(texto || '')
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0);

  if (lineas.length === 0) return { encabezados: [], filas: [] };

  // El BOM que agrega Excel se pega al primer encabezado y lo vuelve
  // irreconocible ("﻿id" en vez de "id"). Lo quitamos de entrada.
  const primeraLinea = lineas[0].replace(/^﻿/, '');
  const encabezados = separarLinea(primeraLinea).map((celda) =>
    aTexto(celda).toLowerCase().replace(/\s+/g, '_')
  );

  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    const celdas = separarLinea(lineas[i]);
    const fila = { _linea: i + 1 };
    encabezados.forEach((encabezado, indice) => {
      fila[encabezado] = aTexto(celdas[indice]);
    });
    filas.push(fila);
  }

  return { encabezados, filas };
}
