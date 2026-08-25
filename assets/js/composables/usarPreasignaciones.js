/**
 * Gestión de preasignaciones de sorteo.
 *
 * Permite registrar favorecidos que deben despacharse primero cuando se ejecuta
 * un sorteo específico (ej. boletos físicos prefijados en dinámicas presenciales).
 *
 * La lista es "oculta": solo se gestiona desde Configuración > Preasignaciones.
 * El sistema las consume silenciosamente durante el sorteo sin mostrar indicadores
 * especiales en la interfaz de locución.
 */

import { api } from '../servicios/servicioApi.js';
import { formatearFechaHora } from '../nucleo/formato.js';

const { ref, reactive, computed, onMounted, onUnmounted } = Vue;

export function usarPreasignaciones({ notificar, notificarError, eventoActivo, haySesion }) {
  const lista = ref([]);
  const cargando = ref(false);
  const guardando = ref(false);
  const error = ref('');
  const busquedaEmpleado = ref('');
  const mostrarListaEmpleados = ref(false);
  const contenedorEmpleados = ref(null);
  const datosCargados = ref(false);

  // Cerrar lista al hacer clic fuera
  function manejarClickFuera(evento) {
    if (contenedorEmpleados.value && !contenedorEmpleados.value.contains(evento.target)) {
      mostrarListaEmpleados.value = false;
    }
  }

  onMounted(() => {
    document.addEventListener('click', manejarClickFuera);
  });

  onUnmounted(() => {
    document.removeEventListener('click', manejarClickFuera);
  });

  async function cargarDatosIniciales() {
    try {
      // Cargar sorteos y empleados en paralelo
      const [listaSorteos, listaEmpleados] = await Promise.all([
        api.sorteos.listar(),
        api.empleados.listar()
      ]);
      
      sorteos.value = listaSorteos;
      empleados.value = listaEmpleados;

      // Seleccionar automáticamente el sorteo del evento activo
      const evento = typeof eventoActivo === 'function' ? eventoActivo() : null;
      if (evento && evento.id) {
        const sorteoActivo = listaSorteos.find(s => 
          s.evento === evento.id && 
          String(s.estado || 'ABIERTO').toUpperCase() !== 'CERRADO' &&
          !s.completo
        );
        
        if (sorteoActivo) {
          formulario.sorteoId = sorteoActivo.id;
          // Seleccionar primer premio con pendientes
          const premioPendiente = sorteoActivo.premios?.find(p => p.pendientes > 0);
          if (premioPendiente) {
            formulario.lineaId = premioPendiente.id;
          }
        }
      }

      // Cargar preasignaciones
      await cargarLista(formulario.sorteoId, formulario.lineaId);
      datosCargados.value = true;
    } catch (fallo) {
      console.error('[preasignaciones] Error cargando datos iniciales:', fallo);
    }
  }

  /** Cargar datos solo cuando haya sesión (llamado desde la vista) */
  async function cargarSiHaySesion() {
    if (!haySesion?.value || datosCargados.value) return;
    await cargarDatosIniciales();
  }

  // Formulario para nueva preasignación
  const formulario = reactive({
    sorteoId: '',
    lineaId: '',
    empleadoId: ''
  });

  // Listas para los selects
  const sorteos = ref([]);
  const empleados = ref([]);

  // Empleados filtrados por búsqueda
  const empleadosFiltrados = computed(() => {
    if (!busquedaEmpleado.value.trim()) return empleados.value;

    const termino = busquedaEmpleado.value.trim().toLowerCase();
    return empleados.value.filter(emp => {
      const nombreCompleto = `${emp.nombres || ''} ${emp.apellidos || ''}`.toLowerCase();
      const dui = (emp.dui || '').toLowerCase();
      return nombreCompleto.includes(termino) || dui.includes(termino);
    });
  });

  function limpiarBusqueda() {
    busquedaEmpleado.value = '';
  }

  async function cargarSorteos() {
    try {
      sorteos.value = await api.sorteos.listar();
    } catch (fallo) {
      console.error('[preasignaciones] Error cargando sorteos:', fallo);
    }
  }

  async function cargarEmpleados() {
    try {
      empleados.value = await api.empleados.listar();
    } catch (fallo) {
      console.error('[preasignaciones] Error cargando empleados:', fallo);
    }
  }

  async function cargarLista(sorteoId = '', lineaId = '') {
    cargando.value = true;
    error.value = '';
    try {
      lista.value = await api.sorteos.listarPreasignaciones(sorteoId, lineaId);
    } catch (fallo) {
      error.value = fallo.message || 'No se pudieron cargar las preasignaciones.';
    } finally {
      cargando.value = false;
    }
  }

  async function crear() {
    if (!formulario.sorteoId || !formulario.lineaId || !formulario.empleadoId) {
      notificarError('Completa todos los campos para crear la preasignación.');
      return;
    }

    guardando.value = true;
    try {
      await api.sorteos.crearPreasignacion(
        formulario.sorteoId,
        formulario.lineaId,
        formulario.empleadoId
      );
      notificar('Preasignación creada.', 'exito');
      formulario.sorteoId = '';
      formulario.lineaId = '';
      formulario.empleadoId = '';
      await cargarLista();
    } catch (fallo) {
      notificarError(fallo.message || 'No se pudo crear la preasignación.');
    } finally {
      guardando.value = false;
    }
  }

  async function eliminar(id) {
    try {
      await api.sorteos.eliminarPreasignacion(id);
      notificar('Preasignación eliminada.', 'exito');
      await cargarLista();
    } catch (fallo) {
      notificarError(fallo.message || 'No se pudo eliminar la preasignación.');
    }
  }

  /** Los premios de un sorteo (para el select de línea de premio). */
  function premiosDeSorteo(sorteoId) {
    const sorteo = sorteos.value.find(s => s.id === sorteoId);
    return sorteo?.premios || [];
  }

  return reactive({
    lista,
    cargando,
    guardando,
    error,
    formulario,
    sorteos,
    empleados,
    busquedaEmpleado,
    empleadosFiltrados,
    mostrarListaEmpleados,
    contenedorEmpleados,
    limpiarBusqueda,
    cargarSorteos,
    cargarEmpleados,
    cargarLista,
    cargarSiHaySesion,
    crear,
    eliminar,
    premiosDeSorteo,
    formatearFechaHora
  });
}
