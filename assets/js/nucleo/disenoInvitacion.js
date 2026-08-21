/**
 * El diseño de la invitación, en un solo lugar.
 *
 * Por qué existe este archivo
 * ---------------------------
 * La invitación se muestra en dos lados: en la pantalla del portal, dibujada
 * con HTML, y en la imagen que el empleado se descarga, dibujada sobre un
 * lienzo. Son dos técnicas que no comparten nada, y hasta ahora cada una tenía
 * su propia idea de cómo se veía la invitación.
 *
 * Eso funciona mientras nadie las toque. En cuanto alguien cambia un color en
 * una, la otra queda distinta, y nadie se entera hasta que un empleado compara
 * lo que ve con lo que bajó.
 *
 * Acá se decide una sola vez: qué bloques hay, en qué orden, con qué texto y de
 * qué color. Los dos pintores reciben lo mismo y se limitan a pintarlo. Pueden
 * verse distintos en los detalles —una pantalla se estira, una imagen no— pero
 * no pueden decir cosas distintas.
 *
 * La configuración por defecto
 * ----------------------------
 * `POR_DEFECTO` reproduce el diseño que el sistema ya tenía. No es un ejemplo
 * ni un punto de partida: es lo que se usa cuando un evento no configuró nada,
 * que va a ser la mayoría.
 *
 * Eso quita el camino de respaldo. Antes había «dibujo fijo» y habría habido
 * «dibujo configurable», dos ramas que mantener; ahora hay una sola, y la
 * ausencia de configuración es simplemente una configuración conocida.
 *
 * Lo que este archivo NO hace
 * ---------------------------
 * No mide texto ni calcula posiciones. Eso depende de la técnica: el navegador
 * acomoda el HTML solo, y el lienzo necesita medir cada línea. Acá se decide
 * qué se dice y de qué color; dónde cae cada cosa lo resuelve cada pintor.
 */

/** Los colores del diseño original, para cuando un evento no elige otros. */
const MARCA = '#465fff';
const MARCA_CLARA = '#c2d6ff';
const FONDO = '#f9fafb';
const TEXTO_FUERTE = '#101828';
const TEXTO_TENUE = '#667085';

/**
 * Las disposiciones que se pueden elegir.
 *
 * Son dos y no diez a propósito: cada una hay que pintarla en HTML y en lienzo,
 * así que cada disposición nueva es trabajo por duplicado. Dos cubren lo que
 * cambia de verdad entre una fiesta y otra.
 */
export const DISPOSICIONES = {
  'tarjeta-vertical': 'Tarjeta vertical',
  'tarjeta-compacta': 'Compacta, sin franja'
};

/** Lo que se usa cuando el evento no configuró nada. Es el diseño de siempre. */
export const POR_DEFECTO = Object.freeze({
  disposicion: 'tarjeta-vertical',
  colorFranja: MARCA,
  colorFondo: FONDO,
  encabezado: 'Estás invitado a',
  piePagina: 'Muestra este código en la entrada del evento.',
  muestraFecha: true,
  muestraLugar: true,
  muestraDui: true,
  muestraLogo: true
});

/** Los campos de texto, con su largo máximo. */
const TEXTOS = { encabezado: 80, piePagina: 120 };

/** Los campos que son sí o no. */
const BANDERAS = ['muestraFecha', 'muestraLugar', 'muestraDui', 'muestraLogo'];

/** Los campos que son un color. */
const COLORES = ['colorFranja', 'colorFondo'];

/** ¿Es un color en hexadecimal de los que entienden el navegador y el lienzo? */
export function esColor(valor) {
  return /^#[0-9a-fA-F]{6}$/.test(String(valor || ''));
}

/**
 * Completa y limpia una configuración.
 *
 * Todo lo que no venga o no sirva se reemplaza por lo de por defecto, campo por
 * campo. Es deliberado que no rechace nada: esta configuración la lee el portal
 * público, y una invitación que no se muestra porque alguien guardó un color
 * mal escrito es peor que una invitación con el color de siempre.
 *
 * Que sea a prueba de basura importa además porque el JSON puede venir de una
 * versión anterior del editor, con campos que ya no existen o que faltan.
 */
export function normalizar(config) {
  const entrada = (config && typeof config === 'object') ? config : {};
  const salida = { ...POR_DEFECTO };

  if (DISPOSICIONES[entrada.disposicion]) salida.disposicion = entrada.disposicion;

  for (const campo of COLORES) {
    if (esColor(entrada[campo])) salida[campo] = entrada[campo];
  }

  for (const [campo, largo] of Object.entries(TEXTOS)) {
    if (typeof entrada[campo] === 'string') {
      const limpio = entrada[campo].trim().slice(0, largo);
      // Un texto vacío es una elección válida: significa «no lo muestres».
      salida[campo] = limpio;
    }
  }

  for (const campo of BANDERAS) {
    if (typeof entrada[campo] === 'boolean') salida[campo] = entrada[campo];
  }

  return salida;
}

/**
 * ¿Esta configuración es la de siempre?
 *
 * Sirve para no guardar en la base un objeto que no cambia nada: un evento sin
 * diseño propio se queda en `null`, y así se distingue «no configuró» de
 * «configuró y le gustó lo de siempre».
 */
export function esLaDeSiempre(config) {
  const limpia = normalizar(config);
  return Object.keys(POR_DEFECTO).every((campo) => limpia[campo] === POR_DEFECTO[campo]);
}

/**
 * Un color de texto que se lea sobre el fondo dado.
 *
 * Hace falta porque la franja es configurable: sobre un azul oscuro el título
 * va en blanco, pero si alguien elige un amarillo claro, el blanco desaparece.
 *
 * La cuenta es la luminancia relativa de la WCAG. El umbral de 0.5 es el
 * habitual y acá alcanza: no se busca certificar contraste, se busca que el
 * texto no se pierda.
 */
export function textoSobre(fondo) {
  if (!esColor(fondo)) return '#ffffff';

  const canal = (desde) => {
    const v = parseInt(fondo.slice(desde, desde + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const luz = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return luz > 0.5 ? '#101828' : '#ffffff';
}

/**
 * Una versión apagada del color, para los textos secundarios de la franja.
 *
 * En el diseño original la fecha y el lugar van en un azul claro sobre el azul
 * de marca. Con un color configurable no se puede dejar ese azul fijo, así que
 * se mezcla el color del texto con el del fondo: queda legible pero un escalón
 * por debajo del título, que es el efecto que se buscaba.
 */
export function textoTenueSobre(fondo) {
  /*
   * Con el color de siempre se devuelve el tono de siempre.
   *
   * La mezcla da un color parecido pero no idéntico al que tenía el diseño
   * original, y la promesa era que sin configurar nada la invitación se viera
   * exactamente igual que antes. Un tono distinto en la fecha es poco, pero
   * «poco» y «nada» no son lo mismo cuando lo que se prometió es nada.
   */
  if (fondo === MARCA) return MARCA_CLARA;

  const principal = textoSobre(fondo);
  // 72% del color del texto sobre el fondo: se lee, sin competir con el título.
  return mezclar(principal, fondo, 0.72);
}

/** Mezcla dos colores. `peso` es cuánto pesa el primero. */
export function mezclar(uno, otro, peso) {
  if (!esColor(uno) || !esColor(otro)) return uno;

  const canal = (color, desde) => parseInt(color.slice(desde, desde + 2), 16);
  const parte = (desde) => {
    const valor = Math.round(canal(uno, desde) * peso + canal(otro, desde) * (1 - peso));
    return Math.max(0, Math.min(255, valor)).toString(16).padStart(2, '0');
  };

  return `#${parte(1)}${parte(3)}${parte(5)}`;
}

/**
 * El modelo: qué bloques tiene esta invitación y cómo se ven.
 *
 * `datos` trae lo del evento y la persona, ya formateado para mostrar: la fecha
 * en palabras, el DUI con su guion, el nombre en formato de nombre propio. Acá
 * no se formatea nada, se decide qué entra.
 *
 * Devuelve los bloques en el orden en que van, cada uno con su papel. Los
 * pintores recorren esa lista; ninguno de los dos sabe qué configuración la
 * produjo, y por eso no pueden interpretarla distinto.
 */
export function construirModelo(config, datos = {}) {
  const c = normalizar(config);
  const conFranja = c.disposicion === 'tarjeta-vertical';

  /*
   * En la compacta no hay franja de color, así que los textos del evento van
   * sobre el fondo de la tarjeta, que es blanco.
   */
  const fondoEncabezado = conFranja ? c.colorFranja : '#ffffff';
  const sobreEncabezado = conFranja ? textoSobre(c.colorFranja) : TEXTO_FUERTE;
  const tenueEncabezado = conFranja ? textoTenueSobre(c.colorFranja) : TEXTO_TENUE;

  const bloques = [];
  const agregar = (bloque) => { if (bloque.texto) bloques.push(bloque); };

  if (c.muestraLogo) {
    bloques.push({ papel: 'logo', zona: 'cabecera', color: c.colorFranja });
  }

  agregar({ papel: 'titulo', zona: 'cabecera', texto: 'Tu invitación', color: TEXTO_FUERTE });
  agregar({
    papel: 'subtitulo', zona: 'cabecera',
    texto: 'Alcaldía Municipal de San Salvador Sur', color: TEXTO_TENUE
  });

  agregar({ papel: 'encabezado', zona: 'evento', texto: c.encabezado, color: tenueEncabezado });
  agregar({ papel: 'evento', zona: 'evento', texto: datos.evento || '', color: sobreEncabezado });

  if (c.muestraFecha) {
    agregar({ papel: 'fecha', zona: 'evento', texto: datos.fecha || '', color: tenueEncabezado });
  }
  if (c.muestraLugar) {
    agregar({ papel: 'lugar', zona: 'evento', texto: datos.ubicacion || '', color: tenueEncabezado });
  }

  agregar({ papel: 'nombre', zona: 'persona', texto: datos.nombre || '', color: TEXTO_FUERTE });
  if (c.muestraDui) {
    agregar({ papel: 'dui', zona: 'persona', texto: datos.dui || '', color: TEXTO_TENUE });
  }

  bloques.push({ papel: 'qr', zona: 'persona', url: datos.urlQr || '' });

  agregar({ papel: 'pie', zona: 'persona', texto: c.piePagina, color: TEXTO_TENUE });

  return {
    configuracion: c,
    disposicion: c.disposicion,
    conFranja,
    colores: {
      fondo: c.colorFondo,
      franja: fondoEncabezado,
      sobreFranja: sobreEncabezado,
      tenueSobreFranja: tenueEncabezado,
      texto: TEXTO_FUERTE,
      textoTenue: TEXTO_TENUE
    },
    bloques
  };
}

/** Los bloques de una zona, en orden. Es lo que recorre cada pintor. */
export function bloquesDe(modelo, zona) {
  return modelo.bloques.filter((bloque) => bloque.zona === zona);
}
