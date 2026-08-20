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

const { reactive, computed } = Vue;

/**
 * Cuántos caracteres como máximo por locución.
 *
 * Chrome corta a los ~15 segundos, que a velocidad normal son unos 200
 * caracteres. Se corta antes, en la frase más cercana.
 */
const LARGO_MAXIMO = 180;

/**
 * Voces preferidas por nombre, de la más deseada a la menos.
 *
 * El nombre pesa más que el idioma porque una voz concreta suena mejor que
 * otra aunque compartan variante. Encabeza «Google español», que es la
 * masculina y la que mejor lee estas instrucciones.
 *
 * El nombre exacto vale más que el que solo coincide al principio. Hace falta
 * porque «Google español de Estados Unidos» empieza igual que «Google
 * español»: sin esa distinción las dos empatarían y ganaría la otra.
 */
const NOMBRES_PREFERIDOS = [
  'Google español',
  'Google español de Estados Unidos',
  'Microsoft Jorge',
  'Jorge',
  'Diego',
  'Microsoft Sabina',
  'Paulina'
];

/**
 * Idiomas aceptables, del más deseado al menos.
 *
 * Encabeza es-US, que es el español latinoamericano que traen instalado casi
 * todos los dispositivos. Detrás van las variantes de la región, y el
 * castellano de España al final: se entiende igual, pero suena ajeno para
 * quien va a escuchar estas instrucciones.
 */
const IDIOMAS = ['es-US', 'es-SV', 'es-419', 'es-MX', 'es-CO', 'es-AR', 'es-ES', 'es'];

/** El que se le pone a la locución cuando no hay ninguna voz en español. */
const IDIOMA_POR_DEFECTO = 'es-ES';

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

/** ¿Esta voz habla español? */
export function esEspanol(voz) {
  return String(voz.lang || '').replace('_', '-').toLowerCase().startsWith('es');
}

/**
 * Puntúa una voz: cuanto más alto, mejor calza con lo que queremos.
 *
 * Manda el nombre, después el idioma. Las que no hablan español puntúan
 * negativo, pero igual se ofrecen: no se descartan, se ordenan al final.
 */
export function puntuar(voz) {
  const nombre = String(voz.name || '');
  const idioma = String(voz.lang || '').replace('_', '-');

  const enMinuscula = nombre.toLowerCase();
  const exacto = NOMBRES_PREFERIDOS.findIndex((b) => enMinuscula === b.toLowerCase());
  const porPrefijo = NOMBRES_PREFERIDOS.findIndex((b) => enMinuscula.startsWith(b.toLowerCase()));

  const porIdioma = IDIOMAS.findIndex(
    (codigo) => idioma.toLowerCase().startsWith(codigo.toLowerCase())
  );

  if (porIdioma === -1) return -1;

  const puntosNombre = exacto !== -1
    ? (NOMBRES_PREFERIDOS.length - exacto) * 1000
    : (porPrefijo === -1 ? 0 : (NOMBRES_PREFERIDOS.length - porPrefijo) * 100);
  // Las locales suenan peor que las del servicio pero funcionan sin conexión,
  // que es la condición en la que se usa esto.
  return puntosNombre + (IDIOMAS.length - porIdioma) * 10 + (voz.localService ? 1 : 0);
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

    /*
     * Se ofrecen TODAS las voces del dispositivo, no solo las españolas.
     *
     * Filtrarlas dejaba la lista en dos o tres opciones —a veces en una— y no
     * había forma de elegir otra cosa. Las que hablan español van primero y
     * ordenadas por preferencia; el resto queda disponible más abajo por si
     * alguien la prefiere.
     */
    const ordenadas = todas
      .map((voz) => ({ voz, puntos: puntuar(voz) }))
      .sort((a, b) => b.puntos - a.puntos)
      .map((fila) => fila.voz);

    estado.voces = ordenadas.map((voz) => ({
      nombre: voz.name,
      idioma: voz.lang,
      esEspanol: esEspanol(voz)
    }));

    // La elegida solo se fija la primera vez, o si la que estaba ya no está
    // —pasa al desinstalar un paquete de voces—.
    const sigueDisponible = ordenadas.some((voz) => voz.name === estado.vozElegida);
    if (!sigueDisponible && ordenadas.length > 0) {
      estado.vozElegida = ordenadas[0].name;
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
      locucion.lang = IDIOMA_POR_DEFECTO;
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

  /*
   * Las voces separadas en dos grupos, para poder agruparlas en el desplegable.
   * Con ocho o diez voces mezcladas cuesta encontrar las que sirven.
   */
  const vocesEnEspanol = computed(() => estado.voces.filter((voz) => voz.esEspanol));
  const otrasVoces = computed(() => estado.voces.filter((voz) => !voz.esEspanol));

  return reactive({
    estado,
    vocesEnEspanol,
    otrasVoces,
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
