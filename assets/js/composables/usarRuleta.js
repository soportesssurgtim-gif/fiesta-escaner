/**
 * El carrete de nombres del sorteo.
 *
 * Qué hace
 * --------
 * Al pulsar «Sacar ganador» empieza a desfilar nombres de asistentes hacia
 * arriba, a velocidad pareja, y cuando el servidor contesta frena poco a poco
 * hasta quedar exactamente en el ganador.
 *
 * Arranca al pulsar y no al llegar la respuesta: si esperara, quien locuta veria
 * primero un boton girando y despues, de golpe, el carrete. El giro es lo que
 * tapa esa espera, asi que tiene que empezar cuando empieza la espera.
 *
 * Lo que el carrete NO hace
 * -------------------------
 * No elige. El ganador lo sortea el servidor entre los asistentes registrados, y
 * acá llega ya decidido. No hay ningún `Math.random()` que resuelva nada: los
 * nombres que desfilan vienen de la misma lista con la que el servidor sorteó,
 * así que lo que se ve es de dónde salió el ganador, no un decorado.
 *
 * Por qué se desliza y no cambia de texto
 * ---------------------------------------
 * La primera versión reemplazaba el nombre cada tantos milisegundos. Se lee como
 * un cartel parpadeando: no hay dirección ni inercia y el ojo no puede seguir
 * nada. Deslizando una columna con `transform` hay las dos cosas, y lo mueve el
 * compositor del navegador sin rehacer la disposición de la página.
 *
 * Cómo frena exacto
 * -----------------
 * Al frenar se escribe el nombre del ganador en una fila concreta —unas cuantas
 * más adelante de donde va el carrete— y la animación lleva el desplazamiento
 * justo hasta ahí.
 *
 * Fijar el destino antes de empezar a frenar es lo que evita el salto: frenar
 * por tiempo y después acomodar al ganador se ve corregirse.
 */

const { reactive, ref } = Vue;

/** Alto de cada fila, en píxeles. Tiene que coincidir con el CSS. */
export const ALTO_FILA = 72;

/** Velocidad del giro libre: una fila cada tantos milisegundos. */
const MS_POR_FILA = 55;

/** Cuánto tarda en frenar una vez que llega el resultado. */
const FRENADO = 2200;

/** Cuántas filas recorre mientras frena. Menos se ve brusco; más, eterno. */
const FILAS_DE_FRENADO = 14;

/**
 * Cuánto puede girar libre antes de quedarse sin columna.
 *
 * Si el servidor tardara más que esto, el carrete se queda quieto esperando en
 * lugar de saltar al principio. No deberia pasar nunca —una extracción tarda
 * décimas— pero quedarse quieto es mejor que dar un tirón.
 */
const ESPERA_MAXIMA = 15000;

/** ¿El sistema pidió menos movimiento? */
function prefiereQuietud() {
  return typeof window !== 'undefined' &&
         typeof window.matchMedia === 'function' &&
         window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** La curva del frenado: rápido al principio, casi quieto al final. */
function suavizar(avance) {
  return 1 - (1 - avance) ** 3;
}

export function usarRuleta() {
  const filas = ref([]);
  const desplazamiento = ref(0);
  const girando = ref(false);

  let cuadro = null;
  let alFrenar = null;

  /** Lo que hay que hacer en cada cuadro. Cambia al pasar de girar a frenar. */
  let paso = null;

  function limpiar() {
    if (cuadro !== null) {
      cancelAnimationFrame(cuadro);
      cuadro = null;
    }
    paso = null;
  }

  function correr() {
    if (!paso) return;
    paso();
    if (paso) cuadro = requestAnimationFrame(correr);
  }

  /**
   * Arranca el giro libre.
   *
   * Se llama al pulsar el botón, antes de saber quién ganó. Sigue girando hasta
   * que alguien llame a `frenarEn`.
   */
  function arrancar(nombres) {
    limpiar();

    const lista = (Array.isArray(nombres) ? nombres : []).filter(Boolean);
    if (lista.length === 0 || prefiereQuietud()) {
      girando.value = false;
      return;
    }

    // Columna larga: la que alcanza para la espera máxima más el frenado.
    const necesarias = Math.ceil(ESPERA_MAXIMA / MS_POR_FILA) + FILAS_DE_FRENADO + 4;
    const columna = [];
    while (columna.length < necesarias) columna.push(...lista);

    filas.value = columna;
    desplazamiento.value = 0;
    girando.value = true;

    const arranque = Date.now();
    const tope = (columna.length - FILAS_DE_FRENADO - 2) * ALTO_FILA;

    paso = () => {
      const avanzado = ((Date.now() - arranque) / MS_POR_FILA) * ALTO_FILA;
      desplazamiento.value = Math.min(avanzado, tope);
    };

    cuadro = requestAnimationFrame(correr);
  }

  /**
   * Frena en el nombre indicado.
   *
   * Devuelve una promesa que se cumple cuando el carrete quedó quieto, para que
   * quien llama sepa cuándo mostrar al ganador y largar el confeti.
   *
   * Sin nombre —cuando salen varios ganadores— frena igual pero sin dejar a
   * nadie en el centro: quedarse en uno de tres sugeriría que ese es «el»
   * ganador.
   */
  function frenarEn(final = '') {
    // Si no llegó a arrancar —sin nombres, o con movimiento reducido— no hay
    // nada que frenar y quien espera recibe su promesa igual.
    if (!girando.value || filas.value.length === 0) {
      girando.value = false;
      if (final) filas.value = [final];
      return Promise.resolve();
    }

    const desde = desplazamiento.value;
    const filaActual = Math.floor(desde / ALTO_FILA);
    const filaDestino = Math.min(filaActual + FILAS_DE_FRENADO, filas.value.length - 1);

    // El ganador se escribe en la fila donde va a frenar. Es lo que hace que el
    // carrete llegue exacto en lugar de acomodarse al final.
    if (final) filas.value[filaDestino] = final;

    const hasta = filaDestino * ALTO_FILA;
    const arranque = Date.now();

    return new Promise((resolver) => {
      alFrenar = resolver;

      paso = () => {
        const avance = Math.min(1, (Date.now() - arranque) / FRENADO);
        desplazamiento.value = desde + (hasta - desde) * suavizar(avance);

        if (avance >= 1) {
          // Clavado en el valor exacto: la curva llega a 1 pero el redondeo de
          // los flotantes puede dejar el nombre medio píxel corrido.
          desplazamiento.value = hasta;
          girando.value = false;
          limpiar();
          if (alFrenar) { alFrenar(); alFrenar = null; }
        }
      };
    });
  }

  /** Arranca y frena de una, para cuando ya se sabe todo. */
  async function girar(nombres, final = '') {
    arrancar(nombres);
    await new Promise((seguir) => setTimeout(seguir, 400));
    return frenarEn(final);
  }

  /**
   * Corta el giro por la mitad.
   *
   * Se usa al cerrar el cartel: si alguien lo cierra mientras gira, la animación
   * seguiría corriendo sobre algo que ya nadie ve.
   */
  function detener() {
    limpiar();
    filas.value = [];
    desplazamiento.value = 0;
    girando.value = false;
    if (alFrenar) { alFrenar(); alFrenar = null; }
  }

  /*
   * Va en `reactive` y no como objeto suelto.
   *
   * `setup()` desenvuelve solo las refs de primer nivel. Devolviendo un objeto
   * comun, `ruleta.filas` en la plantilla sigue siendo la ref y no su valor:
   * el `v-for` recorre las entrañas de la ref y salen «[object Object]», «True»
   * y «False» en la pantalla del sorteo. Pasó de verdad.
   */
  return reactive({ filas, desplazamiento, girando, arrancar, frenarEn, girar, detener });
}
