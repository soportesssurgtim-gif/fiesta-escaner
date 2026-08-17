/**
 * Instalación de la aplicación en el dispositivo.
 *
 * El navegador decide por su cuenta cuándo ofrecer instalar, y esa decisión es
 * inconsistente: Chrome dispara `beforeinstallprompt` cuando le parece, y iOS
 * no lo dispara nunca. Dejarlo librado a eso significa que en la mayoría de los
 * teléfonos la opción sencillamente no aparece.
 *
 * Por eso el botón está siempre visible y este composable resuelve qué hacer
 * al tocarlo:
 *   · Hay evento guardado  → se lo muestra al usuario (instalación en un toque)
 *   · No lo hay (iOS, Firefox, o Chrome que todavía no lo emitió)
 *                          → se explica el procedimiento manual del navegador
 *   · Ya está instalada    → se avisa, no hay nada que hacer
 */

const { ref, reactive, computed, onMounted, onBeforeUnmount } = Vue;

/** ¿La página se está viendo desde la aplicación instalada y no desde el navegador? */
function estaInstalada() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Qué navegador es, únicamente para redactar las instrucciones manuales.
 * El orden importa: en iOS todos los navegadores son Safari por dentro, y
 * Edge y Opera también dicen llamarse Chrome.
 */
function detectarNavegador() {
  const agente = navigator.userAgent;
  const esIOS = /iPad|iPhone|iPod/.test(agente) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (esIOS) return 'ios';
  if (/FxiOS|Firefox/i.test(agente)) return 'firefox';
  if (/SamsungBrowser/i.test(agente)) return 'samsung';
  if (/EdgA?|Edge/i.test(agente)) return 'edge';
  if (/OPR|Opera/i.test(agente)) return 'opera';
  if (/Android/i.test(agente)) return 'android';
  return 'escritorio';
}

/** Pasos manuales por navegador, para cuando no hay diálogo nativo. */
const INSTRUCCIONES = {
  ios: {
    titulo: 'Instalar en iPhone o iPad',
    aviso: 'Safari no ofrece un botón de instalación: hay que hacerlo desde el menú de compartir.',
    pasos: [
      'Abre esta página en Safari (no funciona desde Chrome en iPhone).',
      'Toca el botón Compartir, el cuadrado con la flecha hacia arriba.',
      'Desliza hacia abajo y elige "Agregar a pantalla de inicio".',
      'Toca "Agregar" arriba a la derecha.'
    ]
  },
  android: {
    titulo: 'Instalar en Android',
    aviso: 'Si el botón no abrió el diálogo, el navegador aún no la considera instalable. Se puede forzar desde el menú.',
    pasos: [
      'Toca el menú de tres puntos, arriba a la derecha.',
      'Elige "Instalar aplicación" o "Agregar a pantalla principal".',
      'Confirma tocando "Instalar".'
    ]
  },
  samsung: {
    titulo: 'Instalar en Samsung Internet',
    aviso: '',
    pasos: [
      'Toca el menú de tres líneas, abajo a la derecha.',
      'Elige "Agregar página a".',
      'Selecciona "Pantalla de inicio".'
    ]
  },
  firefox: {
    titulo: 'Instalar en Firefox',
    aviso: '',
    pasos: [
      'Toca el menú de tres puntos.',
      'Elige "Instalar" o "Agregar a pantalla de inicio".'
    ]
  },
  edge: {
    titulo: 'Instalar en Edge',
    aviso: '',
    pasos: [
      'Abre el menú de tres puntos.',
      'Entra en "Aplicaciones".',
      'Elige "Instalar este sitio como una aplicación".'
    ]
  },
  opera: {
    titulo: 'Instalar en Opera',
    aviso: '',
    pasos: [
      'Abre el menú del navegador.',
      'Elige "Instalar" o "Agregar a pantalla de inicio".'
    ]
  },
  escritorio: {
    titulo: 'Instalar en la computadora',
    aviso: 'Necesita Chrome, Edge u Opera. Firefox de escritorio no permite instalar aplicaciones web.',
    pasos: [
      'Mira el ícono de instalación en la barra de direcciones, a la derecha: una pantalla con una flecha.',
      'Si no está, abre el menú del navegador y busca "Instalar Control de Asistencia".',
      'Confirma con "Instalar".'
    ]
  }
};

export function usarInstalacionPwa({ notificar } = {}) {
  // El evento que dispara el navegador. Guardarlo es obligatorio: solo se
  // puede mostrar el diálogo desde una interacción del usuario, así que hay
  // que retenerlo hasta que toque el botón.
  const eventoDiferido = ref(null);
  const instalada = ref(estaInstalada());
  const instalando = ref(false);
  const instruccionesAbiertas = ref(false);
  const navegador = ref(detectarNavegador());

  /** ¿Se puede instalar de un toque, sin explicarle nada al usuario? */
  const instalacionDirecta = computed(() => Boolean(eventoDiferido.value));

  const instrucciones = computed(
    () => INSTRUCCIONES[navegador.value] || INSTRUCCIONES.escritorio
  );

  function cerrarInstrucciones() {
    instruccionesAbiertas.value = false;
  }

  function alPoderInstalar(evento) {
    // Sin esto, Chrome muestra su propia barra flotante además de nuestro
    // botón, y el usuario ve dos invitaciones a lo mismo.
    evento.preventDefault();
    eventoDiferido.value = evento;
  }

  function alInstalar() {
    eventoDiferido.value = null;
    instalada.value = true;
    instruccionesAbiertas.value = false;
    if (notificar) notificar('La aplicación quedó instalada en este dispositivo.', 'exito');
  }

  async function instalar() {
    if (instalada.value) {
      if (notificar) notificar('La aplicación ya está instalada en este dispositivo.', 'info');
      return;
    }

    if (!eventoDiferido.value) {
      instruccionesAbiertas.value = true;
      return;
    }

    instalando.value = true;
    try {
      eventoDiferido.value.prompt();
      const { outcome } = await eventoDiferido.value.userChoice;

      // El evento se consume: sirve una sola vez. Si lo rechazó, el navegador
      // volverá a emitirlo más adelante por su cuenta.
      eventoDiferido.value = null;

      if (outcome !== 'accepted' && notificar) {
        notificar('Instalación cancelada. El botón sigue disponible cuando quieras.', 'info');
      }
    } catch (fallo) {
      // Si el diálogo nativo falla (suele ser porque ya se consumió el evento),
      // al menos mostramos el procedimiento manual en vez de no hacer nada.
      console.error('[pwa]', fallo);
      instruccionesAbiertas.value = true;
    } finally {
      instalando.value = false;
    }
  }

  const modoPantalla = window.matchMedia('(display-mode: standalone)');
  const alCambiarModo = (evento) => { instalada.value = evento.matches; };

  // Instalar nunca es urgente: si alguien abrió las instrucciones sin querer,
  // Escape tiene que sacarlo de ahí igual que en cualquier otro diálogo.
  const alPresionarTecla = (evento) => {
    if (evento.key === 'Escape' && instruccionesAbiertas.value) cerrarInstrucciones();
  };

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    window.addEventListener('appinstalled', alInstalar);
    document.addEventListener('keydown', alPresionarTecla);
    // addEventListener sobre un MediaQueryList no existe en Safari viejo.
    if (modoPantalla.addEventListener) modoPantalla.addEventListener('change', alCambiarModo);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', alPoderInstalar);
    window.removeEventListener('appinstalled', alInstalar);
    document.removeEventListener('keydown', alPresionarTecla);
    if (modoPantalla.removeEventListener) modoPantalla.removeEventListener('change', alCambiarModo);
  });

  /*
   * El retorno va envuelto en reactive() por el mismo motivo que en
   * usarCatalogo: setup() solo desenvuelve los refs que quedan en el primer
   * nivel de lo que devuelve. Este composable se expone agrupado como `pwa`,
   * así que dentro de un objeto plano las plantillas recibirían el ref en
   * bruto en vez de su valor.
   *
   * No es cosmético. Con un objeto plano, `v-if="pwa.instruccionesAbiertas"`
   * evalúa el ref, que es un objeto y por lo tanto siempre verdadero: el modal
   * de instalación aparecía solo al cargar la página y no se cerraba ni con la
   * X ni con "Entendido", porque cerrarlo cambia el .value pero el v-if sigue
   * viendo el mismo objeto. Por lo mismo el botón quedaba siempre deshabilitado
   * (`:disabled="pwa.instalando"`) y el del login nunca aparecía
   * (`v-if="!pwa.instalada"`).
   */
  return reactive({
    instalada,
    instalando,
    instalacionDirecta,
    instruccionesAbiertas,
    instrucciones,
    instalar,
    cerrarInstrucciones
  });
}
