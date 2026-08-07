/**
 * Catálogo genérico: lista + búsqueda + paginación + modal de edición.
 *
 * Departamentos, empleados, premios, roles, usuarios, eventos y sorteos hacían
 * literalmente lo mismo, cada uno con sus propias variables:
 *   listaX, busquedaX, paginaX, itemsPorPaginaX, modalX, formX, guardandoX,
 *   y las computadas xFiltrados / xPaginados / xRangoTexto.
 *
 * Eso eran unas cuarenta líneas repetidas siete veces. Con este composable,
 * declarar un catálogo nuevo son cuatro líneas y viene todo incluido, incluida
 * la paginación que antes solo tenía departamentos.
 */

import { coincide } from '../nucleo/formato.js';

const { ref, reactive, computed, watch } = Vue;

/*
 * Sobre por qué el retorno va envuelto en reactive():
 *
 * Vue solo desenvuelve automáticamente los refs que están en el primer nivel de
 * lo que devuelve setup(). Si un composable devuelve un objeto plano con refs
 * adentro, las plantillas tendrían que escribir `empleados.lista.value`, que es
 * ruidoso y fácil de olvidar. Con reactive() el acceso queda en
 * `empleados.lista` tanto en la plantilla como en el código.
 */

/**
 * @param {Object} config
 * @param {Function} config.alGuardar     (datos) => Promise. La llamada a la API.
 * @param {Object}   config.formularioVacio  Estado inicial del formulario.
 * @param {Function} [config.alAbrir]     (registro) => objeto para el formulario.
 *                                        Sirve para traducir nombres de la base
 *                                        (nombre_dpto) a los del formulario.
 * @param {string[]} [config.camposBusqueda] Qué campos mira el buscador.
 * @param {number}   [config.porPagina]   Filas por página.
 */
export function usarCatalogo(config) {
  const {
    alGuardar,
    formularioVacio,
    alAbrir = (registro) => ({ ...registro }),
    camposBusqueda = ['nombre'],
    porPagina = 10
  } = config;

  const lista = ref([]);
  const busqueda = ref('');
  const pagina = ref(1);
  const filasPorPagina = ref(porPagina);

  const modalAbierto = ref(false);
  const guardando = ref(false);
  const error = ref('');
  const formulario = reactive({ ...formularioVacio });

  /**
   * Filtra por lo que se escribió en el buscador.
   * Busca en varios campos a la vez e ignora tildes y mayúsculas, porque nadie
   * escribe "Panchimalco" con la tilde correcta cuando anda apurado.
   */
  const filtrados = computed(() => {
    const termino = busqueda.value.trim();
    if (!termino) return lista.value;

    return lista.value.filter((registro) =>
      camposBusqueda.some((campo) => coincide(registro[campo], termino))
    );
  });

  const totalPaginas = computed(() => {
    if (filasPorPagina.value === 'Todos') return 1;
    const limite = Number(filasPorPagina.value) || porPagina;
    return Math.max(1, Math.ceil(filtrados.value.length / limite));
  });

  const paginados = computed(() => {
    if (filasPorPagina.value === 'Todos') return filtrados.value;
    const limite = Number(filasPorPagina.value) || porPagina;
    const inicio = (pagina.value - 1) * limite;
    return filtrados.value.slice(inicio, inicio + limite);
  });

  /** Texto tipo "1 a 10 de 47" para el pie de la tabla. */
  const rangoTexto = computed(() => {
    const total = filtrados.value.length;
    if (total === 0) return 'Sin resultados';
    if (filasPorPagina.value === 'Todos') return `1 a ${total} de ${total}`;

    const limite = Number(filasPorPagina.value) || porPagina;
    const desde = (pagina.value - 1) * limite + 1;
    const hasta = Math.min(pagina.value * limite, total);
    return `${desde} a ${hasta} de ${total}`;
  });

  // Al filtrar o cambiar el tamaño de página volvemos a la primera. Si no,
  // quedás en la página 5 de un resultado que ahora tiene una sola.
  watch([busqueda, filasPorPagina], () => { pagina.value = 1; });

  // Red de seguridad: si se borran registros y la página actual queda fuera de
  // rango, retrocedemos en lugar de mostrar una tabla vacía.
  watch(totalPaginas, (total) => {
    if (pagina.value > total) pagina.value = total;
  });

  function irA(numero) {
    pagina.value = Math.min(Math.max(1, numero), totalPaginas.value);
  }

  function abrir(registro = null) {
    error.value = '';
    const valores = registro ? alAbrir(registro) : { ...formularioVacio };

    // Reasignamos campo por campo para no romper la reactividad del objeto.
    Object.keys(formulario).forEach((campo) => { delete formulario[campo]; });
    Object.assign(formulario, { ...formularioVacio }, valores);

    modalAbierto.value = true;
  }

  function cerrar() {
    modalAbierto.value = false;
    error.value = '';
  }

  /**
   * Guarda y avisa del resultado.
   * `alTerminar` normalmente recarga los catálogos desde el servidor.
   */
  async function guardar(alTerminar) {
    guardando.value = true;
    error.value = '';

    try {
      const resultado = await alGuardar({ ...formulario });
      modalAbierto.value = false;
      if (alTerminar) await alTerminar(resultado);
      return { ok: true, resultado };
    } catch (fallo) {
      error.value = fallo.message || 'No se pudo guardar.';
      return { ok: false, error: error.value };
    } finally {
      guardando.value = false;
    }
  }

  return reactive({
    lista,
    busqueda,
    pagina,
    filasPorPagina,
    totalPaginas,
    filtrados,
    paginados,
    rangoTexto,
    irA,
    modalAbierto,
    guardando,
    error,
    formulario,
    abrir,
    cerrar,
    guardar
  });
}
