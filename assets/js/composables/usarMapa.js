/**
 * El mapa para marcar dónde es el evento.
 *
 * Se usa Leaflet, que es la librería de mapas que no pide clave ni cobra por
 * uso.
 *
 * Las tres vistas
 * ---------------
 * Son las mismas tres de Google Maps y salen de sus mismos tiles, igual que en
 * el centro de monitoreo de la alcaldía. Se llegó acá después de probar las
 * alternativas gratuitas: ninguna rotula los comercios, y sobre una foto sin
 * nombres «Salón Los Almendros» es un techo más entre los techos.
 *
 *   Híbrido    la foto con los nombres encima. Es la de entrada: se reconoce
 *              el edificio, se lee la calle y se leen los negocios.
 *   Satélite   la foto sola, para confirmar la forma del techo y el patio.
 *   Callejero  el callejero, para leer las calles sin la foto debajo.
 *
 * Estas direcciones quedan fuera de la API documentada de Google. Están acá
 * por decisión de quien mantiene el sistema, y porque el centro de monitoreo
 * ya las usa en producción con las mismas. Lo que conviene saber de antemano:
 * si algún día el mapa amanece en blanco, la causa es esta, y se recupera
 * cambiando las tres direcciones por las de Esri, que no piden clave.
 *
 * Cómo se marca el lugar
 * ----------------------
 * El pin no se mueve: está clavado en el centro de la pantalla y lo que se
 * arrastra es el mapa, hasta que el lugar queda debajo del pin. Es como
 * funcionan las aplicaciones de transporte, y se maneja con una sola mano.
 *
 * La alternativa —tocar para poner un marcador y después arrastrarlo— obliga a
 * apuntar con precisión sobre un punto que el propio dedo tapa, y en un
 * teléfono eso significa varios intentos.
 *
 * El pin en sí no es parte del mapa: es un dibujo puesto encima del contenedor,
 * siempre en el centro. Por eso no hace falta moverlo nunca; se mueve el mundo
 * debajo.
 *
 * Sin conexión
 * ------------
 * Leaflet y las imágenes vienen de internet, así que este mapa no funciona sin
 * señal. No es un problema: marcar dónde es la fiesta se hace semanas antes,
 * desde una oficina. Lo que sí funciona sin señal es la invitación, que solo
 * necesita las coordenadas ya guardadas para armar el enlace.
 *
 * Por eso todo acá comprueba que Leaflet exista antes de usarlo: si no cargó,
 * quedan los campos de coordenadas y el sistema sigue andando.
 */

const { reactive, ref } = Vue;

/** El centro del municipio, para cuando no hay nada marcado todavía. */
const CENTRO_POR_DEFECTO = [13.6109, -89.1889];
const ACERCAMIENTO_INICIAL = 13;
const ACERCAMIENTO_AL_MARCAR = 17;

/**
 * ¿Este par de números es una coordenada posible?
 *
 * Lo vacío se descarta antes de convertir. Hace falta porque `Number(null)` y
 * `Number('')` dan cero, y el cero es una latitud legítima: sin esta comprobación,
 * media coordenada —una latitud escrita y una longitud en blanco— pasaba por
 * buena y ponía el evento en el Atlántico.
 */
export function esCoordenadaValida(latitud, longitud) {
  const vacio = (valor) => valor === null || valor === undefined ||
                           (typeof valor === 'string' && valor.trim() === '');

  if (vacio(latitud) || vacio(longitud)) return false;

  const lat = Number(latitud);
  const lng = Number(longitud);

  return Number.isFinite(lat) && Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180 &&
         // El (0,0) está en el Atlántico, frente a África. Nadie hace una
         // fiesta ahí: si aparece, son dos campos que quedaron en cero.
         !(lat === 0 && lng === 0);
}

/**
 * El enlace que abre la ubicación en el mapa del dispositivo.
 *
 * Se usa el esquema de Google Maps porque lo entienden todos: en Android abre
 * la aplicación, en iPhone abre Apple Maps o Google Maps según lo que haya, y
 * en un escritorio abre el sitio. Un enlace `geo:` sería más correcto pero no
 * hace nada en una computadora.
 */
export function enlaceComoLlegar(latitud, longitud) {
  if (!esCoordenadaValida(latitud, longitud)) return '';

  const parametros = new URLSearchParams({
    api: '1',
    destination: `${Number(latitud)},${Number(longitud)}`
  });

  return `https://www.google.com/maps/dir/?${parametros.toString()}`;
}

/** Coordenadas con la precisión que tiene sentido: seis decimales son ~10 cm. */
export function formatearCoordenada(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(6) : '';
}

export function usarMapa() {
  const disponible = ref(typeof window !== 'undefined' && typeof window.L !== 'undefined');
  const error = ref('');
  const buscandoUbicacion = ref(false);

  /**
   * ¿Hay un lugar elegido?
   *
   * El mapa siempre tiene un centro, pero eso no significa que alguien haya
   * elegido algo: al abrir un evento sin ubicación, el centro es el del
   * municipio y no una decisión. Queda elegido cuando la persona mueve el mapa,
   * pide su ubicación o escribe las coordenadas.
   */
  const marcado = ref(false);

  /** Lo que está bajo el pin ahora mismo, se haya elegido o no. */
  const punto = reactive({ latitud: null, longitud: null });

  let mapa = null;
  let alCambiar = null;

  /*
   * Leaflet no distingue si el mapa se movió por un gesto o porque el código lo
   * movió. Sin esta bandera, centrar el mapa al abrirlo contaría como que la
   * persona eligió ese lugar, y todos los eventos quedarían marcados en el
   * centro del municipio sin que nadie lo pidiera.
   *
   * Se levanta y se baja alrededor de la llamada, sin temporizadores. Se puede
   * porque los movimientos del código se piden sin animación, y así Leaflet
   * dispara sus eventos en el acto: para cuando la llamada retorna, ya pasó
   * todo lo que había que ignorar.
   *
   * La primera versión bajaba la bandera con un `setTimeout`, y eso dejaba unas
   * décimas en las que un gesto real se habría descartado. Se veía como una
   * prueba que fallaba una de cada tres veces, que es exactamente lo que sería
   * en la vida real: raro, silencioso y muy difícil de reproducir.
   */
  let movimientoPropio = false;

  /** Corre algo que mueve el mapa sin que cuente como elección de nadie. */
  function sinQueCuente(accion) {
    movimientoPropio = true;
    try {
      accion();
    } finally {
      movimientoPropio = false;
    }
  }

  function avisar() {
    if (typeof alCambiar !== 'function') return;

    alCambiar(
      marcado.value ? punto.latitud : null,
      marcado.value ? punto.longitud : null
    );
  }

  /** Lee lo que quedó bajo el pin. */
  function leerCentro() {
    if (!mapa) return;
    const centro = mapa.getCenter();
    punto.latitud = centro.lat;
    punto.longitud = centro.lng;
  }

  /** Mueve el mapa sin que cuente como una elección de la persona. */
  function centrarEn(latitud, longitud, acercamiento) {
    if (!mapa) return;

    sinQueCuente(() => {
      // Sin animación: así los eventos salen antes de que retorne la llamada y
      // la bandera todavía está en alto para atajarlos.
      mapa.setView(
        [Number(latitud), Number(longitud)],
        acercamiento || Math.max(mapa.getZoom(), ACERCAMIENTO_AL_MARCAR),
        { animate: false }
      );
    });
  }

  /** Deja el lugar elegido en estas coordenadas y lleva el mapa ahí. */
  function marcar(latitud, longitud, { centrar = true } = {}) {
    if (!esCoordenadaValida(latitud, longitud)) return;

    punto.latitud = Number(latitud);
    punto.longitud = Number(longitud);
    marcado.value = true;

    if (mapa && centrar) centrarEn(punto.latitud, punto.longitud);
    avisar();
  }

  /** Olvida el lugar elegido. El mapa se queda donde está. */
  function limpiar() {
    marcado.value = false;
    avisar();
  }

  /**
   * Arma el mapa dentro del elemento indicado.
   *
   * Se llama después de que el elemento existe en la pantalla: Leaflet mide el
   * contenedor al crearse, y sobre uno que todavía no se dibujó calcula cero y
   * el mapa queda en blanco.
   */
  function montar(idElemento, { latitud = null, longitud = null, cuandoCambie = null } = {}) {
    alCambiar = cuandoCambie;
    error.value = '';

    const yaTenia = esCoordenadaValida(latitud, longitud);
    marcado.value = yaTenia;

    if (typeof window.L === 'undefined') {
      disponible.value = false;
      error.value = 'El mapa no cargó. Puedes escribir las coordenadas a mano.';
      // Aunque no haya mapa, lo que ya estaba guardado se conserva.
      if (yaTenia) {
        punto.latitud = Number(latitud);
        punto.longitud = Number(longitud);
      }
      return;
    }

    disponible.value = true;
    const contenedor = document.getElementById(idElemento);
    if (!contenedor) return;

    desmontar();

    const partida = yaTenia ? [Number(latitud), Number(longitud)] : CENTRO_POR_DEFECTO;

    sinQueCuente(() => {
      mapa = window.L.map(idElemento, { scrollWheelZoom: true }).setView(
        partida,
        yaTenia ? ACERCAMIENTO_AL_MARCAR : ACERCAMIENTO_INICIAL,
        { animate: false }
      );
    });

    /*
     * Las capas.
     *
     * Las tres son la misma dirección con una letra distinta en `lyrs`, así que
     * se arman con una sola función:
     *
     *   y   la foto con los nombres encima
     *   s   la foto sola
     *   m   el callejero
     *
     * `mt{s}` reparte los pedidos entre mt0, mt1, mt2 y mt3. El navegador abre
     * pocas conexiones simultáneas por dominio, y con un solo servidor las
     * baldosas entrarían de a una: el mapa se vería armarse por pedazos en
     * lugar de aparecer.
     *
     * Que la de entrada sea la híbrida y no la foto sola es a propósito. La
     * foto sirve para confirmar un lugar que ya se encontró, no para
     * encontrarlo: sin los nombres no hay por dónde empezar a buscar.
     */
    const capaGoogle = (lyrs) => window.L.tileLayer(
      `https://mt{s}.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
      { subdomains: '0123', maxZoom: 20, attribution: '© Google' }
    );

    const capas = {
      'Híbrido': capaGoogle('y'),
      'Satélite': capaGoogle('s'),
      'Callejero': capaGoogle('m')
    };

    capas['Híbrido'].addTo(mapa);
    window.L.control.layers(capas, null, { position: 'topright', collapsed: false }).addTo(mapa);

    // Mientras se arrastra, las coordenadas de la pantalla van siguiendo al
    // pin. Es lo que da la sensación de estar apuntando a algo.
    mapa.on('move', leerCentro);

    /*
     * Arrastrar SIEMPRE cuenta como elegir, sin mirar la bandera.
     *
     * Un arrastre solo puede venir de una mano: el código nunca lo produce. La
     * bandera existe para los movimientos que sí puede producir el código, y
     * consultarla acá abría una ventana de unas décimas —justo después de abrir
     * el formulario, mientras se recalcula el tamaño— en la que un arrastre se
     * habría ignorado. Poco probable, pero silencioso: la persona mueve el mapa
     * y el lugar no queda marcado, sin ninguna señal de por qué.
     */
    mapa.on('dragend', () => {
      leerCentro();
      marcado.value = true;
      avisar();
    });

    /*
     * Acercar también es alguien buscando un lugar, pero acá sí hay que mirar
     * la bandera: `setView` cambia el acercamiento y dispara este mismo evento.
     */
    mapa.on('zoomend', () => {
      leerCentro();
      if (movimientoPropio) return;
      marcado.value = true;
      avisar();
    });

    leerCentro();

    // Leaflet mide mal cuando el contenedor aparece dentro de algo que se abre
    // —un modal, una pestaña— porque en ese instante todavía tiene alto cero.
    // Un recálculo en cuanto el navegador termina de dibujar lo acomoda.
    setTimeout(() => {
      if (!mapa) return;
      sinQueCuente(() => {
        mapa.invalidateSize();
        leerCentro();
      });
    }, 60);
  }

  function desmontar() {
    if (mapa) {
      mapa.off();
      mapa.remove();
      mapa = null;
    }
  }

  /** Pide al navegador dónde está, que es lo cómodo estando en el lugar. */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      error.value = 'Este dispositivo no puede dar tu ubicación.';
      return;
    }

    buscandoUbicacion.value = true;
    error.value = '';

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        buscandoUbicacion.value = false;
        marcar(posicion.coords.latitude, posicion.coords.longitude);
      },
      (fallo) => {
        buscandoUbicacion.value = false;
        error.value = fallo.code === 1
          ? 'No diste permiso para usar tu ubicación.'
          : 'No se pudo obtener tu ubicación. Mueve el mapa hasta el lugar.';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /** Para cuando alguien escribe las coordenadas a mano. */
  function escribirCoordenadas(latitud, longitud) {
    if (!esCoordenadaValida(latitud, longitud)) {
      error.value = 'Esas coordenadas no son válidas.';
      return;
    }
    error.value = '';
    marcar(latitud, longitud);
  }

  return reactive({
    disponible,
    error,
    buscandoUbicacion,
    marcado,
    punto,
    montar,
    desmontar,
    marcar,
    limpiar,
    usarMiUbicacion,
    escribirCoordenadas
  });
}
