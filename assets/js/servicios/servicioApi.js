/**
 * La API del sistema, agrupada por recurso.
 *
 * Es el único lugar del frontend que sabe cómo se llaman las rutas y las
 * acciones del backend. Las vistas llaman a `api.empleados.guardar(...)` y no
 * se enteran de que por debajo eso es un POST a /api/empleados.
 *
 * Si mañana cambia una ruta, se cambia acá y nada más.
 */

import { http } from '../nucleo/clienteHttp.js';

export const api = {
  /** Sesión y carga inicial. */
  sesion: {
    iniciar(usuario, password) {
      return http.enviar('auth', { usuario, password });
    },
    cerrar() {
      // Sin credenciales en el cuerpo, el backend lo interpreta como logout.
      return http.enviar('auth', {});
    },
    catalogos() {
      return http.obtener('auth', { accion: 'datos-iniciales' });
    },
    /** Empieza a actuar en nombre de otra cuenta. Solo administradores. */
    impersonar(usuarioId) {
      return http.enviar('auth', { usuarioId }, { accion: 'impersonar' });
    },
    /** Vuelve a la cuenta propia y cierra la prestada. */
    volverDeImpersonar() {
      return http.enviar('auth', {}, { accion: 'volver' });
    }
  },

  /** Registro de asistencias y sincronización offline. */
  asistencias: {
    listar() {
      return http.obtener('asistencias');
    },
    registrar(identificador, dispositivo) {
      return http.enviar('asistencias', { dui: identificador, dispositivo }, { accion: 'registrar' });
    },
    sincronizar(registros) {
      return http.enviar('asistencias', { registros }, { accion: 'sincronizar-pendientes' });
    },
    diagnostico() {
      return http.obtener('asistencias', { accion: 'diagnostico' });
    },
    /**
     * Lo registrado despues de `desde`, mas el total exacto.
     * Es la llamada que sondea el sincronizador, asi que devuelve lo minimo:
     * sin `desde` no trae filas, solo el total y la marca de tiempo.
     */
    novedades(desde) {
      return http.obtener('asistencias', desde ? { accion: 'novedades', desde } : { accion: 'novedades' });
    }
  },

  empleados: {
    listar() {
      return http.obtener('empleados');
    },
    guardar(datos) {
      return http.guardar('empleados', datos);
    },
    exportar() {
      return http.descargar('empleados', { accion: 'exportar-csv' }, 'empleados.csv');
    },
    importar(csv) {
      return http.enviar('empleados', { csv }, { accion: 'importar-csv' });
    },
    /**
     * Sube un bloque de filas ya revisadas.
     *
     * Van como datos y no como texto separado por comas: la pantalla necesita
     * leer y reescribir el departamento antes de enviarlo, y armar y volver a
     * partir un CSV en el medio son dos lugares más donde se pueden romper las
     * comillas de un nombre.
     */
    importarFilas(filas) {
      return http.enviar('empleados', { filas }, { accion: 'importar-csv' });
    },
    /**
     * Da de baja a alguien, o lo borra del todo.
     * Con `definitivo` la fila desaparece y solo lo permite un administrador;
     * sin él, se apaga la bandera `activo` y el historial queda intacto.
     */
    eliminar(id, definitivo = false) {
      return http.enviar('empleados', { id, definitivo }, { accion: 'eliminar' });
    }
  },

  departamentos: {
    listar() {
      return http.obtener('departamentos');
    },
    guardar(datos) {
      return http.guardar('departamentos', datos);
    },
    exportar() {
      return http.descargar('departamentos', { accion: 'exportar-csv' }, 'departamentos.csv');
    },
    importar(csv) {
      return http.enviar('departamentos', { csv }, { accion: 'importar-csv' });
    }
  },

  eventos: {
    listar() {
      return http.obtener('eventos');
    },
    guardar(datos) {
      return http.guardar('eventos', datos);
    },
    activar(eventoId) {
      return http.enviar('eventos', { eventoId }, { accion: 'set-activo' });
    },
    /** Apaga el evento sin poner otro: queda el sistema sin evento en curso. */
    desactivar(eventoId) {
      return http.enviar('eventos', { eventoId }, { accion: 'desactivar' });
    },
    eliminar(id) {
      return http.enviar('eventos', { id }, { accion: 'eliminar' });
    }
  },

  premios: {
    listar() {
      return http.obtener('premios');
    },
    guardar(datos) {
      return http.guardar('premios', datos);
    }
  },

  sorteos: {
    /** Los sorteos con su lista de premios y cuanto llevan repartido. */
    listar() {
      return http.obtener('premios', { accion: 'sorteos' });
    },
    /**
     * Guardar un sorteo usa su propia acción.
     * Antes esto pegaba a /api/premios sin acción, con lo cual el backend lo
     * tomaba como un premio y creaba un premio en vez de un sorteo.
     *
     * `datos.premios` es la lista completa de premios del sorteo: el servidor
     * la sincroniza de una, dando de alta, actualizando y borrando lo que haga
     * falta.
     */
    guardar(datos) {
      return http.enviar('premios', datos, { accion: 'sorteo' });
    },
    /** Los ganadores de un sorteo, en el orden en que se llamaron. */
    ganadores(sorteoId) {
      return http.obtener('premios', { accion: 'ganadores', sorteoId });
    },
    /** Saca uno o varios ganadores de una linea de premio. */
    sortear(sorteoId, lineaId, cantidad = 1) {
      return http.enviar('premios', { sorteoId, lineaId, cantidad }, { accion: 'sortear' });
    },
    /** Marca que el premio se entrego en mano. */
    marcarEntregado(id, entregado) {
      return http.enviar('premios', { id, entregado: entregado ? 'TRUE' : 'FALSE' }, { accion: 'entregado' });
    },
    /** Abre o cierra el sorteo. */
    cambiarEstado(id, abierto) {
      return http.enviar('premios', { id, abierto: abierto ? 'TRUE' : 'FALSE' }, { accion: 'estado-sorteo' });
    }
  },

  roles: {
    listar() {
      return http.obtener('roles');
    },
    guardar(datos) {
      return http.guardar('roles', datos);
    },
    modulos() {
      return http.obtener('roles', { accion: 'modulos' });
    },
    /** Activa o desactiva un rol. */
    cambiarEstado(id, activo) {
      return http.enviar('roles', { id, activo }, { accion: 'estado' });
    }
  },

  permisos: {
    listar() {
      return http.obtener('roles', { accion: 'permisos' });
    },
    guardarUno(datos) {
      return http.enviar('roles', datos, { accion: 'permiso' });
    },
    /** Guarda de una sola vez toda la matriz de un rol. */
    guardarMatriz(permisos) {
      return http.enviar('roles', { permisos }, { accion: 'permisos-rol' });
    }
  },

  usuarios: {
    listar() {
      return http.obtener('usuarios');
    },
    guardar(datos) {
      return http.guardar('usuarios', datos);
    },
    /**
     * Cambio de la contraseña propia.
     * No lleva el id: el servidor lo toma de la sesión, para que nadie pueda
     * cambiar la clave de otra persona mandando su id.
     */
    cambiarMiClave(claveActual, claveNueva) {
      return http.enviar('usuarios', { claveActual, claveNueva }, { accion: 'cambiar-clave' });
    },
    /** Activa o desactiva una cuenta. Al desactivar se le cierran las sesiones. */
    cambiarEstado(id, activo) {
      return http.enviar('usuarios', { id, activo }, { accion: 'estado' });
    }
  },

  tarjetas: {
    plantillas() {
      return http.obtener('tarjetas');
    },
    empleados() {
      return http.obtener('tarjetas', { accion: 'empleados' });
    },
    /**
     * Guarda una plantilla. La imagen viaja en base64 dentro del cuerpo: es el
     * backend quien la sube a Storage, porque el navegador no tiene (ni debe
     * tener) credenciales de Supabase.
     */
    guardarPlantilla(datos) {
      return http.enviar('tarjetas', datos);
    },
    eliminarPlantilla(id) {
      return http.enviar('tarjetas', { id }, { accion: 'eliminar' });
    }
  },

  configuracion: {
    leer() {
      return http.obtener('configuracion');
    },
    guardar(clave, valor) {
      return http.enviar('configuracion', { clave, valor });
    },
    /** Conjuntos de datos que se pueden vaciar, con cuántas filas tiene cada uno. */
    purgables() {
      return http.obtener('configuracion', { accion: 'purgables' });
    },
    /**
     * Vacía un conjunto. `confirmacion` debe ser la etiqueta exacta escrita a
     * mano; el backend rechaza la petición si no coincide.
     */
    purgar(conjunto, confirmacion) {
      return http.enviar('configuracion', { conjunto, confirmacion }, { accion: 'purgar' });
    }
  },

  eventos: {
    /**
     * Guarda solo el diseño de la invitación de un evento.
     *
     * Va aparte del formulario del evento porque son dos personas distintas:
     * Recursos Humanos administra el evento y quien mantiene el sistema
     * configura el diseño. Y porque si viajara junto, guardar el evento desde
     * una pantalla que no incluye el diseño lo borraría.
     */
    guardarDiseno(id, invitacionConfig) {
      return http.enviar('eventos', { id, invitacionConfig }, { accion: 'diseno' });
    }
  },

  /** Portal público: son las únicas llamadas que funcionan sin sesión. */
  invitacion: {
    /** El acertijo que hay que resolver antes de poder consultar. */
    desafio() {
      return http.obtener('invitacion-publica', { accion: 'desafio' });
    },

    /** `reserva` viaja siempre, aunque esté vacío. Ver el controlador. */
    consultar(dui, desafio, reserva = '') {
      return http.obtener('invitacion-publica', { dui, desafio, segundo_apellido: reserva });
    }
  }
};
