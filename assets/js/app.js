/**
 * Punto de entrada de la aplicación.
 *
 * Este archivo ensambla: carga las plantillas, arma el estado a partir de los
 * composables y monta Vue. La lógica de verdad vive en `nucleo/`, `servicios/`
 * y `composables/`; acá solo se conectan las piezas y se exponen a las vistas.
 *
 * Antes esto era un solo archivo de 65 KB con todo adentro: estado, llamadas
 * HTTP, canvas, IndexedDB y la lógica de las catorce pantallas. Cualquier
 * cambio implicaba leerlo entero para no romper algo tres pantallas más abajo.
 */

import { cargarPlantillas } from './nucleo/cargadorVistas.js';
import { almacenSesion } from './nucleo/almacenSesion.js';
import { http } from './nucleo/clienteHttp.js';
import { tema } from './nucleo/tema.js';
import { marca, contrasteConBlanco, PASOS as PASOS_MARCA } from './nucleo/marca.js';
import * as formato from './nucleo/formato.js';

import { api } from './servicios/servicioApi.js';
import { servicioInvitacion } from './servicios/servicioInvitacion.js';
import { descargarXlsx } from './servicios/servicioExcel.js';
import { urlQr, descargarQr, enlaceInvitacion } from './nucleo/qr.js';

import { usarNotificaciones } from './composables/usarNotificaciones.js';
import { usarCatalogo } from './composables/usarCatalogo.js';
import { usarPermisos } from './composables/usarPermisos.js';
import { usarEscanerQr } from './composables/usarEscanerQr.js';
import { usarImportacionCsv } from './composables/usarImportacionCsv.js';
import { usarConciliacion } from './composables/usarConciliacion.js';
import { usarMapa, enlaceComoLlegar } from './composables/usarMapa.js';
import { usarDesafio } from './composables/usarDesafio.js';
import { usarConfeti } from './composables/usarConfeti.js';
import {
  construirModelo, bloquesDe, normalizar as normalizarDiseno,
  esLaDeSiempre, POR_DEFECTO, DISPOSICIONES
} from './nucleo/disenoInvitacion.js';
import { usarInstalacionPwa } from './composables/usarInstalacionPwa.js';
import { usarPendientes } from './composables/usarPendientes.js';
import { usarSincronizacion } from './composables/usarSincronizacion.js';
import { usarBuscadorPersonas } from './composables/usarBuscadorPersonas.js';
import { usarSorteos } from './composables/usarSorteos.js';
import { usarManual } from './composables/usarManual.js';
import { animarDiagrama, cargarAnime } from './composables/usarAnimacionDiagrama.js';
import { usarLectura } from './composables/usarLectura.js';

import { MENU, DISTRITOS } from './contenido/menu.js';
import { registrarComponentes } from './componentes/comunes.js';

const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;

/** Actualiza el texto de la pantalla de carga inicial. */
function avisarCarga(texto) {
  const elemento = document.getElementById('pantalla-carga-texto');
  if (elemento) elemento.textContent = texto;
}

/** Muestra un error fatal cuando ni siquiera se pudo arrancar. */
function mostrarErrorFatal(mensaje) {
  const pantalla = document.getElementById('pantalla-carga');
  if (!pantalla) return;

  pantalla.innerHTML = `
    <div style="max-width:460px;padding:32px;text-align:center;font-family:Outfit,sans-serif">
      <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#fef3f2;
                  display:flex;align-items:center;justify-content:center;font-size:24px;color:#d92d20">!</div>
      <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#101828">No se pudo iniciar el sistema</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#667085">${mensaje}</p>
      <button onclick="location.reload()"
              style="padding:10px 20px;border:none;border-radius:8px;background:#465fff;color:#fff;
                     font-family:inherit;font-size:14px;font-weight:500;cursor:pointer">
        Reintentar
      </button>
    </div>`;
}

async function iniciar() {
  // --- 1. Cargar las plantillas ------------------------------------------
  let plantilla;
  try {
    plantilla = await cargarPlantillas('aplicacion.html', '/assets/views/', avisarCarga);
  } catch (fallo) {
    console.error('[app] Error cargando plantillas:', fallo);
    mostrarErrorFatal(fallo.message || 'No se pudieron cargar las vistas del sistema.');
    return;
  }

  const contenedor = document.getElementById('app');
  contenedor.innerHTML = plantilla;

  // --- 2. Definir la aplicación ------------------------------------------
  const aplicacion = createApp({
    setup() {
      // ---- Estado general ----
      const cargando = ref(true);
      const vista = ref('scanner');
      const modoPublico = ref(false);
      const anchoVentana = ref(window.innerWidth);

      const sesion = reactive({
        token: null, usuario: null, correo: null,
        nombreMostrar: null, rol: null, rolId: null,
        // Cuando la sesión es prestada, acá va quién la abrió.
        impersonadoPor: null
      });

      // El sidebar arranca abierto en escritorio y cerrado en móvil, donde
      // flota por encima del contenido.
      const sidebarAbierto = ref(window.innerWidth >= 1024);
      const sidebarMovil = ref(false);
      const menuUsuarioAbierto = ref(false);

      // La vista de usuarios tiene dos pestañas: cuentas y roles.
      const pestanaUsuarios = ref('usuarios');

      const esMovil = computed(() => anchoVentana.value < 1024);
      const haySesion = computed(() => Boolean(sesion.token));

      /**
       * ¿La barra lateral muestra las etiquetas de las vistas?
       *
       * En móvil el estado "colapsado a iconos" no tiene sentido: el panel se
       * desliza por encima de todo, así que o se ve entero o no se ve. Como
       * `sidebarAbierto` arranca en false debajo de 1024 px, el panel se abría
       * con 90 px de ancho y solo los iconos, y los tooltips (que se posicionan
       * por fuera del panel) empujaban el ancho del documento y provocaban
       * scroll horizontal con los nombres fuera de la pantalla.
       */
      const sidebarExpandido = computed(() => esMovil.value || sidebarAbierto.value);

      // ---- Notificaciones ----
      const {
        notificaciones, cerrarNotificacion, notificar,
        notificarExito, notificarError, notificarAlerta, notificarInfo
      } = usarNotificaciones();

      // ---- Tema ----
      // `tienePreferenciaPropia` se declara más abajo, junto al resto de la
      // configuración. Acá solo se lee, y eso ocurre recién cuando alguien hace
      // clic, con setup() ya terminado.
      const modoOscuro = ref(tema.esOscuro());
      function alternarTema() {
        modoOscuro.value = tema.alternar() === 'oscuro';
        // Tocar el botón es elegir: desde ahora este dispositivo deja de seguir
        // al tema institucional hasta que se le diga lo contrario.
        tienePreferenciaPropia.value = true;
      }

      // ---- Instalación en el dispositivo ----
      const pwa = usarInstalacionPwa({ notificar });

      // ---- Catálogos que llegan en el bundle inicial ----
      const asistencias = ref([]);
      const permisosCargados = ref([]);
      const eventoActivo = ref(null);
      const resumen = reactive({ total: 0 });

      // Las asistencias no usan usarCatalogo porque son de solo lectura: no
      // tienen formulario ni modal, solo listado y búsqueda.
      const busquedaAsistencias = ref('');
      const asistenciasFiltradas = computed(() => {
        const termino = busquedaAsistencias.value.trim();
        if (!termino) return asistencias.value;
        return asistencias.value.filter(
          (fila) =>
            formato.coincide(fila.empleadoNombre, termino) ||
            formato.coincide(fila.dui, termino)
        );
      });

      // ---- Sesión ----
      const formularioLogin = reactive({ usuario: '', password: '' });
      const errorLogin = ref('');
      const entrando = ref(false);
      const verPassword = ref(false);
      const modalCierreAbierto = ref(false);

      // ---- Cambio de la contraseña propia ----
      const cambioClave = reactive({
        abierto: false,
        actual: '',
        nueva: '',
        repetida: '',
        verClaves: false,
        guardando: false,
        error: '',
        // Se enciende cuando el login avisa que la clave sigue siendo temporal.
        esObligatorio: false
      });

      function abrirCambioClave(obligatorio = false) {
        Object.assign(cambioClave, {
          abierto: true,
          actual: '',
          nueva: '',
          repetida: '',
          verClaves: false,
          error: '',
          esObligatorio: obligatorio
        });
        menuUsuarioAbierto.value = false;
      }

      async function guardarClaveNueva() {
        cambioClave.error = '';

        if (cambioClave.nueva !== cambioClave.repetida) {
          cambioClave.error = 'Las dos contraseñas nuevas no coinciden.';
          return;
        }
        if (cambioClave.nueva.length < 8) {
          cambioClave.error = 'La contraseña nueva debe tener al menos 8 caracteres.';
          return;
        }

        cambioClave.guardando = true;
        try {
          await api.usuarios.cambiarMiClave(cambioClave.actual, cambioClave.nueva);
          cambioClave.abierto = false;
          cambioClave.esObligatorio = false;
          notificarExito('Tu contraseña quedó actualizada.');
          // Recargamos para que la lista de usuarios refleje que ya no es temporal.
          await recargarCatalogos();
        } catch (fallo) {
          cambioClave.error = fallo.message || 'No se pudo cambiar la contraseña.';
        } finally {
          cambioClave.guardando = false;
        }
      }

      // =====================================================================
      // Catálogos
      //
      // Cada uno son cuatro líneas gracias a usarCatalogo: trae lista,
      // búsqueda, paginación, modal, formulario y guardado.
      // =====================================================================

      const departamentos = usarCatalogo({
        alGuardar: (datos) => api.departamentos.guardar(datos),
        formularioVacio: { id: null, codDpto: '', nombreDpto: '', activo: 'TRUE' },
        alAbrir: (registro) => ({
          id: registro.id,
          codDpto: registro.cod_dpto || '',
          nombreDpto: registro.nombre_dpto || '',
          activo: String(registro.activo || 'TRUE').toUpperCase()
        }),
        camposBusqueda: ['nombre_dpto', 'cod_dpto']
      });

      const empleados = usarCatalogo({
        alGuardar: (datos) => api.empleados.guardar(datos),
        formularioVacio: {
          id: null, distrito: '', dpto: '', cargo: '', nombres: '', apellidos: '',
          fechaNacimiento: '', telefono: '', correo: '', dui: '', codigo: '', activo: 'TRUE'
        },
        alAbrir: (registro) => ({
          id: registro.id,
          distrito: registro.distrito || '',
          dpto: registro.dpto || '',
          cargo: registro.cargo || '',
          nombres: registro.nombres || '',
          apellidos: registro.apellidos || '',
          fechaNacimiento: formato.aFechaIso(registro.fecha_nacimiento),
          telefono: registro.telefono || '',
          correo: registro.correo || '',
          dui: formato.formatearDui(registro.dui),
          codigo: registro.codigo || '',
          activo: String(registro.activo || 'TRUE').toUpperCase()
        }),
        camposBusqueda: ['nombres', 'apellidos', 'dui', 'codigo', 'cargo'],
        porPagina: 10
      });

      const premios = usarCatalogo({
        alGuardar: (datos) => api.premios.guardar(datos),
        formularioVacio: { id: null, nombre: '', descripcion: '', cantidad: 1, activo: 'TRUE' },
        camposBusqueda: ['nombre', 'descripcion']
      });

      const usuarios = usarCatalogo({
        alGuardar: (datos) => api.usuarios.guardar(datos),
        formularioVacio: {
          id: null, empleado: '', telefono: '', correo: '',
          usuario: '', passwordPlano: '', rol: '', activo: 'TRUE'
        },
        alAbrir: (registro) => ({
          id: registro.id,
          empleado: registro.empleadoId || '',
          telefono: registro.telefono || '',
          correo: registro.correo || '',
          usuario: registro.usuario || '',
          passwordPlano: '',   // nunca se precarga: si se deja vacío, no se cambia
          rol: registro.rolId || '',
          activo: String(registro.activo || 'TRUE').toUpperCase()
        }),
        camposBusqueda: ['usuario', 'correo', 'empleadoNombre', 'rolNombre']
      });

      const roles = usarCatalogo({
        alGuardar: (datos) => api.roles.guardar(datos),
        formularioVacio: { id: null, nombreRol: '', descripcion: '', activo: 'TRUE' },
        alAbrir: (registro) => ({
          id: registro.id,
          nombreRol: registro.nombre_rol || '',
          descripcion: registro.descripcion || '',
          activo: String(registro.activo || 'TRUE').toUpperCase()
        }),
        camposBusqueda: ['nombre_rol', 'descripcion']
      });

      const eventos = usarCatalogo({
        alGuardar: (datos) => api.eventos.guardar(datos),
        /*
         * `ubicacion` es el nombre del lugar y sigue siendo texto libre: es lo
         * que se lee en la invitación. Las coordenadas van aparte, porque son
         * para llegar, no para leer.
         */
        formularioVacio: {
          id: null, nombre: '', fechaEvento: '', ubicacion: '',
          latitud: '', longitud: '', activo: 'FALSE'
        },
        alAbrir: (registro) => ({
          id: registro.id,
          nombre: registro.nombre || '',
          fechaEvento: registro.fecha_evento || '',
          ubicacion: registro.ubicacion || '',
          latitud: registro.latitud ?? '',
          longitud: registro.longitud ?? '',
          activo: String(registro.activo || 'FALSE').toUpperCase()
        }),
        camposBusqueda: ['nombre', 'ubicacion']
      });

      /*
       * Los sorteos ya no son un catálogo como los demás.
       *
       * usarCatalogo da lista + búsqueda + paginación + un modal de un solo
       * formulario, y eso alcanzaba cuando un sorteo era un premio. Ahora cada
       * sorteo lleva una lista de premios con cantidades, se extrae en vivo y
       * tiene estado propio, así que la parte de operación vive en usarSorteos
       * y acá queda solo lo que la tabla de administración necesita.
       */
      const sorteosCatalogo = usarCatalogo({
        alGuardar: (datos) => api.sorteos.guardar(datos),
        formularioVacio: { id: null, nombre: '' },
        camposBusqueda: ['nombre']
      });

      // ---- Permisos ----
      const permisos = usarPermisos({
        sesion,
        obtenerPermisos: () => permisosCargados.value,
        obtenerRoles: () => roles.lista,
        notificar
      });

      /*
       * El manual de usuario.
       *
       * Antes de esto la ayuda era un modal con cuatro pasos por pantalla que
       * se cerraba al leerlo. Ahora es una pantalla propia, con el contenido
       * en dos registros —breve para recordar, detallado para entender— y
       * lectura en voz alta.
       *
       * El botón de ayuda del encabezado no desapareció: abre el manual en el
       * capítulo de la pantalla donde se estaba, así que la ayuda contextual
       * se conserva y además se puede seguir leyendo.
       */
      /*
       * El diseño de la invitación, en Configuración.
       *
       * Vive acá y no en el formulario del evento a propósito: el evento lo
       * administra Recursos Humanos —fecha, lugar, activarlo— y el diseño lo
       * configura quien mantiene el sistema. Meterlo en el mismo formulario le
       * ponía enfrente a RH una pantalla de colores y disposiciones que no le
       * toca decidir.
       */
      /*
       * Las pestañas de Configuración.
       *
       * La pantalla junta cosas sin relación entre sí, y en una sola columna
       * había que desplazarse por lo que no se estaba buscando.
       */
      const PESTANAS_CONFIG = [
        { id: 'general', etiqueta: 'General', icono: 'fa-sliders' },
        { id: 'apariencia', etiqueta: 'Apariencia', icono: 'fa-palette' },
        { id: 'invitacion', etiqueta: 'Invitación', icono: 'fa-envelope-open-text' },
        { id: 'mantenimiento', etiqueta: 'Mantenimiento', icono: 'fa-screwdriver-wrench' }
      ];

      const pestanaConfig = ref('general');

      const disenoInvitacion = reactive({
        evento: '',
        config: { ...POR_DEFECTO },
        guardando: false,
        aviso: ''
      });

      /** Al elegir un evento se carga su diseño, o el de siempre si no tiene. */
      function elegirEventoDelDiseno(id) {
        disenoInvitacion.evento = id || '';
        disenoInvitacion.aviso = '';

        const evento = eventos.lista.find((fila) => fila.id === id);
        disenoInvitacion.config = normalizarDiseno(evento ? evento.invitacion_config : null);
      }

      /*
       * La vista previa usa datos de muestra y no los de un empleado real:
       * quien configura el diseño está en el escritorio, sin nadie a mano, y lo
       * que necesita ver es cómo quedan los colores y los textos.
       */
      const vistaPreviaInvitacion = computed(() => {
        const evento = eventos.lista.find((fila) => fila.id === disenoInvitacion.evento);

        return construirModelo(disenoInvitacion.config, {
          evento: evento ? evento.nombre : 'Nombre del evento',
          fecha: evento && evento.fecha_evento
            ? formato.formatearFechaLarga(evento.fecha_evento)
            : '',
          ubicacion: evento ? evento.ubicacion || '' : '',
          nombre: 'Nombre del Empleado',
          dui: '01234567-8',
          urlQr: ''
        });
      });

      const bloquesPrevia = computed(() => bloquesDe(vistaPreviaInvitacion.value, 'evento'));

      /** Vuelve el diseño al de siempre. */
      function reiniciarDiseno() {
        disenoInvitacion.config = { ...POR_DEFECTO };
      }

      /**
       * Copia el diseño de otro evento.
       *
       * Es lo que reemplaza a tener un catálogo de plantillas: con cuatro o
       * cinco fiestas al año, «como la del año pasado» resuelve el caso.
       */
      function copiarDisenoDe(idEvento) {
        const otro = eventos.lista.find((fila) => fila.id === idEvento);
        if (!otro) return;
        disenoInvitacion.config = normalizarDiseno(otro.invitacion_config);
      }

      /**
       * Guarda el diseño del evento elegido.
       *
       * Si quedó igual al de siempre se guarda como nada, y así se distingue en
       * la base «este evento no tiene diseño propio» de «tiene uno que resultó
       * ser el de siempre». Lo segundo no le sirve a nadie y ocupa lugar.
       */
      async function guardarDisenoInvitacion() {
        if (!disenoInvitacion.evento) return;

        disenoInvitacion.guardando = true;
        disenoInvitacion.aviso = '';

        try {
          const aGuardar = esLaDeSiempre(disenoInvitacion.config)
            ? null
            : normalizarDiseno(disenoInvitacion.config);

          const actualizado = await api.eventos.guardarDiseno(disenoInvitacion.evento, aGuardar);

          // La lista en memoria tiene que reflejarlo, o «copiar de otro evento»
          // seguiría ofreciendo el diseño viejo hasta recargar la pantalla.
          const enLista = eventos.lista.find((fila) => fila.id === disenoInvitacion.evento);
          if (enLista) enLista.invitacion_config = actualizado.invitacion_config ?? null;

          disenoInvitacion.aviso = 'Diseño guardado.';
          notificarExito('Diseño de la invitación guardado.');
        } catch (fallo) {
          disenoInvitacion.aviso = '';
          notificarError(fallo.message || 'No se pudo guardar el diseño.');
        } finally {
          disenoInvitacion.guardando = false;
        }
      }

      const manual = usarManual({
        puedeVer: (modulo) => permisos.tienePermiso(modulo, 'Ver'),
        // El diagrama se dibuja apilado cuando no hay ancho para el horizontal.
        // Va como función y no como valor para que se recalcule al girar el
        // teléfono, que cambia `esMovil` sin recargar nada.
        esAngosto: () => esMovil.value
      });

      /*
       * El confeti del cartel de ganadores.
       *
       * Se lanza al aparecer un ganador y se corta al cerrar el cartel. Si no
       * se cortara, seguiria corriendo detras de la pantalla siguiente: son
       * cuadros de animacion gastados en algo que ya nadie ve, y en la maquina
       * del proyector eso se nota.
       */
      const confeti = usarConfeti();

      /** Cierra el cartel y corta el confeti. */
      function cerrarCartel() {
        confeti.detener();
        sorteos.limpiarCartel();
      }

      /*
       * Al aparecer un ganador cae el confeti.
       *
       * Se espera a `nextTick` porque el lienzo entra con el modal: antes de
       * que Vue lo dibuje, `getElementById` no encuentra nada y el confeti no
       * saldria nunca.
       */
      watch(() => sorteos.ultimaExtraccion, async (extraccion) => {
        if (!extraccion) { confeti.detener(); return; }
        await nextTick();
        confeti.lanzar('confeti-ganador');
      });

      const lectura = usarLectura();
      const opcionesVozAbiertas = ref(false);
      // En pantalla angosta el índice ocupa toda la altura, así que aparece
      // solo cuando se lo pide.
      const indiceManualAbierto = ref(false);

      /*
       * El manual es una capa encima de la aplicación, no una pantalla más.
       *
       * Se entra a consultar algo y se vuelve a lo que uno estaba haciendo. Si
       * fuera una vista del menú, cerrarla sería elegir otra del menú, y no
       * necesariamente la de donde se venía.
       */
      const manualAbierto = ref(false);

      /*
       * Las animaciones del diagrama de la lámina que se está viendo.
       *
       * Se guarda para poder frenarlas. El recorrido del punto va en bucle, así
       * que sin esto cada lámina visitada dejaría una animación corriendo para
       * siempre: en un teléfono, batería gastada en dibujos que ya nadie mira.
       */
      let animacionDiagrama = null;

      function frenarDiagrama() {
        if (animacionDiagrama) {
          animacionDiagrama.detener();
          animacionDiagrama = null;
        }
      }

      /**
       * Anima el diagrama de la lámina actual, si Anime.js está disponible.
       *
       * Se espera a `nextTick` porque el SVG entra por `v-html` y hasta que Vue
       * no termina de dibujar no hay nada que animar.
       *
       * Si la librería no está —sin señal la primera vez, o movimiento reducido
       * en el sistema— esto no hace nada y quedan las animaciones de CSS, que
       * alcanzan para entender el diagrama.
       */
      async function animarDiagramaActual() {
        frenarDiagrama();
        if (!manualAbierto.value || !manual.diagrama) return;

        await nextTick();
        const marco = document.querySelector('.manual-capa .diagrama-marco');
        if (!marco) return;

        const animacion = await animarDiagrama(marco);

        // Mientras se cargaba la librería pudo cambiar la lámina o cerrarse el
        // manual. Si ya no corresponde, se frena en el acto.
        if (!manualAbierto.value) { if (animacion) animacion.detener(); return; }
        animacionDiagrama = animacion;
      }

      watch(
        () => [manualAbierto.value, manual.capitulo && manual.capitulo.id, manual.paso],
        () => { animarDiagramaActual(); }
      );

      function abrirManual(capitulo = null) {
        if (capitulo) manual.abrirCapitulo(capitulo);
        // Se pide la librería apenas se abre, para que esté lista antes de que
        // alguien llegue a la primera lámina con diagrama.
        cargarAnime();
        manualAbierto.value = true;
        indiceManualAbierto.value = false;
        // La barra lateral del teléfono queda debajo de la capa; si se deja
        // abierta, al cerrar el manual reaparece sin que nadie la haya pedido.
        sidebarMovil.value = false;
      }

      function cerrarManual() {
        frenarDiagrama();
        lectura.detener();
        lecturaContinua.value = false;
        manualAbierto.value = false;
        indiceManualAbierto.value = false;
        opcionesVozAbiertas.value = false;
      }

      function abrirIndiceManual() {
        indiceManualAbierto.value = true;
      }

      /** Cierra el manual y lleva a la pantalla que el capítulo explica. */
      function irALaPantalla(destino) {
        cerrarManual();
        cambiarVista(destino);
      }

      /** El botón de ayuda: manual abierto en lo que corresponde a esta pantalla. */
      function abrirGuia() {
        manual.abrirDeVista(vista.value);
        abrirManual();
      }

      /**
       * Cambia de capítulo y sube la pantalla.
       *
       * Sin el scroll, al elegir un capítulo del índice queda a mitad del
       * anterior y parece que no pasó nada.
       */
      function irAlCapitulo(id) {
        manual.abrirCapitulo(id);
        indiceManualAbierto.value = false;
        // Saltar de capítulo mientras se escucha también sigue leyendo: quien
        // eligió otro capítulo lo eligió para oírlo.
        seguirLeyendo();
      }

      /*
       * Deslizar para cambiar de diapositiva.
       *
       * En un teléfono, un tutorial que solo avanza con botones se siente
       * viejo: la mano ya viene entrenada para deslizar. Los botones se
       * conservan igual, porque el gesto no se descubre solo.
       */
      const gesto = { x: 0, y: 0, activo: false };

      function alTocarInicio(evento) {
        const toque = evento.changedTouches && evento.changedTouches[0];
        if (!toque) return;
        gesto.x = toque.clientX;
        gesto.y = toque.clientY;
        gesto.activo = true;
      }

      function alTocarFin(evento) {
        if (!gesto.activo) return;
        gesto.activo = false;

        const toque = evento.changedTouches && evento.changedTouches[0];
        if (!toque) return;

        const dx = toque.clientX - gesto.x;
        const dy = toque.clientY - gesto.y;

        // Tiene que ser claramente horizontal y de un largo mínimo: si no,
        // desplazarse hacia abajo por la pantalla cambiaría de diapositiva.
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

        if (dx < 0) pasoSiguienteManual();
        else pasoAnteriorManual();
      }

      /*
       * Cambiar de diapositiva corta lo que suena —era de la anterior— y
       * retoma en la nueva si se estaba escuchando.
       */
      function irAPasoManual(indice) {
        manual.irAPaso(indice);
        seguirLeyendo();
      }

      function pasoSiguienteManual() {
        if (manual.esUltimoPaso) return;
        manual.pasoSiguiente();
        seguirLeyendo();
      }

      function pasoAnteriorManual() {
        if (manual.esPrimerPaso) return;
        manual.pasoAnterior();
        seguirLeyendo();
      }

      /*
       * ¿La voz tiene que seguir al pasar de diapositiva?
       *
       * Quien está escuchando el manual con las manos ocupadas pulsa
       * «Siguiente» y espera que siga leyendo; tener que pulsar el altavoz de
       * nuevo en cada pantalla arruina la razón de escucharlo. Pero quien lo
       * detuvo a propósito no quiere que vuelva solo.
       *
       * La diferencia es esa: se apaga solo cuando alguien la detiene, no
       * cuando la lectura termina por su cuenta.
       */
      const lecturaContinua = ref(false);

      /** El texto de la diapositiva que está a la vista, como se escucha. */
      function textoDeLaDiapositiva() {
        const actual = manual.diapositiva;
        if (!actual) return null;

        let texto = actual.titulo + '. ';
        if (actual.tipo === 'consejos') {
          texto += (actual.puntos || []).join(' ');
        } else if (actual.tipo === 'problemas') {
          texto += (actual.casos || []).map((c) => `${c.sintoma} ${c.solucion}`).join(' ');
        } else {
          texto += actual.texto || '';
        }

        return { texto, id: actual.id };
      }

      /**
       * Empieza o detiene la lectura de la diapositiva a la vista.
       *
       * En el teléfono no tiene sentido leer el capítulo entero de corrido: se
       * ve una cosa por vez, y la voz se iría de la pantalla que se mira.
       */
      function escucharDiapositiva() {
        if (lectura.estado.leyendo) {
          // Detenida a mano: no vuelve sola en la siguiente.
          lecturaContinua.value = false;
          lectura.detener();
          return;
        }

        const actual = textoDeLaDiapositiva();
        if (!actual) return;

        lecturaContinua.value = true;
        lectura.leer(actual.texto, actual.id);
      }

      /**
       * Retoma la lectura en la diapositiva nueva, si venía leyendo.
       *
       * Se corta primero lo que suena: es de la diapositiva anterior y ya no
       * corresponde a lo que se está viendo.
       */
      function seguirLeyendo() {
        lectura.detener();
        if (!lecturaContinua.value) return;

        const actual = textoDeLaDiapositiva();
        if (actual) lectura.leer(actual.texto, actual.id);
      }

      // =====================================================================
      // Carga de catálogos
      // =====================================================================

      function poblarCatalogos(bundle) {
        if (!bundle) return;

        empleados.lista = bundle.empleados || [];
        departamentos.lista = bundle.departamentos || [];
        premios.lista = bundle.premios || [];
        roles.lista = bundle.roles || [];
        usuarios.lista = bundle.usuarios || [];
        eventos.lista = bundle.eventos || [];
        // Los sorteos NO salen del bundle: necesitan su lista de premios y el
        // conteo de lo repartido, que el bundle no trae. Los pide usarSorteos.
        sorteosCatalogo.lista = bundle.sorteos || [];

        permisosCargados.value = bundle.permisos || [];
        asistencias.value = bundle.asistencias || [];
        eventoActivo.value =
          bundle.eventoActivo ||
          (bundle.eventos || []).find((evento) => formato.esVerdadero(evento.activo)) ||
          null;
        resumen.total = bundle.resumen?.total ?? asistencias.value.length;

        // La lista viene entera y al día, así que el sincronizador arranca
        // desde la asistencia más reciente que acaba de llegar.
        sincronizacion.reiniciar(asistencias.value[0]?.fechaHora || null);

        permisos.seleccionarPrimerRol();
      }

      async function recargarCatalogos() {
        if (!sesion.token) return;
        try {
          poblarCatalogos(await api.sesion.catalogos());
        } catch (fallo) {
          if (!fallo.esSesionVencida) {
            console.error('[app] No se pudieron recargar los catálogos:', fallo);
          }
        }
      }

      // =====================================================================
      // Autenticación
      // =====================================================================

      async function iniciarSesion() {
        errorLogin.value = '';
        entrando.value = true;

        try {
          const respuesta = await api.sesion.iniciar(
            formularioLogin.usuario.trim(),
            formularioLogin.password
          );

          Object.assign(sesion, {
            token: respuesta.token,
            usuario: respuesta.usuario,
            correo: respuesta.correo,
            nombreMostrar: respuesta.nombreMostrar,
            rol: respuesta.rol,
            rolId: respuesta.rolId,
            impersonadoPor: null
          });
          almacenSesion.guardar(respuesta);
          poblarCatalogos(respuesta.datosIniciales);

          formularioLogin.password = '';
          vista.value = 'scanner';
          sincronizacion.arrancar();
          aplicarAparienciaInstitucional();
          notificarExito(`Bienvenido, ${respuesta.nombreMostrar || respuesta.usuario}.`);

          // Si la clave sigue siendo la temporal, abrimos el cambio de una vez.
          // Avisar con una notificación no alcanzaba: desaparece a los pocos
          // segundos y nadie volvía a acordarse.
          if (respuesta.debeCambiarContrasena) {
            abrirCambioClave(true);
          }
        } catch (fallo) {
          errorLogin.value = fallo.message || 'No se pudo iniciar sesión.';
        } finally {
          entrando.value = false;
        }
      }

      /** Limpia todo rastro de la sesión en el navegador. */
      function limpiarSesion() {
        sincronizacion.detener();
        almacenSesion.limpiar();
        Object.assign(sesion, {
          token: null, usuario: null, correo: null,
          nombreMostrar: null, rol: null, rolId: null,
          impersonadoPor: null
        });
        formularioLogin.usuario = '';
        formularioLogin.password = '';
        errorLogin.value = '';
        verPassword.value = false;
        vista.value = 'scanner';
        menuUsuarioAbierto.value = false;
      }

      async function confirmarCierre() {
        modalCierreAbierto.value = false;
        await escaner.detener();
        try {
          await api.sesion.cerrar();
        } catch {
          // Si el servidor no responde igual cerramos del lado del cliente:
          // la sesión vence sola en seis horas.
        }
        limpiarSesion();
      }

      // Cuando cualquier petición recibe un 401, el cliente HTTP nos avisa acá.
      http.alVencerSesion = () => {
        if (!sesion.token) return;
        limpiarSesion();
        notificarAlerta('Tu sesión expiró. Vuelve a iniciar sesión.');
      };

      // =====================================================================
      // Usuarios y roles: activar, desactivar, y usar otra cuenta
      // =====================================================================

      const gestionCuentas = reactive({
        trabajando: '',        // el id sobre el que se está operando
        confirmando: null      // { tipo: 'usuario'|'rol'|'impersonar', fila }
      });

      /** ¿Es la cuenta con la que se inició sesión? */
      function esMiCuenta(cuenta) {
        return Boolean(cuenta && cuenta.usuario && cuenta.usuario === sesion.usuario);
      }

      async function cambiarEstadoUsuario(cuenta, activar) {
        gestionCuentas.trabajando = cuenta.id;
        try {
          const resultado = await api.usuarios.cambiarEstado(cuenta.id, activar ? 'TRUE' : 'FALSE');
          notificar(resultado.mensaje, activar ? 'exito' : 'info');
          await recargarCatalogos();
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo cambiar el estado.');
        } finally {
          gestionCuentas.trabajando = '';
          gestionCuentas.confirmando = null;
        }
      }

      async function cambiarEstadoRol(rol, activar) {
        gestionCuentas.trabajando = rol.id;
        try {
          const resultado = await api.roles.cambiarEstado(rol.id, activar ? 'TRUE' : 'FALSE');
          notificar(resultado.mensaje, activar ? 'exito' : 'alerta');
          await recargarCatalogos();
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo cambiar el estado del rol.');
        } finally {
          gestionCuentas.trabajando = '';
          gestionCuentas.confirmando = null;
        }
      }

      /**
       * Empieza a usar otra cuenta.
       *
       * Sirve para responder la pregunta que aparece siempre: "¿por qué esta
       * persona no ve tal botón?". Crear una cuenta de prueba con el mismo rol
       * es lento y nunca reproduce el caso exacto.
       *
       * Se reemplaza el token por el prestado y se recarga todo: la matriz de
       * permisos, el menú y las vistas pasan a ser las de esa persona.
       */
      async function usarCuentaDe(cuenta) {
        gestionCuentas.trabajando = cuenta.id;
        try {
          const respuesta = await api.sesion.impersonar(cuenta.id);

          Object.assign(sesion, {
            token: respuesta.token,
            usuario: respuesta.usuario,
            correo: respuesta.correo,
            nombreMostrar: respuesta.nombreMostrar,
            rol: respuesta.rol,
            rolId: respuesta.rolId,
            impersonadoPor: respuesta.impersonadoPor || null
          });
          almacenSesion.guardar(respuesta);
          poblarCatalogos(respuesta.datosIniciales);

          vista.value = 'scanner';
          gestionCuentas.confirmando = null;
          notificarAlerta(`Estás usando la cuenta de ${respuesta.usuario}.`);
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo usar esa cuenta.');
        } finally {
          gestionCuentas.trabajando = '';
        }
      }

      /** Vuelve a la cuenta propia y cierra la prestada. */
      async function volverAMiCuenta() {
        gestionCuentas.trabajando = 'volviendo';
        try {
          const respuesta = await api.sesion.volverDeImpersonar();

          Object.assign(sesion, {
            token: respuesta.token,
            usuario: respuesta.usuario,
            correo: respuesta.correo,
            nombreMostrar: respuesta.nombreMostrar,
            rol: respuesta.rol,
            rolId: respuesta.rolId,
            impersonadoPor: null
          });
          almacenSesion.guardar(respuesta);
          poblarCatalogos(respuesta.datosIniciales);

          vista.value = 'usuarios';
          notificarExito(`Volviste a tu cuenta, ${respuesta.usuario}.`);
        } catch (fallo) {
          // Si no se puede volver (la cuenta original se desactivó, por
          // ejemplo) lo correcto es salir del todo, no quedarse con una sesión
          // prestada que ya no tiene dueño.
          notificarError(fallo.message || 'No se pudo volver. Inicia sesión otra vez.');
          limpiarSesion();
        } finally {
          gestionCuentas.trabajando = '';
        }
      }

      // =====================================================================
      // Escáner
      // =====================================================================

      const escaner = usarEscanerQr({
        notificar,
        obtenerEmpleados: () => empleados.lista,
        alRegistrar(respuesta, identificador) {
          // Sumamos el registro a la lista local en el acto, sin esperar a
          // recargar del servidor: en la puerta se necesita ver el conteo subir.
          resumen.total += 1;
          asistencias.value.unshift({
            id: `local-${Date.now()}`,
            fechaHora: new Date().toISOString(),
            evento: eventoActivo.value?.id || null,
            empleadoNombre: formato.nombreCompleto(respuesta.empleado),
            dui: respuesta.empleado?.dui || identificador,
            fuente: 'qr'
          });

          // Se pide de inmediato en vez de esperar el turno: así las otras
          // tablets ven este ingreso en el acto, y de paso llega la fila real
          // que reemplaza a la optimista de arriba.
          sincronizacion.sincronizarAhora();
        }
      });

      // =====================================================================
      // Buscar a una persona desde la puerta
      //
      // El plan C cuando el QR no aparece: no guardó su invitación, se quedó
      // sin batería, o no se sabe el DUI. Antes, sin el DUI no había forma.
      // =====================================================================

      const buscador = usarBuscadorPersonas({
        obtenerEmpleados: () => empleados.lista,
        obtenerDepartamentos: () => departamentos.lista,
        obtenerAsistencias: () => asistencias.value,
        obtenerEventoActivo: () => eventoActivo.value,
        // Pasa por el mismo camino que un escaneo: misma cola, mismos
        // reintentos, mismo respaldo local si no hay señal.
        alElegir: (identificador) => escaner.registrar(identificador)
      });

      // =====================================================================
      // Refresco periódico de asistencias
      //
      // En la puerta suele haber más de una tablet escaneando. Sin esto cada
      // una veía solo lo suyo y el contador quedaba congelado en lo que había
      // al iniciar sesión.
      // =====================================================================

      const sincronizacion = usarSincronizacion({
        haySesion: () => Boolean(sesion.token),
        vistaActual: () => vista.value,
        // Registrar tiene prioridad sobre refrescar: con un escaneo en vuelo,
        // el sincronizador se saltea el turno.
        estaOcupado: () => escaner.procesando || escaner.estadoRed.sincronizando,
        alRecibir: fusionarNovedades
      });

      /**
       * Mete lo que llegó del servidor en la lista que ya está en pantalla.
       *
       * No se reemplaza la lista entera a propósito. Al registrar un escaneo se
       * agrega una fila optimista con id `local-…` para que el conteo suba en
       * el acto; si el sondeo pisara la lista, esa fila desaparecería hasta que
       * el servidor la devolviera, y en la puerta eso se ve como un registro
       * que se perdió.
       *
       * Entonces: se agregan las nuevas que no estén ya, y recién ahí se
       * descartan las optimistas que el servidor ya confirmó, comparando por
       * DUI. El total siempre viene del servidor, que es quien sabe.
       */
      function fusionarNovedades({ total, nuevas }) {
        resumen.total = total;
        if (nuevas.length === 0) return;

        const conocidas = new Set(asistencias.value.map((fila) => fila.id));
        const frescas = nuevas.filter((fila) => !conocidas.has(fila.id));
        if (frescas.length === 0) return;

        const duisConfirmados = new Set(frescas.map((fila) => formato.duiPlano(fila.dui)));

        asistencias.value = [
          ...frescas,
          ...asistencias.value.filter((fila) => {
            const esOptimista = String(fila.id || '').startsWith('local-');
            if (!esOptimista) return true;
            // La optimista ya tiene su versión real: sobra.
            return !duisConfirmados.has(formato.duiPlano(fila.dui));
          })
        ];
      }

      // =====================================================================
      // Registros pendientes en el dispositivo
      // =====================================================================

      const pendientes = usarPendientes({
        notificar,
        obtenerEmpleados: () => empleados.lista,
        // Después de subir o descartar, el contador de la barra lateral tiene
        // que reflejar la realidad; si no, sigue diciendo que hay cosas por
        // subir cuando ya no queda ninguna.
        alCambiar: () => escaner.actualizarPendientes()
      });

      // =====================================================================
      // Importación de CSV
      // =====================================================================

      const importacion = usarImportacionCsv({
        notificar,
        alTerminar: recargarCatalogos
      });

      /*
       * Importación de empleados con revisión previa.
       *
       * Recursos Humanos tiene su planilla con ochocientos empleados y los
       * departamentos escritos a su manera. Los desplegables con validación de
       * la plantilla no dejan pegar esos valores, y aunque dejaran, los nombres
       * no coinciden letra por letra con el catálogo.
       *
       * Ahora se pega el texto tal cual está y el sistema propone a qué
       * departamento y distrito corresponde cada variante. Alguien confirma o
       * corrige, y recién ahí se sube. Nada se guarda sin que una persona lo
       * haya mirado.
       */
      const conciliacion = usarConciliacion({
        obtenerDepartamentos: () => departamentos.lista,
        distritos: DISTRITOS,
        enviarBloque: (filas) => api.empleados.importarFilas(filas),
        // Permite resolver un departamento que el archivo trae y el catálogo
        // no, sin salir del panel y perder lo ya decidido.
        crearDepartamento: async (nombre) => {
          const creado = await api.departamentos.guardar({ nombre_dpto: nombre, activo: 'TRUE' });
          await recargarCatalogos();
          return creado;
        },
        notificar,
        alTerminar: recargarCatalogos
      });

      /** Los departamentos que se pueden elegir: los que están activos. */
      const departamentosActivos = computed(() =>
        departamentos.lista.filter((d) => formato.esVerdadero(d.activo))
      );

      const marcadosDepartamento = computed(() =>
        conciliacion.gruposDepartamento.filter((g) => g.seleccionado).length
      );
      const marcadosDistrito = computed(() =>
        conciliacion.gruposDistrito.filter((g) => g.seleccionado).length
      );

      /**
       * Cerrar con filas subidas recarga los catálogos.
       * Si no, la tabla de atrás sigue mostrando el conteo viejo y parece que
       * la importación no hizo nada.
       */
      async function cerrarConciliacion() {
        const huboCambios = conciliacion.cuantasSubidas > 0;
        conciliacion.cerrar();
        if (huboCambios) await recargarCatalogos();
      }

      /*
       * Departamentos importa directo: sus nombres son la clave natural, así
       * que no hay nada que conciliar. Empleados pasa por la revisión previa
       * porque su columna de departamento apunta a este catálogo y ahí es donde
       * cada quien escribe el nombre a su manera.
       */
      const importarDepartamentos = (evento) =>
        importacion.importar(evento, 'departamentos', (csv) => api.departamentos.importar(csv));

      // =====================================================================
      // Exportación a Excel
      //
      // Antes esto bajaba un CSV que armaba el servidor. Dos problemas: Excel
      // abre los CSV con el separador de la configuración regional (en la
      // mayoría de las máquinas de la alcaldía es el punto y coma, así que
      // todo caía en una sola columna), y la columna de departamento traía el
      // UUID, ilegible e imposible de corregir a mano.
      //
      // Ahora se genera un .xlsx en el navegador, con los datos que ya están
      // cargados. Sin viaje al servidor y con el departamento por su nombre.
      // =====================================================================

      /**
       * Qué columnas lleva cada catálogo.
       *
       * Los encabezados son los nombres internos y no títulos bonitos a
       * propósito: el importador busca las columnas por su nombre, así que
       * "fecha_nacimiento" se reconoce al reimportar y "Fecha de nacimiento"
       * no. El archivo se edita en Excel y vuelve, y eso pesa más que la
       * estética.
       *
       * El `id` de la fila no va: el importador nunca lo usa (empareja por DUI
       * y por nombre de departamento) y una columna de UUID solo estorba a
       * quien tiene que corregir el archivo.
       */
      const COLUMNAS_EXPORTACION = {
        empleados: {
          nombreArchivo: 'empleados',
          hoja: 'Empleados',
          encabezados: [
            'nombres', 'apellidos', 'dui', 'codigo', 'departamento',
            'cargo', 'distrito', 'fecha_nacimiento', 'telefono', 'correo', 'activo'
          ],
          ejemplo: [
            'Ana María', 'López Portillo', '01234567-8', 'EMP-001', 'Obras Públicas',
            'Analista', 'Panchimalco', '24/03/1990', '70001234', 'ana.lopez@ejemplo.sv', 'TRUE'
          ],
          /**
           * Columnas que se eligen de un desplegable en vez de escribirse.
           *
           * Es la diferencia entre un archivo que importa limpio y uno que
           * falla fila por fila: "Panchimalco" escrito a mano aparece también
           * como "PANCHIMALCO", "panchimalco " con espacio al final y
           * "Panchimalko". El departamento además tiene que existir en el
           * catálogo, o el importador rechaza la fila.
           *
           * Solo los departamentos activos: ofrecer uno dado de baja sería
           * invitar a asignar gente a un departamento que ya no opera.
           */
          listas: () => [
            { columna: 'distrito', titulo: 'Distrito', valores: [...DISTRITOS] },
            {
              columna: 'departamento',
              titulo: 'Departamento',
              valores: departamentos.lista
                .filter((fila) => formato.esVerdadero(fila.activo))
                .map((fila) => fila.nombre_dpto)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'es'))
            }
          ],

          filas: () => empleados.lista.map((persona) => [
            persona.nombres || '',
            persona.apellidos || '',
            formato.formatearDui(persona.dui),
            persona.codigo || '',
            nombreDeDepartamento(persona.dpto),
            persona.cargo || '',
            persona.distrito || '',
            formato.formatearFechaCorta(persona.fecha_nacimiento),
            persona.telefono || '',
            persona.correo || '',
            formato.esVerdadero(persona.activo) ? 'TRUE' : 'FALSE'
          ])
        },

        departamentos: {
          nombreArchivo: 'departamentos',
          hoja: 'Departamentos',
          encabezados: ['cod_dpto', 'nombre_dpto', 'activo'],
          ejemplo: ['OP-01', 'Obras Públicas', 'TRUE'],
          filas: () => departamentos.lista.map((fila) => [
            fila.cod_dpto || '',
            fila.nombre_dpto || '',
            formato.esVerdadero(fila.activo) ? 'TRUE' : 'FALSE'
          ])
        }
      };

      /** El nombre del departamento a partir de su id, para la exportación. */
      function nombreDeDepartamento(id) {
        if (!id) return '';
        const encontrado = departamentos.lista.find((fila) => fila.id === id);
        return encontrado ? encontrado.nombre_dpto || '' : '';
      }

      /** Fecha de hoy para el nombre del archivo: 2026-08-20. */
      function hoy() {
        return new Date().toISOString().slice(0, 10);
      }

      async function exportar(recurso) {
        const definicion = COLUMNAS_EXPORTACION[recurso];
        if (!definicion) return;

        try {
          const filas = definicion.filas();
          if (filas.length === 0) {
            notificarAlerta('No hay nada que exportar todavía.');
            return;
          }

          await descargarXlsx({
            encabezados: definicion.encabezados,
            filas,
            nombreHoja: definicion.hoja,
            nombreArchivo: `${definicion.nombreArchivo}-${hoy()}.xlsx`
          });

          notificarExito(`${filas.length} registros exportados.`);
        } catch (fallo) {
          console.error('[exportar]', fallo);
          notificarError(fallo.message || 'No se pudo exportar.');
        }
      }

      /**
       * Baja un Excel vacío con los encabezados y una fila de ejemplo.
       *
       * La fila de ejemplo importa más de lo que parece: sin ella nadie sabe si
       * la fecha va como 24/03/1990 o 1990-03-24, ni que el departamento se
       * escribe por su nombre y tiene que existir antes en el catálogo.
       */
      async function descargarPlantilla(recurso) {
        const definicion = COLUMNAS_EXPORTACION[recurso];
        if (!definicion) return;

        try {
          const listas = definicion.listas ? definicion.listas() : [];

          await descargarXlsx({
            encabezados: definicion.encabezados,
            filas: [definicion.ejemplo],
            nombreHoja: definicion.hoja,
            nombreArchivo: `plantilla-${definicion.nombreArchivo}.xlsx`,
            listas
          });

          notificarInfo(
            listas.length > 0
              ? 'Reemplaza la fila de ejemplo con tus datos. Distrito y departamento se eligen de una lista.'
              : 'Reemplaza la fila de ejemplo con tus datos y vuelve a subirla.'
          );
        } catch (fallo) {
          console.error('[plantilla]', fallo);
          notificarError(fallo.message || 'No se pudo generar la plantilla.');
        }
      }

      // =====================================================================
      // Eventos y sorteos
      // =====================================================================

      async function activarEvento(eventoId) {
        try {
          const respuesta = await api.eventos.activar(eventoId);
          notificarExito(respuesta.mensaje);
          await recargarCatalogos();
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo activar el evento.');
        }
      }


      /*
       * Apaga el evento en curso sin poner otro.
       *
       * Queda el sistema sin evento activo, que es un estado válido: entre una
       * fiesta y la siguiente no hay ninguna, y con el escáner apagado nadie
       * registra entradas por error en el evento del año pasado.
       */
      /*
       * El mapa donde se marca el lugar del evento.
       *
       * Se monta cuando se abre el formulario y se desmonta al cerrarlo: Leaflet
       * mide el contenedor al crearse, y sobre uno que todavía no se dibujó
       * calcula cero y el mapa queda en blanco.
       *
       * Lo que el mapa marca se copia al formulario, que es lo que se guarda.
       * Así funciona igual si alguien escribe las coordenadas a mano.
       */
      const mapa = usarMapa();

      watch(() => eventos.modalAbierto, async (abierto) => {
        if (!abierto) {
          mapa.desmontar();
          return;
        }

        await nextTick();
        mapa.montar('mapa-evento', {
          latitud: eventos.formulario.latitud,
          longitud: eventos.formulario.longitud,
          cuandoCambie: (latitud, longitud) => {
            eventos.formulario.latitud = latitud === null ? '' : latitud;
            eventos.formulario.longitud = longitud === null ? '' : longitud;
          }
        });
      });

      async function desactivarEvento(evento) {
        try {
          const respuesta = await api.eventos.desactivar(evento.id);
          notificarExito(respuesta.mensaje || 'El evento ya no está activo.');
          await recargarCatalogos();
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo desactivar el evento.');
        }
      }

      /*
       * Borrado de un evento, con confirmación.
       *
       * El servidor vuelve a revisar que no tenga asistencias ni sorteos: esto
       * es comodidad, no la salvaguarda. Su mensaje se muestra tal cual porque
       * explica qué hay colgando y cuánto.
       */
      const bajaEvento = reactive({
        abierta: false,
        evento: null,
        trabajando: false,
        error: ''
      });

      function pedirBajaEvento(evento) {
        Object.assign(bajaEvento, {
          abierta: true,
          evento,
          trabajando: false,
          error: ''
        });
      }

      function cancelarBajaEvento() {
        bajaEvento.abierta = false;
        bajaEvento.error = '';
      }

      async function confirmarBajaEvento() {
        if (!bajaEvento.evento) return;

        bajaEvento.trabajando = true;
        bajaEvento.error = '';

        try {
          const respuesta = await api.eventos.eliminar(bajaEvento.evento.id);
          notificarExito(respuesta.mensaje || 'El evento se borró.');
          bajaEvento.abierta = false;
          await recargarCatalogos();
        } catch (fallo) {
          bajaEvento.error = fallo.message || 'No se pudo borrar el evento.';
        } finally {
          bajaEvento.trabajando = false;
        }
      }

      /*
       * Comparte el enlace del portal público de invitaciones.
       *
       * Es el mismo al que lleva «Consulta tu código QR aquí» de la pantalla de
       * entrada, y lo que más se pide mientras hay un evento en curso: cada vez
       * que alguien pregunta por su invitación, la respuesta es este enlace.
       *
       * Donde el dispositivo tiene el menú de compartir del sistema —los
       * teléfonos— se usa ese, que es de donde sale mandarlo por WhatsApp. En el
       * escritorio se copia al portapapeles, que es lo único que hay.
       */
      const enlaceCopiado = ref(false);

      async function compartirInvitacion() {
        const enlace = new URL('/?invitacion=1', window.location.origin).href;
        const texto = eventoActivo.value
          ? `Consulta tu invitación para ${eventoActivo.value.nombre}`
          : 'Consulta tu invitación';

        try {
          if (navigator.share) {
            await navigator.share({ title: texto, text: texto, url: enlace });
            return;
          }

          await navigator.clipboard.writeText(enlace);
          enlaceCopiado.value = true;
          notificarExito('Enlace copiado. Ya puedes pegarlo donde lo necesites.');
          setTimeout(() => { enlaceCopiado.value = false; }, 2500);
        } catch (fallo) {
          // Cancelar el menú de compartir lanza AbortError y no es un problema.
          if (fallo && fallo.name === 'AbortError') return;
          notificarError('No se pudo compartir el enlace. Cópialo desde la barra del navegador.');
        }
      }
      // =====================================================================
      // Sorteos
      //
      // La operación en vivo vive en usarSorteos; acá queda el formulario de
      // administración, que edita el sorteo junto con su lista de premios.
      // =====================================================================

      const sorteos = usarSorteos({
        notificar,
        notificarError,
        // Al extraer cambia el stock de los premios, así que el catálogo que
        // está en pantalla queda desactualizado.
        alCambiar: recargarCatalogos
      });

      const editorSorteo = reactive({
        abierto: false,
        id: null,
        nombre: '',
        descripcion: '',
        permiteRepetirGanador: false,
        premios: [],
        guardando: false,
        error: ''
      });

      // Solo cuentan las líneas que ya tienen premio elegido: una línea recién
      // agregada trae cantidad 1 y todavía no reparte nada.
      const totalUnidadesSorteo = computed(() =>
        editorSorteo.premios.reduce(
          (suma, linea) => suma + (linea.premioId ? Number(linea.cantidad) || 0 : 0),
          0
        )
      );

      function abrirSorteo(sorteo = null) {
        Object.assign(editorSorteo, {
          abierto: true,
          id: sorteo ? sorteo.id : null,
          nombre: sorteo ? sorteo.nombre || '' : '',
          descripcion: sorteo ? sorteo.descripcion || '' : '',
          permiteRepetirGanador: sorteo ? formato.esVerdadero(sorteo.permite_repetir_ganador) : false,
          // Se copian las líneas para que cancelar no deje a medias lo que se
          // estaba editando.
          premios: sorteo
            ? (sorteo.premios || []).map((p) => ({ premioId: p.premioId, cantidad: p.cantidad }))
            : [],
          guardando: false,
          error: ''
        });
      }

      function cerrarSorteo() {
        editorSorteo.abierto = false;
        editorSorteo.error = '';
      }

      function agregarPremioAlSorteo() {
        editorSorteo.premios.push({ premioId: '', cantidad: 1 });
      }

      function quitarPremioDelSorteo(indice) {
        editorSorteo.premios.splice(indice, 1);
      }

      async function guardarSorteo() {
        if (!editorSorteo.nombre.trim()) {
          editorSorteo.error = 'El nombre del sorteo es obligatorio.';
          return;
        }

        // Una línea sin premio elegido se descartaba en silencio, y el sorteo
        // se guardaba con menos premios de los que se veían en pantalla. Mejor
        // frenar y decirlo.
        const sinElegir = editorSorteo.premios.filter((linea) => !linea.premioId).length;
        if (sinElegir > 0) {
          editorSorteo.error = sinElegir === 1
            ? 'Hay una línea sin premio elegido. Elígele uno o quítala.'
            : `Hay ${sinElegir} líneas sin premio elegido. Elígeles uno o quítalas.`;
          return;
        }

        const lineas = editorSorteo.premios;

        // Un mismo premio dos veces no tiene sentido: para repetirlo se sube la
        // cantidad, y además el servidor lo rechazaría por el índice único.
        const vistos = new Set();
        for (const linea of lineas) {
          if (vistos.has(linea.premioId)) {
            editorSorteo.error = 'Hay un premio repetido en la lista. Súbele la cantidad en vez de agregarlo dos veces.';
            return;
          }
          vistos.add(linea.premioId);
        }

        editorSorteo.guardando = true;
        editorSorteo.error = '';

        try {
          await api.sorteos.guardar({
            id: editorSorteo.id,
            nombre: editorSorteo.nombre.trim(),
            descripcion: editorSorteo.descripcion.trim(),
            permiteRepetirGanador: editorSorteo.permiteRepetirGanador ? 'TRUE' : 'FALSE',
            premios: lineas.map((linea) => ({
              premioId: linea.premioId,
              cantidad: Math.max(1, Number(linea.cantidad) || 1)
            }))
          });

          notificarExito(editorSorteo.id ? 'Sorteo actualizado.' : 'Sorteo creado.');
          cerrarSorteo();
          await Promise.all([sorteos.cargar(), recargarCatalogos()]);
        } catch (fallo) {
          editorSorteo.error = fallo.message || 'No se pudo guardar el sorteo.';
        } finally {
          editorSorteo.guardando = false;
        }
      }

      // =====================================================================
      // Detalle de un empleado
      //
      // Se abre al hacer clic en la fila del padrón. Junta la ficha completa y
      // el QR de la persona en un solo lugar: antes, para ver el código de
      // alguien había que irse a Tarjetas, buscarlo de nuevo y generar un lote
      // de uno solo.
      // =====================================================================

      const detalle = reactive({
        abierto: false,
        persona: null,
        campoQr: 'dui',
        generando: false,
        // '' | 'baja' | 'definitivo'. Qué confirmación está a la vista.
        confirmando: '',
        trabajando: false,
        error: ''
      });

      // El QR no se pide al backend: es una URL de QuickChart que se arma acá,
      // así que cambiar de contenido no cuesta ninguna petición propia.
      const qrDetalle = computed(() =>
        detalle.persona ? urlQr(detalle.persona, detalle.campoQr) : ''
      );

      const enlaceDetalle = computed(() =>
        detalle.persona ? enlaceInvitacion(detalle.persona) : ''
      );

      const departamentoDetalle = computed(() => {
        if (!detalle.persona) return '';
        const encontrado = departamentos.lista.find((fila) => fila.id === detalle.persona.dpto);
        return encontrado ? encontrado.nombre_dpto : '';
      });

      /**
       * ¿Ya marcó en el evento activo? Se resuelve con lo que ya está cargado,
       * sin pedirle nada al servidor.
       *
       * El filtro por evento importa: la lista trae el histórico completo, y
       * sin él alguien que asistió a la fiesta del año pasado aparecería como
       * presente en la de hoy.
       */
      const asistenciaDetalle = computed(() => {
        if (!detalle.persona || !eventoActivo.value) return null;
        const dui = formato.duiPlano(detalle.persona.dui);
        if (!dui) return null;

        return asistencias.value.find(
          (fila) =>
            fila.evento === eventoActivo.value.id &&
            formato.duiPlano(fila.dui) === dui
        ) || null;
      });

      function abrirDetalle(persona) {
        detalle.persona = persona;
        detalle.campoQr = 'dui';
        detalle.abierto = true;
        detalle.confirmando = '';
        detalle.error = '';
        // Saber si hay plantillas define si se puede ofrecer la tarjeta
        // completa o solamente el QR suelto.
        if (plantillas.value.length === 0) cargarPlantillas();
      }

      function cerrarDetalle() {
        detalle.abierto = false;
        detalle.persona = null;
        detalle.confirmando = '';
        detalle.error = '';
      }

      /**
       * Baja y borrado de un empleado.
       *
       * Son dos cosas distintas y la interfaz las separa a propósito:
       *
       *   · Dar de baja apaga la bandera `activo`. La persona sale del escáner
       *     pero su historial de asistencias sigue ahí. Es
       *     lo que se hace el 99% de las veces, y lo puede hacer cualquiera con
       *     permiso de eliminar sobre el módulo.
       *
       *   · Borrar definitivamente se lleva la fila. Solo administradores, y
       *     el servidor lo niega si la persona tiene asistencias, premios o una
       *     cuenta: eso se llevaría por delante el registro de un evento que ya
       *     pasó y no se puede reconstruir.
       */
      async function ejecutarBaja(definitivo) {
        if (!detalle.persona) return;

        detalle.trabajando = true;
        detalle.error = '';

        try {
          const resultado = await api.empleados.eliminar(detalle.persona.id, definitivo);
          notificarExito(resultado.mensaje || 'Listo.');
          cerrarDetalle();
          await recargarCatalogos();
        } catch (fallo) {
          detalle.error = fallo.message || 'No se pudo completar la operación.';
        } finally {
          detalle.trabajando = false;
        }
      }

      /** Pasa al formulario de edición sin dejar los dos modales encimados. */
      function editarDesdeDetalle() {
        const persona = detalle.persona;
        cerrarDetalle();
        empleados.abrir(persona);
      }

      async function descargarQrDetalle() {
        try {
          await descargarQr(detalle.persona, detalle.campoQr);
          notificarExito('El QR se descargó.');
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo descargar el QR.');
        }
      }

      async function copiarEnlaceDetalle() {
        try {
          await navigator.clipboard.writeText(enlaceDetalle.value);
          notificarExito('Enlace copiado.');
        } catch {
          // El portapapeles exige HTTPS y permiso. Si no se puede, al menos que
          // el enlace quede a la vista para copiarlo a mano.
          notificarAlerta(enlaceDetalle.value);
        }
      }

      // =====================================================================
      // Configuración
      // =====================================================================

      const interruptores = ref([]);
      const diagnostico = ref(null);
      const revisandoSistema = ref(false);

      /*
       * La apariencia institucional.
       *
       * Vive en la tabla `configuracion` y define cómo arranca la aplicación en
       * todos los dispositivos: el tema claro u oscuro, el color primario del
       * que sale toda la paleta, y qué forma y tamaño tiene el logo.
       *
       * Lo del tema no pisa a quien ya eligió uno a mano con el botón de la
       * barra superior: para eso está el botón de "seguir al sistema", que
       * olvida esa elección. El color y el logo sí son de la institución y no
       * se eligen por dispositivo.
       */
      /*
       * El logo se cachea aparte de la paleta.
       *
       * La pantalla de entrada se dibuja sin sesión, y sin sesión no se puede
       * leer la configuración. Sin este cache, cada visita arrancaría con el
       * logo de fábrica y saltaría al configurado recién después de entrar.
       */
      const CLAVE_LOGO = 'sssur_logo';

      function logoCacheado() {
        try {
          const guardado = JSON.parse(localStorage.getItem(CLAVE_LOGO) || 'null');
          if (!guardado) return null;

          return {
            forma: guardado.forma === 'horizontal' ? 'horizontal' : 'escudo',
            anchoSidebar: Number(guardado.anchoSidebar) || 40,
            anchoLogin: Number(guardado.anchoLogin) || 56
          };
        } catch {
          return null;
        }
      }

      function guardarLogoEnCache() {
        try {
          localStorage.setItem(CLAVE_LOGO, JSON.stringify({
            forma: apariencia.logoForma.valor,
            anchoSidebar: apariencia.anchoSidebar.valor,
            anchoLogin: apariencia.anchoLogin.valor
          }));
        } catch {
          // Sin almacenamiento el login muestra el logo de fábrica. Aceptable.
        }
      }

      const logoInicial = logoCacheado();

      /*
       * Cada parámetro lleva dos valores: `valor` es lo que se está viendo y
       * `guardado` es lo que hay en la base.
       *
       * Hacen falta los dos porque los deslizadores de tamaño actualizan la
       * vista previa mientras se arrastran. Con un solo campo, al soltar el
       * deslizador el valor nuevo ya estaba escrito y el guardado no tenía con
       * qué compararlo: creía que no había cambiado nada y no guardaba nunca.
       */
      const anchoSidebarInicial = logoInicial ? logoInicial.anchoSidebar : 40;
      const anchoLoginInicial = logoInicial ? logoInicial.anchoLogin : 56;
      const formaInicial = logoInicial ? logoInicial.forma : 'escudo';
      const colorInicial = marca.actual();

      const apariencia = reactive({
        // Qué clave se está guardando ahora mismo, o '' si ninguna.
        guardando: '',
        tema: { valor: 'sistema', guardado: 'sistema', opciones: [] },
        color: { valor: colorInicial, guardado: colorInicial, sugerencias: [] },
        logoForma: { valor: formaInicial, guardado: formaInicial, opciones: [] },
        anchoSidebar: {
          valor: anchoSidebarInicial, guardado: anchoSidebarInicial,
          minimo: 28, maximo: 240, recomendado: {}
        },
        anchoLogin: {
          valor: anchoLoginInicial, guardado: anchoLoginInicial,
          minimo: 32, maximo: 320, recomendado: {}
        }
      });

      /** ¿Hay tamaños tocados que todavía no se guardaron? */
      const hayTamanosSinGuardar = computed(() =>
        apariencia.anchoSidebar.valor !== apariencia.anchoSidebar.guardado ||
        apariencia.anchoLogin.valor !== apariencia.anchoLogin.guardado
      );

      // Se recalcula en cada cambio y no una sola vez al arrancar: el usuario
      // puede tocar el botón de la barra superior con la pantalla abierta.
      const tienePreferenciaPropia = ref(tema.tienePreferenciaPropia());

      /** Los doce tonos del color elegido, para la tira de vista previa. */
      const paletaPrevia = computed(() => {
        const paleta = marca.previsualizar(apariencia.color.valor);
        return PASOS_MARCA.map((paso) => ({ paso, color: paleta[paso] }));
      });

      /*
       * ¿Se lee el texto blanco de los botones sobre el color elegido?
       *
       * El botón primario es fondo del color con texto blanco. Con un amarillo
       * o un celeste claro eso queda ilegible, y no hay forma de que la persona
       * que elige el color se dé cuenta hasta que alguien no puede leer un
       * botón. Por eso se avisa acá mismo.
       */
      const contrasteDelColor = computed(() => contrasteConBlanco(apariencia.color.valor));

      /** Deja el estado local igual a lo que devolvió la API. */
      function refrescarApariencia(datos) {
        const porClave = new Map((datos.parametros || []).map((p) => [p.clave, p]));

        const tomar = (clave, destino, transformar = (v) => v) => {
          const parametro = porClave.get(clave);
          if (!parametro) return null;

          destino.valor = transformar(parametro.valor);
          destino.guardado = destino.valor;
          if (parametro.opciones) destino.opciones = parametro.opciones;
          if (parametro.sugerencias) destino.sugerencias = parametro.sugerencias;
          if (parametro.minimo !== undefined) destino.minimo = parametro.minimo;
          if (parametro.maximo !== undefined) destino.maximo = parametro.maximo;
          if (parametro.recomendado) destino.recomendado = parametro.recomendado;
          return parametro;
        };

        const elTema = tomar('tema_sistema', apariencia.tema);
        tomar('color_primario', apariencia.color);
        tomar('logo_forma', apariencia.logoForma);
        tomar('logo_ancho_sidebar', apariencia.anchoSidebar, Number);
        tomar('logo_ancho_login', apariencia.anchoLogin, Number);

        marca.establecer(apariencia.color.valor);
        tema.reaplicar();
        guardarLogoEnCache();

        if (elTema) {
          tema.aplicarDelSistema(elTema.valor);
          modoOscuro.value = tema.esOscuro();
          tienePreferenciaPropia.value = tema.tienePreferenciaPropia();
        }
      }

      async function cargarConfiguracion() {
        try {
          const datos = await api.configuracion.leer();
          interruptores.value = datos.interruptores || [];
          refrescarApariencia(datos);
        } catch (fallo) {
          console.error('[configuracion]', fallo);
        }
      }

      /**
       * Aplica la apariencia institucional al entrar.
       *
       * Se llama al iniciar sesión y al arrancar con una sesión guardada, no
       * solo al abrir Configuración: si esperara a eso, el color y el tema que
       * definió la institución no se verían nunca en el uso normal.
       *
       * Falla en silencio a propósito. Que no se pueda leer la apariencia no es
       * razón para molestar a nadie: se sigue con la que ya está aplicada, que
       * salió del cache y casi siempre es la correcta.
       */
      async function aplicarAparienciaInstitucional() {
        try {
          refrescarApariencia(await api.configuracion.leer());
        } catch (fallo) {
          console.warn('[apariencia] No se pudo leer la configuración:', fallo.message);
        }
      }

      /**
       * Guarda un parámetro de apariencia.
       *
       * Se aplica en pantalla antes de que responda el servidor, para que se
       * vea el efecto de lo que se elige, y se revierte si el guardado falla.
       * `alAplicar` es lo que hace visible el cambio; se lo llama con el valor
       * nuevo y con el anterior si hay que deshacer.
       */
      async function guardarApariencia(clave, destino, valor, alAplicar) {
        // Se compara contra lo que hay en la base, NO contra lo que se está
        // viendo: al soltar un deslizador lo que se ve ya es el valor nuevo.
        if (String(valor) === String(destino.guardado)) return true;

        const anterior = destino.guardado;
        destino.valor = valor;
        apariencia.guardando = clave;
        if (alAplicar) alAplicar(valor);

        try {
          await api.configuracion.guardar(clave, String(valor));
          destino.guardado = valor;
          guardarLogoEnCache();
        } catch (fallo) {
          destino.valor = anterior;
          if (alAplicar) alAplicar(anterior);
          notificarError(fallo.message || 'No se pudo guardar el cambio.');
          return false;
        } finally {
          apariencia.guardando = '';
        }
        return true;
      }

      async function cambiarTemaSistema(valor) {
        const ok = await guardarApariencia('tema_sistema', apariencia.tema, valor, (v) => {
          tema.aplicarDelSistema(v);
          modoOscuro.value = tema.esOscuro();
        });
        if (ok) notificarExito('Tema del sistema actualizado.');
      }

      async function cambiarColorPrimario(valor) {
        const ok = await guardarApariencia('color_primario', apariencia.color, valor, (v) => {
          marca.establecer(v);
          // La barra del navegador móvil lee el color de la variable CSS, así
          // que hay que volver a aplicarla despues de reescribirla.
          tema.reaplicar();
        });
        if (ok) notificarExito('Color del sistema actualizado.');
      }

      /**
       * Cambia la forma del logo y le ajusta el tamaño.
       *
       * El escudo es cuadrado y el logo horizontal necesita más del doble de
       * ancho para que se lea su texto. Dejar el tamaño de la forma anterior
       * deja el logo diminuto o desbordado, así que se lleva al recomendado de
       * la forma nueva. Después se puede ajustar a mano.
       */
      async function cambiarFormaLogo(valor) {
        const ok = await guardarApariencia('logo_forma', apariencia.logoForma, valor);
        if (!ok) return;

        // Cada forma se ve bien en un rango distinto: el escudo es cuadrado, el
        // vertical lleva el nombre debajo y el horizontal al costado. Dejar el
        // tamaño de la forma anterior deja el logo diminuto o desbordado.
        const sugeridoSidebar = apariencia.anchoSidebar.recomendado?.[valor];
        const sugeridoLogin = apariencia.anchoLogin.recomendado?.[valor];

        if (sugeridoSidebar) {
          await guardarApariencia('logo_ancho_sidebar', apariencia.anchoSidebar, sugeridoSidebar);
        }
        if (sugeridoLogin) {
          await guardarApariencia('logo_ancho_login', apariencia.anchoLogin, sugeridoLogin);
        }

        notificarExito('Forma del logo actualizada.');
      }

      /**
       * Guarda los dos tamaños de una vez.
       *
       * Van con botón y no al soltar el deslizador: ajustar un tamaño lleva
       * varios intentos, y guardar cada paso llena la pantalla de avisos y
       * manda una petición por cada píxel que se mueve. Mientras tanto la vista
       * previa ya muestra cómo va a quedar.
       */
      async function guardarTamanosLogo() {
        const sidebarOk = await guardarApariencia(
          'logo_ancho_sidebar', apariencia.anchoSidebar, apariencia.anchoSidebar.valor);
        const loginOk = await guardarApariencia(
          'logo_ancho_login', apariencia.anchoLogin, apariencia.anchoLogin.valor);

        if (sidebarOk && loginOk) notificarExito('Tamaños del logo guardados.');
      }

      /** Vuelve a los tamaños que están guardados. */
      function descartarTamanosLogo() {
        apariencia.anchoSidebar.valor = apariencia.anchoSidebar.guardado;
        apariencia.anchoLogin.valor = apariencia.anchoLogin.guardado;
      }

      /** Vuelve todo a como venía de fábrica. */
      async function restablecerApariencia() {
        await cambiarColorPrimario('#465fff');
        // cambiarFormaLogo ya lleva los tamaños al recomendado de la forma.
        await cambiarFormaLogo('escudo');
        await guardarApariencia('logo_ancho_sidebar', apariencia.anchoSidebar, 40);
        await guardarApariencia('logo_ancho_login', apariencia.anchoLogin, 56);
        notificarExito('Apariencia restablecida.');
      }

      /** Olvida la elección personal de tema de este dispositivo. */
      function volverAlTemaDelSistema() {
        tema.olvidarPreferenciaPropia();
        modoOscuro.value = tema.esOscuro();
        tienePreferenciaPropia.value = false;
        notificarExito('Este dispositivo vuelve a seguir el tema del sistema.');
      }

      async function alternarInterruptor(interruptor) {
        const nuevoValor = interruptor.activo ? 'FALSE' : 'TRUE';
        // Lo cambiamos en pantalla de inmediato y lo revertimos si falla:
        // esperar la respuesta hace sentir el interruptor pegajoso.
        interruptor.activo = !interruptor.activo;

        try {
          await api.configuracion.guardar(interruptor.clave, nuevoValor);
          notificarExito(`${interruptor.etiqueta}: ${interruptor.activo ? 'activado' : 'desactivado'}.`);
        } catch (fallo) {
          interruptor.activo = !interruptor.activo;
          notificarError(fallo.message || 'No se pudo guardar el cambio.');
        }
      }

      async function revisarSistema() {
        revisandoSistema.value = true;
        try {
          diagnostico.value = await api.asistencias.diagnostico();
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo revisar el sistema.');
        } finally {
          revisandoSistema.value = false;
        }
      }

      // ---- Vaciado de registros ----
      //
      // Sirve para dejar la base limpia entre prueba y prueba sin entrar a
      // Supabase. Es destructivo y no tiene vuelta atrás, así que además del
      // permiso de administrador que valida el backend, hay que escribir el
      // nombre del conjunto a mano.
      const purga = reactive({
        conjuntos: [],
        cargando: false,
        elegido: null,       // el conjunto que se está por vaciar
        confirmacion: '',
        ejecutando: false,
        error: ''
      });

      /** ¿Lo escrito coincide con el nombre del conjunto? */
      const confirmacionValida = computed(() => {
        if (!purga.elegido) return false;
        return purga.confirmacion.trim().toLowerCase() === purga.elegido.etiqueta.toLowerCase();
      });

      async function cargarPurgables() {
        purga.cargando = true;
        try {
          const datos = await api.configuracion.purgables();
          purga.conjuntos = datos.conjuntos || [];
        } catch (fallo) {
          // Sin permisos de administrador el backend responde 403. No es un
          // error que haya que gritarle a quien solo vino a ver la pantalla.
          purga.conjuntos = [];
          if (!fallo.esSesionVencida) console.info('[configuracion]', fallo.message);
        } finally {
          purga.cargando = false;
        }
      }

      function pedirPurga(conjunto) {
        purga.elegido = conjunto;
        purga.confirmacion = '';
        purga.error = '';
      }

      function cancelarPurga() {
        purga.elegido = null;
        purga.confirmacion = '';
        purga.error = '';
      }

      async function confirmarPurga() {
        if (!purga.elegido || !confirmacionValida.value) return;

        purga.ejecutando = true;
        purga.error = '';

        try {
          const resultado = await api.configuracion.purgar(
            purga.elegido.clave,
            purga.confirmacion.trim()
          );

          notificarExito(
            resultado.total === 0
              ? `«${resultado.conjunto}» ya estaba vacío.`
              : `Se borraron ${resultado.total} registros de «${resultado.conjunto}».`
          );

          cancelarPurga();
          // Los catálogos en pantalla quedaron desactualizados: lo que se
          // acaba de borrar sigue listado hasta que se vuelvan a pedir.
          await Promise.all([recargarCatalogos(), cargarPurgables()]);
          diagnostico.value = null;
        } catch (fallo) {
          purga.error = fallo.message || 'No se pudo vaciar.';
        } finally {
          purga.ejecutando = false;
        }
      }

      // =====================================================================
      // Portal público de invitaciones
      // =====================================================================

      const invitacion = reactive({
        dui: '', resultado: null, error: '', consultando: false,
        guardando: false,
        // Campo opcional del formulario. Viaja siempre, vacio o no.
        // El porque esta en api/_lib/controladores/invitacionPublica.js.
        reserva: '',
        // Se muestra en iPhone, donde la imagen se abre en otra pestaña en vez
        // de descargarse: sin explicarlo, parece que el botón no hizo nada.
        avisoGuardado: ''
      });

      /*
       * El acertijo que hay que resolver para poder consultar.
       *
       * Se empieza a resolver al abrir la pantalla, no al pulsar «Consultar»:
       * mientras la persona escribe sus diez digitos, la cuenta ya termino.
       */
      const desafio = usarDesafio(() => api.invitacion.desafio());

      /** El QR a pantalla completa, para mostrarlo en la puerta del evento. */
      const qrAmpliado = ref(false);

      /*
       * El diseño de la invitación que se está mostrando.
       *
       * Es el mismo modelo que pinta la imagen descargable. Que los dos salgan
       * de acá es lo que impide que la pantalla diga una cosa y el archivo otra.
       *
       * Sin resultado devuelve el modelo por defecto en lugar de null: así la
       * plantilla no tiene que preguntar si existe antes de leer un color.
       */
      const diseno = computed(() => {
        const resultado = invitacion.resultado;
        if (!resultado) return construirModelo(null, {});

        return construirModelo(resultado.invitacionConfig, {
          evento: resultado.evento,
          fecha: resultado.fechaEvento ? formato.formatearFechaLarga(resultado.fechaEvento) : '',
          ubicacion: resultado.ubicacion || '',
          nombre: formato.nombreCompleto(resultado.empleado),
          dui: formato.formatearDui(resultado.empleado.dui),
          urlQr: resultado.empleado.qr_url
        });
      });

      const bloquesDelEvento = computed(() => bloquesDe(diseno.value, 'evento'));
      const muestraDui = computed(() => diseno.value.bloques.some((b) => b.papel === 'dui'));
      const textoDelPie = computed(() => {
        const pie = diseno.value.bloques.find((b) => b.papel === 'pie');
        return pie ? pie.texto : '';
      });

      /**
       * Guarda la invitación completa como imagen.
       *
       * Antes esto era un enlace con `download` apuntando al QR de QuickChart,
       * que no descarga nada: el atributo se ignora entre dominios distintos y
       * el navegador abría el PNG suelto. El empleado terminaba con un cuadrito
       * negro sin su nombre ni el evento.
       */
      async function guardarInvitacion() {
        if (!invitacion.resultado) return;

        invitacion.guardando = true;
        invitacion.avisoGuardado = '';

        try {
          const persona = invitacion.resultado.empleado;
          const resultado = await servicioInvitacion.descargar({
            evento: invitacion.resultado.evento,
            fecha: invitacion.resultado.fechaEvento
              ? formato.formatearFechaLarga(invitacion.resultado.fechaEvento)
              : '',
            ubicacion: invitacion.resultado.ubicacion || '',
            nombre: formato.nombreCompleto(persona),
            dui: formato.formatearDui(persona.dui),
            urlQr: persona.qr_url,
            // El mismo diseño que se está viendo en pantalla.
            config: invitacion.resultado.invitacionConfig
          });

          invitacion.avisoGuardado = resultado.descargada
            ? 'Tu invitación se descargó.'
            : 'Mantén pulsada la imagen y elige "Guardar en Fotos".';
        } catch (fallo) {
          console.error('[invitacion]', fallo);
          invitacion.avisoGuardado =
            'No se pudo generar la imagen. Toma una captura de pantalla de esta página.';
        } finally {
          invitacion.guardando = false;
        }
      }

      async function consultarInvitacion() {
        invitacion.error = '';
        invitacion.resultado = null;
        invitacion.avisoGuardado = '';

        if (!invitacion.dui) {
          invitacion.error = 'Escribe tu DUI.';
          return;
        }

        qrAmpliado.value = false;

        invitacion.consultando = true;
        try {
          // Si ya se resolvio mientras escribia, esto vuelve al instante.
          const resuelto = await desafio.obtener();

          invitacion.resultado = await api.invitacion.consultar(
            invitacion.dui,
            resuelto,
            invitacion.reserva
          );
        } catch (fallo) {
          invitacion.error = fallo.message || 'No se pudo consultar la invitación.';
        } finally {
          invitacion.consultando = false;
        }
      }

      // =====================================================================
      // Navegación
      // =====================================================================

      /**
       * Solo las entradas del menú que el rol actual puede ver.
       *
       * Una entrada sin `modulo` la ve cualquiera. Es el caso del manual: no
       * hay permiso que valga sobre la ayuda, y filtrarla por permisos la
       * escondería justo de quien más la necesita. Sin este caso especial
       * quedaba oculta, porque preguntar por un módulo que no existe devuelve
       * que no se puede.
       */
      const menuVisible = computed(() =>
        MENU.map((grupo) => ({
          ...grupo,
          items: grupo.items.filter(
            (item) => !item.modulo || permisos.tienePermiso(item.modulo, 'Ver')
          )
        })).filter((grupo) => grupo.items.length > 0)
      );

      const tituloVista = computed(() => {
        for (const grupo of MENU) {
          const encontrado = grupo.items.find((item) => item.vista === vista.value);
          if (encontrado) return encontrado.etiqueta;
        }
        return 'Panel';
      });

      async function cambiarVista(nueva) {
        /*
         * El manual no es una vista: es una capa.
         *
         * Sigue estando en el menú, porque es donde la gente lo va a buscar,
         * pero elegirlo abre la capa encima de lo que se estaba haciendo en
         * lugar de reemplazarlo. Así, al cerrarla, se vuelve exactamente a
         * donde se estaba.
         */
        if (nueva === 'manual') {
          abrirManual();
          if (esMovil.value) sidebarMovil.value = false;
          return;
        }

        // Al salir del escáner apagamos la cámara: si no, sigue encendida y
        // consumiendo batería en segundo plano.
        if (vista.value === 'scanner' && nueva !== 'scanner') {
          await escaner.detener();
        }
        vista.value = nueva;
        if (esMovil.value) sidebarMovil.value = false;
      }

      watch(vista, (nueva) => {
        if (nueva !== 'configuracion') return;
        cargarConfiguracion();
        cargarPurgables();
      });

      // Al entrar al escáner o al listado se pide de una. El sondeo de fondo
      // espera treinta segundos entre turnos, y abrir Asistencias para mirar un
      // número que tarda medio minuto en despertarse no sirve de nada.
      watch(vista, (nueva) => {
        if (nueva === 'scanner' || nueva === 'asistentes') {
          sincronizacion.sincronizarAhora();
        }
      });

      // Los sorteos traen su lista de premios y el conteo de lo repartido, que
      // no vienen en el bundle inicial. Se piden al entrar a cualquiera de las
      // dos pantallas que los usan.
      watch(vista, (nueva) => {
        if (nueva === 'rifa' || nueva === 'sorteos') sorteos.cargar();
      });

      // La tabla de administración usa la búsqueda y la paginación de
      // usarCatalogo, pero las filas tienen que ser las enriquecidas: las del
      // bundle no traen los premios ni el conteo de lo repartido.
      watch(() => sorteos.lista, (nueva) => {
        sorteosCatalogo.lista = nueva || [];
      }, { immediate: true });

      // =====================================================================
      // Ciclo de vida
      // =====================================================================

      function alRedimensionar() {
        anchoVentana.value = window.innerWidth;
        if (window.innerWidth >= 1024) sidebarMovil.value = false;
      }

      /** Cierra el menú de usuario al hacer clic fuera de él. */
      function alHacerClicFuera(evento) {
        if (!menuUsuarioAbierto.value) return;
        if (!evento.target.closest('[data-menu-usuario]')) {
          menuUsuarioAbierto.value = false;
        }
      }

      onMounted(async () => {
        window.addEventListener('resize', alRedimensionar);
        document.addEventListener('click', alHacerClicFuera);
        document.addEventListener('keydown', alPresionarTecla);
        tema.seguirAlSistema((modo) => { modoOscuro.value = modo === 'oscuro'; });

        // El portal público no necesita sesión ni catálogos.
        const parametros = new URLSearchParams(location.search);
        if (parametros.get('invitacion') === '1') {
          modoPublico.value = true;
          vista.value = 'invitacion-publica';
          const duiPrecargado = parametros.get('dui');
          if (duiPrecargado) invitacion.dui = duiPrecargado.replace(/[^0-9]/g, '');

          // El acertijo se empieza a resolver ya, mientras la persona escribe.
          // Para cuando pulse «Consultar», la cuenta suele estar terminada.
          desafio.preparar();

          cargando.value = false;
          ocultarPantallaCarga();
          return;
        }

        // Sesión guardada de una visita anterior.
        const guardada = almacenSesion.leer();
        if (guardada && guardada.token) {
          Object.assign(sesion, guardada);
          // Si la sesión guardada era prestada, la franja de aviso vuelve a
          // aparecer tras recargar la página.
          sesion.impersonadoPor = guardada.impersonadoPor || null;
          await recargarCatalogos();
          sincronizacion.arrancar();
          aplicarAparienciaInstitucional();
        }

        escaner.vigilarConexion();
        cargando.value = false;
        ocultarPantallaCarga();
      });

      /** Escape cierra el manual, como en cualquier capa que tape la pantalla. */
      function alPresionarTecla(evento) {
        if (evento.key !== 'Escape' || !manualAbierto.value) return;

        if (indiceManualAbierto.value) indiceManualAbierto.value = false;
        else cerrarManual();
      }

      onBeforeUnmount(() => {
        // Sin esto la voz sigue sonando despues de cerrar.
        lectura.limpiar();
        window.removeEventListener('resize', alRedimensionar);
        document.removeEventListener('click', alHacerClicFuera);
        document.removeEventListener('keydown', alPresionarTecla);
        escaner.detener();
      });

      function ocultarPantallaCarga() {
        const pantalla = document.getElementById('pantalla-carga');
        if (pantalla) pantalla.style.display = 'none';
      }

      // =====================================================================
      // Lo que ven las plantillas
      // =====================================================================
      return {
        // General
        cargando, vista, modoPublico, esMovil, haySesion, anchoVentana,
        sesion, sidebarAbierto, sidebarMovil, sidebarExpandido,
        menuUsuarioAbierto, pestanaUsuarios,
        modoOscuro, alternarTema,
        menuVisible, tituloVista, cambiarVista,

        // Instalación en el dispositivo
        pwa,

        // Notificaciones
        notificaciones, cerrarNotificacion,
        notificar, notificarExito, notificarError, notificarAlerta, notificarInfo,

        // Sesión
        formularioLogin, errorLogin, entrando, verPassword,
        iniciarSesion, modalCierreAbierto, confirmarCierre,

        // Usuarios y roles
        gestionCuentas, esMiCuenta,
        cambiarEstadoUsuario, cambiarEstadoRol, usarCuentaDe, volverAMiCuenta,

        // Guías
        manual, lectura, opcionesVozAbiertas, indiceManualAbierto, manualAbierto,
        abrirGuia, abrirManual, cerrarManual, abrirIndiceManual, irALaPantalla,
        irAlCapitulo, escucharDiapositiva, lecturaContinua,
        alTocarInicio, alTocarFin,
        irAPasoManual, pasoSiguienteManual, pasoAnteriorManual,

        // Cambio de la contraseña propia
        cambioClave, abrirCambioClave, guardarClaveNueva,

        // Catálogos
        departamentos, empleados, premios, usuarios, roles, eventos,
        vistaPreviaInvitacion, bloquesPrevia, reiniciarDiseno, copiarDisenoDe, DISPOSICIONES,
        disenoInvitacion, elegirEventoDelDiseno, guardarDisenoInvitacion,
        PESTANAS_CONFIG, pestanaConfig,
        asistencias, busquedaAsistencias, asistenciasFiltradas,
        permisosCargados, eventoActivo, resumen,
        recargarCatalogos, DISTRITOS,

        // Permisos
        permisos,

        // Escáner
        escaner,

        // Registros pendientes en el dispositivo
        pendientes,

        // Buscador de personas
        buscador,

        // Refresco periódico
        sincronizacion,

        // Importar / exportar
        importacion,
        conciliacion, departamentosActivos, marcadosDepartamento, marcadosDistrito,
        cerrarConciliacion, importarDepartamentos, exportar, descargarPlantilla,

        // Eventos
        activarEvento, desactivarEvento,
        bajaEvento, pedirBajaEvento, cancelarBajaEvento, confirmarBajaEvento,
        compartirInvitacion, enlaceCopiado, mapa, enlaceComoLlegar,

        // Sorteos
        sorteos,
        confeti, cerrarCartel, sorteosCatalogo, editorSorteo, totalUnidadesSorteo,
        abrirSorteo, cerrarSorteo, guardarSorteo,
        agregarPremioAlSorteo, quitarPremioDelSorteo,

        // Detalle de un empleado
        detalle, qrDetalle, enlaceDetalle, departamentoDetalle, asistenciaDetalle,
        abrirDetalle, cerrarDetalle, editarDesdeDetalle, ejecutarBaja,
        descargarQrDetalle, copiarEnlaceDetalle,

        // Configuración
        interruptores, diagnostico, revisandoSistema,
        alternarInterruptor, revisarSistema, cargarConfiguracion,
        apariencia, tienePreferenciaPropia, paletaPrevia, contrasteDelColor,
        cambiarTemaSistema, volverAlTemaDelSistema,
        cambiarColorPrimario, cambiarFormaLogo,
        hayTamanosSinGuardar, guardarTamanosLogo, descartarTamanosLogo,
        restablecerApariencia,

        // Vaciado de registros
        purga, confirmacionValida, cargarPurgables,
        pedirPurga, cancelarPurga, confirmarPurga,

        // Portal público
        invitacion, consultarInvitacion, guardarInvitacion, desafio,
        diseno, bloquesDelEvento, muestraDui, textoDelPie, qrAmpliado,

        // Utilidades de formato disponibles en las plantillas
        ...formato
      };
    }
  });

  // Si algo revienta dentro de un componente, lo dejamos registrado y avisamos
  // en pantalla en vez de quedar con la interfaz congelada sin explicación.
  aplicacion.config.errorHandler = (error, instancia, informacion) => {
    console.error('[vue]', informacion, error);
  };

  registrarComponentes(aplicacion);
  aplicacion.mount('#app');
}

iniciar();
