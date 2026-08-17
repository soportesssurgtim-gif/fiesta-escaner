/**
 * Gestión de los registros que quedaron guardados en el dispositivo.
 *
 * Hasta ahora la única señal de que había algo pendiente era un contador en la
 * barra lateral y un botón que reintentaba todo a la vez. Eso alcanza mientras
 * todo sube, pero no cuando algo se atasca: un DUI que no está en el padrón se
 * rechaza siempre, y el contador se queda clavado en «1 por subir» sin que nadie
 * pueda ver de quién se trata ni sacarlo de la cola.
 *
 * Acá se puede ver cada registro, reintentarlos de a uno, descartar los que no
 * tienen arreglo y, antes de descartar nada, bajarse un CSV. Ese CSV importa:
 * descartar es la única operación de todo el sistema que destruye un escaneo,
 * y un evento no se puede repetir.
 */

import { servicioOffline } from '../servicios/servicioOffline.js';
import { formatearFechaHora, formatearDui, duiPlano } from '../nucleo/formato.js';

const { ref, reactive, computed } = Vue;

/**
 * @param {Object} config
 * @param {Function} config.notificar         Para avisar en pantalla.
 * @param {Function} config.obtenerEmpleados  Getter del padrón, para resolver
 *   a quién corresponde cada registro. Va como función por lo mismo que en
 *   usarEscanerQr: la lista se reemplaza entera al recargar los catálogos.
 * @param {Function} [config.alCambiar]       Se llama cuando la cantidad de
 *   pendientes cambia, para que el contador de la barra lateral la siga.
 */
export function usarPendientes({ notificar, obtenerEmpleados, alCambiar }) {
  const abierto = ref(false);
  const lista = ref([]);
  const cargando = ref(false);
  const trabajando = ref('');        // idCliente en proceso, o 'todos'
  const seleccion = ref([]);
  const confirmandoDescarte = ref(false);

  const hayPendientes = computed(() => lista.value.length > 0);
  const todosSeleccionados = computed(
    () => lista.value.length > 0 && seleccion.value.length === lista.value.length
  );

  /** Los que ya fallaron alguna vez: son los que necesitan una decisión. */
  const conProblemas = computed(() => lista.value.filter((registro) => registro.intentos > 0));

  const resumen = computed(() => ({
    total: lista.value.length,
    conProblemas: conProblemas.value.length,
    sinIdentificar: lista.value.filter((registro) => !registro.empleadoId).length
  }));

  /**
   * Completa cada registro con lo que hace falta para mostrarlo.
   * El padrón puede haber cambiado desde que se guardó el escaneo, así que el
   * nombre se vuelve a resolver acá en vez de confiar en el que quedó grabado.
   */
  function decorar(registro) {
    const padron = obtenerEmpleados() || [];
    const buscado = duiPlano(registro.identificador);

    const empleado =
      padron.find((persona) => duiPlano(persona.dui) === buscado) ||
      padron.find((persona) => String(persona.codigo || '') === String(registro.identificador)) ||
      padron.find((persona) => String(persona.id) === String(registro.identificador)) ||
      null;

    return {
      ...registro,
      nombre: empleado
        ? `${empleado.nombres} ${empleado.apellidos}`.trim()
        : `${registro.nombres || ''} ${registro.apellidos || ''}`.trim(),
      // Que no esté en el padrón es el motivo más común de que un registro se
      // atasque, y conviene decirlo antes de que lo reintenten diez veces.
      enPadron: Boolean(empleado),
      duiLegible: formatearDui(registro.identificador) || registro.identificador,
      momentoLegible: formatearFechaHora(registro.momento),
      intentos: registro.intentos || 0
    };
  }

  async function cargar() {
    cargando.value = true;
    try {
      const crudos = await servicioOffline.pendientes();
      lista.value = crudos
        .sort((a, b) => (a.momento || 0) - (b.momento || 0))
        .map(decorar);
      // Se descartan de la selección los que ya no están.
      const vigentes = new Set(lista.value.map((r) => r.idCliente));
      seleccion.value = seleccion.value.filter((id) => vigentes.has(id));
    } catch (fallo) {
      console.error('[pendientes]', fallo);
      notificar('No se pudo leer el almacenamiento del dispositivo.', 'error');
      lista.value = [];
    } finally {
      cargando.value = false;
    }
  }

  async function abrir() {
    abierto.value = true;
    seleccion.value = [];
    confirmandoDescarte.value = false;
    await cargar();
  }

  function cerrar() {
    abierto.value = false;
    confirmandoDescarte.value = false;
    seleccion.value = [];
  }

  function alternarSeleccion(idCliente) {
    const indice = seleccion.value.indexOf(idCliente);
    if (indice >= 0) seleccion.value.splice(indice, 1);
    else seleccion.value.push(idCliente);
  }

  function alternarTodos() {
    seleccion.value = todosSeleccionados.value
      ? []
      : lista.value.map((registro) => registro.idCliente);
  }

  /** Reintenta la subida. Sin argumento va todo; con uno, solo ese registro. */
  async function reintentar(idCliente = null) {
    trabajando.value = idCliente || 'todos';

    try {
      const resultado = await servicioOffline.sincronizar(idCliente ? [idCliente] : null);

      if (resultado.sinConexion) {
        notificar('Todavía no hay conexión. Los registros siguen guardados.', 'alerta');
      } else if (resultado.errores > 0) {
        notificar(
          `${resultado.sincronizados} subidos · ${resultado.duplicados} ya estaban · ${resultado.errores} con error`,
          'alerta'
        );
      } else {
        notificar(
          `${resultado.sincronizados} subidos · ${resultado.duplicados} ya estaban.`,
          'exito'
        );
      }

      await cargar();
      if (alCambiar) await alCambiar();
      return resultado;
    } finally {
      trabajando.value = '';
    }
  }

  /**
   * Descarta registros del dispositivo. Es destructivo y definitivo: el escaneo
   * desaparece sin haber llegado nunca al servidor.
   */
  async function descartar(idsCliente) {
    const ids = [].concat(idsCliente || []).filter(Boolean);
    if (ids.length === 0) return;

    trabajando.value = ids.length === 1 ? ids[0] : 'todos';
    try {
      await servicioOffline.eliminar(ids);
      notificar(
        ids.length === 1 ? 'Registro descartado.' : `${ids.length} registros descartados.`,
        'info'
      );

      confirmandoDescarte.value = false;
      await cargar();
      if (alCambiar) await alCambiar();
    } catch (fallo) {
      notificar(fallo.message || 'No se pudo descartar.', 'error');
    } finally {
      trabajando.value = '';
    }
  }

  /**
   * Baja un CSV con lo que hay guardado.
   *
   * Es la red de seguridad antes de descartar: si alguien decide que un puñado
   * de escaneos no tiene arreglo, al menos queda constancia de a quién se le
   * leyó el código y a qué hora, para poder cargarlo a mano después.
   */
  function exportarCsv() {
    if (lista.value.length === 0) return;

    const escapar = (valor) => {
      const texto = String(valor ?? '');
      return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const columnas = ['Fecha y hora', 'Identificador', 'Nombre', 'En el padrón', 'Dispositivo', 'Intentos', 'Último error'];
    const filas = lista.value.map((registro) => [
      registro.momentoLegible,
      registro.duiLegible,
      registro.nombre || 'Sin identificar',
      registro.enPadron ? 'Sí' : 'No',
      registro.dispositivo,
      registro.intentos,
      registro.ultimoError || ''
    ]);

    // El BOM es para que Excel abra el archivo como UTF-8; sin él, los nombres
    // con tilde se ven rotos y quien recibe el respaldo cree que está dañado.
    const contenido = '﻿' + [columnas, ...filas].map((fila) => fila.map(escapar).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `pendientes-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);

    notificar('Se descargó el respaldo de los pendientes.', 'exito');
  }

  return reactive({
    abierto,
    lista,
    cargando,
    trabajando,
    seleccion,
    confirmandoDescarte,
    hayPendientes,
    todosSeleccionados,
    conProblemas,
    resumen,
    abrir,
    cerrar,
    cargar,
    alternarSeleccion,
    alternarTodos,
    reintentar,
    descartar,
    exportarCsv
  });
}
