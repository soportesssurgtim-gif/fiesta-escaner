/**
 * El confeti del cartel de ganadores.
 *
 * Por qué en un lienzo y no con elementos
 * ---------------------------------------
 * Doscientos papelitos son doscientos elementos que el navegador tiene que
 * medir, componer y volver a dibujar en cada cuadro. En una computadora de
 * escritorio no se nota; en la que suele estar conectada al proyector de un
 * salón municipal, sí.
 *
 * En un lienzo son doscientos rectángulos pintados de un saque. El navegador no
 * sabe que son objetos distintos y no tiene nada que recalcular.
 *
 * Por qué sin librería
 * --------------------
 * Anime.js ya está vendorizado, pero se carga solo cuando alguien abre el
 * manual y son 116 KB. Traerlo a la pantalla del sorteo por unos papelitos no
 * se justifica, y además está pensado para interpolar propiedades entre dos
 * valores: el confeti no interpola nada, cae. Son tres líneas de física —
 * gravedad, roce y giro— y quedan más cortas escritas que configuradas.
 *
 * Los colores
 * -----------
 * Salen del color de marca configurado, no de una lista fija. Si la
 * municipalidad cambia su azul en Apariencia, el confeti lo sigue. Alrededor de
 * ese tono se arman los celestes, y se suman blanco y un dorado que es lo que
 * le da el aire de festejo: solo azules se ve monocromo, con dorado se ve fiesta.
 */

const { ref } = Vue;

/** Cuántos papelitos por tanda. Más que esto no se distingue y cuesta más. */
const POR_TANDA = 90;

/** Cuánto dura la caída antes de apagarse sola, en milisegundos. */
const DURACION = 4200;

/** El dorado y el blanco, que son los que sacan al confeti del monocromo. */
const ACENTOS = ['#ffffff', '#ffd166', '#ffe9a8'];

/** ¿El sistema pidió menos movimiento? */
function prefiereQuietud() {
  return typeof window !== 'undefined' &&
         typeof window.matchMedia === 'function' &&
         window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Los colores del confeti, a partir del color de marca que esté configurado.
 *
 * Se leen del CSS y no de una constante para que sigan al tema: son las mismas
 * variables que usa el resto del sistema.
 */
function paleta() {
  const estilos = getComputedStyle(document.documentElement);
  const tono = (nombre, respaldo) =>
    (estilos.getPropertyValue(nombre) || '').trim() || respaldo;

  return [
    tono('--marca-500', '#465fff'),
    tono('--marca-400', '#7592ff'),
    tono('--marca-300', '#9cb9ff'),
    tono('--marca-200', '#c2d6ff'),
    ...ACENTOS
  ];
}

/** Un papelito nuevo, arriba de todo y con su empujón inicial. */
function crearPapel(ancho, colores) {
  return {
    x: Math.random() * ancho,
    // Arrancan por encima del borde, escalonados: si salen todos de la misma
    // altura se ve una cortina y no una lluvia.
    y: -20 - Math.random() * ancho * 0.4,
    ancho: 6 + Math.random() * 6,
    alto: 8 + Math.random() * 8,
    color: colores[Math.floor(Math.random() * colores.length)],
    // La velocidad de caída varía para que no bajen en bloque.
    velocidadY: 2 + Math.random() * 3,
    velocidadX: -1.2 + Math.random() * 2.4,
    giro: Math.random() * Math.PI * 2,
    velocidadGiro: -0.12 + Math.random() * 0.24
  };
}

export function usarConfeti() {
  /** Para la pantalla: si hay confeti cayendo ahora mismo. */
  const cayendo = ref(false);

  let lienzo = null;
  let ctx = null;
  let papeles = [];
  let cuadro = null;
  let arranque = 0;
  let alRedimensionar = null;

  /** Ajusta el lienzo al tamaño de la pantalla, contando la densidad. */
  function medir() {
    if (!lienzo) return;

    const densidad = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.floor(lienzo.clientWidth * densidad);
    lienzo.height = Math.floor(lienzo.clientHeight * densidad);
    ctx.setTransform(densidad, 0, 0, densidad, 0, 0);
  }

  function dibujar() {
    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;

    ctx.clearRect(0, 0, ancho, alto);

    for (const papel of papeles) {
      papel.y += papel.velocidadY;
      papel.x += papel.velocidadX;
      papel.giro += papel.velocidadGiro;

      // Un roce mínimo: sin esto los papelitos se van de costado en línea recta
      // y parecen disparados, no cayendo.
      papel.velocidadX *= 0.995;

      ctx.save();
      ctx.translate(papel.x, papel.y);
      ctx.rotate(papel.giro);
      ctx.fillStyle = papel.color;
      /*
       * El alto se aplasta con el coseno del giro. Es lo que hace que un
       * papelito parezca un papelito: al girar de canto casi desaparece, y al
       * volver se ve entero. Sin eso se ven cuadraditos rotando.
       */
      ctx.fillRect(
        -papel.ancho / 2,
        -papel.alto / 2,
        papel.ancho,
        papel.alto * Math.abs(Math.cos(papel.giro))
      );
      ctx.restore();
    }

    // Los que ya salieron por abajo no se siguen calculando.
    papeles = papeles.filter((papel) => papel.y < alto + 40);
  }

  function animar() {
    if (!lienzo || !ctx) return;

    dibujar();

    const terminado = Date.now() - arranque > DURACION || papeles.length === 0;
    if (terminado) {
      detener();
      return;
    }

    cuadro = requestAnimationFrame(animar);
  }

  /**
   * Lanza una tanda de confeti sobre el lienzo indicado.
   *
   * Se puede llamar de nuevo mientras cae: los papelitos nuevos se suman a los
   * que ya están. Es lo que pasa al sacar varios premios seguidos, y queda
   * mejor que cortar la tanda anterior de golpe.
   */
  function lanzar(idElemento) {
    if (prefiereQuietud()) return;

    lienzo = document.getElementById(idElemento);
    if (!lienzo) return;

    ctx = lienzo.getContext('2d');
    if (!ctx) return;

    medir();

    if (!alRedimensionar) {
      alRedimensionar = () => medir();
      window.addEventListener('resize', alRedimensionar);
    }

    const colores = paleta();
    for (let i = 0; i < POR_TANDA; i++) {
      papeles.push(crearPapel(lienzo.clientWidth, colores));
    }

    arranque = Date.now();
    cayendo.value = true;

    if (cuadro === null) cuadro = requestAnimationFrame(animar);
  }

  /** Corta el confeti y limpia. Se llama al cerrar el cartel. */
  function detener() {
    if (cuadro !== null) {
      cancelAnimationFrame(cuadro);
      cuadro = null;
    }

    if (alRedimensionar) {
      window.removeEventListener('resize', alRedimensionar);
      alRedimensionar = null;
    }

    if (ctx && lienzo) {
      ctx.clearRect(0, 0, lienzo.clientWidth, lienzo.clientHeight);
    }

    papeles = [];
    cayendo.value = false;
  }

  return { cayendo, lanzar, detener };
}
