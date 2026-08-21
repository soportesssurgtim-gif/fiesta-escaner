/**
 * Parecido entre dos nombres escritos por personas distintas.
 *
 * El caso que resuelve: Recursos Humanos pega su planilla y los departamentos
 * vienen escritos como los escribe cada quien. «Gerencia de Tecnología de
 * Información», «Gerencia de Tecnologia de la Informacion Municipal» y «Ger. de
 * Tecnología» son el mismo lugar, pero ninguno coincide letra por letra con el
 * nombre del catálogo.
 *
 * Cómo se compara
 * ---------------
 * Se mezclan dos medidas porque cada una falla donde la otra acierta:
 *
 *   Palabras en común (Dice sobre el conjunto de palabras). Es la que entiende
 *   que sobre o falte una palabra entera: «Municipal» de más, «la» de menos.
 *   Pero no perdona un error de tipeo: «Tecnologia» y «Tecnología» sin tildes
 *   son la misma palabra, con una letra cambiada son dos distintas.
 *
 *   Letras en común (distancia de edición sobre el texto entero). Esta sí
 *   perdona el tipeo, pero se hunde cuando una versión trae tres palabras más:
 *   son muchas letras de diferencia aunque el nombre se reconozca al leerlo.
 *
 * Se toma la mezcla de las dos, con más peso en las palabras, y se le suma algo
 * cuando una está contenida en la otra, que en nombres de oficina casi siempre
 * significa que son la misma con un apellido más.
 *
 * Nada de esto decide solo: el resultado es una sugerencia que alguien confirma
 * o cambia antes de que se guarde nada.
 */

import { limpiarTildes } from './formato.js';

/**
 * Palabras que no distinguen un departamento de otro.
 *
 * Están todas las de unión, y también las que aparecen en casi todos los
 * nombres del catálogo: si «gerencia» estuviera, dos gerencias cualesquiera se
 * parecerían solo por eso.
 */
const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'al', 'en', 'para',
  'por', 'con', 'un', 'una'
]);

/**
 * Abreviaturas que se ven en las planillas.
 * Se expanden antes de comparar: «Ger.» y «Gerencia» tienen que ser lo mismo.
 */
const ABREVIATURAS = new Map([
  ['ger', 'gerencia'],
  ['gcia', 'gerencia'],
  ['dpto', 'departamento'],
  ['depto', 'departamento'],
  ['dep', 'departamento'],
  ['dir', 'direccion'],
  ['direc', 'direccion'],
  ['adm', 'administracion'],
  ['admon', 'administracion'],
  ['admin', 'administracion'],
  ['coord', 'coordinacion'],
  ['sub', 'sub'],
  ['tec', 'tecnologia'],
  ['info', 'informacion'],
  ['rrhh', 'recursos humanos'],
  ['rh', 'recursos humanos'],
  ['ti', 'tecnologia informacion'],
  ['uaci', 'unidad adquisiciones contrataciones institucional'],
  ['ugd', 'unidad gestion documental']
]);

/** Sin tildes, sin puntuación, en minúscula y con un solo espacio entre palabras. */
export function normalizar(texto) {
  // Las tildes las quita limpiarTildes, que ya vive en formato.js y la usan
  // todos los buscadores del sistema. Duplicar ese rango de caracteres acá
  // significaba tener dos versiones de lo mismo esperando a divergir.
  //
  // De paso convierte la eñe en ene, y para cotejar nombres eso conviene: en
  // las planillas «Diseno» y «Diseño» conviven, y como los dos lados pasan por
  // la misma limpieza terminan siendo la misma palabra.
  return limpiarTildes(texto)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Las palabras que de verdad distinguen un nombre de otro.
 * Se expanden las abreviaturas y se descartan las palabras de unión.
 */
export function palabras(texto) {
  const salida = [];

  for (const palabra of normalizar(texto).split(' ')) {
    if (!palabra) continue;

    const expandida = ABREVIATURAS.get(palabra) || palabra;
    for (const parte of expandida.split(' ')) {
      if (parte && !PALABRAS_VACIAS.has(parte)) salida.push(parte);
    }
  }

  return salida;
}

/**
 * Distancia de edición: cuántos cambios de una letra separan a dos textos.
 *
 * Se guarda una sola fila de la tabla en vez de la tabla entera. Con nombres de
 * departamento la diferencia no se nota, pero es la versión que no crece en
 * memoria con el largo del texto.
 */
export function distanciaEdicion(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const anterior = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,                                            // borrar
        fila[j - 1] + 1,                                        // insertar
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)              // sustituir
      );
      diagonal = anterior;
    }
  }

  return fila[b.length];
}

/** La distancia de edición llevada a una escala de 0 a 1. */
function parecidoDeLetras(a, b) {
  const largo = Math.max(a.length, b.length);
  if (largo === 0) return 1;
  return 1 - distanciaEdicion(a, b) / largo;
}

/**
 * Cuántas palabras comparten, en escala de 0 a 1 (coeficiente de Dice).
 *
 * Se cuenta sobre conjuntos y no sobre listas: que un nombre repita una palabra
 * no debería contar doble.
 */
function parecidoDePalabras(unas, otras) {
  if (unas.length === 0 && otras.length === 0) return 1;
  if (unas.length === 0 || otras.length === 0) return 0;

  const conjuntoA = new Set(unas);
  const conjuntoB = new Set(otras);

  let comunes = 0;
  for (const palabra of conjuntoA) if (conjuntoB.has(palabra)) comunes++;

  return (2 * comunes) / (conjuntoA.size + conjuntoB.size);
}

/** ¿Todas las palabras de una están dentro de la otra? */
function unaContieneALaOtra(unas, otras) {
  if (unas.length === 0 || otras.length === 0) return false;

  const [cortas, largas] = unas.length <= otras.length ? [unas, otras] : [otras, unas];
  const conjunto = new Set(largas);
  return cortas.every((palabra) => conjunto.has(palabra));
}

/**
 * Qué tanto se parecen dos nombres, de 0 a 1.
 *
 * Los pesos salieron de probar contra los casos reales que trae la planilla de
 * Recursos Humanos; están en las pruebas, con los nombres de verdad.
 */
export function similitud(uno, otro) {
  const textoA = normalizar(uno);
  const textoB = normalizar(otro);

  if (!textoA || !textoB) return 0;
  if (textoA === textoB) return 1;

  const palabrasA = palabras(uno);
  const palabrasB = palabras(otro);

  // Después de sacar las palabras de unión pueden quedar iguales: «Gerencia de
  // Tecnología» y «Gerencia Tecnología» son el mismo nombre.
  if (palabrasA.length > 0 && palabrasA.join(' ') === palabrasB.join(' ')) return 1;

  const porPalabras = parecidoDePalabras(palabrasA, palabrasB);
  const porLetras = parecidoDeLetras(palabrasA.join(' '), palabrasB.join(' '));

  let puntaje = porPalabras * 0.65 + porLetras * 0.35;

  // Que una esté contenida en la otra es señal fuerte: en nombres de oficina
  // suele ser el mismo lugar con una palabra más.
  if (unaContieneALaOtra(palabrasA, palabrasB)) {
    puntaje = Math.max(puntaje, 0.82);
  }

  return Math.min(1, Math.round(puntaje * 1000) / 1000);
}

/** A partir de qué puntaje se considera qué. */
export const UMBRALES = {
  /** Se da por buena y queda lista, aunque igual se puede cambiar. */
  segura: 0.86,
  /** Se sugiere, pero alguien tiene que confirmarla. */
  probable: 0.58
};

/**
 * La mejor coincidencia de `texto` dentro de `candidatos`.
 *
 * Devuelve también las siguientes, que es lo que permite ofrecer alternativas
 * en lugar de una sola opción a ciegas.
 */
export function mejoresCoincidencias(texto, candidatos, nombreDe = (x) => x, cuantas = 4) {
  const puntuados = (candidatos || [])
    .map((candidato) => ({ candidato, puntaje: similitud(texto, nombreDe(candidato)) }))
    .sort((a, b) => b.puntaje - a.puntaje);

  return puntuados.slice(0, cuantas);
}

/** En qué banda cae un puntaje. */
export function bandaDe(puntaje) {
  if (puntaje >= UMBRALES.segura) return 'segura';
  if (puntaje >= UMBRALES.probable) return 'probable';
  return 'ninguna';
}
