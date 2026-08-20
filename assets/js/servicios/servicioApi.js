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
    listar() {
      return http.obtener('premios', { accion: 'sorteos' });
    },
    /**
     * Guardar un sorteo usa su propia acción.
     * Antes esto pegaba a /api/premios sin acción, con lo cual el backend lo
     * tomaba como un premio y creaba un premio en vez de un sorteo.
     */
    guardar(datos) {
      return http.enviar('premios', datos, { accion: 'sorteo' });
    },
    sortear(sorteoId) {
      return http.enviar('premios', { sorteoId }, { accion: 'sortear' });
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

  /** Portal público: es la única llamada que funciona sin sesión. */
  invitacion: {
    consultar(dui, ultimos4) {
      return http.obtener('invitacion-publica', { dui, ultimos4 });
    }
  }
};
