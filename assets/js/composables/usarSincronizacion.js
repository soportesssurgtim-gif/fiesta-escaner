/**
 * Refresco periódico de las asistencias.
 *
 * En la puerta suele haber más de un dispositivo escaneando. Sin esto, cada uno
 * solo veía lo suyo: el contador y el listado quedaban congelados en lo que
 * había al iniciar sesión, y para ver el número real había que recargar. En
 * medio de un evento nadie recarga.
 *
 * No hay websockets ni Realtime de Supabase acá a propósito. Mantener una
 * conexión viva desde una tablet con señal irregular es más frágil que preguntar
 * cada tantos segundos, y el backend es una función serverless: no hay dónde
 * sostener la conexión. Un sondeo corto y barato encaja mejor con la forma que
 * ya tiene el sistema.
 *
 * Lo que lo hace barato es el endpoint: devuelve un COUNT y solo las filas
 * posteriores a la última vista. En una jornada normal son cero filas por
 * llamada.
 */

import { api } from '../servicios/servicioApi.js';

const { ref, reactive, computed, onBeforeUnmount } = Vue;

// Cada cuánto se pregunta, según lo que se esté mirando. En el escáner y en el
// listado el número está a la vista y conviene que se mueva; en el resto de las
// pantallas nadie lo está mirando y no vale la pena gastar red ni batería.
const INTERVALO_ATENTO = 8000;
const INTERVALO_DE_FONDO = 30000;

// Vistas donde el dato se está mirando de verdad.
const VISTAS_ATENTAS = ['scanner', 'asistentes'];

// Cuánto se espera tras un fallo, y hasta dónde crece. Si el servidor está
// caído, insistir cada ocho segundos desde todas las tablets solo empeora las
// cosas.
const ESPERA_TRAS_FALLO = 15000;
const ESPERA_MAXIMA = 120000;

/**
 * @param {Object} config
 * @param {Function} config.haySesion        () => boolean
 * @param {Function} config.vistaActual      () => string
 * @param {Function} config.estaOcupado      () => boolean. Si hay un escaneo en
 *   vuelo se saltea el turno: en la puerta, registrar tiene prioridad sobre
 *   refrescar.
 * @param {Function} config.alRecibir        ({ total, nuevas }) => void
 */
export function usarSincronizacion({ haySesion, vistaActual, estaOcupado, alRecibir }) {
  const activo = ref(true);
  const consultando = ref(false);
  const ultimaSincronizacion = ref(null);
  const fallosSeguidos = ref(0);

  // Marca de la asistencia más reciente que ya se conoce. El servidor la
  // devuelve en cada respuesta; no se calcula acá con el reloj del navegador,
  // que puede estar corrido respecto del de la base y haría perder registros.
  let marca = null;
  let reloj = null;

  const enPantallaAtenta = computed(() => VISTAS_ATENTAS.includes(vistaActual()));

  const estado = reactive({
    activo,
    consultando,
    ultimaSincronizacion,
    fallosSeguidos,
    // Para poder decirlo en la interfaz sin exponer los milisegundos.
    hayProblema: computed(() => fallosSeguidos.value >= 2)
  });

  /** Cuánto esperar hasta el próximo turno. */
  function proximaEspera() {
    if (fallosSeguidos.value > 0) {
      // Espera creciente: 15 s, 30 s, 60 s… hasta el techo.
      return Math.min(ESPERA_TRAS_FALLO * 2 ** (fallosSeguidos.value - 1), ESPERA_MAXIMA);
    }
    return enPantallaAtenta.value ? INTERVALO_ATENTO : INTERVALO_DE_FONDO;
  }

  /** ¿Tiene sentido preguntar ahora mismo? */
  function conviene() {
    if (!activo.value) return false;
    if (!haySesion()) return false;
    if (!navigator.onLine) return false;
    // Con la pestaña en segundo plano nadie está mirando el número, y en móvil
    // el navegador estrangula los temporizadores igual.
    if (document.hidden) return false;
    if (estaOcupado()) return false;
    return true;
  }

  async function consultar({ forzado = false } = {}) {
    if (consultando.value) return;
    if (!forzado && !conviene()) return;
    if (forzado && (!haySesion() || !navigator.onLine)) return;

    consultando.value = true;
    try {
      const respuesta = await api.asistencias.novedades(marca);

      // La marca avanza solo con lo que el servidor confirma. Si no llegó nada
      // nuevo, devuelve la misma que se le mandó.
      if (respuesta.desde) marca = respuesta.desde;

      alRecibir({
        total: Number(respuesta.total) || 0,
        nuevas: Array.isArray(respuesta.nuevas) ? respuesta.nuevas : []
      });

      ultimaSincronizacion.value = Date.now();
      fallosSeguidos.value = 0;
    } catch (fallo) {
      // Una sesión vencida no es un fallo del sincronizador: el cliente HTTP ya
      // avisó y cerró la sesión. Insistir solo llenaría la consola.
      if (fallo.esSesionVencida) {
        activo.value = false;
        return;
      }
      fallosSeguidos.value += 1;
      if (fallosSeguidos.value === 1) console.warn('[sincronizacion]', fallo.message || fallo);
    } finally {
      consultando.value = false;
    }
  }

  function programar() {
    clearTimeout(reloj);
    reloj = setTimeout(async () => {
      await consultar();
      programar();
    }, proximaEspera());
  }

  /** Pregunta ya mismo, sin esperar el turno. */
  async function sincronizarAhora() {
    await consultar({ forzado: true });
    programar();
  }

  function arrancar() {
    activo.value = true;
    fallosSeguidos.value = 0;
    programar();
  }

  function detener() {
    activo.value = false;
    clearTimeout(reloj);
    reloj = null;
  }

  // Al volver a la pestaña se pregunta de una: lo que pasó mientras estaba
  // oculta es justamente lo que se quiere ver al volver.
  const alCambiarVisibilidad = () => {
    if (document.hidden) return;
    if (haySesion()) sincronizarAhora();
  };

  // Y al recuperar la señal, por lo mismo.
  const alVolverLaRed = () => {
    fallosSeguidos.value = 0;
    if (haySesion()) sincronizarAhora();
  };

  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('online', alVolverLaRed);

  onBeforeUnmount(() => {
    detener();
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    window.removeEventListener('online', alVolverLaRed);
  });

  return reactive({
    estado,
    arrancar,
    detener,
    sincronizarAhora,
    /** Se llama al iniciar sesión o al recargar catálogos: reinicia la marca. */
    reiniciar(desde = null) {
      marca = desde;
      fallosSeguidos.value = 0;
    }
  });
}
