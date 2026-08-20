/**
 * El manual de usuario.
 *
 * Junta tres cosas: qué capítulo se está viendo, en qué registro se lee
 * (breve o detallado), y el buscador.
 *
 * Los capítulos se filtran por permisos. Mostrarle a quien solo escanea en la
 * puerta el capítulo de permisos de usuarios no le sirve de nada y le hace más
 * largo el índice donde tiene que encontrar lo suyo.
 */

const { reactive, computed, ref } = Vue;

import { CAPITULOS, MODOS, capituloDeVista } from '../contenido/manual.js';
import { diagramaDe } from '../contenido/diagramas.js';
import { paraBuscar } from '../nucleo/formato.js';

const CLAVE_MODO = 'sssur_manual_modo';

function modoGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_MODO);
    return MODOS.some((m) => m.valor === guardado) ? guardado : 'breve';
  } catch {
    return 'breve';
  }
}

export function usarManual({ puedeVer, esAngosto }) {
  const modo = ref(modoGuardado());
  const capituloId = ref(CAPITULOS[0].id);
  const busqueda = ref('');

  /** Los capítulos que este usuario puede ver. */
  const capitulosPermitidos = computed(() =>
    CAPITULOS.filter((capitulo) => !capitulo.modulo || puedeVer(capitulo.modulo))
  );

  /**
   * Los del índice, ya filtrados por el buscador.
   *
   * Busca en el título, en el resumen y en el texto de los bloques —en los dos
   * registros—, no solo en el título: quien busca «gran angular» o «documento»
   * está buscando una frase que está en el medio de un párrafo, no un título.
   */
  const capitulosVisibles = computed(() => {
    const aguja = paraBuscar(busqueda.value);
    if (!aguja) return capitulosPermitidos.value;

    return capitulosPermitidos.value.filter((capitulo) => {
      const pajar = paraBuscar([
        capitulo.titulo,
        capitulo.resumen,
        ...capitulo.bloques.flatMap((b) => [b.titulo, b.breve, b.detallada]),
        ...(capitulo.consejos || []),
        ...(capitulo.problemas || []).flatMap((p) => [p.sintoma, p.solucion])
      ].join(' '));

      return aguja.split(/\s+/).every((palabra) => pajar.includes(palabra));
    });
  });

  /** El capítulo abierto. Si el filtro lo dejó fuera, cae en el primero visible. */
  const capitulo = computed(() => {
    const visibles = capitulosVisibles.value;
    if (visibles.length === 0) return null;
    return visibles.find((c) => c.id === capituloId.value) || visibles[0];
  });

  /**
   * Los bloques del capítulo con el texto que corresponde al modo.
   *
   * Se resuelve acá y no en la plantilla para que la lectura en voz alta y lo
   * que se ve en pantalla salgan de la misma fuente. Si la plantilla eligiera
   * el texto por su cuenta, se podría escuchar una cosa y leer otra.
   */
  const bloques = computed(() => {
    if (!capitulo.value) return [];

    return capitulo.value.bloques.map((bloque) => ({
      ...bloque,
      texto: modo.value === 'detallada' ? bloque.detallada : bloque.breve
    }));
  });

  /*
   * El diagrama, en la orientación que entre en la pantalla.
   *
   * En un teléfono el flujo horizontal obligaba a desplazarlo a lo ancho para
   * verlo entero, que es lo peor que se le puede pedir a alguien que está
   * tratando de entender un proceso. Ahí va la versión apilada.
   */
  const diagrama = computed(() => (
    capitulo.value
      ? diagramaDe(capitulo.value.diagrama, { vertical: Boolean(esAngosto && esAngosto()) })
      : ''
  ));

  /** Todo el capítulo como una lista de textos, para escucharlo de corrido. */
  const paraEscuchar = computed(() => {
    if (!capitulo.value) return [];

    const partes = [{
      id: 'capitulo-intro',
      texto: `${capitulo.value.titulo}. ${capitulo.value.resumen}`
    }];

    for (const bloque of bloques.value) {
      partes.push({ id: bloque.id, texto: `${bloque.titulo}. ${bloque.texto}` });
    }

    (capitulo.value.consejos || []).forEach((consejo, i) => {
      partes.push({ id: `consejo-${i}`, texto: `Consejo. ${consejo}` });
    });

    return partes;
  });

  /*
   * El capítulo partido en diapositivas, para la pantalla angosta.
   *
   * En un teléfono la lista completa es un rollo larguísimo donde se pierde el
   * hilo. De a una cosa por vez, con avance visible, se parece a lo que ya
   * conoce cualquiera que haya abierto una aplicación por primera vez.
   *
   * La portada lleva el diagrama, que es el mapa de lo que viene después.
   */
  const paso = ref(0);

  const diapositivas = computed(() => {
    if (!capitulo.value) return [];

    const partes = [{
      tipo: 'portada',
      id: 'portada',
      titulo: capitulo.value.titulo,
      texto: capitulo.value.resumen,
      icono: capitulo.value.icono
    }];

    for (const bloque of bloques.value) {
      partes.push({ tipo: 'bloque', ...bloque });
    }

    if ((capitulo.value.consejos || []).length > 0) {
      partes.push({
        tipo: 'consejos',
        id: 'consejos',
        titulo: 'Conviene saber',
        icono: 'fa-lightbulb',
        puntos: capitulo.value.consejos
      });
    }

    if ((capitulo.value.problemas || []).length > 0) {
      partes.push({
        tipo: 'problemas',
        id: 'problemas',
        titulo: 'Si algo sale mal',
        icono: 'fa-triangle-exclamation',
        casos: capitulo.value.problemas
      });
    }

    return partes;
  });

  const diapositiva = computed(() =>
    diapositivas.value[Math.min(paso.value, diapositivas.value.length - 1)] || null
  );

  const esPrimerPaso = computed(() => paso.value <= 0);
  const esUltimoPaso = computed(() => paso.value >= diapositivas.value.length - 1);

  function irAPaso(indice) {
    paso.value = Math.max(0, Math.min(indice, diapositivas.value.length - 1));
  }

  function pasoSiguiente() {
    if (!esUltimoPaso.value) paso.value += 1;
  }

  function pasoAnterior() {
    if (!esPrimerPaso.value) paso.value -= 1;
  }

  const indice = computed(() =>
    capitulosVisibles.value.findIndex((c) => c.id === (capitulo.value ? capitulo.value.id : ''))
  );

  const anterior = computed(() => {
    const i = indice.value;
    return i > 0 ? capitulosVisibles.value[i - 1] : null;
  });

  const siguiente = computed(() => {
    const i = indice.value;
    return i >= 0 && i < capitulosVisibles.value.length - 1
      ? capitulosVisibles.value[i + 1]
      : null;
  });

  function abrirCapitulo(id) {
    capituloId.value = id;
    // Volver a la portada. Quedarse en la diapositiva cinco de un capítulo que
    // recién se abre no tiene sentido, y con capítulos de largos distintos
    // podría caer directamente en el final.
    paso.value = 0;
  }

  /** Abre el capítulo que corresponde a una pantalla. Lo usa el botón de ayuda. */
  function abrirDeVista(vista) {
    const encontrado = capituloDeVista(vista);
    busqueda.value = '';
    capituloId.value = encontrado.id;
    paso.value = 0;
  }

  function cambiarModo(valor) {
    modo.value = MODOS.some((m) => m.valor === valor) ? valor : 'breve';
    // El modo no cambia cuántas diapositivas hay, así que se conserva el paso:
    // quien está en el paso tres y quiere la explicación larga la quiere de ese
    // paso, no del principio.
    try {
      localStorage.setItem(CLAVE_MODO, modo.value);
    } catch {
      // Sin almacenamiento el modo dura lo que dure la sesión. Aceptable.
    }
  }

  return reactive({
    modos: MODOS,
    modo,
    busqueda,
    capitulo,
    capitulosVisibles,
    bloques,
    diagrama,
    paraEscuchar,
    anterior,
    siguiente,
    paso,
    diapositivas,
    diapositiva,
    esPrimerPaso,
    esUltimoPaso,
    irAPaso,
    pasoSiguiente,
    pasoAnterior,
    abrirCapitulo,
    abrirDeVista,
    cambiarModo
  });
}
