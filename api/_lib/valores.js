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

/**
 * Deja cualquier fecha en el formato ISO "1990-03-24" que usa la base.
 *
 * Hace falta porque a la importación llegan en tres formas distintas:
 *
 *   · "24/03/1990"  lo que escribe la gente y lo que exporta el sistema
 *   · "1990-03-24"  lo que ya está guardado
 *   · "32955"       el número de días de Excel, cuando la celda quedó con
 *                   formato de fecha. Antes se guardaba ese número tal cual y
 *                   después nada podía interpretarlo, así que la fecha se veía
 *                   vacía en la ficha y en la siguiente exportación. Parecía
 *                   que no se había guardado.
 *
 * Devuelve '' si no se entiende, en vez de inventar una fecha.
 */
/*
 * El desfase de 1900:
 *
 * Excel cree que 1900 fue bisiesto y reserva el número 60 para un 29 de
 * febrero que no existió. Es un error heredado de Lotus 1-2-3 que nunca
 * corrigieron para no romper las hojas de cálculo del mundo.
 *
 * La consecuencia práctica: para las series de 61 en adelante la cuenta parte
 * del 30 de diciembre de 1899, y para las de antes hay que sumar un día. La
 * 60 no corresponde a ninguna fecha real.
 *
 * En fechas de nacimiento esto no se va a cruzar nunca —serían de enero o
 * febrero de 1900—, pero dejarlo mal sería dejar una resta que da un día menos
 * sin que nadie sepa por qué.
 */
export function aFechaIso(valor) {
  const texto = aTexto(valor);
  if (!texto) return '';

  // Número de días de Excel. Ver la nota del desfase de 1900 más abajo.
  if (/^\d+([.,]\d+)?$/.test(texto)) {
    const dias = Math.floor(Number(texto.replace(',', '.')));
    if (dias > 0 && dias !== 60 && dias < 200000) {
      const base = dias < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
      const fecha = new Date(base + dias * 86400000);
      if (!Number.isNaN(fecha.getTime())) return fecha.toISOString().slice(0, 10);
    }
    return '';
  }

  const partes = texto.split(/[-T/.\s]/).filter(Boolean);
  if (partes.length < 3) return '';

  const dosDigitos = (n) => String(n).padStart(2, '0');

  // Ya viene en ISO.
  if (partes[0].length === 4) {
    return `${partes[0]}-${dosDigitos(partes[1])}-${dosDigitos(partes[2])}`;
  }

  // Día/mes/año. El año de dos cifras se resuelve como 19xx: son fechas de
  // nacimiento, así que "90" es 1990 y no 2090.
  if (partes[2].length === 4) {
    return `${partes[2]}-${dosDigitos(partes[1])}-${dosDigitos(partes[0])}`;
  }
  if (partes[2].length === 2) {
    const anio = Number(partes[2]);
    const siglo = anio > 30 ? 1900 : 2000;
    return `${siglo + anio}-${dosDigitos(partes[1])}-${dosDigitos(partes[0])}`;
  }

  return '';
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
