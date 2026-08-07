/**
 * Formateo y normalización de datos para mostrar en pantalla.
 *
 * Todo lo que sea "convertir un dato crudo en algo legible" va acá. Antes
 * estaba desperdigado dentro del componente principal y algunas funciones
 * estaban duplicadas con variantes sutilmente distintas.
 */

/**
 * Da formato al DUI salvadoreño: 9 dígitos con guion antes del verificador.
 * Ejemplo: "012345678" → "01234567-8"
 *
 * Los DUI digitados sin el cero inicial se completan solos, porque en la base
 * conviven las dos formas de la época en que se cargaron desde hojas de cálculo.
 */
export function formatearDui(valor) {
  let digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  if (!digitos) return '';
  if (digitos.length === 8) digitos = '0' + digitos;
  digitos = digitos.slice(0, 9);
  return digitos.length === 9 ? `${digitos.slice(0, 8)}-${digitos.slice(8)}` : digitos;
}

/** Solo los dígitos del DUI, que es como se compara y como viaja en el QR. */
export function duiPlano(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  return digitos.length === 8 ? '0' + digitos : digitos;
}

/**
 * Quita tildes y diéresis para poder buscar sin preocuparse por los acentos.
 * Así "Panchimalco" encuentra a "PANCHIMALCO" y "José" a "Jose".
 *
 * (La versión anterior de esta función tenía las clases de caracteres corruptas
 * por un problema de codificación del archivo y no quitaba nada.)
 */
export function limpiarTildes(valor) {
  return String(valor ?? '')
    .normalize('NFD')                 // separa la letra de su acento
    .replace(/[̀-ͯ]/g, '')  // borra los acentos ya sueltos
    .normalize('NFC');
}

/** Texto normalizado para comparar en los buscadores: sin tildes y minúscula. */
export function paraBuscar(valor) {
  return limpiarTildes(valor).toLowerCase().trim();
}

/**
 * ¿Este texto contiene lo que se está buscando?
 * Ignora tildes, mayúsculas y espacios sobrantes en ambos lados.
 */
export function coincide(texto, busqueda) {
  const aguja = paraBuscar(busqueda);
  if (!aguja) return true;
  return paraBuscar(texto).includes(aguja);
}

/** Fecha y hora en formato salvadoreño: "06/08/2026, 21:45" */
export function formatearFechaHora(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString('es-SV', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Solo la hora, para la lista de asistencias del día. */
export function formatearHora(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
}

/** Fecha sola: "6 de agosto de 2026" */
export function formatearFechaLarga(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** ¿Este valor de la base significa "sí"? La base guarda 'TRUE'/'FALSE' como texto. */
export function esVerdadero(valor) {
  const texto = String(valor ?? '').trim().toUpperCase();
  return texto === 'TRUE' || texto === '1' || texto === 'SI' || texto === 'SÍ';
}

/** Convierte un booleano de JavaScript al texto que espera la base. */
export function aBandera(valor) {
  return valor === true || esVerdadero(valor) ? 'TRUE' : 'FALSE';
}

/** Nombre completo a partir de un empleado, sin espacios sobrantes. */
export function nombreCompleto(persona) {
  if (!persona) return '';
  return `${persona.nombres || ''} ${persona.apellidos || ''}`.trim();
}

/**
 * Iniciales para el avatar. Toma la primera letra del nombre y del apellido.
 * Si solo hay una palabra, usa sus dos primeras letras.
 */
export function iniciales(texto) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

/** Recorta un texto largo para que no rompa el ancho de una celda. */
export function recortar(texto, largoMaximo = 40) {
  const limpio = String(texto ?? '');
  return limpio.length <= largoMaximo ? limpio : limpio.slice(0, largoMaximo - 1) + '…';
}

/**
 * Normaliza una fecha al formato ISO "1985-03-24" que espera <input type="date">.
 *
 * Hace falta porque algunos registros viejos se importaron desde Excel con el
 * formato invertido ("24/03/1985") y el input los rechaza en silencio: se ve
 * vacío y quien edita cree que la persona no tiene fecha cargada.
 */
export function aFechaIso(valor) {
  if (!valor) return '';

  const partes = String(valor).split(/[-T/]/);
  if (partes.length < 3) return '';

  // Ya viene en ISO.
  if (partes[0].length === 4) {
    return `${partes[0]}-${String(partes[1]).padStart(2, '0')}-${String(partes[2]).padStart(2, '0')}`;
  }
  // Viene como día/mes/año.
  if (partes[2].length === 4) {
    return `${partes[2]}-${String(partes[1]).padStart(2, '0')}-${String(partes[0]).padStart(2, '0')}`;
  }
  return '';
}
