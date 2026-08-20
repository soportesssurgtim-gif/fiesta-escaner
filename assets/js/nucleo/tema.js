/**
 * Modo claro / oscuro.
 *
 * Hay tres cosas que pueden decidir el tema, y este es el orden en que mandan:
 *
 *   1. La elección personal del usuario en este dispositivo (el botón de la
 *      barra superior). Si eligió, se respeta y nada la pisa.
 *   2. El tema institucional, definido en Configuración y guardado en la tabla
 *      `configuracion`. Es el arranque por defecto para todos.
 *   3. La preferencia del sistema operativo.
 *
 * El tema institucional se cachea en localStorage porque se necesita antes de
 * que la API responda: sin cache, cada carga arrancaría con el tema equivocado
 * y saltaría al correcto un segundo después.
 *
 * Ojo: la primera aplicación NO ocurre acá sino en un script inline dentro del
 * <head> de index.html. Tiene que pasar antes del primer pintado o se ve un
 * destello blanco al cargar. Este módulo se encarga del resto.
 */

const CLAVE = 'sssur_tema';
const CLAVE_SISTEMA = 'sssur_tema_sistema';

/** localStorage puede estar bloqueado; nunca debe tumbar la aplicación. */
function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento el tema dura lo que dure la pestaña. Aceptable.
  }
}

function preferenciaDelSistema() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

function aplicar(modo) {
  document.documentElement.classList.toggle('dark', modo === 'oscuro');

  // Mantenemos la barra del navegador móvil en sintonía con el fondo.
  //
  // En claro toma el color primario configurado, no uno fijo: si la institución
  // cambió su color, la barra del navegador tiene que acompañar. Se lee de la
  // variable CSS porque es la única fuente de verdad; marca.js la reescribe
  // cuando cambia el color.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;

  if (modo === 'oscuro') {
    meta.setAttribute('content', '#101828');
    return;
  }

  const primario = getComputedStyle(document.documentElement)
    .getPropertyValue('--marca-500')
    .trim();

  meta.setAttribute('content', primario || '#465fff');
}

/** El modo que corresponde según las tres fuentes, en orden de prioridad. */
function resolver() {
  const personal = leer(CLAVE);
  if (personal === 'claro' || personal === 'oscuro') return personal;

  const institucional = leer(CLAVE_SISTEMA);
  if (institucional === 'claro' || institucional === 'oscuro') return institucional;

  return preferenciaDelSistema();
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

  /**
   * Vuelve a aplicar el modo actual sin tocar ninguna preferencia.
   *
   * Hace falta cuando cambia el color primario: la barra del navegador lo lee
   * de la variable CSS, y sin volver a pasar por acá se queda con el anterior.
   */
  reaplicar() {
    aplicar(this.actual());
  },

  /** ¿El usuario eligió a mano en este dispositivo? */
  tienePreferenciaPropia() {
    const personal = leer(CLAVE);
    return personal === 'claro' || personal === 'oscuro';
  },

  establecer(modo) {
    const elegido = modo === 'oscuro' ? 'oscuro' : 'claro';
    aplicar(elegido);
    escribir(CLAVE, elegido);
    return elegido;
  },

  alternar() {
    return this.establecer(this.actual() === 'oscuro' ? 'claro' : 'oscuro');
  },

  /**
   * Olvida la elección personal y vuelve a lo que diga la institución (o el
   * sistema operativo). Es la salida para quien tocó el botón una vez y quedó
   * clavado en un tema que ya no quiere.
   */
  olvidarPreferenciaPropia() {
    escribir(CLAVE, null);
    const modo = resolver();
    aplicar(modo);
    return modo;
  },

  /**
   * Guarda el tema que define la institución y lo aplica si el usuario no
   * eligió uno propio. `valor` es 'claro', 'oscuro' o 'sistema'.
   */
  aplicarDelSistema(valor) {
    const institucional = valor === 'claro' || valor === 'oscuro' ? valor : 'sistema';

    // 'sistema' se guarda como ausencia: así resolver() cae al sistema
    // operativo sin necesitar un caso especial.
    escribir(CLAVE_SISTEMA, institucional === 'sistema' ? null : institucional);

    const modo = resolver();
    aplicar(modo);
    return modo;
  },

  /**
   * Sigue los cambios de tema del sistema operativo, pero solo mientras nadie
   * haya decidido antes: ni el usuario en este dispositivo ni la institución.
   */
  seguirAlSistema(alCambiar) {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');

    consulta.addEventListener('change', () => {
      if (this.tienePreferenciaPropia()) return;
      if (leer(CLAVE_SISTEMA)) return;

      const modo = preferenciaDelSistema();
      aplicar(modo);
      if (typeof alCambiar === 'function') alCambiar(modo);
    });
  }
};
