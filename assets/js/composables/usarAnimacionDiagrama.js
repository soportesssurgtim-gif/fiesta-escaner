/**
 * Las animaciones de los diagramas del manual, con Anime.js.
 *
 * Qué agrega sobre lo que ya hacía el CSS
 * ---------------------------------------
 * Los diagramas ya se animan solos: los nodos aparecen en orden, las líneas se
 * trazan y un punto recorre los tramos. Eso queda como está y sigue siendo lo
 * que se ve si esto no carga.
 *
 * Lo que se suma son tres cosas que con CSS no salían:
 *
 *   Las curvas   en los diagramas con ramas, el punto bajaba en línea recta
 *                mientras las ramas se abrían en curva. Ahora sale un punto por
 *                rama y cada uno recorre su curva de verdad. Es la diferencia
 *                entre «de acá sale algo» y «de acá sale esto, esto o esto»,
 *                que es lo que el diagrama quiere decir.
 *
 *   El orden     el punto llega al nodo y el nodo late. Antes eran dos
 *                animaciones sueltas que coincidían porque los porcentajes
 *                estaban calculados a mano; cualquier cambio en los tiempos las
 *                desincronizaba en silencio.
 *
 *   El freno     una animación en bucle sigue corriendo aunque la lámina ya no
 *                se vea. En un teléfono eso es batería gastada en un dibujo que
 *                nadie está mirando.
 *
 * Cómo se carga
 * -------------
 * Con `import()` dinámico, recién cuando el manual se abre. Son 116 KB —un 15%
 * más sobre el precache del sistema— y cobrárselos de entrada a quien solo usa
 * el escáner en la puerta del evento no tiene sentido. El service worker lo
 * guarda la primera vez, así que de la segunda en adelante funciona sin
 * conexión.
 *
 * Si la carga falla —sin señal la primera vez, por ejemplo— no se avisa nada:
 * quedan las animaciones de CSS, que alcanzan para entender el diagrama.
 *
 * Sobre el movimiento reducido
 * ----------------------------
 * Quien pidió menos movimiento en su sistema no ve nada de esto. Ni siquiera se
 * baja la librería: el diagrama se muestra armado y quieto, que es lo que esa
 * preferencia significa.
 */

const RUTA_ANIME = '../../vendor/anime.esm.min.js';

/** Cuánto tarda el punto en recorrer un tramo. */
const DURACION_TRAMO = 900;

/** El respiro entre que el punto llega y arranca el siguiente tramo. */
const PAUSA_EN_NODO = 260;

/** La librería, una sola vez para toda la sesión. */
let promesaAnime = null;

/** ¿El sistema pidió menos movimiento? */
export function prefiereQuietud() {
  return typeof window !== 'undefined' &&
         typeof window.matchMedia === 'function' &&
         window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Trae Anime.js.
 *
 * Devuelve null si no se pudo, y ese null es una respuesta válida: significa
 * «seguí con lo que hacía el CSS», no «algo se rompió».
 */
export async function cargarAnime() {
  if (prefiereQuietud()) return null;

  if (!promesaAnime) {
    promesaAnime = import(RUTA_ANIME).catch((fallo) => {
      console.warn('[manual] Anime.js no cargó; quedan las animaciones de CSS.', fallo.message);
      // Se guarda el null: si no hay red, reintentar en cada lámina solo suma
      // pedidos que van a fallar igual.
      return null;
    });
  }

  return promesaAnime;
}

/**
 * El punto que viaja, dibujado por nosotros y no el que ya trae el SVG.
 *
 * Los que vienen en el SVG están puestos en el arranque de su tramo, que es lo
 * que necesita la animación de CSS. Anime.js, en cambio, mueve el elemento a
 * coordenadas absolutas del dibujo, así que necesita uno que empiece en el
 * origen. En lugar de mover los que hay —y romper el respaldo de CSS— se
 * agregan los propios y se esconden los otros.
 */
function crearViajero(svg, clase) {
  const punto = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  punto.setAttribute('cx', '0');
  punto.setAttribute('cy', '0');
  punto.setAttribute('r', '4');
  punto.setAttribute('class', `diagrama-viajero ${clase}`);
  svg.appendChild(punto);
  return punto;
}

/** Los dos extremos de un `<line>`, tal como quedaron en el dibujo. */
function extremos(linea) {
  return {
    x1: Number(linea.getAttribute('x1')) || 0,
    y1: Number(linea.getAttribute('y1')) || 0,
    x2: Number(linea.getAttribute('x2')) || 0,
    y2: Number(linea.getAttribute('y2')) || 0
  };
}

/**
 * Anima el diagrama que haya dentro de este contenedor.
 *
 * Devuelve algo con `detener()`, o null si no hubo nada que animar. Quien lo
 * llama tiene que guardar eso y detenerlo al cambiar de lámina: si no, las
 * animaciones de las láminas viejas siguen corriendo para siempre.
 */
export async function animarDiagrama(contenedor) {
  if (!contenedor) return null;

  const svg = contenedor.querySelector('svg.diagrama');
  if (!svg) return null;

  const anime = await cargarAnime();
  if (!anime) return null;

  const { animate, createTimeline, stagger, svg: utilesSvg } = anime;
  if (!animate || !createTimeline) return null;

  /*
   * A partir de acá manda Anime.js.
   *
   * La clase apaga las animaciones que el SVG trae escritas, que si no
   * quedarían corriendo por debajo y se verían dos puntos avanzando desfasados.
   */
  svg.classList.add('con-anime');

  const nodos = [...svg.querySelectorAll('.diagrama-nodo')];
  const conectores = [...svg.querySelectorAll('.diagrama-conector')];
  const ramas = [...svg.querySelectorAll('.diagrama-rama')];
  const curvas = [...svg.querySelectorAll('.diagrama-curva')];

  const animaciones = [];
  const agregados = [];

  // --- La entrada: los nodos aparecen en el orden en que se leen -------------
  if (nodos.length) {
    animaciones.push(animate(nodos, {
      opacity: [0, 1],
      scale: [0.86, 1],
      translateY: [10, 0],
      duration: 460,
      delay: stagger ? stagger(120) : 0,
      ease: 'out(3)'
    }));
  }

  if (ramas.length) {
    animaciones.push(animate(ramas, {
      opacity: [0, 1],
      scale: [0.86, 1],
      duration: 460,
      delay: stagger ? stagger(110, { start: nodos.length * 120 }) : 0,
      ease: 'out(3)'
    }));
  }

  /*
   * --- El recorrido -------------------------------------------------------
   *
   * Una sola línea de tiempo en bucle. Cada tramo es: el punto avanza, y al
   * llegar late el nodo que está al final. Van juntos en la misma línea de
   * tiempo justamente para que no puedan desincronizarse.
   */
  const recorrido = createTimeline({ loop: true, defaults: { ease: 'linear' } });
  let hayRecorrido = false;

  conectores.forEach((conector, i) => {
    const linea = conector.querySelector('.diagrama-linea');
    if (!linea) return;

    const { x1, y1, x2, y2 } = extremos(linea);
    const punto = crearViajero(svg, `viajero-anime-${i}`);
    agregados.push(punto);
    hayRecorrido = true;

    // El punto aparece en el arranque del tramo, recorre, y se apaga al llegar.
    recorrido.add(punto, {
      translateX: [x1, x2],
      translateY: [y1, y2],
      opacity: [{ to: 1, duration: 80 }, { to: 1, duration: DURACION_TRAMO - 80 }],
      duration: DURACION_TRAMO
    });

    const destino = nodos[i + 1] && nodos[i + 1].querySelector('.diagrama-circulo');
    if (destino) {
      recorrido.add(destino, {
        scale: [1, 1.14, 1],
        duration: PAUSA_EN_NODO,
        ease: 'out(2)'
      });
    }

    recorrido.add(punto, { opacity: 0, duration: 1 });
  });

  /*
   * --- Las ramas ----------------------------------------------------------
   *
   * Acá está lo que el CSS no podía hacer. Antes bajaba un punto en línea recta
   * hasta la altura de las ramas, mientras las ramas se abrían en curva: el
   * punto no pasaba por ninguna de ellas.
   *
   * Ahora sale uno por rama y cada uno recorre su curva. Salen a la vez y no
   * uno tras otro, porque lo que el diagrama dice es «de acá sale uno de
   * estos», no «primero este, después este».
   */
  if (curvas.length && utilesSvg && typeof utilesSvg.createMotionPath === 'function') {
    /*
     * El instante en que arrancan, anotado antes de agregar la primera.
     *
     * Tiene que ser un número y no `'<<'`: esa marca significa «cuando arrancó
     * lo anterior», y entre rama y rama se agregan el latido y el apagado, así
     * que la segunda quedaría alineada con el apagado de la primera. Con el
     * instante anotado, las tres salen juntas pase lo que pase en el medio.
     */
    const salida = recorrido.iterationDuration;

    curvas.forEach((curva, i) => {
      const camino = utilesSvg.createMotionPath(curva);
      if (!camino) return;

      const punto = crearViajero(svg, `viajero-rama-${i}`);
      agregados.push(punto);
      hayRecorrido = true;

      recorrido.add(punto, {
        translateX: camino.translateX,
        translateY: camino.translateY,
        opacity: [{ to: 1, duration: 60 }, { to: 1, duration: DURACION_TRAMO - 60 }],
        duration: DURACION_TRAMO
      }, salida);

      const circulo = ramas[i] && ramas[i].querySelector('.diagrama-circulo');
      if (circulo) {
        recorrido.add(
          circulo,
          { scale: [1, 1.16, 1], duration: PAUSA_EN_NODO, ease: 'out(2)' },
          salida + DURACION_TRAMO
        );
      }

      recorrido.add(punto, { opacity: 0, duration: 1 }, salida + DURACION_TRAMO);
    });
  }

  if (hayRecorrido) animaciones.push(recorrido);
  else recorrido.pause();

  return {
    detener() {
      for (const animacion of animaciones) {
        if (animacion && typeof animacion.pause === 'function') animacion.pause();
      }
      for (const punto of agregados) punto.remove();
      svg.classList.remove('con-anime');
    }
  };
}
