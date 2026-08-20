/**
 * Importación de Excel o CSV con barra de progreso.
 *
 * Empleados y departamentos comparten esta pantalla: se elige el archivo, se
 * manda al servidor, y el detalle que devuelve se va mostrando fila por fila.
 *
 * Ese desfile de filas es cosmético —el servidor ya terminó todo cuando
 * responde— pero sirve: da tiempo a leer qué se insertó y qué falló, en vez de
 * que aparezca un número final sin contexto.
 */

import { esExcel, xlsxComoCsv } from '../servicios/servicioExcel.js';

const { ref, reactive, computed } = Vue;

// Pausa entre filas del detalle. Suficiente para seguirlo con la vista sin
// aburrir cuando el archivo trae doscientas.
const PAUSA_ENTRE_FILAS = 45;

export function usarImportacionCsv({ notificar, alTerminar }) {
  const abierto = ref(false);
  const procesando = ref(false);
  const tipo = ref('');
  const progreso = ref(0);
  const detalle = ref([]);
  const resumen = ref(null);

  const totales = computed(() => {
    const filas = detalle.value;
    return {
      insertados: filas.filter((f) => f.accion === 'insertado').length,
      actualizados: filas.filter((f) => f.accion === 'actualizado').length,
      errores: filas.filter((f) => f.accion === 'error').length
    };
  });

  function reiniciar() {
    progreso.value = 0;
    detalle.value = [];
    resumen.value = null;
  }

  function cerrar() {
    abierto.value = false;
    reiniciar();
  }

  /**
   * @param {Event} evento         El change del <input type="file">.
   * @param {string} nombreTipo    'empleados' o 'departamentos', para el título.
   * @param {Function} enviarAlServidor  (textoCsv) => Promise con el resultado.
   */
  async function importar(evento, nombreTipo, enviarAlServidor) {
    const archivo = evento.target.files && evento.target.files[0];
    // Limpiamos el input enseguida para que se pueda volver a elegir el mismo
    // archivo si hizo falta corregirlo.
    evento.target.value = '';
    if (!archivo) return;

    tipo.value = nombreTipo;
    abierto.value = true;
    procesando.value = true;
    reiniciar();

    try {
      // El .xlsx se traduce a CSV acá mismo y el servidor sigue recibiendo lo
      // de siempre. Su importador ya está probado y no hace falta enseñarle a
      // descomprimir un ZIP dentro de una función serverless.
      const texto = esExcel(archivo) ? await xlsxComoCsv(archivo) : await archivo.text();

      if (!texto.trim()) {
        throw new Error('El archivo está vacío.');
      }

      const resultado = await enviarAlServidor(texto);

      procesando.value = false;

      // Desfile del detalle.
      const filas = Array.isArray(resultado.detalle) ? resultado.detalle : [];
      for (let i = 0; i < filas.length; i++) {
        detalle.value.push(filas[i]);
        progreso.value = Math.round(((i + 1) / filas.length) * 100);
        if (i < filas.length - 1) {
          await new Promise((seguir) => setTimeout(seguir, PAUSA_ENTRE_FILAS));
        }
      }

      progreso.value = 100;
      resumen.value = resultado;

      const conError = (resultado.errores || []).length;
      notificar(
        `Importación lista: ${resultado.insertados} nuevos, ${resultado.actualizados} actualizados` +
          (conError ? `, ${conError} con problemas.` : '.'),
        conError ? 'alerta' : 'exito'
      );

      if (alTerminar) await alTerminar();
    } catch (fallo) {
      procesando.value = false;
      resumen.value = { error: true };
      notificar(fallo.message || 'No se pudo importar el archivo.', 'error');
    }
  }

  // reactive() para que las plantillas escriban `importacion.progreso` y no
  // `importacion.progreso.value`. Ver la nota en usarCatalogo.js.
  return reactive({
    abierto,
    procesando,
    tipo,
    progreso,
    detalle,
    resumen,
    totales,
    importar,
    cerrar
  });
}
