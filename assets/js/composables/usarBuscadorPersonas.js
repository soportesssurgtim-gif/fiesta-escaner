/**
 * Buscar a una persona por su nombre, desde la puerta del evento.
 *
 * Es el plan C cuando el QR no aparece: alguien no guardó su invitación, la
 * batería del teléfono se acabó, o no se sabe el DUI de memoria. Hasta ahora la
 * única salida era escribir el DUI a mano, y sin el DUI no había salida.
 *
 * Muestra departamento, cargo y distrito de cada coincidencia. Eso es lo que
 * permite decidir: en un padrón municipal hay varios "José Hernández", y saber
 * que el que está en la puerta es el de Obras Públicas y no el de Registro
 * Familiar es la diferencia entre registrar a la persona correcta y meterle una
 * asistencia a otra.
 *
 * Todo sale del padrón que ya está cargado en memoria, así que funciona sin
 * señal, que es justo cuando más falta hace.
 */

import { coincide, duiPlano, nombreCompleto, formatearDui, esVerdadero } from '../nucleo/formato.js';

const { ref, reactive, computed } = Vue;

// Cuántas coincidencias se muestran. Con más, la lista deja de ayudar: si la
// búsqueda devuelve treinta personas, lo que hay que hacer es afinar el nombre.
const MAXIMO_RESULTADOS = 25;

/**
 * @param {Object} config
 * @param {Function} config.obtenerEmpleados     Getter del padrón.
 * @param {Function} config.obtenerDepartamentos Getter del catálogo de departamentos.
 * @param {Function} config.obtenerAsistencias   Getter de las asistencias cargadas.
 * @param {Function} config.obtenerEventoActivo  Getter del evento activo.
 * @param {Function} config.alElegir             (identificador) => void. Registra.
 */
export function usarBuscadorPersonas({
  obtenerEmpleados,
  obtenerDepartamentos,
  obtenerAsistencias,
  obtenerEventoActivo,
  alElegir
}) {
  const abierto = ref(false);
  const termino = ref('');
  const soloActivos = ref(true);

  /** El nombre del departamento de alguien, resuelto contra el catálogo. */
  function departamentoDe(persona) {
    const encontrado = (obtenerDepartamentos() || []).find((fila) => fila.id === persona.dpto);
    return encontrado ? encontrado.nombre_dpto || '' : '';
  }

  /** ¿Ya marcó en el evento activo? Se resuelve con lo que hay en memoria. */
  function yaRegistrado(persona) {
    const evento = obtenerEventoActivo();
    if (!evento) return null;

    const dui = duiPlano(persona.dui);
    if (!dui) return null;

    return (obtenerAsistencias() || []).find(
      (fila) => fila.evento === evento.id && duiPlano(fila.dui) === dui
    ) || null;
  }

  const resultados = computed(() => {
    const busqueda = termino.value.trim();
    if (busqueda.length < 2) return [];

    const lista = (obtenerEmpleados() || []).filter((persona) => {
      if (soloActivos.value && !esVerdadero(persona.activo)) return false;
      return (
        coincide(nombreCompleto(persona), busqueda) ||
        coincide(persona.dui, busqueda) ||
        coincide(persona.codigo, busqueda)
      );
    });

    return lista.slice(0, MAXIMO_RESULTADOS).map((persona) => {
      const asistencia = yaRegistrado(persona);
      return {
        id: persona.id,
        // El identificador que se le pasa al escáner. Se manda el DUI porque es
        // lo que el backend resuelve mejor y lo que aparece en el listado.
        identificador: persona.dui,
        nombre: nombreCompleto(persona),
        dui: formatearDui(persona.dui),
        departamento: departamentoDe(persona),
        cargo: persona.cargo || '',
        distrito: persona.distrito || '',
        activo: esVerdadero(persona.activo),
        yaRegistrado: Boolean(asistencia),
        registradoEn: asistencia ? asistencia.fechaHora : null
      };
    });
  });

  /** Cuántas coincidencias hay en total, para avisar si se recortaron. */
  const totalCoincidencias = computed(() => {
    const busqueda = termino.value.trim();
    if (busqueda.length < 2) return 0;

    return (obtenerEmpleados() || []).filter((persona) => {
      if (soloActivos.value && !esVerdadero(persona.activo)) return false;
      return (
        coincide(nombreCompleto(persona), busqueda) ||
        coincide(persona.dui, busqueda) ||
        coincide(persona.codigo, busqueda)
      );
    }).length;
  });

  const hayRecorte = computed(() => totalCoincidencias.value > MAXIMO_RESULTADOS);
  const buscando = computed(() => termino.value.trim().length >= 2);

  function abrir() {
    termino.value = '';
    soloActivos.value = true;
    abierto.value = true;
  }

  function cerrar() {
    abierto.value = false;
    termino.value = '';
  }

  /**
   * Registra la asistencia de la persona elegida y cierra.
   *
   * Se cierra a propósito: en la puerta hay fila, y dejar la lista abierta
   * invita a tocar dos veces sobre la misma persona. La ventana anti-repetición
   * del escáner igual lo frenaría, pero es mejor que ni se plantee.
   */
  function elegir(fila) {
    if (!fila || !fila.identificador) return;
    alElegir(fila.identificador);
    cerrar();
  }

  return reactive({
    abierto,
    termino,
    soloActivos,
    resultados,
    totalCoincidencias,
    hayRecorte,
    buscando,
    maximo: MAXIMO_RESULTADOS,
    abrir,
    cerrar,
    elegir
  });
}
