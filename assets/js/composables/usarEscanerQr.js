/**
 * Escáner de códigos QR y registro de asistencia.
 *
 * Es la parte más crítica del sistema: corre en la puerta del evento, con
 * gente haciendo fila y señal irregular. Las decisiones de diseño salen de ahí:
 *
 *   · Los escaneos se encolan. Si llegan tres seguidos, se procesan en orden en
 *     vez de pisarse.
 *   · Si falla el envío se reintenta dos veces antes de darlo por perdido.
 *   · Si sigue fallando, se guarda en el dispositivo. Nunca se descarta.
 *   · Hay una pausa anti-rebote: la cámara lee el mismo QR varias veces por
 *     segundo y no queremos tres intentos por la misma persona.
 */

import { api } from '../servicios/servicioApi.js';
import { servicioOffline } from '../servicios/servicioOffline.js';
import { duiPlano } from '../nucleo/formato.js';

const { ref, reactive, computed, nextTick } = Vue;

const ID_CONTENEDOR = 'lector-qr';
const REINTENTOS = 2;

/*
 * Cuánto se ignora el mismo código después de leerlo.
 *
 * La cámara lee el mismo QR diez veces por segundo mientras la persona lo
 * sostiene delante, así que sin esta ventana un solo escaneo se convierte en
 * una decena de intentos por la misma persona. Tres segundos es el tiempo que
 * tarda alguien en apartarse y que entre el siguiente.
 *
 * Es idempotencia del lado del cliente. La del servidor ya existe (la
 * restricción UNIQUE de evento + empleado), pero llegar hasta allá para que
 * rechace nueve duplicados es gastar red y batería en la puerta del evento.
 */
const ESPERA_MISMO_CODIGO = 3000;

/**
 * @param {Object} config
 * @param {Function} config.notificar          Para avisar en pantalla.
 * @param {Function} config.obtenerEmpleados   Getter del padrón. Va como función
 *   y no como arreglo porque la lista se reemplaza entera cada vez que se
 *   recargan los catálogos: si guardáramos la referencia, el escáner quedaría
 *   buscando en el padrón viejo.
 * @param {Function} config.alRegistrar        Se llama tras un registro exitoso.
 */
/*
 * Elección de la cámara.
 *
 * `facingMode: 'environment'` deja que el navegador elija cuál de las cámaras
 * traseras usa, y en los teléfonos con varias entrega la que quiere. En un
 * Galaxy S21 Ultra devuelve la gran angular, que tiene una distancia mínima de
 * enfoque de varios centímetros: apuntada a un QR de cerca lo deja borroso y no
 * lo lee nunca. El operador ve la cámara abierta, funcionando, y sin embargo
 * nada entra.
 *
 * Por eso se enumeran las cámaras y se elige uno de los dispositivos por su id,
 * en vez de dejarlo librado al navegador.
 */

// Dónde se recuerda la cámara elegida. Es por dispositivo, no por usuario: en
// el evento el mismo teléfono lo usan varias personas y la cámara buena sigue
// siendo la misma.
const CLAVE_CAMARA = 'sssur_camara';

/*
 * Cómo se puntúa una cámara. Cuanto más alto, mejor para leer un QR de cerca.
 *
 * Ojo con "gran angular" / "wide": en iOS así se llama la cámara PRINCIPAL
 * ("Cámara trasera gran angular"), y la mala es "ultra gran angular". Por eso
 * solo se penaliza el "ultra", nunca el "wide" a secas. Confundirlos descarta
 * justo la cámara que se quiere.
 */
const TRASERA = /(back|rear|trasera|posterior|environment)/i;
const FRONTAL = /(front|frontal|user|selfie)/i;
const ULTRA_ANGULAR = /(ultra[\s_-]*wide|ultra[\s_-]*gran[\s_-]*angular|gran[\s_-]*angular[\s_-]*ultra|0\.5)/i;
const TELEOBJETIVO = /(tele|zoom)/i;
const NO_SIRVE = /(depth|profundidad|macro|monochrome|mono\b|infrared|ir\b)/i;

function puntuar(camara, indice) {
  const etiqueta = String(camara.label || '');
  let puntos = 0;

  if (TRASERA.test(etiqueta)) puntos += 100;
  if (FRONTAL.test(etiqueta)) puntos -= 200;
  if (ULTRA_ANGULAR.test(etiqueta)) puntos -= 60;
  if (TELEOBJETIVO.test(etiqueta)) puntos -= 40;
  if (NO_SIRVE.test(etiqueta)) puntos -= 90;

  // Android suele etiquetar "camera2 0, facing back". El número es el índice
  // del sensor y el 0 es casi siempre el principal, así que a mayor número,
  // menos prioridad. Sin etiqueta útil se cae al orden en que vinieron.
  const numerada = etiqueta.match(/camera2?\s*(\d+)/i);
  puntos -= numerada ? Number(numerada[1]) : indice * 0.5;

  return puntos;
}

/** La mejor cámara disponible según la puntuación, o null si no hay ninguna. */
function mejorCamara(lista) {
  if (!lista || lista.length === 0) return null;
  return [...lista]
    .map((camara, indice) => ({ camara, puntos: puntuar(camara, indice) }))
    .sort((a, b) => b.puntos - a.puntos)[0].camara;
}

/** Nombre corto y legible, para el selector. Las etiquetas crudas son ilegibles. */
function nombreLegible(camara, indice) {
  const etiqueta = String(camara.label || '').trim();
  if (!etiqueta) return `Cámara ${indice + 1}`;

  if (ULTRA_ANGULAR.test(etiqueta)) return 'Gran angular (no recomendada)';
  if (TELEOBJETIVO.test(etiqueta)) return 'Teleobjetivo';
  if (NO_SIRVE.test(etiqueta)) return 'Sensor auxiliar';
  if (FRONTAL.test(etiqueta)) return 'Frontal';
  if (TRASERA.test(etiqueta)) return `Trasera ${indice + 1}`;

  return etiqueta.length > 34 ? etiqueta.slice(0, 33) + '…' : etiqueta;
}

function leerCamaraGuardada() {
  try {
    return localStorage.getItem(CLAVE_CAMARA) || '';
  } catch {
    // Modo privado o almacenamiento bloqueado: se elige sola cada vez.
    return '';
  }
}

function guardarCamara(id) {
  try {
    if (id) localStorage.setItem(CLAVE_CAMARA, id);
  } catch {
    // Que no se pueda recordar no impide escanear.
  }
}

export function usarEscanerQr({ notificar, obtenerEmpleados, alRegistrar }) {
  const escaneando = ref(false);
  const iniciandoCamara = ref(false);
  const procesando = ref(false);
  const ultimoResultado = ref(null);
  const identificadorManual = ref('');

  // La cámara ocupa la pantalla entera mientras se escanea. En un recuadro fijo
  // dentro de la vista quedaba diminuta en el teléfono, y apuntar a un QR
  // impreso en una tarjeta exigía una puntería que no se tiene con gente
  // esperando.
  const camaraAbierta = ref(false);

  // Confirmación grande del último escaneo, encima de la cámara. Se va sola
  // después de la ventana de espera: para cuando desaparece, el lector ya
  // volvió a aceptar códigos, así que el operador nunca ve la cámara "libre"
  // con una confirmación vieja encima.
  const confirmacionAbierta = ref(false);
  let relojConfirmacion = null;

  // Cámaras del dispositivo y cuál se está usando. La elegida se recuerda para
  // que el operador la ajuste una vez y no en cada escaneo.
  const camaras = ref([]);
  const camaraElegida = ref(leerCamaraGuardada());
  const selectorCamarasAbierto = ref(false);

  const estadoRed = reactive({
    enLinea: navigator.onLine,
    pendientes: 0,
    sincronizando: false
  });

  let lector = null;
  const cola = [];
  const leidosRecientes = new Map();

  /** Sonido corto de confirmación. Sin él no se sabe si el escaneo entró. */
  function emitirSonido(tipo) {
    try {
      const contexto = new (window.AudioContext || window.webkitAudioContext)();
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();

      oscilador.connect(volumen);
      volumen.connect(contexto.destination);
      oscilador.frequency.setValueAtTime(tipo === 'exito' ? 880 : 220, contexto.currentTime);
      volumen.gain.setValueAtTime(0.08, contexto.currentTime);

      oscilador.start();
      oscilador.stop(contexto.currentTime + 0.16);

      // Cerramos el contexto: los navegadores limitan cuántos puede haber
      // abiertos y en una jornada larga se llega al tope.
      setTimeout(() => contexto.close(), 400);
    } catch {
      // Sin audio no pasa nada, el resultado también se ve en pantalla.
    }
  }

  /** ¿Ya leímos este código hace un instante? */
  function esRepeticionInmediata(codigo) {
    const ahora = Date.now();

    // De paso limpiamos los vencidos para que el Map no crezca toda la noche.
    for (const [clave, momento] of leidosRecientes) {
      if (ahora - momento > ESPERA_MISMO_CODIGO) leidosRecientes.delete(clave);
    }

    if (leidosRecientes.has(codigo)) return true;
    leidosRecientes.set(codigo, ahora);
    return false;
  }

  /**
   * Muestra la confirmación del último escaneo y programa su cierre.
   * Solo tiene sentido con la cámara a pantalla completa: en el escritorio el
   * resultado ya está en su tarjeta, siempre visible.
   */
  function mostrarConfirmacion() {
    if (!camaraAbierta.value) return;
    confirmacionAbierta.value = true;
    clearTimeout(relojConfirmacion);
    relojConfirmacion = setTimeout(() => {
      confirmacionAbierta.value = false;
    }, ESPERA_MISMO_CODIGO);
  }

  function cerrarConfirmacion() {
    clearTimeout(relojConfirmacion);
    confirmacionAbierta.value = false;
  }

  function buscarEmpleadoLocal(identificador) {
    const buscado = duiPlano(identificador);
    const lista = obtenerEmpleados() || [];
    return (
      lista.find((persona) => duiPlano(persona.dui) === buscado) ||
      lista.find((persona) => String(persona.codigo || '') === String(identificador)) ||
      lista.find((persona) => String(persona.id) === String(identificador)) ||
      null
    );
  }

  /** Guarda el escaneo en el dispositivo cuando no se pudo enviar. */
  async function guardarLocalmente(identificador) {
    try {
      const empleado = buscarEmpleadoLocal(identificador);
      await servicioOffline.guardar({
        identificador,
        empleado,
        dispositivo: 'escaner-web'
      });

      estadoRed.pendientes = await servicioOffline.contarPendientes();

      ultimoResultado.value = {
        error: false,
        offline: true,
        empleado: empleado
          ? { nombres: empleado.nombres, apellidos: empleado.apellidos }
          : null,
        mensaje: empleado
          ? `Guardado sin conexión: ${empleado.nombres} ${empleado.apellidos}. Pendientes: ${estadoRed.pendientes}`
          : `Guardado sin conexión. Pendientes: ${estadoRed.pendientes}`
      };
      emitirSonido('exito');
      mostrarConfirmacion();
    } catch (fallo) {
      ultimoResultado.value = {
        error: true,
        mensaje: 'No se pudo guardar ni siquiera localmente: ' + (fallo.message || fallo)
      };
      emitirSonido('error');
      mostrarConfirmacion();
    }
  }

  /** Envía un escaneo, con reintentos y respaldo local. */
  async function enviar(identificador, intento = 0) {
    procesando.value = true;

    try {
      if (!estadoRed.enLinea) {
        await guardarLocalmente(identificador);
        return;
      }

      const respuesta = await api.asistencias.registrar(identificador, 'escaner-web');
      ultimoResultado.value = respuesta;
      emitirSonido(respuesta.duplicado ? 'error' : 'exito');
      mostrarConfirmacion();

      if (!respuesta.duplicado && alRegistrar) alRegistrar(respuesta, identificador);
    } catch (fallo) {
      // Un 404 (empleado inexistente) o un 400 no se reintentan: el resultado
      // va a ser el mismo. Solo insistimos ante fallas de red o del servidor.
      const vaARepetirse = fallo.estado >= 400 && fallo.estado < 500;

      if (!vaARepetirse && intento < REINTENTOS) {
        procesando.value = false;
        setTimeout(() => enviar(identificador, intento + 1), 700 * (intento + 1));
        return;
      }

      if (vaARepetirse) {
        ultimoResultado.value = { error: true, mensaje: fallo.message };
        emitirSonido('error');
        mostrarConfirmacion();
      } else {
        await guardarLocalmente(identificador);
      }
    } finally {
      procesando.value = false;
      procesarCola();
    }
  }

  function procesarCola() {
    if (cola.length === 0 || procesando.value) return;
    enviar(cola.shift(), 0);
  }

  /** Punto de entrada: lo llama la cámara, la foto y el ingreso manual. */
  function registrar(identificador) {
    const codigo = String(identificador || '').trim();
    if (!codigo) return;
    if (esRepeticionInmediata(codigo)) return;

    if (procesando.value) {
      cola.push(codigo);
      return;
    }
    enviar(codigo, 0);
  }

  function registrarManual() {
    const valor = identificadorManual.value.trim();
    if (!valor) return;
    registrar(valor);
    identificadorManual.value = '';
  }

  /**
   * ¿La cámara que está abierta es una gran angular?
   *
   * Se avisa en pantalla porque el síntoma engaña: la cámara se ve funcionando,
   * la imagen es nítida a un metro, y sin embargo el QR de cerca nunca entra.
   * Sin este aviso el operador concluye que el escáner está roto.
   */
  const usandoGranAngular = computed(() => {
    const actual = camaras.value.find((camara) => camara.id === camaraElegida.value);
    return Boolean(actual && actual.esGranAngular);
  });

  /**
   * Lado del recuadro de lectura, en píxeles.
   *
   * Estaba fijo en 260 px, que a pantalla completa deja la zona activa mucho
   * más chica que el marco de puntería que se dibuja encima: el operador
   * centra el QR dentro del marco y aun así queda fuera del área que la
   * librería mira. Se calcula del lado corto de la pantalla, igual que el
   * marco, para que lo que se ve y lo que se lee coincidan.
   */
  function medidaDelRecuadro() {
    const lado = Math.min(window.innerWidth || 360, window.innerHeight || 640);
    const medida = Math.round(Math.min(300, Math.max(200, lado * 0.62)));
    return { width: medida, height: medida };
  }

  /**
   * Pide enfoque continuo.
   *
   * Es lo que evita que el QR quede borroso cuando la persona acerca la
   * tarjeta. No todos los navegadores lo permiten, y los que no, lo ignoran:
   * por eso va aparte y con su propio try, para que un fallo acá no tire abajo
   * un escáner que por lo demás funciona.
   */
  async function pedirEnfoqueContinuo() {
    try {
      await lector.applyVideoConstraints({
        focusMode: 'continuous',
        advanced: [{ focusMode: 'continuous' }]
      });
    } catch {
      // El dispositivo no lo admite. Se sigue igual.
    }
  }

  /**
   * Enumera las cámaras del dispositivo.
   *
   * getCameras() pide permiso si hace falta; sin permiso las etiquetas vienen
   * vacías y no se puede distinguir la gran angular de la principal, así que
   * conviene llamarla recién al abrir el escáner y no al cargar la página.
   */
  async function cargarCamaras() {
    try {
      const encontradas = await Html5Qrcode.getCameras();
      camaras.value = (encontradas || []).map((camara, indice) => ({
        id: camara.id,
        etiqueta: nombreLegible(camara, indice),
        // Se marca para poder avisarlo en el selector: es exactamente la que
        // el navegador elige solo en los Samsung y la que no lee de cerca.
        esGranAngular: ULTRA_ANGULAR.test(String(camara.label || ''))
      }));
      return camaras.value;
    } catch (fallo) {
      console.warn('[escaner] No se pudieron enumerar las cámaras:', fallo);
      camaras.value = [];
      return [];
    }
  }

  /** Qué cámara hay que abrir: la recordada si sigue existiendo, o la mejor. */
  function resolverCamara(encontradas) {
    const guardada = camaraElegida.value;
    if (guardada && encontradas.some((camara) => camara.id === guardada)) {
      return guardada;
    }
    const mejor = mejorCamara(encontradas.map((c) => ({ id: c.id, label: c.etiqueta })));
    return mejor ? mejor.id : '';
  }

  async function iniciar() {
    if (typeof Html5Qrcode === 'undefined') {
      ultimoResultado.value = {
        error: true,
        mensaje: 'La librería del escáner no cargó. Recarga la página.'
      };
      return;
    }

    // El contenedor del lector vive dentro de la pantalla completa, así que
    // hay que abrirla ANTES de que la librería lo busque en el DOM.
    camaraAbierta.value = true;
    escaneando.value = true;
    iniciandoCamara.value = true;
    ultimoResultado.value = null;
    cerrarConfirmacion();

    // Damos un ciclo para que Vue pinte el contenedor antes de que la librería
    // lo busque en el DOM.
    await nextTick();

    const contenedor = document.getElementById(ID_CONTENEDOR);
    if (!contenedor) {
      iniciandoCamara.value = false;
      escaneando.value = false;
      camaraAbierta.value = false;
      return;
    }
    contenedor.innerHTML = '';

    try {
      const encontradas = await cargarCamaras();
      const id = resolverCamara(encontradas);
      camaraElegida.value = id;

      lector = new Html5Qrcode(ID_CONTENEDOR);

      // Con un id concreto se abre esa cámara y no la que el navegador prefiera.
      // Sin id (no se pudieron enumerar) queda el comportamiento de antes, que
      // al menos abre alguna cámara trasera.
      await lector.start(
        id ? { deviceId: { exact: id } } : { facingMode: 'environment' },
        { fps: 10, qrbox: medidaDelRecuadro(), aspectRatio: 1 },
        (textoLeido) => registrar(textoLeido),
        () => { /* fallo de lectura por cuadro: es normal, no hay que hacer nada */ }
      );

      await pedirEnfoqueContinuo();
      guardarCamara(id);
    } catch (fallo) {
      escaneando.value = false;
      // Se cierra la pantalla completa: dejarla abierta en negro, sin imagen y
      // sin explicación, es peor que volver a la vista con el error a la vista.
      camaraAbierta.value = false;
      ultimoResultado.value = {
        error: true,
        mensaje: 'No se pudo abrir la cámara. Revisa los permisos del navegador.'
      };
      if (notificar) notificar('No se pudo acceder a la cámara.', 'error');
      console.error('[escaner]', fallo);
    } finally {
      iniciandoCamara.value = false;
    }
  }

  async function detener() {
    escaneando.value = false;
    camaraAbierta.value = false;
    selectorCamarasAbierto.value = false;
    cerrarConfirmacion();

    if (lector) {
      try {
        // Solo se puede detener si está escaneando; si no, tira excepción.
        if (typeof lector.getState !== 'function' || lector.getState() === 2) {
          await lector.stop();
        }
        lector.clear();
      } catch {
        // La cámara ya estaba cerrada. No hay nada que reportar.
      }
      lector = null;
    }

    const contenedor = document.getElementById(ID_CONTENEDOR);
    if (contenedor) contenedor.innerHTML = '';
  }

  /**
   * Cambia de cámara sin salir del escáner.
   *
   * Hay que detener y volver a arrancar: la librería no permite cambiar el
   * dispositivo de una cámara ya iniciada. Se conserva la pantalla completa
   * abierta para que el cambio se vea como tal y no como una salida.
   */
  async function cambiarCamara(id) {
    if (!id || id === camaraElegida.value) {
      selectorCamarasAbierto.value = false;
      return;
    }

    camaraElegida.value = id;
    guardarCamara(id);
    selectorCamarasAbierto.value = false;

    if (!escaneando.value) return;

    iniciandoCamara.value = true;
    try {
      if (lector) {
        try { await lector.stop(); } catch { /* ya estaba detenida */ }
        lector.clear();
        lector = null;
      }

      lector = new Html5Qrcode(ID_CONTENEDOR);
      await lector.start(
        { deviceId: { exact: id } },
        { fps: 10, qrbox: medidaDelRecuadro(), aspectRatio: 1 },
        (textoLeido) => registrar(textoLeido),
        () => {}
      );
      await pedirEnfoqueContinuo();
    } catch (fallo) {
      console.error('[escaner] No se pudo cambiar de cámara:', fallo);
      if (notificar) notificar('No se pudo abrir esa cámara.', 'error');
      escaneando.value = false;
      camaraAbierta.value = false;
    } finally {
      iniciandoCamara.value = false;
    }
  }

  /** Lee un QR desde una foto de la galería. */
  async function leerDesdeFoto(evento) {
    const archivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;

    if (typeof Html5Qrcode === 'undefined') {
      ultimoResultado.value = { error: true, mensaje: 'La librería del escáner no está disponible.' };
      return;
    }

    // La librería necesita un contenedor propio aunque sea invisible.
    let temporal = document.getElementById('lector-qr-foto');
    if (!temporal) {
      temporal = document.createElement('div');
      temporal.id = 'lector-qr-foto';
      temporal.style.display = 'none';
      document.body.appendChild(temporal);
    }

    try {
      const lectorFoto = new Html5Qrcode('lector-qr-foto');
      const texto = await lectorFoto.scanFile(archivo, false);
      registrar(texto);
    } catch {
      ultimoResultado.value = {
        error: true,
        mensaje: 'No se detectó ningún código QR en la imagen.'
      };
      emitirSonido('error');
    }
  }

  /** Sube manualmente lo que quedó pendiente. */
  async function sincronizarPendientes() {
    estadoRed.sincronizando = true;
    try {
      const resultado = await servicioOffline.sincronizar();
      estadoRed.pendientes = await servicioOffline.contarPendientes();

      if (resultado.sinConexion) {
        notificar('Todavía no hay conexión. Los registros siguen guardados.', 'alerta');
      } else {
        notificar(
          `${resultado.sincronizados} subidos · ${resultado.duplicados} ya estaban · ${resultado.errores} con error`,
          resultado.errores > 0 ? 'alerta' : 'exito'
        );
      }
      return resultado;
    } finally {
      estadoRed.sincronizando = false;
    }
  }

  async function actualizarPendientes() {
    try {
      estadoRed.pendientes = await servicioOffline.contarPendientes();
    } catch {
      // IndexedDB puede no estar disponible en modo privado. No es crítico.
    }
  }

  /*
   * Escape cierra la cámara.
   *
   * A pantalla completa el único modo de salir era el botón de la esquina, y en
   * escritorio la reacción de cualquiera ante algo que ocupa toda la pantalla es
   * apretar Escape. El listener se registra una sola vez y no se retira: el
   * escáner vive mientras vive la aplicación.
   */
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || !camaraAbierta.value) return;
    if (confirmacionAbierta.value) {
      // Primero se saca la confirmación de encima, sin apagar la cámara: la
      // fila sigue avanzando y volver a abrirla cuesta un par de segundos.
      cerrarConfirmacion();
      return;
    }
    detener();
  });

  /** Escucha los cambios de conectividad y sincroniza solo al volver la señal. */
  function vigilarConexion() {
    window.addEventListener('online', async () => {
      estadoRed.enLinea = true;
      await actualizarPendientes();
      if (estadoRed.pendientes > 0) {
        notificar('Conexión recuperada. Subiendo registros pendientes…', 'info');
        await sincronizarPendientes();
      }
    });

    window.addEventListener('offline', () => {
      estadoRed.enLinea = false;
      notificar('Sin conexión. Los escaneos se guardarán en este dispositivo.', 'alerta');
    });

    actualizarPendientes();
  }

  // reactive() para que las plantillas usen `escaner.escaneando` en vez de
  // `escaner.escaneando.value`. Ver la nota en usarCatalogo.js.
  return reactive({
    escaneando,
    iniciandoCamara,
    procesando,
    ultimoResultado,
    identificadorManual,
    camaraAbierta,
    confirmacionAbierta,
    cerrarConfirmacion,
    camaras,
    camaraElegida,
    usandoGranAngular,
    selectorCamarasAbierto,
    cambiarCamara,
    cargarCamaras,
    // La plantilla lo muestra en el aviso de espera. En segundos, que es como
    // se le explica a una persona.
    segundosEspera: ESPERA_MISMO_CODIGO / 1000,
    estadoRed,
    iniciar,
    detener,
    registrar,
    registrarManual,
    leerDesdeFoto,
    sincronizarPendientes,
    actualizarPendientes,
    vigilarConexion
  });
}
