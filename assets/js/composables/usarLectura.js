/**
 * Lectura en voz alta.
 *
 * El manual se puede escuchar en lugar de leerlo. Sirve para quien opera con
 * las manos ocupadas —en la puerta, con el teléfono en una mano— y para quien
 * le cuesta leer en pantalla.
 *
 * Usa speechSynthesis, que viene en el navegador: no descarga nada, no manda el
 * texto a ningún servidor y funciona sin conexión con las voces del sistema.
 *
 * Tres cosas del API que obligan a escribir más de lo que uno esperaría:
 *
 * 1. Las voces cargan tarde. `getVoices()` devuelve vacío en la primera
 *    llamada y hay que esperar el evento `voiceschanged`.
 * 2. Chrome corta las locuciones largas alrededor de los quince segundos. Por
 *    eso el texto se parte en frases y se encadenan: cada pedazo entra dentro
 *    del límite y además se puede seguir el avance.
 * 3. En iOS la primera locución tiene que salir de un gesto de la persona.
 *    No hay forma de arrancar sola.
 */

const { reactive } = Vue;

/**
 * Cuántos caracteres como máximo por locución.
 *
 * Chrome corta a los ~15 segundos, que a velocidad normal son unos 200
 * caracteres. Se corta antes, en la frase más cercana.
 */
const LARGO_MAXIMO = 180;

/** Idiomas aceptables, del más deseado al menos. */
const IDIOMAS = ['es-SV', 'es-419', 'es-MX', 'es-US', 'es-CO', 'es-AR', 'es-ES', 'es'];

/**
 * Parte un texto en pedazos que entren en una locución.
 *
 * Se corta en el final de una oración, y si una oración sola ya es demasiado
 * larga, en la coma más cercana. Cortar por cantidad de caracteres a secas
 * dejaría frases partidas al medio, que se escuchan mal.
 */
export function partirEnFrases(texto) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  if (limpio.length <= LARGO_MAXIMO) return [limpio];

  const oraciones = limpio.match(/[^.!?…]+[.!?…]*\s*/g) || [limpio];
  const pedazos = [];
  let actual = '';

  const empujar = () => {
    const listo = actual.trim();
    if (listo) pedazos.push(listo);
    actual = '';
  };

  for (const oracion of oraciones) {
    if (oracion.length > LARGO_MAXIMO) {
      empujar();
      // Una sola oración muy larga: se parte en comas.
      let resto = oracion;
      while (resto.length > LARGO_MAXIMO) {
        const corte = resto.lastIndexOf(',', LARGO_MAXIMO);
        const donde = corte > LARGO_MAXIMO / 2 ? corte + 1 : LARGO_MAXIMO;
        pedazos.push(resto.slice(0, donde).trim());
        resto = resto.slice(donde);
      }
      actual = resto;
      continue;
    }

    if ((actual + oracion).length > LARGO_MAXIMO) empujar();
    actual += oracion;
  }

  empujar();
  return pedazos.filter(Boolean);
}

/** Puntúa una voz: cuanto más alto, mejor calza con lo que queremos. */
function puntuar(voz) {
  const idioma = String(voz.lang || '').replace('_', '-');
  const posicion = IDIOMAS.findIndex((codigo) => idioma.toLowerCase().startsWith(codigo.toLowerCase()));
  if (posicion === -1) return -1;

  // Las locales suenan peor que las del servicio pero funcionan sin conexión,
  // que es la condición en la que se usa esto.
  return (IDIOMAS.length - posicion) * 10 + (voz.localService ? 1 : 0);
}

export function usarLectura() {
  const disponible = typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function';

  const estado = reactive({
    disponible,
    /** El id del bloque que se está leyendo, o '' si ninguno. */
    leyendo: '',
    pausado: false,
    voces: [],
    vozElegida: '',
    velocidad: 1,
    /** Qué pedazo va y cuántos son, para la barra de avance. */
    progreso: { indice: 0, total: 0 },
    error: ''
  });

  // Pedazos pendientes de la lectura en curso.
  let cola = [];
  let alTerminar = null;
  // Cada lectura lleva su número. Si llega el `onend` de una lectura vieja
  // —pasa al cancelar— se descarta por no coincidir.
  let turno = 0;

  function cargarVoces() {
    if (!disponible) return;

    const todas = window.speechSynthesis.getVoices() || [];
    const enEspanol = todas
      .map((voz) => ({ voz, puntos: puntuar(voz) }))
      .filter((fila) => fila.puntos >= 0)
      .sort((a, b) => b.puntos - a.puntos);

    // Si el sistema no tiene ninguna voz en español se ofrecen todas: es
    // preferible escucharlo con acento a no poder escucharlo.
    const elegibles = enEspanol.length > 0 ? enEspanol.map((f) => f.voz) : todas;

    estado.voces = elegibles.map((voz) => ({ nombre: voz.name, idioma: voz.lang }));

    if (!estado.vozElegida && elegibles.length > 0) {
      estado.vozElegida = elegibles[0].name;
    }
  }

  if (disponible) {
    cargarVoces();
    // `voiceschanged` es el que llega de verdad: la primera llamada casi
    // siempre devuelve la lista vacía.
    window.speechSynthesis.addEventListener('voiceschanged', cargarVoces);
  }

  function vozActual() {
    const todas = window.speechSynthesis.getVoices() || [];
    return todas.find((voz) => voz.name === estado.vozElegida) || null;
  }

  function detener() {
    if (!disponible) return;

    turno++;
    cola = [];
    alTerminar = null;
    estado.leyendo = '';
    estado.pausado = false;
    estado.progreso = { indice: 0, total: 0 };
    window.speechSynthesis.cancel();
  }

  function decirSiguiente(miTurno) {
    if (miTurno !== turno) return;

    if (cola.length === 0) {
      const terminar = alTerminar;
      estado.leyendo = '';
      estado.progreso = { indice: 0, total: 0 };
      alTerminar = null;
      if (terminar) terminar();
      return;
    }

    const texto = cola.shift();
    estado.progreso = {
      indice: estado.progreso.total - cola.length,
      total: estado.progreso.total
    };

    const locucion = new window.SpeechSynthesisUtterance(texto);
    const voz = vozActual();
    if (voz) {
      locucion.voice = voz;
      locucion.lang = voz.lang;
    } else {
      locucion.lang = 'es-ES';
    }
    locucion.rate = estado.velocidad;

    locucion.onend = () => decirSiguiente(miTurno);
    locucion.onerror = (evento) => {
      // `interrupted` y `canceled` son lo que pasa al detener a propósito: no
      // son errores que haya que mostrarle a nadie.
      if (evento.error && evento.error !== 'interrupted' && evento.error !== 'canceled') {
        estado.error = 'No se pudo reproducir el audio.';
        detener();
        return;
      }
      if (miTurno === turno) decirSiguiente(miTurno);
    };

    window.speechSynthesis.speak(locucion);
  }

  /**
   * Lee un texto y marca `id` como el bloque en curso.
   * Vuelver a llamarla con el mismo id detiene la lectura, que es lo que
   * espera quien vuelve a pulsar el mismo botón.
   */
  function leer(texto, id = 'bloque', cuandoTermine = null) {
    if (!disponible) return;

    if (estado.leyendo === id && !estado.pausado) {
      detener();
      return;
    }

    detener();

    const pedazos = partirEnFrases(texto);
    if (pedazos.length === 0) return;

    estado.error = '';
    estado.leyendo = id;
    cola = pedazos;
    alTerminar = cuandoTermine;
    estado.progreso = { indice: 0, total: pedazos.length };

    decirSiguiente(turno);
  }

  /**
   * Lee varios bloques seguidos, marcando cada uno mientras suena.
   * Es el "escuchar el capítulo entero" de la pantalla.
   */
  function leerSeguido(bloques) {
    if (!disponible || bloques.length === 0) return;

    detener();

    let indice = 0;
    const siguiente = () => {
      if (indice >= bloques.length) return;
      const bloque = bloques[indice++];
      leer(bloque.texto, bloque.id, siguiente);
    };

    siguiente();
  }

  function pausar() {
    if (!disponible || !estado.leyendo) return;
    window.speechSynthesis.pause();
    estado.pausado = true;
  }

  function reanudar() {
    if (!disponible) return;
    window.speechSynthesis.resume();
    estado.pausado = false;
  }

  function alternarPausa() {
    if (estado.pausado) reanudar();
    else pausar();
  }

  /** Cambia la velocidad. Se aplica al siguiente pedazo, no al que suena. */
  function cambiarVelocidad(valor) {
    estado.velocidad = Math.min(2, Math.max(0.5, Number(valor) || 1));
  }

  function cambiarVoz(nombre) {
    estado.vozElegida = nombre;
    // Si estaba leyendo, se corta: cambiar de voz a mitad de una frase suena
    // peor que empezar de nuevo.
    if (estado.leyendo) detener();
  }

  /** Hay que llamarla al desmontar: si no, la voz sigue sonando sola. */
  function limpiar() {
    detener();
    if (disponible) {
      window.speechSynthesis.removeEventListener('voiceschanged', cargarVoces);
    }
  }

  return reactive({
    estado,
    leer,
    leerSeguido,
    detener,
    pausar,
    reanudar,
    alternarPausa,
    cambiarVelocidad,
    cambiarVoz,
    limpiar
  });
}
