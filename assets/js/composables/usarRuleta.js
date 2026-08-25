/**
 * El carrete de nombres del sorteo.
 *
 * Qué hace
 * --------
 * Entre que se pulsa «Sacar ganador» y que aparece el nombre, hace desfilar los
 * nombres de los asistentes hacia arriba, cada vez más despacio, hasta frenar
 * justo en el ganador.
 *
 * Es el momento del evento: la sala mira la pantalla, y ese segundo merece el
 * peso que tiene. Mostrar el nombre de golpe funciona, pero se termina antes de
 * que nadie llegue a mirar.
 *
 * Lo que el carrete NO hace
 * -------------------------
 * No elige. El ganador ya venía decidido por el servidor cuando esto arranca:
 * lo sortea el backend entre los asistentes registrados, y acá llega el
 * resultado ya cerrado.
 *
 * Conviene tenerlo claro leyendo el código: no hay ningún `Math.random()` que
 * decida nada. Los nombres que desfilan son de gente que de verdad podía ganar
 * —los manda el servidor desde la misma lista con la que sorteó— así que lo que
 * se ve es una representación honesta de entre quiénes salió.
 *
 * Por qué se desliza y no cambia de texto
 * ---------------------------------------
 * La primera versión reemplazaba el texto cada tantos milisegundos. Funcionaba,
 * pero se lee como un cartel parpadeando y no como algo que gira: no hay
 * dirección, no hay inercia, y el ojo no puede seguir nada.
 *
 * Deslizando una columna con `transform` hay las dos cosas. Además lo mueve el
 * compositor del navegador, sin recalcular la disposición de la página en cada
 * cuadro, así que va suave incluso en la máquina del proyector.
 *
 * Cómo frena
 * ----------
 * El recorrido está calculado de antemano: la última fila de la columna es el
 * ganador, y la animación lleva el desplazamiento desde cero hasta esa fila con
 * una curva que se aplana al final.
 *
 * Eso importa: frenar por tiempo y después «acomodar» al ganador deja un salto
 * visible. Con el destino fijado desde el principio, el carrete llega exacto y
 * no hay nada que corregir.
 */

const { ref } = Vue;

/** Alto de cada fila, en píxeles. Tiene que coincidir con el CSS. */
export const ALTO_FILA = 72;

/** Cuánto dura el giro. Menos se siente apurado; más se hace largo en vivo. */
const DURACION = 2800;

/** Cuántas vueltas da antes de frenar. Con menos no llega a leerse como giro. */
const VUELTAS = 4;

/** ¿El sistema pidió menos movimiento? */
function prefiereQuietud() {
  return typeof window !== 'undefined' &&
         typeof window.matchMedia === 'function' &&
         window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * La curva del frenado.
 *
 * Es una salida cúbica: arranca rápido y se aplana sobre el final. Con un
 * avance parejo el carrete parecería trabarse de golpe; así pierde impulso como
 * una tómbola de verdad.
 */
function suavizar(avance) {
  return 1 - (1 - avance) ** 3;
}

export function usarRuleta() {
  /** Las filas que se dibujan en la columna, de arriba abajo. */
  const filas = ref([]);

  /** Cuánto está corrida la columna hacia arriba, en píxeles. */
  const desplazamiento = ref(0);

  /** ¿Está girando? La pantalla muestra el carrete o el ganador según esto. */
  const girando = ref(false);

  let cuadro = null;
  let alTerminar = null;

  function limpiar() {
    if (cuadro !== null) {
      cancelAnimationFrame(cuadro);
      cuadro = null;
    }
  }

  function terminar() {
    girando.value = false;
    limpiar();
    if (alTerminar) { alTerminar(); alTerminar = null; }
  }

  /**
   * Hace desfilar los nombres y frena en el que se le indique.
   *
   * `nombres` son los que pasan durante el giro. `final` es dónde frena; si no
   * se da ninguno —cuando salen varios ganadores a la vez— el carrete se
   * detiene sin quedarse en nadie y la pantalla revela la lista completa.
   *
   * Devuelve una promesa que se cumple al terminar, para que quien llama sepa
   * cuándo mostrar al ganador y largar el confeti.
   */
  function girar(nombres, final = '') {
    limpiar();

    const lista = (Array.isArray(nombres) ? nombres : []).filter(Boolean);

    /*
     * Sin nombres no hay animación posible, y con movimiento reducido no
     * corresponde. En los dos casos se termina de inmediato: quien llama no
     * tiene que preguntar nada, siempre recibe su promesa.
     */
    if (lista.length === 0 || prefiereQuietud()) {
      filas.value = final ? [final] : [];
      desplazamiento.value = 0;
      girando.value = false;
      return Promise.resolve();
    }

    /*
     * La columna: varias vueltas de la muestra y el ganador al final.
     *
     * Poner al ganador como última fila es lo que hace que el carrete pueda
     * llegar exacto: el destino es una posición conocida desde el principio, no
     * algo que haya que ajustar cuando se acaba el tiempo.
     */
    const columna = [];
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) columna.push(...lista);
    columna.push(final || lista[0]);

    filas.value = columna;
    desplazamiento.value = 0;
    girando.value = true;

    const recorrido = (columna.length - 1) * ALTO_FILA;

    return new Promise((resolver) => {
      alTerminar = resolver;
      const arranque = Date.now();

      const paso = () => {
        const avance = Math.min(1, (Date.now() - arranque) / DURACION);
        desplazamiento.value = recorrido * suavizar(avance);

        if (avance >= 1) {
          // Se deja clavado en el valor exacto: la curva llega a 1 pero el
          // redondeo de los flotantes puede dejar el nombre medio pixel corrido.
          desplazamiento.value = recorrido;
          terminar();
          return;
        }

        cuadro = requestAnimationFrame(paso);
      };

      cuadro = requestAnimationFrame(paso);
    });
  }

  /**
   * Corta el giro por la mitad.
   *
   * Se usa al cerrar el cartel: si alguien lo cierra mientras gira, la
   * animación seguiría corriendo sobre algo que ya nadie ve.
   */
  function detener() {
    filas.value = [];
    desplazamiento.value = 0;
    terminar();
  }

  return { filas, desplazamiento, girando, girar, detener };
}
