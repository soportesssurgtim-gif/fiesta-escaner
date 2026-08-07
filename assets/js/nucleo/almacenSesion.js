/**
 * Guarda y recupera la sesión del navegador.
 *
 * Es una capa fina sobre localStorage, pero tenerla aparte sirve para dos
 * cosas: que la clave de almacenamiento esté escrita una sola vez, y que si
 * localStorage está bloqueado (modo privado de algunos navegadores, políticas
 * corporativas) la aplicación siga funcionando en memoria en vez de romperse.
 */

const CLAVE = 'sssur_sesion';

// Respaldo en memoria para cuando el navegador no deja escribir en disco.
// La sesión no sobrevive a un refresco, pero al menos se puede trabajar.
let respaldoEnMemoria = null;

export const almacenSesion = {
  /** Devuelve la sesión guardada, o null si no hay ninguna. */
  leer() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (!crudo) return respaldoEnMemoria;
      return JSON.parse(crudo);
    } catch {
      return respaldoEnMemoria;
    }
  },

  /** Guarda solo lo necesario: nunca la contraseña ni el bundle de catálogos. */
  guardar(datos) {
    if (!datos || !datos.token) return;

    const sesion = {
      token: datos.token,
      usuario: datos.usuario || '',
      correo: datos.correo || '',
      nombreMostrar: datos.nombreMostrar || '',
      rol: datos.rol || '',
      rolId: datos.rolId || ''
    };

    respaldoEnMemoria = sesion;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(sesion));
    } catch {
      // Sin disco disponible seguimos con el respaldo en memoria.
    }
  },

  /** Borra la sesión al cerrar o cuando el servidor dice que expiró. */
  limpiar() {
    respaldoEnMemoria = null;
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      // Nada que hacer: si no se puede escribir, tampoco había nada guardado.
    }
  },

  /** Atajo para el cliente HTTP, que solo necesita el token. */
  token() {
    const sesion = this.leer();
    return sesion ? sesion.token : null;
  }
};
