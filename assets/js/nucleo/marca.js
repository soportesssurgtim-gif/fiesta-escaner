/**
 * El color primario del sistema y la paleta que sale de él.
 *
 * La institución elige UN color en Configuración. De ahí se derivan los doce
 * tonos que usa la interfaz: el 500 es el color elegido tal cual, los claros
 * (25 a 400) son fondos y bordes suaves, y los oscuros (600 a 950) son estados
 * presionados y texto sobre fondo claro.
 *
 * Se derivan en vez de pedirlos porque nadie va a cargar doce colores a mano, y
 * porque elegidos sueltos no forman una escala: hace falta que el hover de un
 * botón sea el mismo color un paso más oscuro, no otro azul.
 *
 * La curva viene de la paleta original de TailAdmin (#465fff), medida en HSL.
 * Alimentada con ese color, esta función devuelve exactamente esa paleta; con
 * cualquier otro, la misma progresión trasladada al color nuevo.
 *
 * Los tonos se publican dos veces en :root, en hex y como terna «R G B»:
 *   --marca-500      lo usan los componentes de assets/css/sistema-diseno.css
 *   --marca-500-rgb  lo usan las clases de Tailwind (bg-brand-500, etc.), que
 *                    necesitan la terna suelta para poder aplicarle opacidad
 *                    con la sintaxis bg-brand-500/20.
 */

/** Los pasos de la escala, de más claro a más oscuro. */
export const PASOS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/**
 * La curva medida sobre la paleta original.
 *
 * `luz` es la luminosidad HSL de cada paso, `saturacion` cuánta de la del color
 * elegido conserva, y `tono` cuántos grados se corre respecto del 500.
 *
 * Los tres se movían en la paleta original y los tres hacen falta. La bajada de
 * saturación en los pasos oscuros es lo que evita que el 900 se vea como neón.
 * El corrimiento de tono es más sutil: los claros tiran unos grados hacia el
 * cian y los oscuros hacia el violeta, que es lo que hace que la escala se lea
 * como un solo color y no como seis azules distintos. Ignorarlo desviaba los
 * tonos medios hasta 17 puntos sobre 255.
 */
const CURVA = {
  25:  { luz: 97.5, saturacion: 1,     tono: -15 },
  50:  { luz: 96.3, saturacion: 1,     tono: -14 },
  100: { luz: 93.3, saturacion: 1,     tono: -13 },
  200: { luz: 88.0, saturacion: 1,     tono: -12 },
  300: { luz: 80.6, saturacion: 1,     tono: -10 },
  400: { luz: 72.9, saturacion: 1,     tono: -5 },
  500: { luz: 63.7, saturacion: 1,     tono: 0 },
  600: { luz: 58.6, saturacion: 0.905, tono: 5 },
  700: { luz: 50.6, saturacion: 0.690, tono: 6 },
  800: { luz: 41.4, saturacion: 0.649, tono: 4 },
  900: { luz: 34.3, saturacion: 0.566, tono: 3 },
  950: { luz: 20.0, saturacion: 0.569, tono: 5 }
};

const LUZ_BASE = CURVA[500].luz;

/** El color que se usa si nadie configuró ninguno. */
export const COLOR_POR_DEFECTO = '#465fff';

const CLAVE_PALETA = 'sssur_paleta';

const entre = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

/** ¿Es un color hexadecimal de seis dígitos? Se acepta con o sin almohadilla. */
export function esHexValido(valor) {
  return /^#?[0-9a-fA-F]{6}$/.test(String(valor || '').trim());
}

/** Normaliza a la forma «#rrggbb» en minúsculas. */
export function normalizarHex(valor) {
  const limpio = String(valor || '').trim().replace(/^#/, '').toLowerCase();
  return '#' + limpio;
}

function hexARgb(hex) {
  const n = parseInt(normalizarHex(hex).slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbAHex({ r, g, b }) {
  const dos = (v) => Math.round(entre(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + dos(r) + dos(g) + dos(b);
}

function rgbAHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const luz = (max + min) / 2;

  if (max === min) return { tono: 0, saturacion: 0, luz: luz * 100 };

  const delta = max - min;
  const saturacion = luz > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let tono;
  if (max === rr) tono = (gg - bb) / delta + (gg < bb ? 6 : 0);
  else if (max === gg) tono = (bb - rr) / delta + 2;
  else tono = (rr - gg) / delta + 4;

  return { tono: tono * 60, saturacion: saturacion * 100, luz: luz * 100 };
}

function hslARgb({ tono, saturacion, luz }) {
  const s = entre(saturacion, 0, 100) / 100;
  const l = entre(luz, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = ((tono % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Luminancia relativa segun WCAG: cuánta luz emite el color a ojos de una
 * persona. Se usa para ordenar la escala y para medir contraste.
 */
function luminanciaRelativa({ r, g, b }) {
  const canal = (v) => {
    const c = entre(v, 0, 255) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Contraste entre dos colores, de 1:1 (iguales) a 21:1 (negro sobre blanco).
 *
 * Sirve para avisar cuando el color elegido deja el texto blanco de los botones
 * ilegible. WCAG pide 4.5 para texto normal y 3 para texto grande.
 */
export function contraste(hexUno, hexOtro) {
  const a = luminanciaRelativa(hexARgb(hexUno));
  const b = luminanciaRelativa(hexARgb(hexOtro));
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** ¿El texto blanco se lee sobre este color? Es el caso del botón primario. */
export function contrasteConBlanco(hex) {
  const razon = contraste(hex, '#ffffff');
  return {
    razon,
    // Por debajo de 3 no se lee ni en grande. Entre 3 y 4.5 pasa justo.
    nivel: razon >= 4.5 ? 'bien' : razon >= 3 ? 'justo' : 'malo'
  };
}

/**
 * Los doce tonos que salen del color elegido.
 *
 * La escala se ancla en el color: el 500 es exactamente lo que se eligió, sin
 * corregirlo. Si se forzara la luminosidad de la curva, un azul institucional
 * oscuro saldría aclarado y el color elegido no aparecería en ninguna parte.
 *
 * Los pasos claros se acercan a blanco guardando la misma proporción que en la
 * curva original, y los oscuros bajan proporcionalmente desde el color. Por eso
 * el 25 sigue siendo un fondo casi blanco aunque se elija un color muy oscuro:
 * un tinte suave tiene que seguir siendo suave o deja de servir como fondo.
 */
export function derivarPaleta(colorPrimario) {
  const base = rgbAHsl(hexARgb(colorPrimario));
  const paleta = {};
  const enHsl = {};

  for (const paso of PASOS) {
    const curva = CURVA[paso];

    let luz;
    if (paso === 500) {
      luz = base.luz;
    } else if (curva.luz > LUZ_BASE) {
      // Claros: se conserva la distancia relativa al blanco.
      const proporcion = (100 - curva.luz) / (100 - LUZ_BASE);
      luz = 100 - proporcion * (100 - base.luz);
    } else {
      // Oscuros: se baja en la misma proporción que la curva.
      luz = base.luz * (curva.luz / LUZ_BASE);
    }

    // La bajada de saturación se aplica en proporción a lo saturado que sea el
    // color elegido. Un color ya apagado no necesita que lo apaguen más, y
    // bajarle la saturación lo unico que hace es acercarlo al gris.
    const cuantoBajar = (1 - curva.saturacion) * (base.saturacion / 100);

    enHsl[paso] = {
      tono: base.tono + curva.tono,
      saturacion: entre(base.saturacion * (1 - cuantoBajar), 0, 100),
      luz: entre(luz, 0, 100)
    };
  }

  /*
   * Última pasada: que la escala nunca se aclare al avanzar.
   *
   * Bajar la saturación sube la luminancia percibida —un azul apagado es más
   * claro que uno puro a la misma luminosidad HSL—, y con un color de partida
   * oscuro eso alcanzaba para que el 700 saliera más claro que el 600. Una
   * escala que se invierte a la mitad deja de leerse como escala: el hover de
   * un botón se veía más claro que el botón.
   */
  let techo = Infinity;
  for (const paso of PASOS) {
    if (paso < 500) continue;

    let actual = enHsl[paso];
    let lum = luminanciaRelativa(hslARgb(actual));

    // Se oscurece de a poco hasta respetar el paso anterior. El límite de
    // vueltas es por seguridad: con luz 0 la luminancia ya no puede bajar.
    for (let intento = 0; intento < 100 && lum > techo; intento++) {
      actual = { ...actual, luz: Math.max(0, actual.luz - 0.5) };
      lum = luminanciaRelativa(hslARgb(actual));
    }

    enHsl[paso] = actual;
    techo = lum;
  }

  for (const paso of PASOS) paleta[paso] = rgbAHex(hslARgb(enHsl[paso]));

  // El 500 se copia del original y no del viaje de ida y vuelta por HSL, que
  // puede correr un dígito por redondeo. El color elegido tiene que aparecer
  // tal cual se eligió.
  paleta[500] = normalizarHex(colorPrimario);
  return paleta;
}

/** «#465fff» -> «70 95 255», que es lo que espera la sintaxis rgb() de Tailwind. */
export function hexATerna(hex) {
  const { r, g, b } = hexARgb(hex);
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function guardar(paleta) {
  try {
    localStorage.setItem(CLAVE_PALETA, JSON.stringify(paleta));
  } catch {
    // Sin almacenamiento la paleta dura lo que dure la pestaña: al recargar se
    // ve un instante la de por defecto hasta que responde la API. Aceptable.
  }
}

/** Escribe los doce tonos en :root, en sus dos formas. */
export function aplicarPaleta(paleta) {
  const raiz = document.documentElement;
  for (const paso of PASOS) {
    raiz.style.setProperty(`--marca-${paso}`, paleta[paso]);
    raiz.style.setProperty(`--marca-${paso}-rgb`, hexATerna(paleta[paso]));
  }
}

export const marca = {
  /** El color primario configurado, o el de por defecto. */
  actual() {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE_PALETA) || 'null');
      if (guardada && esHexValido(guardada[500])) return normalizarHex(guardada[500]);
    } catch {
      // Un JSON corrupto no debe dejar la aplicación sin color.
    }
    return COLOR_POR_DEFECTO;
  },

  /**
   * Aplica un color primario y lo deja cacheado.
   *
   * Se cachea la paleta ya derivada, no el color: el script del <head> tiene
   * que pintarla antes de que cargue ningún módulo, y ahí no puede correr la
   * derivación sin duplicar todo este archivo.
   */
  establecer(colorPrimario) {
    const color = esHexValido(colorPrimario) ? normalizarHex(colorPrimario) : COLOR_POR_DEFECTO;
    const paleta = derivarPaleta(color);

    aplicarPaleta(paleta);
    guardar(paleta);

    return { color, paleta };
  },

  /** La vista previa de un color sin aplicarlo ni guardarlo. */
  previsualizar(colorPrimario) {
    return esHexValido(colorPrimario)
      ? derivarPaleta(normalizarHex(colorPrimario))
      : derivarPaleta(COLOR_POR_DEFECTO);
  }
};
