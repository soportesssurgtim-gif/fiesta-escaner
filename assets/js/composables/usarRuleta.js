/**
 * El foco del sorteo.
 *
 * Qué hace
 * --------
 * Al pulsar «Sacar ganador» aparece un nombre enorme en el centro que cambia
 * muy rápido, rodeado de un anillo que gira. Cuando el servidor contesta, los
 * cambios se van espaciando —cada vez tardan más— hasta que el último se queda
 * fijo: ese es el ganador. El anillo desacelera con ellos y se cierra entero.
 *
 * Arranca al pulsar y no al llegar la respuesta: si esperara, quien locuta veria
 * primero un boton girando y despues, de golpe, la animación. El giro es lo que
 * tapa esa espera, asi que tiene que empezar cuando empieza la espera.
 *
 * Por qué así y no una rueda de gajos
 * -----------------------------------
 * En una ruleta circular con nombres en los gajos entran unos doce, y a la
 * fiesta van cientos de personas. Mostrar doce sugiere que el sorteo fue entre
 * esos doce, y no es cierto. Además el texto girando sobre los gajos no se lee
 * proyectado a diez metros.
 *
 * Acá el anillo aporta el giro y la tensión, y el nombre —uno solo, grande y
 * quieto en el centro— aporta lo que hay que leer. Funciona igual con cinco
 * asistentes que con novecientos.
 *
 * Por qué el nombre cambia y no se desliza
 * ----------------------------------------
 * La versión anterior deslizaba una columna de nombres, como un tragamonedas.
 * Se leia como un selector de formulario: mucho movimiento y ninguna ceremonia,
 * y el ganador quedaba del mismo tamaño que los demás. Un solo nombre ocupando
 * el centro puede ser tres veces mas grande, que es lo que hace falta desde el
 * fondo de la sala.
 *
 * Lo que el foco NO hace
 * ----------------------
 * No elige. El ganador lo sortea el servidor entre los asistentes registrados, y
 * acá llega ya decidido. No hay ningún azar que resuelva nada: los nombres que
 * pasan vienen de la misma lista con la que el servidor sorteó, así que lo que
 * se ve es de dónde salió el ganador, no un decorado.
 *
 * Cómo frena exacto
 * -----------------
 * Al frenar se calculan de antemano los momentos de cada cambio de nombre, con
 * huecos que crecen. El último momento escribe al ganador. Fijar el destino
 * antes de empezar a frenar es lo que evita el salto: frenar por tiempo y
 * después acomodar al ganador se ve corregirse.
 */

const { reactive, ref } = Vue;

/** Giro libre: un nombre nuevo cada tantos milisegundos. */
const MS_POR_CAMBIO = 60;

/** Cuánto dura el último cambio, ya frenando. El silencio antes del nombre. */
const MS_CAMBIO_FINAL = 430;

/** Cuántos nombres pasan mientras frena. Menos se ve brusco; más, eterno. */
const CAMBIOS_DE_FRENADO = 16;

/** Grados por segundo del anillo en giro libre. */
const GRADOS_POR_SEGUNDO = 240;

/** Vueltas que da el anillo mientras frena, para que el final se sienta largo. */
const VUELTAS_DE_FRENADO = 2;

/** Cuánto del anillo se dibuja mientras gira libre, de 0 a 1. */
const ARCO_MINIMO = 0.14;

/**
 * El largo del anillo del SVG: dos pi por r, con r = 54.
 *
 * La plantilla lo necesita para el `stroke-dasharray`, y el radio vive en el
 * `viewBox`. Hay una prueba que comprueba que los dos sigan de acuerdo.
 */
export const CIRCUNFERENCIA = 339.292;

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

/**
 * Los momentos de cada cambio de nombre mientras frena.
 *
 * El hueco entre uno y otro crece: arranca en la velocidad del giro libre y
 * termina en `MS_CAMBIO_FINAL`. El exponente hace que casi todo el espaciado
 * ocurra sobre el final, que es donde tiene que notarse.
 */
function momentosDeFrenado() {
  const momentos = [];
  let acumulado = 0;
  for (let i = 0; i < CAMBIOS_DE_FRENADO; i++) {
    const tramo = i / (CAMBIOS_DE_FRENADO - 1);
    acumulado += MS_POR_CAMBIO + (MS_CAMBIO_FINAL - MS_POR_CAMBIO) * tramo ** 2.5;
    momentos.push(acumulado);
  }
  return momentos;
}

export function usarRuleta() {
  /** El nombre que se ve ahora mismo en el centro. */
  const nombre = ref('');

  /** Grados de rotación del anillo. Crece siempre; no se reinicia al frenar. */
  const giro = ref(0);

  /** Cuánto del anillo está dibujado, de 0 a 1. Llega a 1 al quedar el ganador. */
  const avance = ref(0);

  const girando = ref(false);

  /** Quedó un ganador en el centro. Es lo que enciende el destello. */
  const listo = ref(false);

  let cuadro = null;
  let alFrenar = null;

  /** Lo que hay que hacer en cada cuadro. Cambia al pasar de girar a frenar. */
  let paso = null;

  /** La lista de donde salen los nombres que pasan, y por dónde va. */
  let bolsa = [];
  let proximo = 0;

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
   * El siguiente nombre de la bolsa.
   *
   * Se recorre en orden y se vuelve a empezar. Sin azar: el orden ya viene
   * barajado del servidor, y sortear acá sería la pantalla decidiendo algo que
   * no le toca.
   *
   * `evitar` saltea al ganador mientras frena. Si saliera justo antes del final,
   * el último cambio no cambiaría nada y el momento se perdería.
   */
  function tomarNombre(evitar = '') {
    if (bolsa.length === 0) return '';
    for (let intento = 0; intento < bolsa.length; intento++) {
      const candidato = bolsa[proximo % bolsa.length];
      proximo++;
      if (!evitar || candidato !== evitar) return candidato;
    }
    return bolsa[0];
  }

  /**
   * Arranca el giro libre.
   *
   * Se llama al pulsar el botón, antes de saber quién ganó. Sigue girando hasta
   * que alguien llame a `frenarEn`, sin límite de tiempo: el anillo no se gasta
   * como se gastaba la columna del carrete anterior, así que no hace falta una
   * espera máxima que lo dejaba trabado si el servidor tardaba.
   */
  function arrancar(nombres) {
    limpiar();

    const lista = (Array.isArray(nombres) ? nombres : []).filter(Boolean);
    if (lista.length === 0 || prefiereQuietud()) {
      girando.value = false;
      return;
    }

    bolsa = lista;
    proximo = 0;
    listo.value = false;
    girando.value = true;
    giro.value = 0;
    avance.value = ARCO_MINIMO;
    nombre.value = tomarNombre();

    const arranque = Date.now();
    let ultimoCambio = 0;

    paso = () => {
      const corrido = Date.now() - arranque;
      giro.value = (corrido / 1000) * GRADOS_POR_SEGUNDO;
      if (corrido - ultimoCambio >= MS_POR_CAMBIO) {
        ultimoCambio = corrido;
        nombre.value = tomarNombre();
      }
    };

    cuadro = requestAnimationFrame(correr);
  }

  /**
   * Frena en el nombre indicado.
   *
   * Devuelve una promesa que se cumple cuando quedó quieto, para que quien llama
   * sepa cuándo largar el confeti.
   *
   * Sin nombre —cuando salen varios ganadores— frena igual pero no deja a nadie
   * en el centro: quedarse en uno de tres sugeriría que ese es «el» ganador. La
   * pantalla pasa entonces a la lista completa.
   */
  function frenarEn(final = '') {
    // Si no llegó a arrancar —sin nombres, o con movimiento reducido— no hay
    // nada que frenar y quien espera recibe su promesa igual.
    if (!girando.value) {
      girando.value = false;
      if (final) {
        nombre.value = final;
        avance.value = 1;
        listo.value = true;
      }
      return Promise.resolve();
    }

    const momentos = momentosDeFrenado();
    const duracion = momentos[momentos.length - 1];

    const desdeGiro = giro.value;
    const hastaGiro = desdeGiro + 360 * VUELTAS_DE_FRENADO;
    const desdeArco = avance.value;

    const arranque = Date.now();
    let hechos = 0;

    return new Promise((resolver) => {
      alFrenar = resolver;

      paso = () => {
        const corrido = Date.now() - arranque;
        const tramo = Math.min(1, corrido / duracion);

        giro.value = desdeGiro + (hastaGiro - desdeGiro) * suavizar(tramo);
        avance.value = desdeArco + (1 - desdeArco) * suavizar(tramo);

        /*
         * Los cambios de nombre van por su propia tabla de momentos y no por el
         * avance del giro: son lo que marca el pulso del frenado, y atarlos a la
         * curva del anillo los amontonaria todos al principio.
         */
        while (hechos < momentos.length && corrido >= momentos[hechos]) {
          hechos++;
          const esElUltimo = hechos >= momentos.length;
          nombre.value = esElUltimo && final ? final : tomarNombre(final);
        }

        if (tramo >= 1) {
          // Clavado en los valores exactos: la curva llega a 1 pero el redondeo
          // de los flotantes puede dejar el anillo sin cerrar por un pelo.
          giro.value = hastaGiro;
          avance.value = 1;
          if (final) nombre.value = final;
          girando.value = false;
          listo.value = Boolean(final);
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
    bolsa = [];
    proximo = 0;
    nombre.value = '';
    giro.value = 0;
    avance.value = 0;
    girando.value = false;
    listo.value = false;
    if (alFrenar) { alFrenar(); alFrenar = null; }
  }

  /*
   * Va en `reactive` y no como objeto suelto.
   *
   * `setup()` desenvuelve solo las refs de primer nivel. Devolviendo un objeto
   * comun, `ruleta.nombre` en la plantilla sigue siendo la ref y no su valor, y
   * en la pantalla del sorteo salen «[object Object]», «True» y «False». Pasó
   * de verdad, proyectado.
   */
  return reactive({
    nombre, giro, avance, girando, listo,
    arrancar, frenarEn, girar, detener
  });
}
