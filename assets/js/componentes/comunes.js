/**
 * Componentes globales reutilizables.
 *
 * Son piezas que aparecían tal cual en siete u ocho vistas. En vez de copiar el
 * bloque de HTML en cada archivo, se registran una vez acá y las plantillas los
 * usan como una etiqueta más.
 *
 * Se definen con `template` en texto (no con archivos .vue) porque el proyecto
 * se sirve sin compilación: el runtime de Vue los compila al vuelo.
 */

import { OPCIONES_PAGINACION } from '../contenido/menu.js';

/**
 * Pie de tabla con el rango y los controles de página.
 *
 * Recibe el objeto que devuelve usarCatalogo, así que sabe leer solo el total,
 * la página actual y cuántas páginas hay.
 */
const PaginacionTabla = {
  name: 'PaginacionTabla',
  props: {
    catalogo: { type: Object, required: true }
  },
  setup() {
    return { OPCIONES_PAGINACION };
  },
  template: `
    <div v-if="catalogo.filtrados.length > 0"
         class="flex flex-col gap-3 border-t border-gray-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">

      <div class="flex items-center gap-2 text-theme-sm text-gray-500 dark:text-gray-400">
        <span>Mostrando</span>
        <select v-model="catalogo.filasPorPagina"
                class="campo-select h-9 w-auto py-0 pl-3 text-theme-sm"
                aria-label="Filas por página">
          <option v-for="opcion in OPCIONES_PAGINACION" :key="opcion" :value="opcion">{{ opcion }}</option>
        </select>
        <span class="hidden sm:inline">{{ catalogo.rangoTexto }}</span>
      </div>

      <div v-if="catalogo.totalPaginas > 1" class="flex items-center gap-1">
        <button type="button" class="boton-icono"
                :disabled="catalogo.pagina === 1"
                @click="catalogo.irA(1)" aria-label="Primera página">
          <i class="fa-solid fa-angles-left"></i>
        </button>
        <button type="button" class="boton-icono"
                :disabled="catalogo.pagina === 1"
                @click="catalogo.irA(catalogo.pagina - 1)" aria-label="Página anterior">
          <i class="fa-solid fa-angle-left"></i>
        </button>

        <span class="px-3 text-theme-sm text-gray-600 dark:text-gray-400">
          {{ catalogo.pagina }} / {{ catalogo.totalPaginas }}
        </span>

        <button type="button" class="boton-icono"
                :disabled="catalogo.pagina === catalogo.totalPaginas"
                @click="catalogo.irA(catalogo.pagina + 1)" aria-label="Página siguiente">
          <i class="fa-solid fa-angle-right"></i>
        </button>
        <button type="button" class="boton-icono"
                :disabled="catalogo.pagina === catalogo.totalPaginas"
                @click="catalogo.irA(catalogo.totalPaginas)" aria-label="Última página">
          <i class="fa-solid fa-angles-right"></i>
        </button>
      </div>
    </div>
  `
};

/**
 * Mensaje para cuando una tabla o lista no tiene nada que mostrar.
 * Distingue "todavía no hay datos" de "tu búsqueda no encontró nada", que son
 * dos situaciones distintas y pedían mensajes distintos.
 */
const EstadoVacio = {
  name: 'EstadoVacio',
  props: {
    icono: { type: String, default: 'fa-inbox' },
    titulo: { type: String, default: 'Todavía no hay nada aquí' },
    descripcion: { type: String, default: '' },
    buscando: { type: Boolean, default: false }
  },
  template: `
    <div class="px-5 py-12 text-center">
      <i class="fa-solid mb-3 block text-4xl text-gray-300 dark:text-gray-700"
         :class="buscando ? 'fa-magnifying-glass' : icono"></i>
      <p class="text-theme-sm font-medium text-gray-600 dark:text-gray-400">
        {{ buscando ? 'Sin resultados para esa búsqueda' : titulo }}
      </p>
      <p v-if="descripcion && !buscando" class="mt-1 text-theme-sm text-gray-400">{{ descripcion }}</p>
      <p v-if="buscando" class="mt-1 text-theme-sm text-gray-400">Prueba con otro término.</p>
    </div>
  `
};

/**
 * Barra superior de una vista de catálogo: buscador a la izquierda y las
 * acciones a la derecha, que van por slot para que cada vista ponga las suyas.
 */
const BarraCatalogo = {
  name: 'BarraCatalogo',
  props: {
    catalogo: { type: Object, required: true },
    titulo: { type: String, required: true },
    marcador: { type: String, default: 'Buscar…' }
  },
  template: `
    <div class="tarjeta-encabezado">
      <div>
        <h2 class="tarjeta-titulo">{{ titulo }}</h2>
        <p class="tarjeta-subtitulo">{{ catalogo.lista.length }} registros en total</p>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-sm text-gray-400"></i>
          <input v-model="catalogo.busqueda"
                 type="search"
                 class="campo w-full pl-10 sm:w-64"
                 :placeholder="marcador" />
        </div>
        <slot name="acciones"></slot>
      </div>
    </div>
  `
};

/** Interruptor de encendido/apagado accesible. */
const InterruptorSimple = {
  name: 'InterruptorSimple',
  props: {
    modelValue: { type: Boolean, default: false },
    etiqueta: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  template: `
    <button type="button"
            role="switch"
            :aria-checked="modelValue"
            :aria-label="etiqueta"
            class="interruptor"
            :class="{ 'interruptor-activo': modelValue }"
            @click="$emit('update:modelValue', !modelValue)"></button>
  `
};

/** Los registra todos de una vez en la instancia de la aplicación. */
export function registrarComponentes(aplicacion) {
  aplicacion.component('PaginacionTabla', PaginacionTabla);
  aplicacion.component('EstadoVacio', EstadoVacio);
  aplicacion.component('BarraCatalogo', BarraCatalogo);
  aplicacion.component('InterruptorSimple', InterruptorSimple);
}
