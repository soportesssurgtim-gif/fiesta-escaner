/**
 * Modo claro / oscuro.
 *
 * La preferencia se guarda en localStorage y se aplica agregando o quitando la
 * clase `dark` en <html>, que es lo que leen tanto Tailwind como nuestro CSS
 * de componentes.
 *
 * Ojo: la primera aplicación NO ocurre acá sino en un script inline dentro del
 * <head> de index.html. Tiene que pasar antes del primer pintado o se ve un
 * destello blanco al cargar. Este módulo se encarga del resto: alternarlo y
 * seguir los cambios del sistema operativo.
 */

const CLAVE = 'sssur_tema';

function preferenciaDelSistema() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

function aplicar(modo) {
  document.documentElement.classList.toggle('dark', modo === 'oscuro');

  // Mantenemos la barra del navegador móvil en sintonía con el fondo.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', modo === 'oscuro' ? '#101828' : '#465fff');
}

export const tema = {
  /** El modo activo ahora mismo. */
  actual() {
    return document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro';
  },

  /** ¿Está en oscuro? Atajo cómodo para los v-if de las plantillas. */
  esOscuro() {
    return this.actual() === 'oscuro';
  },

  establecer(modo) {
    const elegido = modo === 'oscuro' ? 'oscuro' : 'claro';
    aplicar(elegido);
    try {
      localStorage.setItem(CLAVE, elegido);
    } catch {
      // Sin almacenamiento el tema dura lo que dure la pestaña. Aceptable.
    }
    return elegido;
  },

  alternar() {
    return this.establecer(this.actual() === 'oscuro' ? 'claro' : 'oscuro');
  },

  /**
   * Sigue los cambios de tema del sistema operativo, pero solo mientras el
   * usuario no haya elegido uno a mano. Si eligió, se respeta su decisión.
   */
  seguirAlSistema(alCambiar) {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');

    consulta.addEventListener('change', () => {
      let eligioManualmente = false;
      try {
        eligioManualmente = Boolean(localStorage.getItem(CLAVE));
      } catch {
        eligioManualmente = false;
      }

      if (eligioManualmente) return;

      const modo = preferenciaDelSistema();
      aplicar(modo);
      if (typeof alCambiar === 'function') alCambiar(modo);
    });
  }
};
