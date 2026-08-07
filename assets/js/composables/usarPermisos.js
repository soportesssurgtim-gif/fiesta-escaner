/**
 * Permisos por rol y módulo.
 *
 * La matriz tiene una regla que conviene tener en un solo lugar: "ver" es la
 * base de todo. Si alguien no puede ver un módulo, tampoco puede agregar,
 * editar ni eliminar en él. Y al revés: si le das cualquiera de las otras tres,
 * "ver" se activa solo, porque no tendría sentido dejarlo a medias.
 */

import { api } from '../servicios/servicioApi.js';
import { esVerdadero, coincide } from '../nucleo/formato.js';

const { ref, reactive, computed } = Vue;

/** Etiquetas legibles de cada módulo, para no mostrarle "dpto" al usuario. */
export const NOMBRES_DE_MODULO = {
  scanner: 'Escáner QR',
  asistencias: 'Asistencias',
  tarjetas: 'Tarjetas de invitación',
  departamentos: 'Departamentos',
  empleados: 'Empleados',
  eventos: 'Eventos',
  sorteos: 'Sorteos',
  premios: 'Premios',
  configuracion: 'Configuración',
  usuarios: 'Usuarios',
  permisos: 'Permisos'
};

const ACCIONES = ['puedeVer', 'puedeAgregar', 'puedeEditar', 'puedeEliminar'];

/**
 * @param {Object} config
 * @param {Object} config.sesion            Estado reactivo de la sesión.
 * @param {Function} config.obtenerPermisos Getter de la matriz cargada del servidor.
 * @param {Function} config.obtenerRoles    Getter de la lista de roles.
 *
 * Las dos listas entran como funciones y no como valores porque se reemplazan
 * enteras en cada recarga de catálogos; guardar la referencia dejaría este
 * composable mirando datos viejos.
 */
export function usarPermisos({ sesion, obtenerPermisos, obtenerRoles, notificar }) {
  const rolSeleccionado = ref(null);
  const busqueda = ref('');
  const matriz = ref([]);
  const guardando = ref(false);

  /** ¿La sesión actual es de un administrador con acceso total? */
  const esAdministrador = computed(() => {
    const rol = String(sesion.rol || '').trim().toUpperCase();
    return rol === 'ADMIN' || rol === 'ADMINISTRADOR';
  });

  /**
   * ¿El usuario actual puede hacer esto en este módulo?
   * Es la función que consultan todas las vistas para mostrar u ocultar botones.
   *
   * Recordatorio: esto es comodidad de interfaz, no seguridad. El backend
   * vuelve a validar cada operación por su cuenta.
   */
  function tienePermiso(modulo, accion = 'Ver') {
    if (!sesion.token) return false;
    if (esAdministrador.value) return true;

    const permiso = (obtenerPermisos() || []).find(
      (fila) => fila.modulo === modulo && fila.rol === sesion.rolId
    );
    if (!permiso) return false;

    const campo = 'puede_' + accion.toLowerCase();
    return esVerdadero(permiso[campo]);
  }

  /** Arma la matriz editable del rol elegido, con todos los módulos siempre. */
  function construirMatriz() {
    const rolId = rolSeleccionado.value;
    if (!rolId) {
      matriz.value = [];
      return;
    }

    const delRol = (obtenerPermisos() || []).filter((fila) => fila.rol === rolId);

    // Listamos todos los módulos conocidos, no solo los que ya tienen fila.
    // Antes solo aparecían los que ya estaban guardados, así que un módulo
    // nuevo era invisible y no había forma de darle permiso desde la interfaz.
    matriz.value = Object.keys(NOMBRES_DE_MODULO).map((modulo) => {
      const existente = delRol.find((fila) => fila.modulo === modulo);
      return {
        modulo,
        etiqueta: NOMBRES_DE_MODULO[modulo],
        id: existente ? existente.id : null,
        rol: rolId,
        puedeVer: existente ? esVerdadero(existente.puede_ver) : false,
        puedeAgregar: existente ? esVerdadero(existente.puede_agregar) : false,
        puedeEditar: existente ? esVerdadero(existente.puede_editar) : false,
        puedeEliminar: existente ? esVerdadero(existente.puede_eliminar) : false
      };
    });
  }

  const filtrados = computed(() => {
    const termino = busqueda.value.trim();
    if (!termino) return matriz.value;
    return matriz.value.filter((fila) => coincide(fila.etiqueta, termino));
  });

  function cambiarRol(rolId) {
    rolSeleccionado.value = rolId;
    busqueda.value = '';
    construirMatriz();
  }

  /** El objeto completo del rol que se está viendo. */
  const rolActual = computed(() =>
    (obtenerRoles() || []).find((rol) => rol.id === rolSeleccionado.value) || null
  );

  /**
   * ¿Este rol tiene acceso total por definición?
   *
   * Los roles llamados ADMIN o ADMINISTRADOR pasan por encima de la matriz: el
   * backend los deja hacer todo sin consultarla. Editarles las casillas daría
   * la falsa impresión de que se les puede recortar el acceso, así que la
   * pantalla los muestra en modo lectura.
   */
  function esRolDeAccesoTotal(rol) {
    const nombre = String(rol?.nombre_rol || '').trim().toUpperCase();
    return nombre === 'ADMIN' || nombre === 'ADMINISTRADOR';
  }

  const matrizEsSoloLectura = computed(() => esRolDeAccesoTotal(rolActual.value));

  /** Cuántas de las cuatro acciones tiene marcadas un módulo. */
  function accionesActivas(fila) {
    return ACCIONES.filter((accion) => fila[accion]).length;
  }

  /** Resumen para el encabezado: "7 de 11 módulos habilitados". */
  const resumenMatriz = computed(() => {
    if (matrizEsSoloLectura.value) {
      return { habilitados: matriz.value.length, total: matriz.value.length };
    }
    return {
      habilitados: matriz.value.filter((fila) => fila.puedeVer).length,
      total: matriz.value.length
    };
  });

  /** Marca o desmarca una columna entera (todos los módulos a la vez). */
  function alternarColumna(accion) {
    const encender = !matriz.value.every((fila) => fila[accion]);
    for (const fila of matriz.value) {
      fila[accion] = encender;
      // Se respeta la misma regla que al alternar de a una: cualquier acción
      // implica poder ver, y quitar "ver" apaga el resto.
      if (accion !== 'puedeVer' && encender) fila.puedeVer = true;
      if (accion === 'puedeVer' && !encender) {
        fila.puedeAgregar = false;
        fila.puedeEditar = false;
        fila.puedeEliminar = false;
      }
    }
  }

  /** Alterna una casilla respetando la dependencia con "ver". */
  function alternar(fila, accion) {
    fila[accion] = !fila[accion];

    if (accion === 'puedeVer' && !fila.puedeVer) {
      // Quitar "ver" apaga todo lo demás.
      fila.puedeAgregar = false;
      fila.puedeEditar = false;
      fila.puedeEliminar = false;
    } else if (accion !== 'puedeVer' && fila[accion]) {
      // Dar cualquier otra acción implica poder ver.
      fila.puedeVer = true;
    }
  }

  /** ¿Están las cuatro marcadas? Lo usa la casilla de "todo". */
  function tieneTodo(fila) {
    return ACCIONES.every((accion) => fila[accion]);
  }

  function alternarTodo(fila) {
    const nuevoValor = !tieneTodo(fila);
    ACCIONES.forEach((accion) => { fila[accion] = nuevoValor; });
  }

  async function guardar(alTerminar) {
    if (!rolSeleccionado.value) return;

    guardando.value = true;
    try {
      const resultado = await api.permisos.guardarMatriz(
        matriz.value.map((fila) => ({
          id: fila.id,
          rol: fila.rol,
          modulo: fila.modulo,
          puedeVer: fila.puedeVer,
          puedeAgregar: fila.puedeAgregar,
          puedeEditar: fila.puedeEditar,
          puedeEliminar: fila.puedeEliminar
        }))
      );

      notificar(`${resultado.guardados} permisos guardados.`, 'exito');
      if (alTerminar) await alTerminar();
    } catch (fallo) {
      notificar(fallo.message || 'No se pudieron guardar los permisos.', 'error');
    } finally {
      guardando.value = false;
    }
  }

  /** Selecciona el primer rol apenas llegan los catálogos. */
  function seleccionarPrimerRol() {
    const primero = (obtenerRoles() || [])[0];
    if (primero && !rolSeleccionado.value) {
      rolSeleccionado.value = primero.id;
    }
    construirMatriz();
  }

  // reactive() para que las plantillas usen `permisos.matriz` en vez de
  // `permisos.matriz.value`. Ver la nota en usarCatalogo.js.
  return reactive({
    rolSeleccionado,
    rolActual,
    busqueda,
    matriz,
    filtrados,
    guardando,
    esAdministrador,
    matrizEsSoloLectura,
    resumenMatriz,
    tienePermiso,
    esRolDeAccesoTotal,
    accionesActivas,
    construirMatriz,
    cambiarRol,
    alternar,
    alternarTodo,
    alternarColumna,
    tieneTodo,
    guardar,
    seleccionarPrimerRol
  });
}
