/**
 * Resolver el desafío del portal, sin que nadie lo note.
 *
 * El servidor manda un acertijo que solo se resuelve probando números de cero
 * para arriba hasta dar con el que corresponde. La cuenta es rápida, pero no
 * instantánea: cien mil pruebas en el peor caso.
 *
 * El truco para que no se sienta
 * ------------------------------
 * Se empieza a resolver en cuanto se abre la pantalla, no cuando se pulsa
 * «Consultar». Mientras la persona escribe su DUI —que son diez dígitos y unos
 * cuantos segundos— el acertijo ya se está resolviendo de fondo. Para cuando
 * pulsa, la respuesta suele estar lista y la consulta sale de inmediato.
 *
 * Si pulsa antes de que termine, espera lo que falte y nada más.
 *
 * Por qué se corta en pedazos
 * ---------------------------
 * El navegador tiene un solo hilo para dibujar y para calcular. Un bucle de
 * cien mil vueltas seguidas lo deja congelado: no responde al teclado, no anima
 * nada, y en un teléfono el sistema llega a ofrecer cerrar la pestaña.
 *
 * Por eso se resuelve de a tandas y entre tanda y tanda se le devuelve el turno
 * al navegador. Tarda apenas más y la pantalla nunca se traba.
 *
 * Un trabajador web sería más prolijo, pero obliga a servir un archivo aparte
 * —o a armarlo con un blob, que algunas configuraciones estrictas bloquean— y
 * acá el cortado en tandas alcanza de sobra.
 *
 * Cada consulta gasta su desafío
 * ------------------------------
 * Un desafío resuelto sirve una vez. Después de usarlo se pide otro y se lo
 * empieza a resolver enseguida, para que la segunda consulta salga tan rápido
 * como la primera. También se pide otro si el que había venció esperando.
 */

const { reactive } = Vue;

import { sha256 } from '../nucleo/sha256.js';

/** Cuántas pruebas por tanda antes de devolverle el turno al navegador. */
const TANDA = 4000;

/** Margen para no usar un desafío que está por vencer justo al enviarlo. */
const MARGEN_SEGUNDOS = 20;

/** El vencimiento que viene escrito en la sal, en segundos. */
function vencimientoDe(sal) {
  const partes = String(sal || '').split('?');
  if (partes.length < 2) return 0;

  const vence = Number(new URLSearchParams(partes[1]).get('expires'));
  return Number.isFinite(vence) ? vence : 0;
}

/** Le devuelve el turno al navegador hasta el siguiente tic. */
function respirar() {
  return new Promise((seguir) => setTimeout(seguir, 0));
}

export function usarDesafio(pedirDesafio) {
  /**
   * Para la pantalla: si está resolviendo y si ya está listo.
   *
   * No se muestra una barra de progreso a propósito. Esto no es una tarea que
   * la persona pidió, es una condición para atenderla: contarle que se están
   * calculando hashes solo agrega una pregunta que no tiene por qué hacerse.
   * Lo único que llega a verse es el botón esperando, y solo si pulsó rápido.
   */
  const estado = reactive({ resolviendo: false, listo: false, error: '' });

  // La solución armada y esperando a que alguien la use.
  let guardada = null;

  // El trabajo en curso, para que dos llamadas no resuelvan dos veces.
  let enCurso = null;

  /** Prueba número por número hasta dar con el que resuelve el acertijo. */
  async function resolver(desafio) {
    const sal = String(desafio.salt || '');
    const objetivo = String(desafio.challenge || '');
    const tope = Number(desafio.maxnumber) || 0;

    for (let numero = 0; numero <= tope; numero++) {
      if (sha256(`${sal}${numero}`) === objetivo) {
        return {
          algorithm: desafio.algorithm || 'SHA-256',
          challenge: objetivo,
          number: numero,
          salt: sal,
          signature: desafio.signature
        };
      }

      if (numero % TANDA === 0 && numero > 0) await respirar();
    }

    // Que ningún número resuelva significa que el desafío vino roto. No es algo
    // que la persona pueda arreglar, así que se pide otro y se sigue.
    return null;
  }

  /** El paquete que viaja al servidor: la solución en base64, como Altcha. */
  function empaquetar(solucion) {
    const texto = JSON.stringify(solucion);
    // `btoa` solo entiende bytes sueltos, y la sal es hexadecimal, así que
    // nunca hay nada fuera de ASCII acá. Aun así se codifica primero, por si
    // algún día el desafío trae otra cosa.
    return btoa(unescape(encodeURIComponent(texto)));
  }

  async function trabajar() {
    estado.resolviendo = true;
    estado.listo = false;
    estado.error = '';

    try {
      const desafio = await pedirDesafio();
      const solucion = await resolver(desafio);

      if (!solucion) throw new Error('El desafío no tiene solución.');

      guardada = { paquete: empaquetar(solucion), vence: vencimientoDe(desafio.salt) };
      estado.listo = true;
      return guardada;
    } catch (fallo) {
      guardada = null;
      estado.error = (fallo && fallo.message) || 'No se pudo preparar la consulta.';
      throw fallo;
    } finally {
      estado.resolviendo = false;
      enCurso = null;
    }
  }

  /** ¿Lo que hay guardado sigue sirviendo? */
  function sigueVigente() {
    if (!guardada) return false;
    return guardada.vence > Math.floor(Date.now() / 1000) + MARGEN_SEGUNDOS;
  }

  /**
   * Empieza a resolver, sin esperar el resultado.
   *
   * Se llama al abrir la pantalla. Si algo sale mal acá no se muestra nada: la
   * persona todavía no pidió nada, y el error va a volver a aparecer cuando
   * pulse, que es cuando corresponde contarlo.
   */
  function preparar() {
    if (sigueVigente() || enCurso) return;
    enCurso = trabajar().catch(() => null);
  }

  /**
   * La solución para mandar ahora.
   *
   * Devuelve la guardada si sirve, espera la que se esté resolviendo, o arranca
   * una nueva. Lo que devuelve se consume: la próxima consulta empieza de cero.
   */
  async function obtener(intento = 0) {
    // Un servidor con el reloj corrido devolveria desafios ya vencidos, y sin
    // este tope esto se llamaria a si mismo para siempre.
    if (intento > 2) throw new Error('No se pudo preparar la consulta. Intenta de nuevo.');

    if (sigueVigente()) {
      const paquete = guardada.paquete;
      guardada = null;
      estado.listo = false;

      /*
       * No se pide otro de una.
       *
       * La primera versión lo hacía, para que una segunda consulta saliera tan
       * rápido como la primera. Pero casi nadie consulta dos veces —se mira el
       * QR y se cierra— así que era duplicar los pedidos para un caso raro. Si
       * llega una segunda consulta, se resuelve en ese momento y lo único que
       * se nota es el botón esperando un instante.
       */
      return paquete;
    }

    if (enCurso) {
      await enCurso;
      if (sigueVigente()) return obtener(intento + 1);
    }

    enCurso = trabajar();
    await enCurso;
    return obtener(intento + 1);
  }

  /** Tira lo guardado. Se usa al salir de la pantalla. */
  function olvidar() {
    guardada = null;
    estado.listo = false;
    estado.error = '';
  }

  return reactive({ estado, preparar, obtener, olvidar });
}
