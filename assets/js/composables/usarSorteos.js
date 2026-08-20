/**
 * Sorteos de la fiesta.
 *
 * Un sorteo es la jornada entera, no un premio. Así se hace en la vida real:
 * alguien con un micrófono va llamando ganadores durante toda la noche, y los
 * premios pueden ser veinte o más.
 *
 * El modelo anterior ataba un sorteo a UN premio y lo cerraba al primer
 * ganador, así que había que crear veinte sorteos y elegirlos de a uno en un
 * desplegable, sin forma de saber cuál ya se había entregado.
 *
 * Esta pantalla se proyecta delante de la gente, así que las decisiones son
 * distintas a las del resto del sistema: el nombre del ganador va enorme, la
 * lista de premios está siempre a la vista, y nada se hace sin que quien locuta
 * lo pida.
 */

import { api } from '../servicios/servicioApi.js';

const { ref, reactive, computed } = Vue;

export function usarSorteos({ notificar, notificarError, alCambiar }) {
  const lista = ref([]);
  const elegido = ref('');
  const ganadores = ref([]);
  const cargando = ref(false);
  const sorteando = ref(false);
  const error = ref('');

  // Cuántos se sacan de una vez. Casi siempre uno, pero cuando hay diez termos
  // iguales se llaman de a varios para no alargar la noche.
  const cantidadPorExtraer = ref(1);
  const lineaElegida = ref('');

  // El último resultado, para el cartel grande.
  const ultimaExtraccion = ref(null);

  const sorteo = computed(() => lista.value.find((s) => s.id === elegido.value) || null);

  /** Los premios que todavía tienen unidades por repartir. */
  const premiosPendientes = computed(() =>
    (sorteo.value?.premios || []).filter((p) => p.pendientes > 0)
  );

  const linea = computed(
    () => (sorteo.value?.premios || []).find((p) => p.id === lineaElegida.value) || null
  );

  /** Cuánto se puede pedir sin pasarse de lo que queda del premio elegido. */
  const maximoPorExtraer = computed(() => Math.max(1, Math.min(20, linea.value?.pendientes || 1)));

  const progreso = computed(() => {
    const s = sorteo.value;
    if (!s || !s.totalPremios) return 0;
    return Math.round((s.totalEntregados / s.totalPremios) * 100);
  });

  async function cargar() {
    cargando.value = true;
    try {
      lista.value = await api.sorteos.listar();

      // Si el sorteo elegido desapareció, se limpia la selección en vez de
      // quedar apuntando a un id que ya no existe.
      if (elegido.value && !lista.value.some((s) => s.id === elegido.value)) {
        elegido.value = '';
        ganadores.value = [];
      }
    } catch (fallo) {
      if (!fallo.esSesionVencida) console.error('[sorteos]', fallo);
    } finally {
      cargando.value = false;
    }
  }

  async function elegirSorteo(id) {
    elegido.value = id;
    lineaElegida.value = '';
    cantidadPorExtraer.value = 1;
    ultimaExtraccion.value = null;
    error.value = '';

    if (!id) {
      ganadores.value = [];
      return;
    }

    // Se preselecciona el primer premio con unidades: casi siempre es el que
    // sigue en la locución, y ahorra un toque.
    const siguiente = premiosPendientes.value[0];
    if (siguiente) lineaElegida.value = siguiente.id;

    await cargarGanadores();
  }

  async function cargarGanadores() {
    if (!elegido.value) return;
    try {
      ganadores.value = await api.sorteos.ganadores(elegido.value);
    } catch (fallo) {
      console.error('[sorteos]', fallo);
      ganadores.value = [];
    }
  }

  /** Saca los ganadores del premio elegido. */
  async function extraer() {
    if (!elegido.value || !lineaElegida.value) {
      error.value = 'Elige primero qué premio vas a sortear.';
      return;
    }

    sorteando.value = true;
    error.value = '';
    ultimaExtraccion.value = null;

    try {
      const resultado = await api.sorteos.sortear(
        elegido.value,
        lineaElegida.value,
        Math.max(1, Number(cantidadPorExtraer.value) || 1)
      );

      ultimaExtraccion.value = resultado;

      if (resultado.seSortearonMenos) {
        notificar(
          `Se pidieron más de los que quedaban: salieron ${resultado.ganadores.length}.`,
          'alerta'
        );
      }

      await Promise.all([cargar(), cargarGanadores()]);
      if (alCambiar) await alCambiar();

      // Si el premio se agotó se pasa al siguiente, para que quien locuta no
      // tenga que buscarlo mientras la gente espera.
      if (resultado.pendientesDeEstePremio <= 0) {
        const siguiente = premiosPendientes.value[0];
        lineaElegida.value = siguiente ? siguiente.id : '';
        cantidadPorExtraer.value = 1;
      } else {
        cantidadPorExtraer.value = Math.min(cantidadPorExtraer.value, maximoPorExtraer.value);
      }
    } catch (fallo) {
      error.value = fallo.message || 'No se pudo sortear.';
    } finally {
      sorteando.value = false;
    }
  }

  /** Marca que el premio se entregó en mano, o revierte la marca. */
  async function alternarEntrega(ganador) {
    try {
      await api.sorteos.marcarEntregado(ganador.id, !ganador.entregado);
      await cargarGanadores();
    } catch (fallo) {
      notificarError(fallo.message || 'No se pudo marcar la entrega.');
    }
  }

  /** Cierra el sorteo, o lo vuelve a abrir. */
  async function alternarEstado() {
    if (!sorteo.value) return;
    const abrir = String(sorteo.value.estado || '').toUpperCase() === 'CERRADO';

    try {
      const resultado = await api.sorteos.cambiarEstado(sorteo.value.id, abrir);
      notificar(resultado.mensaje, 'info');
      await cargar();
    } catch (fallo) {
      notificarError(fallo.message || 'No se pudo cambiar el estado.');
    }
  }

  function limpiarCartel() {
    ultimaExtraccion.value = null;
  }

  return reactive({
    lista,
    elegido,
    sorteo,
    ganadores,
    cargando,
    sorteando,
    error,
    lineaElegida,
    linea,
    cantidadPorExtraer,
    maximoPorExtraer,
    premiosPendientes,
    ultimaExtraccion,
    progreso,
    cargar,
    elegirSorteo,
    cargarGanadores,
    extraer,
    alternarEntrega,
    alternarEstado,
    limpiarCartel
  });
}
