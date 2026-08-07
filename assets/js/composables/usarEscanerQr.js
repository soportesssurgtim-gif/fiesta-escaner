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

const { ref, reactive, nextTick } = Vue;

const ID_CONTENEDOR = 'lector-qr';
const REINTENTOS = 2;

// Cuánto ignoramos el mismo código después de leerlo. Un segundo y medio es
// suficiente para que la persona se corra y entre la siguiente.
const ESPERA_MISMO_CODIGO = 1500;

/**
 * @param {Object} config
 * @param {Function} config.notificar          Para avisar en pantalla.
 * @param {Function} config.obtenerEmpleados   Getter del padrón. Va como función
 *   y no como arreglo porque la lista se reemplaza entera cada vez que se
 *   recargan los catálogos: si guardáramos la referencia, el escáner quedaría
 *   buscando en el padrón viejo.
 * @param {Function} config.alRegistrar        Se llama tras un registro exitoso.
 */
export function usarEscanerQr({ notificar, obtenerEmpleados, alRegistrar }) {
  const escaneando = ref(false);
  const iniciandoCamara = ref(false);
  const procesando = ref(false);
  const ultimoResultado = ref(null);
  const identificadorManual = ref('');

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
    } catch (fallo) {
      ultimoResultado.value = {
        error: true,
        mensaje: 'No se pudo guardar ni siquiera localmente: ' + (fallo.message || fallo)
      };
      emitirSonido('error');
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

  async function iniciar() {
    if (typeof Html5Qrcode === 'undefined') {
      ultimoResultado.value = {
        error: true,
        mensaje: 'La librería del escáner no cargó. Recarga la página.'
      };
      return;
    }

    escaneando.value = true;
    iniciandoCamara.value = true;
    ultimoResultado.value = null;

    // Damos un ciclo para que Vue pinte el contenedor antes de que la librería
    // lo busque en el DOM.
    await nextTick();

    const contenedor = document.getElementById(ID_CONTENEDOR);
    if (!contenedor) {
      iniciandoCamara.value = false;
      escaneando.value = false;
      return;
    }
    contenedor.innerHTML = '';

    try {
      lector = new Html5Qrcode(ID_CONTENEDOR);
      await lector.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (textoLeido) => registrar(textoLeido),
        () => { /* fallo de lectura por cuadro: es normal, no hay que hacer nada */ }
      );
    } catch (fallo) {
      escaneando.value = false;
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
