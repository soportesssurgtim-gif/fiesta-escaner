/**
 * SHA-256, hecho a mano y sincrónico.
 *
 * Por qué no `crypto.subtle`
 * --------------------------
 * El navegador ya trae SHA-256 en `crypto.subtle.digest`, y es más rápido que
 * esto para un hash suelto. El problema es que devuelve una promesa: para
 * resolver el desafío del portal hay que calcular cientos de miles de hashes
 * uno tras otro, y ahí lo que se paga no es el hash sino el ir y venir de cada
 * promesa. Doscientas mil promesas encadenadas tardan segundos; doscientas mil
 * vueltas de este bucle, décimas.
 *
 * Hay una segunda razón: `crypto.subtle` solo existe en contextos seguros. En
 * `http://` —una prueba en red local, por ejemplo— sencillamente no está, y el
 * portal quedaría sin poder resolver el desafío.
 *
 * Escribir un algoritmo criptográfico a mano suele ser mala idea, pero acá no
 * se está protegiendo nada con él: se usa para resolver un acertijo que el
 * servidor va a verificar de nuevo con la implementación de verdad. Si esto
 * estuviera mal, el síntoma sería que el portal no deja consultar a nadie, no
 * que deje pasar a quien no debe. Aun así las pruebas lo comparan contra
 * `node:crypto` con textos vacíos, largos, acentuados y con emoji.
 *
 * La implementación es la del estándar, sin vueltas: FIPS 180-4, §6.2.
 */

/** Las 64 constantes del estándar: la parte fraccionaria de las raíces cúbicas de los primeros 64 primos. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** El estado inicial: la parte fraccionaria de las raíces cuadradas de los primeros 8 primos. */
const INICIO = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const codificador = new TextEncoder();

/*
 * Espacio de trabajo reutilizado entre llamadas.
 *
 * Reservar dos arreglos nuevos por hash haría que el recolector de basura
 * trabaje más que el algoritmo: en el bucle del desafío son cientos de miles de
 * reservas. Como todo esto corre en un solo hilo y sin pausas en medio del
 * cálculo, un espacio compartido es seguro.
 */
const w = new Uint32Array(64);
const h = new Uint32Array(8);

/** Gira los bits a la derecha; es la operación que usa el algoritmo en todos lados. */
function girar(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Rellena el mensaje como pide el estándar y devuelve los bloques listos. */
function rellenar(bytes) {
  // El mensaje, un 1 en bits, ceros, y al final el largo en 64 bits.
  const total = (((bytes.length + 8) >> 6) + 1) << 6;
  const bloque = new Uint8Array(total);

  bloque.set(bytes);
  bloque[bytes.length] = 0x80;

  const vista = new DataView(bloque.buffer);
  const bits = bytes.length * 8;

  // Los 64 bits del largo van en big-endian. Se escribe la mitad alta también,
  // aunque acá nunca haga falta: dejarla sin escribir sería correcto por
  // casualidad y no por diseño.
  vista.setUint32(total - 8, Math.floor(bits / 0x100000000), false);
  vista.setUint32(total - 4, bits >>> 0, false);

  return { bloque, vista };
}

/** El resumen de estos bytes, en hexadecimal. */
export function sha256Bytes(bytes) {
  const { bloque, vista } = rellenar(bytes);

  h.set(INICIO);

  for (let inicio = 0; inicio < bloque.length; inicio += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(inicio + t * 4, false);

    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = (girar(x, 7) ^ girar(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (girar(y, 17) ^ girar(y, 19) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h[0], b = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], i = h[7];

    for (let t = 0; t < 64; t++) {
      const S1 = (girar(e, 6) ^ girar(e, 11) ^ girar(e, 25)) >>> 0;
      const eleccion = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (i + S1 + eleccion + K[t] + w[t]) >>> 0;

      const S0 = (girar(a, 2) ^ girar(a, 13) ^ girar(a, 22)) >>> 0;
      const mayoria = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + mayoria) >>> 0;

      i = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + i) >>> 0;
  }

  let salida = '';
  for (let n = 0; n < 8; n++) salida += h[n].toString(16).padStart(8, '0');
  return salida;
}

/** El resumen de este texto, en hexadecimal. */
export function sha256(texto) {
  return sha256Bytes(codificador.encode(String(texto)));
}
