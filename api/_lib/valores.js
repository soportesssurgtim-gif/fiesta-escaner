/**
 * Conversión de valores entre lo que usa la base y lo que usa el código.
 *
 * El punto doloroso: en Postgres los booleanos están guardados como el texto
 * 'TRUE' / 'FALSE'. Si comparás directo con === true nunca da. Estas funciones
 * son el traductor oficial; no compares banderas a mano en otro archivo.
 */

import crypto from 'node:crypto';
import { SI, NO } from './configuracion.js';

/** ¿Este valor de la base significa "sí"? Tolera 'true', 'TRUE', true, 1, 'SI'. */
export function esVerdadero(valor) {
  const texto = String(valor ?? '').trim().toUpperCase();
  return texto === 'TRUE' || texto === '1' || texto === 'SI' || texto === 'SÍ';
}

/** Convierte cualquier cosa al 'TRUE'/'FALSE' que espera la base. */
export function aBandera(valor) {
  return esVerdadero(valor) ? SI : NO;
}

/** Texto recortado, o cadena vacía si vino nulo. */
export function aTexto(valor) {
  return String(valor ?? '').trim();
}

/** Número entero, con un valor de respaldo si lo que llegó no es numérico. */
export function aEntero(valor, porDefecto = 0) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : porDefecto;
}

/**
 * Deja solo los dígitos y normaliza el DUI a 9 cifras.
 *
 * Los DUI viejos se digitaron sin el cero inicial, así que un "1234567-8"
 * y un "01234567-8" son la misma persona. Rellenamos a 9 para poder comparar.
 */
export function normalizarDui(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  if (!digitos) return '';
  return digitos.length === 8 ? '0' + digitos : digitos;
}

/** Los últimos 4 dígitos del DUI: es la "contraseña" del portal público. */
export function ultimosCuatroDigitos(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  return digitos.length < 4 ? '' : digitos.slice(-4);
}

/** Un UUID de verdad, no el generador casero a base de Math.random() de antes. */
export function nuevoUuid() {
  return crypto.randomUUID();
}
