/**
 * El desafío de trabajo del portal público.
 *
 * Qué problema resuelve
 * ---------------------
 * El portal de invitaciones se atiende sin sesión: cualquiera con la dirección
 * puede consultar. Un script que recorra números de DUI puede juntar la lista
 * de nombres del municipio sin despeinarse, porque pedir mil veces le cuesta lo
 * mismo que pedir una.
 *
 * La idea acá es que pedir cueste. Antes de responder, el servidor manda un
 * acertijo que solo se resuelve probando: hay que encontrar el número que, al
 * mezclarlo con una sal y pasarlo por SHA-256, da un resultado concreto. No hay
 * atajo, se prueba de cero para arriba.
 *
 * Para una persona son unas décimas de segundo mientras termina de escribir su
 * DUI, y no ve nada. Para un script que quiere novecientos empleados, son
 * novecientos acertijos, y eso ya se nota.
 *
 * Es el mismo esquema de Altcha, escrito acá porque son cincuenta líneas y así
 * no hay que crear una cuenta en ningún lado ni depender de que otro servicio
 * siga en pie el día de la fiesta.
 *
 * Lo que este desafío NO hace
 * ---------------------------
 * No distingue a una persona de un robot. Un scraper decidido resuelve el
 * acertijo igual, solo que más lento. Lo que de verdad pone un techo es el
 * limitador por dirección IP; esto encarece cada intento, y las dos cosas
 * juntas son las que sirven. Conviene tenerlo claro para no confiarse.
 *
 * De dónde sale la llave
 * ----------------------
 * De derivar la llave de servicio de Supabase, no de una variable nueva. Es un
 * secreto que ya existe y que ya vive solo en el servidor, y derivarla con
 * SHA-256 es de una sola dirección: de la llave del desafío no se vuelve a la
 * de Supabase. La ventaja práctica es que no hay nada que configurar, y por lo
 * tanto nada que quede sin configurar el día que alguien despliegue de nuevo.
 *
 * Si algún día conviene rotarla sin tocar Supabase, `CLAVE_DESAFIO` manda.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cuántos números hay que probar, como mucho.
 *
 * Se resuelve en la mitad, en promedio. Con este tamaño son unas décimas de
 * segundo en un teléfono modesto: no se percibe, y aun así obliga a quien
 * quiera la lista entera a pagar ese precio una vez por empleado.
 */
export const MAXIMO_NUMERO = 100000;

/** Un desafío viejo no sirve: sin esto, se resuelven mil de antemano. */
export const VIGENCIA_SEGUNDOS = 300;

const ALGORITMO = 'SHA-256';

/** La llave con la que se firma, derivada una sola vez. */
let llaveEnCache = null;

function llave() {
  if (llaveEnCache) return llaveEnCache;

  const explicita = process.env.CLAVE_DESAFIO;
  if (explicita) {
    llaveEnCache = Buffer.from(explicita, 'utf8');
    return llaveEnCache;
  }

  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) {
    // Sin secreto no se puede firmar nada. Se avisa fuerte y se usa una llave
    // de sesión: el portal sigue andando y los desafíos siguen siendo válidos
    // mientras viva esta instancia, que es lo mejor que se puede hacer sin
    // configuración.
    console.warn('[desafio] Sin SUPABASE_SERVICE_ROLE_KEY ni CLAVE_DESAFIO: se firma con una llave de sesión.');
    llaveEnCache = randomBytes(32);
    return llaveEnCache;
  }

  // La etiqueta separa este uso de cualquier otro que se le dé a la misma
  // llave más adelante: dos usos con la misma derivación se contaminan.
  llaveEnCache = createHash('sha256').update(`desafio-invitacion:${base}`).digest();
  return llaveEnCache;
}

function sha256Hex(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

function firmar(texto) {
  return createHmac('sha256', llave()).update(texto, 'utf8').digest('hex');
}

/**
 * Compara sin delatar en cuánto se parecen.
 *
 * Comparar dos textos con `===` corta en la primera letra distinta, y ese
 * tiempo de más se puede medir para ir adivinando la firma letra por letra. Es
 * un ataque difícil sobre una red real, pero la comparación pareja no cuesta
 * nada y evita tener que discutirlo.
 */
function igualesEnTiempoFijo(a, b) {
  const uno = Buffer.from(String(a || ''), 'utf8');
  const otro = Buffer.from(String(b || ''), 'utf8');
  if (uno.length !== otro.length) return false;
  return timingSafeEqual(uno, otro);
}

/**
 * Arma un desafío nuevo.
 *
 * La sal lleva pegado su vencimiento —`?expires=…`— y la firma cubre el
 * resultado, que a su vez sale de la sal. Así el vencimiento queda firmado sin
 * necesidad de guardar nada: el servidor no recuerda los desafíos que emitió,
 * y no hace falta, porque uno inventado no lleva firma válida.
 */
export function crearDesafio() {
  const vence = Math.floor(Date.now() / 1000) + VIGENCIA_SEGUNDOS;
  const sal = `${randomBytes(12).toString('hex')}?expires=${vence}`;

  // El número secreto es lo que hay que encontrar probando.
  const secreto = Math.floor(Math.random() * (MAXIMO_NUMERO + 1));
  const resultado = sha256Hex(`${sal}${secreto}`);

  return {
    algorithm: ALGORITMO,
    challenge: resultado,
    salt: sal,
    signature: firmar(resultado),
    maxnumber: MAXIMO_NUMERO
  };
}

/** El vencimiento que viene escrito en la sal, o null si no trae. */
function vencimientoDe(sal) {
  const partes = String(sal || '').split('?');
  if (partes.length < 2) return null;

  const vence = new URLSearchParams(partes[1]).get('expires');
  const numero = Number(vence);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * ¿La solución que mandaron es buena?
 *
 * Devuelve `{ valido, motivo }`. El motivo es para el log del servidor, no para
 * la pantalla: a quien consulta se le dice siempre lo mismo, porque distinguir
 * «venció» de «está mal» le sirve más a quien está probando que a quien está
 * consultando.
 */
export function verificarDesafio(solucion) {
  if (!solucion || typeof solucion !== 'object') {
    return { valido: false, motivo: 'sin solución' };
  }

  const { algorithm, challenge, number, salt, signature } = solucion;

  if (algorithm && algorithm !== ALGORITMO) {
    return { valido: false, motivo: 'otro algoritmo' };
  }

  if (!challenge || !salt || !signature) {
    return { valido: false, motivo: 'faltan campos' };
  }

  const numero = Number(number);
  if (!Number.isInteger(numero) || numero < 0 || numero > MAXIMO_NUMERO) {
    return { valido: false, motivo: 'número fuera de rango' };
  }

  // Primero la firma: si el desafío no lo emitimos nosotros, no hay más que
  // mirar. Y es lo barato, así que descarta lo inventado sin hacer cuentas.
  if (!igualesEnTiempoFijo(signature, firmar(challenge))) {
    return { valido: false, motivo: 'firma que no es nuestra' };
  }

  const vence = vencimientoDe(salt);
  if (vence === null) return { valido: false, motivo: 'sal sin vencimiento' };
  if (vence < Math.floor(Date.now() / 1000)) {
    return { valido: false, motivo: 'vencido' };
  }

  // Y recién ahora, que el número resuelve de verdad el acertijo.
  if (!igualesEnTiempoFijo(challenge, sha256Hex(`${salt}${numero}`))) {
    return { valido: false, motivo: 'el número no resuelve' };
  }

  return { valido: true, motivo: '' };
}

/**
 * Lee la solución tal como la manda el navegador: en base64, como hace Altcha.
 *
 * Va así y no como parámetros sueltos para que el día que convenga cambiar esto
 * por el widget de Altcha, lo que llega ya tenga la forma que espera.
 */
export function leerSolucion(texto) {
  const crudo = String(texto || '').trim();
  if (!crudo) return null;

  try {
    return JSON.parse(Buffer.from(crudo, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
