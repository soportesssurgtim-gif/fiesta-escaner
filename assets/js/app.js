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
import * as formato from './nucleo/formato.js';

import { api } from './servicios/servicioApi.js';
import {
  disenador, ZONAS_PREDEFINIDAS, MAXIMO_POR_LOTE,
  urlQr, descargarQr, enlaceInvitacion
} from './servicios/servicioTarjetas.js';

import { usarNotificaciones } from './composables/usarNotificaciones.js';
import { usarCatalogo } from './composables/usarCatalogo.js';
import { usarPermisos } from './composables/usarPermisos.js';
import { usarEscanerQr } from './composables/usarEscanerQr.js';
import { usarImportacionCsv } from './composables/usarImportacionCsv.js';

import { guiaDe } from './contenido/guias.js';
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
        nombreMostrar: null, rol: null, rolId: null
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

      // ---- Notificaciones ----
      const {
        notificaciones, cerrarNotificacion, notificar,
        notificarExito, notificarError, notificarAlerta, notificarInfo
      } = usarNotificaciones();

      // ---- Tema ----
      const modoOscuro = ref(tema.esOscuro());
      function alternarTema() {
        modoOscuro.value = tema.alternar() === 'oscuro';
      }

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

      // ---- Guías ----
      const guiaAbierta = ref(false);
      const guiaActual = ref(guiaDe('scanner'));

      function abrirGuia() {
        guiaActual.value = guiaDe(vista.value);
        guiaAbierta.value = true;
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
        formularioVacio: { id: null, nombre: '', fechaEvento: '', ubicacion: '', activo: 'FALSE' },
        alAbrir: (registro) => ({
          id: registro.id,
          nombre: registro.nombre || '',
          fechaEvento: registro.fecha_evento || '',
          ubicacion: registro.ubicacion || '',
          activo: String(registro.activo || 'FALSE').toUpperCase()
        }),
        camposBusqueda: ['nombre', 'ubicacion']
      });

      const sorteos = usarCatalogo({
        alGuardar: (datos) => api.sorteos.guardar(datos),
        formularioVacio: { id: null, nombre: '', premio: '' },
        camposBusqueda: ['nombre']
      });

      // ---- Permisos ----
      const permisos = usarPermisos({
        sesion,
        obtenerPermisos: () => permisosCargados.value,
        obtenerRoles: () => roles.lista,
        notificar
      });

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
        sorteos.lista = bundle.sorteos || [];

        permisosCargados.value = bundle.permisos || [];
        asistencias.value = bundle.asistencias || [];
        eventoActivo.value =
          bundle.eventoActivo ||
          (bundle.eventos || []).find((evento) => formato.esVerdadero(evento.activo)) ||
          null;
        resumen.total = bundle.resumen?.total ?? asistencias.value.length;

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
            rolId: respuesta.rolId
          });
          almacenSesion.guardar(respuesta);
          poblarCatalogos(respuesta.datosIniciales);

          formularioLogin.password = '';
          vista.value = 'scanner';
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
        almacenSesion.limpiar();
        Object.assign(sesion, {
          token: null, usuario: null, correo: null,
          nombreMostrar: null, rol: null, rolId: null
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
        }
      });

      // =====================================================================
      // Importación de CSV
      // =====================================================================

      const importacion = usarImportacionCsv({
        notificar,
        alTerminar: recargarCatalogos
      });

      const importarEmpleados = (evento) =>
        importacion.importar(evento, 'empleados', (csv) => api.empleados.importar(csv));
      const importarDepartamentos = (evento) =>
        importacion.importar(evento, 'departamentos', (csv) => api.departamentos.importar(csv));

      async function exportar(recurso) {
        try {
          await api[recurso].exportar();
          notificarExito('La descarga comenzó.');
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo exportar.');
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

      const sorteando = ref(false);
      const ganador = ref(null);
      const errorSorteo = ref('');
      const sorteoElegido = ref('');

      async function sortear(sorteoId) {
        const elegido = sorteoId || sorteoElegido.value || sorteos.formulario.id;
        if (!elegido) {
          errorSorteo.value = 'Primero elige un sorteo.';
          return;
        }

        errorSorteo.value = '';
        ganador.value = null;
        sorteando.value = true;

        try {
          ganador.value = await api.sorteos.sortear(elegido);
          notificarExito('¡Tenemos ganador!');
          await recargarCatalogos();
        } catch (fallo) {
          errorSorteo.value = fallo.message || 'No se pudo realizar el sorteo.';
        } finally {
          sorteando.value = false;
        }
      }

      // =====================================================================
      // Tarjetas de invitación
      // =====================================================================

      const plantillas = ref([]);
      const plantillaElegida = ref('');
      const nombrePlantilla = ref('');
      const campoQr = ref('dui');
      const guardandoPlantilla = ref(false);
      const hayPlantillaCargada = ref(false);

      const modalGenerarAbierto = ref(false);
      const seleccionEmpleados = ref([]);
      const busquedaTarjetas = ref('');
      const generando = ref(false);
      const progresoTarjetas = reactive({ hechas: 0, total: 0, porcentaje: 0 });

      const empleadosParaTarjetas = computed(() => {
        const termino = busquedaTarjetas.value.trim();
        const lista = empleados.lista.filter((persona) => formato.esVerdadero(persona.activo));
        if (!termino) return lista;
        return lista.filter(
          (persona) =>
            formato.coincide(formato.nombreCompleto(persona), termino) ||
            formato.coincide(persona.dui, termino)
        );
      });

      async function cargarPlantillas() {
        try {
          plantillas.value = await api.tarjetas.plantillas();
        } catch (fallo) {
          console.error('[tarjetas]', fallo);
        }
      }

      async function subirPlantilla(evento) {
        const archivo = evento.target.files && evento.target.files[0];
        evento.target.value = '';
        if (!archivo) return;

        try {
          await disenador.cargarPlantillaDesdeArchivo(archivo);
          hayPlantillaCargada.value = true;
          notificarExito('Plantilla lista. Arrastra el QR hasta su lugar.');
        } catch (fallo) {
          notificarError(fallo.message);
        }
      }

      async function guardarPlantilla() {
        if (!hayPlantillaCargada.value) {
          notificarError('Primero sube una plantilla.');
          return;
        }

        guardandoPlantilla.value = true;
        try {
          await api.tarjetas.guardarPlantilla(disenador.datosParaGuardar(nombrePlantilla.value));
          await cargarPlantillas();
          nombrePlantilla.value = '';
          notificarExito('Plantilla guardada.');
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo guardar la plantilla.');
        } finally {
          guardandoPlantilla.value = false;
        }
      }

      async function eliminarPlantilla(id) {
        try {
          await api.tarjetas.eliminarPlantilla(id);
          await cargarPlantillas();
          if (plantillaElegida.value === id) plantillaElegida.value = '';
          notificarExito('Plantilla eliminada.');
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo eliminar.');
        }
      }

      /** Deja lista la plantilla guardada que se eligió, para poder generar. */
      async function prepararPlantillaElegida() {
        const plantilla = plantillas.value.find((fila) => fila.id === plantillaElegida.value);
        if (!plantilla) throw new Error('Elige una plantilla primero.');
        await disenador.usarPlantillaGuardada(plantilla);
        return plantilla;
      }

      async function generarUna(empleado) {
        try {
          await prepararPlantillaElegida();
          await disenador.descargarIndividual(empleado);
          notificarExito('Tarjeta generada.');
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo generar la tarjeta.');
        }
      }

      function abrirGeneracionMasiva() {
        if (plantillas.value.length === 0) {
          notificarError('Primero guarda al menos una plantilla.');
          return;
        }
        seleccionEmpleados.value = [];
        busquedaTarjetas.value = '';
        progresoTarjetas.hechas = 0;
        progresoTarjetas.total = 0;
        progresoTarjetas.porcentaje = 0;
        modalGenerarAbierto.value = true;
      }

      function alternarSeleccion(id) {
        const indice = seleccionEmpleados.value.indexOf(id);
        if (indice >= 0) seleccionEmpleados.value.splice(indice, 1);
        else seleccionEmpleados.value.push(id);
      }

      function seleccionarTodosVisibles() {
        const visibles = empleadosParaTarjetas.value.slice(0, MAXIMO_POR_LOTE).map((e) => e.id);
        seleccionEmpleados.value =
          seleccionEmpleados.value.length === visibles.length ? [] : visibles;
      }

      async function generarLote() {
        if (seleccionEmpleados.value.length === 0) {
          notificarError('Selecciona al menos una persona.');
          return;
        }

        generando.value = true;
        try {
          await prepararPlantillaElegida();

          const elegidos = empleados.lista.filter((persona) =>
            seleccionEmpleados.value.includes(persona.id)
          );

          const resultado = await disenador.generarLoteZip(elegidos, disenador.campoQr, (hechas, total) => {
            progresoTarjetas.hechas = hechas;
            progresoTarjetas.total = total;
            progresoTarjetas.porcentaje = Math.round((hechas / total) * 100);
          });

          modalGenerarAbierto.value = false;

          if (resultado.fallidos.length > 0) {
            notificarAlerta(
              `${resultado.generadas} generadas. No se pudo con: ${resultado.fallidos.join(', ')}`
            );
          } else {
            notificarExito(`${resultado.generadas} tarjetas listas. La descarga comenzó.`);
          }
        } catch (fallo) {
          notificarError(fallo.message || 'No se pudo generar el lote.');
        } finally {
          generando.value = false;
          progresoTarjetas.porcentaje = 0;
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
        generando: false
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
        // Saber si hay plantillas define si se puede ofrecer la tarjeta
        // completa o solamente el QR suelto.
        if (plantillas.value.length === 0) cargarPlantillas();
      }

      function cerrarDetalle() {
        detalle.abierto = false;
        detalle.persona = null;
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

      /**
       * Genera la tarjeta completa de esta persona.
       * Si todavía no se eligió plantilla en la vista de Tarjetas, toma la
       * primera guardada: desde acá no hay dónde elegirla y no hacer nada
       * sería peor que decidir por el usuario.
       */
      async function generarTarjetaDetalle() {
        if (plantillas.value.length === 0) {
          notificarError('No hay ninguna plantilla guardada. Crea una en la vista de Tarjetas.');
          return;
        }
        if (!plantillaElegida.value) plantillaElegida.value = plantillas.value[0].id;

        detalle.generando = true;
        try {
          await generarUna(detalle.persona);
        } finally {
          detalle.generando = false;
        }
      }

      // =====================================================================
      // Configuración
      // =====================================================================

      const interruptores = ref([]);
      const diagnostico = ref(null);
      const revisandoSistema = ref(false);

      async function cargarConfiguracion() {
        try {
          const datos = await api.configuracion.leer();
          interruptores.value = datos.interruptores || [];
        } catch (fallo) {
          console.error('[configuracion]', fallo);
        }
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

      // =====================================================================
      // Portal público de invitaciones
      // =====================================================================

      const invitacion = reactive({
        dui: '', ultimos4: '', resultado: null, error: '', consultando: false
      });

      async function consultarInvitacion() {
        invitacion.error = '';
        invitacion.resultado = null;

        if (!invitacion.dui || !invitacion.ultimos4) {
          invitacion.error = 'Escribe tu DUI y los últimos 4 dígitos.';
          return;
        }

        invitacion.consultando = true;
        try {
          invitacion.resultado = await api.invitacion.consultar(invitacion.dui, invitacion.ultimos4);
        } catch (fallo) {
          invitacion.error = fallo.message || 'No se pudo consultar la invitación.';
        } finally {
          invitacion.consultando = false;
        }
      }

      // =====================================================================
      // Navegación
      // =====================================================================

      /** Solo las entradas del menú que el rol actual puede ver. */
      const menuVisible = computed(() =>
        MENU.map((grupo) => ({
          ...grupo,
          items: grupo.items.filter((item) => permisos.tienePermiso(item.modulo, 'Ver'))
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
        // Al salir del escáner apagamos la cámara: si no, sigue encendida y
        // consumiendo batería en segundo plano.
        if (vista.value === 'scanner' && nueva !== 'scanner') {
          await escaner.detener();
        }
        if (vista.value === 'tarjetas' && nueva !== 'tarjetas') {
          disenador.desmontar();
        }

        vista.value = nueva;
        if (esMovil.value) sidebarMovil.value = false;
      }

      // Al entrar a tarjetas hay que esperar a que el canvas exista en el DOM.
      watch(vista, async (nueva) => {
        if (nueva !== 'tarjetas') return;
        await nextTick();
        disenador.montar('canvasTarjeta');
        cargarPlantillas();
      });

      watch(vista, (nueva) => {
        if (nueva === 'configuracion') cargarConfiguracion();
      });

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
        tema.seguirAlSistema((modo) => { modoOscuro.value = modo === 'oscuro'; });

        // El portal público no necesita sesión ni catálogos.
        const parametros = new URLSearchParams(location.search);
        if (parametros.get('invitacion') === '1') {
          modoPublico.value = true;
          vista.value = 'invitacion-publica';
          const duiPrecargado = parametros.get('dui');
          if (duiPrecargado) invitacion.dui = duiPrecargado.replace(/[^0-9]/g, '');
          cargando.value = false;
          ocultarPantallaCarga();
          return;
        }

        // Sesión guardada de una visita anterior.
        const guardada = almacenSesion.leer();
        if (guardada && guardada.token) {
          Object.assign(sesion, guardada);
          await recargarCatalogos();
        }

        escaner.vigilarConexion();
        cargando.value = false;
        ocultarPantallaCarga();
      });

      onBeforeUnmount(() => {
        window.removeEventListener('resize', alRedimensionar);
        document.removeEventListener('click', alHacerClicFuera);
        escaner.detener();
        disenador.desmontar();
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
        sesion, sidebarAbierto, sidebarMovil, menuUsuarioAbierto, pestanaUsuarios,
        modoOscuro, alternarTema,
        menuVisible, tituloVista, cambiarVista,

        // Notificaciones
        notificaciones, cerrarNotificacion,
        notificar, notificarExito, notificarError, notificarAlerta, notificarInfo,

        // Sesión
        formularioLogin, errorLogin, entrando, verPassword,
        iniciarSesion, modalCierreAbierto, confirmarCierre,

        // Guías
        guiaAbierta, guiaActual, abrirGuia,

        // Cambio de la contraseña propia
        cambioClave, abrirCambioClave, guardarClaveNueva,

        // Catálogos
        departamentos, empleados, premios, usuarios, roles, eventos, sorteos,
        asistencias, busquedaAsistencias, asistenciasFiltradas,
        permisosCargados, eventoActivo, resumen,
        recargarCatalogos, DISTRITOS,

        // Permisos
        permisos,

        // Escáner
        escaner,

        // Importar / exportar
        importacion, importarEmpleados, importarDepartamentos, exportar,

        // Eventos y sorteos
        activarEvento, sortear, sorteando, ganador, errorSorteo, sorteoElegido,

        // Tarjetas
        plantillas, plantillaElegida, nombrePlantilla, campoQr, hayPlantillaCargada,
        guardandoPlantilla, subirPlantilla, guardarPlantilla, eliminarPlantilla,
        modalGenerarAbierto, seleccionEmpleados, busquedaTarjetas, generando,
        progresoTarjetas, empleadosParaTarjetas, abrirGeneracionMasiva,
        alternarSeleccion, seleccionarTodosVisibles, generarUna, generarLote,
        ZONAS_PREDEFINIDAS, MAXIMO_POR_LOTE,
        aplicarZona: (nombre) => disenador.aplicarZona(nombre),
        cambiarCampoQr: (campo) => { campoQr.value = campo; disenador.establecerCampoQr(campo); },

        // Detalle de un empleado
        detalle, qrDetalle, enlaceDetalle, departamentoDetalle, asistenciaDetalle,
        abrirDetalle, cerrarDetalle, editarDesdeDetalle,
        descargarQrDetalle, copiarEnlaceDetalle, generarTarjetaDetalle,

        // Configuración
        interruptores, diagnostico, revisandoSistema,
        alternarInterruptor, revisarSistema, cargarConfiguracion,

        // Portal público
        invitacion, consultarInvitacion,

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
