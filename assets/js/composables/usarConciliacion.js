/**
 * Conciliación de departamentos y distritos antes de importar.
 *
 * El problema que resuelve: Recursos Humanos tiene su propia planilla con
 * ochocientos o novecientos empleados. Al pegarla en la plantilla, los
 * desplegables con validación rechazan los valores, y aunque no lo hicieran,
 * los nombres no coinciden letra por letra con los del catálogo. «Gerencia de
 * Tecnología de Información» y «Gerencia de Tecnologia de la Informacion
 * Municipal» son el mismo lugar y ninguno coincide.
 *
 * Cómo funciona
 * -------------
 * Se pega el texto tal como está en el archivo de origen. El sistema lee el
 * Excel, junta los valores distintos —que son cuarenta, no novecientos— y
 * busca a cuál del catálogo se parece cada uno. Después alguien confirma o
 * corrige, de a uno o por grupo, y recién ahí se sube.
 *
 * Nada se guarda sin que una persona lo haya mirado. La sugerencia automática
 * es una sugerencia: manda quien confirma.
 *
 * Por bloques, sin cerrar
 * -----------------------
 * Lo resuelto se sube en tandas mientras el panel sigue abierto, así se puede
 * subir lo que ya está y seguir trabajando sobre lo que falta. Con novecientas
 * filas de una sola vez la función del servidor se pasa de tiempo y quedan
 * empleados a medio importar sin que nadie sepa cuáles.
 */

const { ref, reactive, computed } = Vue;

import { leerXlsxComoObjetos, esExcel } from '../servicios/servicioExcel.js';
import { mejoresCoincidencias, bandaDe, normalizar } from '../nucleo/similitud.js';

/** Cuántas filas por envío. El servidor rechaza más de 250. */
const POR_BLOQUE = 100;

/** Marca del valor «crear este departamento» en el desplegable. */
export const CREAR_NUEVO = '__crear__';

/** Los encabezados que puede traer la columna del departamento. */
const COLUMNAS_DEPARTAMENTO = ['departamento', 'nombre_dpto', 'dpto'];
const COLUMNAS_DISTRITO = ['distrito'];

/** El primer encabezado presente en la fila, de los que se aceptan. */
function columnaPresente(fila, candidatas) {
  return candidatas.find((nombre) => fila[nombre] !== undefined) || candidatas[0];
}

export function usarConciliacion({
  obtenerDepartamentos,
  distritos,
  enviarBloque,
  crearDepartamento,
  notificar,
  alTerminar,
  // Quién lee el archivo. Se recibe en lugar de llamarlo directo para poder
  // probar la conciliación sin descomprimir un Excel de verdad, que es un
  // problema distinto y ya tiene sus propias pruebas.
  leerArchivo = leerXlsxComoObjetos
}) {
  const abierto = ref(false);
  const leyendo = ref(false);
  const subiendo = ref(false);
  const error = ref('');

  /** Las filas del archivo, tal como se leyeron. */
  const filas = ref([]);
  const columnaDepartamento = ref('departamento');

  /**
   * Un grupo por cada valor distinto del archivo.
   *
   * Es lo que hace manejable el problema: novecientas filas traen unos cuarenta
   * departamentos distintos, y decidir cuarenta veces es posible.
   */
  const gruposDepartamento = ref([]);
  const gruposDistrito = ref([]);

  const progreso = reactive({ enviadas: 0, total: 0 });
  const acumulado = reactive({ insertados: 0, actualizados: 0, errores: [] });

  /** Índices de fila ya subidos, para no repetirlos en el bloque siguiente. */
  const yaSubidas = ref(new Set());

  function reiniciar() {
    filas.value = [];
    gruposDepartamento.value = [];
    gruposDistrito.value = [];
    yaSubidas.value = new Set();
    progreso.enviadas = 0;
    progreso.total = 0;
    acumulado.insertados = 0;
    acumulado.actualizados = 0;
    acumulado.errores = [];
    error.value = '';
  }

  function cerrar() {
    abierto.value = false;
    reiniciar();
  }

  /**
   * Arma los grupos de un campo: un grupo por valor distinto, con su
   * sugerencia y las alternativas por si la sugerencia no es la correcta.
   */
  function agruparPor(campo, catalogo, nombreDe, idDe) {
    const porTexto = new Map();

    filas.value.forEach((fila, indice) => {
      const crudo = String(fila[campo] ?? '').trim();
      const clave = normalizar(crudo);

      if (!porTexto.has(clave)) {
        porTexto.set(clave, { texto: crudo, indices: [] });
      }
      porTexto.get(clave).indices.push(indice);
    });

    const grupos = [];
    let numero = 0;

    for (const { texto, indices } of porTexto.values()) {
      numero++;

      // Un valor vacío no se adivina: alguien tiene que elegirlo.
      if (!texto) {
        grupos.push({
          id: `g${numero}`,
          texto: '',
          vacio: true,
          cantidad: indices.length,
          indices,
          alternativas: [],
          puntaje: 0,
          banda: 'ninguna',
          elegido: '',
          seleccionado: false
        });
        continue;
      }

      const parecidos = mejoresCoincidencias(texto, catalogo, nombreDe);
      const mejor = parecidos[0] || { candidato: null, puntaje: 0 };
      const banda = bandaDe(mejor.puntaje);

      grupos.push({
        id: `g${numero}`,
        texto,
        vacio: false,
        cantidad: indices.length,
        indices,
        alternativas: parecidos
          .filter((p) => p.puntaje > 0.2)
          .map((p) => ({
            valor: idDe(p.candidato),
            nombre: nombreDe(p.candidato),
            puntaje: p.puntaje
          })),
        puntaje: mejor.puntaje,
        banda,
        /*
         * Las coincidencias seguras vienen preseleccionadas y las probables
         * también, porque teniendo cuarenta grupos obligar a elegir cuarenta
         * veces lo mismo que el sistema ya acertó no aporta nada. Lo que sí se
         * exige es confirmarlas: la cuenta de «por revisar» no baja hasta que
         * alguien las acepta.
         */
        elegido: banda === 'ninguna' ? '' : idDe(mejor.candidato),
        seleccionado: false
      });
    }

    // Primero lo que necesita atención: sin coincidencia, después las dudosas.
    const orden = { ninguna: 0, probable: 1, segura: 2 };
    return grupos.sort((a, b) => {
      const porBanda = orden[a.banda] - orden[b.banda];
      return porBanda !== 0 ? porBanda : b.cantidad - a.cantidad;
    });
  }

  /** Lee el archivo y prepara la revisión. */
  async function revisarArchivo(evento) {
    const archivo = evento.target.files && evento.target.files[0];
    // Se limpia enseguida para poder volver a elegir el mismo archivo si hubo
    // que corregirlo.
    evento.target.value = '';
    if (!archivo) return;

    if (!esExcel(archivo)) {
      notificar('El archivo tiene que ser un Excel (.xlsx).', 'error');
      return;
    }

    abierto.value = true;
    leyendo.value = true;
    reiniciar();

    try {
      const { filas: leidas } = await leerArchivo(archivo);

      if (leidas.length === 0) {
        throw new Error('El archivo no tiene filas de datos.');
      }

      filas.value = leidas;
      columnaDepartamento.value = columnaPresente(leidas[0], COLUMNAS_DEPARTAMENTO);

      const departamentos = (obtenerDepartamentos() || []).filter(
        (d) => d.activo === undefined || String(d.activo).toUpperCase() !== 'FALSE'
      );

      gruposDepartamento.value = agruparPor(
        columnaDepartamento.value,
        departamentos,
        (d) => d.nombre_dpto,
        (d) => d.id
      );

      gruposDistrito.value = agruparPor(
        columnaPresente(leidas[0], COLUMNAS_DISTRITO),
        distritos,
        (d) => d,
        (d) => d
      );

      progreso.total = leidas.length;
    } catch (fallo) {
      error.value = fallo.message || 'No se pudo leer el archivo.';
    } finally {
      leyendo.value = false;
    }
  }

  // --- Lo que decide quién revisa -------------------------------------------

  function elegir(grupo, valor) {
    grupo.elegido = valor;
    grupo.confirmado = true;
  }

  function alternarSeleccion(grupo) {
    grupo.seleccionado = !grupo.seleccionado;
  }

  function seleccionarTodos(grupos, valor) {
    for (const grupo of grupos) grupo.seleccionado = valor;
  }

  /** Aplica un mismo destino a todos los grupos marcados. */
  function aplicarASeleccionados(grupos, valor) {
    const marcados = grupos.filter((g) => g.seleccionado);
    if (marcados.length === 0) return;

    for (const grupo of marcados) {
      grupo.elegido = valor;
      grupo.confirmado = true;
      grupo.seleccionado = false;
    }

    notificar(
      `${marcados.length} ${marcados.length === 1 ? 'variante asignada' : 'variantes asignadas'}.`,
      'exito'
    );
  }

  /**
   * Da por buenas las coincidencias seguras.
   * Es el atajo que hace usable el caso real: de cuarenta grupos, treinta son
   * el mismo nombre con una tilde de diferencia.
   */
  function confirmarSeguras(grupos) {
    const seguras = grupos.filter((g) => g.banda === 'segura' && !g.confirmado && g.elegido);
    for (const grupo of seguras) grupo.confirmado = true;

    notificar(
      seguras.length === 0
        ? 'No hay coincidencias seguras sin confirmar.'
        : `${seguras.length} ${seguras.length === 1 ? 'coincidencia confirmada' : 'coincidencias confirmadas'}.`,
      seguras.length === 0 ? 'info' : 'exito'
    );
  }

  /** Crea en el catálogo el departamento que el archivo trae y no existe. */
  async function crearYAsignar(grupo) {
    if (!crearDepartamento || !grupo.texto) return;

    try {
      const creado = await crearDepartamento(grupo.texto);
      const id = creado && creado.id;
      if (!id) throw new Error('El departamento se creó pero no devolvió identificador.');

      // Queda disponible para los demás grupos, no solo para este.
      grupo.alternativas = [{ valor: id, nombre: grupo.texto, puntaje: 1 }, ...grupo.alternativas];
      grupo.elegido = id;
      grupo.confirmado = true;
      grupo.banda = 'segura';
      grupo.puntaje = 1;

      notificar(`Se creó el departamento "${grupo.texto}".`, 'exito');
    } catch (fallo) {
      notificar(fallo.message || 'No se pudo crear el departamento.', 'error');
    }
  }

  // --- Qué está listo y qué no ----------------------------------------------

  const resueltoPorFila = computed(() => {
    const departamento = new Map();
    const distrito = new Map();

    for (const grupo of gruposDepartamento.value) {
      const listo = Boolean(grupo.elegido) && grupo.confirmado === true;
      for (const indice of grupo.indices) departamento.set(indice, listo ? grupo.elegido : null);
    }

    for (const grupo of gruposDistrito.value) {
      const listo = Boolean(grupo.elegido) && grupo.confirmado === true;
      for (const indice of grupo.indices) distrito.set(indice, listo ? grupo.elegido : null);
    }

    return { departamento, distrito };
  });

  /** Filas con las dos columnas resueltas y todavía sin subir. */
  const filasListas = computed(() => {
    const { departamento, distrito } = resueltoPorFila.value;
    const subidas = yaSubidas.value;

    return filas.value
      .map((fila, indice) => ({ fila, indice }))
      .filter(({ indice }) =>
        !subidas.has(indice) &&
        departamento.get(indice) !== null &&
        distrito.get(indice) !== null
      );
  });

  const cuantasPendientes = computed(() => {
    const { departamento, distrito } = resueltoPorFila.value;
    const subidas = yaSubidas.value;

    return filas.value.filter((_, indice) =>
      !subidas.has(indice) &&
      (departamento.get(indice) === null || distrito.get(indice) === null)
    ).length;
  });

  const cuantasSubidas = computed(() => yaSubidas.value.size);

  const porRevisar = computed(() => ({
    departamentos: gruposDepartamento.value.filter((g) => !g.confirmado || !g.elegido).length,
    distritos: gruposDistrito.value.filter((g) => !g.confirmado || !g.elegido).length
  }));

  const todoResuelto = computed(() =>
    filas.value.length > 0 && cuantasPendientes.value === 0 && filasListas.value.length === 0
  );

  // --- Subir por bloques ------------------------------------------------------

  /**
   * Sube lo que está resuelto, en tandas, sin cerrar el panel.
   *
   * Que el panel siga abierto es lo importante: se sube lo que ya se decidió y
   * se sigue trabajando sobre lo que falta, sin volver a elegir el archivo ni
   * rehacer las decisiones tomadas.
   */
  async function subirListos() {
    const pendientes = filasListas.value;
    if (pendientes.length === 0 || subiendo.value) return;

    subiendo.value = true;
    error.value = '';
    progreso.enviadas = 0;
    progreso.total = pendientes.length;

    const { departamento, distrito } = resueltoPorFila.value;
    const columna = columnaDepartamento.value;

    try {
      for (let desde = 0; desde < pendientes.length; desde += POR_BLOQUE) {
        const bloque = pendientes.slice(desde, desde + POR_BLOQUE);

        const paraEnviar = bloque.map(({ fila, indice }) => ({
          ...fila,
          // El identificador en lugar del nombre: es lo que el servidor ya
          // sabe resolver sin adivinar, y deja el nombre escrito en la planilla
          // fuera de la ecuación.
          [columna]: departamento.get(indice),
          distrito: distrito.get(indice)
        }));

        const resultado = await enviarBloque(paraEnviar);

        acumulado.insertados += resultado.insertados || 0;
        acumulado.actualizados += resultado.actualizados || 0;
        acumulado.errores.push(...(resultado.errores || []));

        // Se marcan como subidas recién con la respuesta en la mano: si el
        // bloque falla, esas filas siguen disponibles para reintentar.
        const marcadas = new Set(yaSubidas.value);
        for (const { indice } of bloque) marcadas.add(indice);
        yaSubidas.value = marcadas;

        progreso.enviadas = Math.min(desde + bloque.length, pendientes.length);
      }

      const conError = acumulado.errores.length;
      notificar(
        `Subidas ${progreso.enviadas} filas: ${acumulado.insertados} nuevas, ` +
        `${acumulado.actualizados} actualizadas` +
        (conError ? `, ${conError} con problemas.` : '.'),
        conError ? 'alerta' : 'exito'
      );

      if (alTerminar) await alTerminar();
    } catch (fallo) {
      error.value = fallo.message || 'No se pudo subir el bloque.';
      notificar(error.value, 'error');
    } finally {
      subiendo.value = false;
    }
  }

  return reactive({
    abierto,
    leyendo,
    subiendo,
    error,
    filas,
    gruposDepartamento,
    gruposDistrito,
    progreso,
    acumulado,
    filasListas,
    cuantasPendientes,
    cuantasSubidas,
    porRevisar,
    todoResuelto,
    revisarArchivo,
    elegir,
    alternarSeleccion,
    seleccionarTodos,
    aplicarASeleccionados,
    confirmarSeguras,
    crearYAsignar,
    subirListos,
    cerrar
  });
}
