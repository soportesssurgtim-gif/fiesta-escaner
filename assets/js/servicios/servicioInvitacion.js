/**
 * Genera la imagen de la invitación del portal público.
 *
 * El botón "Guardar el código" antes era un enlace con `download` apuntando a
 * QuickChart. Eso no descarga nada: el atributo `download` se ignora cuando el
 * archivo es de otro dominio, así que el navegador abría el PNG del QR en una
 * pestaña. El empleado terminaba con un cuadrito negro suelto, sin su nombre ni
 * el evento, y encima tenía que guardarlo a mano.
 *
 * Ahora se dibuja la invitación entera en un canvas y se baja como PNG: queda
 * en la galería del teléfono, se muestra en la puerta sin señal, y se entiende
 * de quién es sin abrir nada.
 *
 * Se dibuja a mano en vez de usar html2canvas por lo mismo que el resto del
 * proyecto no trae dependencias: son doscientos kilobytes de librería para algo
 * que acá son cuatro rectángulos y cinco líneas de texto, y el resultado es
 * predecible en lugar de depender de cómo interprete el CSS.
 */

// El logo se toma del propio dominio y no de sansalvadorsur.gob.sv: una imagen
// de otro origen sin cabeceras CORS "mancha" el canvas y toDataURL lanza una
// excepción de seguridad. El de assets/iconos salió del mismo logo.
const LOGO = '/assets/iconos/icono-192.png';

/*
 * Los colores y los textos ya no viven acá.
 *
 * Los decide `disenoInvitacion.js` a partir de la configuración del evento, y
 * la pantalla del portal usa ese mismo modelo. Es lo que impide que la imagen
 * descargada diga una cosa y la pantalla otra.
 *
 * Lo que sigue acá son las medidas, porque son de esta técnica: el navegador
 * acomoda el HTML solo y el lienzo necesita cada número.
 */
import { construirModelo, bloquesDe } from '../nucleo/disenoInvitacion.js';

// Medidas en píxeles lógicos; el lienzo real se dibuja al doble para que no se
// vea pixelado en pantallas de alta densidad ni al imprimirlo.
const ANCHO = 440;
const ESCALA = 2;
const MARGEN = 24;
const ALTO_MAXIMO = 1400;

const TIPOGRAFIA = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** Carga una imagen y espera a que esté lista para dibujarse. */
function cargarImagen(origen, conCors = false) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    if (conCors) imagen.crossOrigin = 'anonymous';
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => rechazar(new Error('No se pudo cargar la imagen.'));
    imagen.src = origen;
  });
}

/**
 * Rectángulo redondeado.
 * No se usa ctx.roundRect porque no existe en Safari anterior al 16, que sigue
 * siendo común en los iPhone que llegan a la puerta del evento.
 */
function rectangulo(ctx, x, y, ancho, alto, radio) {
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.lineTo(x + ancho - radio, y);
  ctx.quadraticCurveTo(x + ancho, y, x + ancho, y + radio);
  ctx.lineTo(x + ancho, y + alto - radio);
  ctx.quadraticCurveTo(x + ancho, y + alto, x + ancho - radio, y + alto);
  ctx.lineTo(x + radio, y + alto);
  ctx.quadraticCurveTo(x, y + alto, x, y + alto - radio);
  ctx.lineTo(x, y + radio);
  ctx.quadraticCurveTo(x, y, x + radio, y);
  ctx.closePath();
}

/**
 * Escribe texto centrado, partiéndolo en varias líneas si no entra.
 * Devuelve la Y siguiente. Hace falta de verdad: "Fiesta de fin de año de la
 * Alcaldía Municipal" no entra en una línea, y sin cortarlo se sale de la
 * tarjeta.
 */
function escribir(ctx, texto, { x, y, anchoMaximo, fuente, color, interlineado }) {
  ctx.font = fuente;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return y;

  const lineas = [];
  let actual = palabras[0];

  for (let i = 1; i < palabras.length; i++) {
    const tentativa = `${actual} ${palabras[i]}`;
    if (ctx.measureText(tentativa).width <= anchoMaximo) {
      actual = tentativa;
    } else {
      lineas.push(actual);
      actual = palabras[i];
    }
  }
  lineas.push(actual);

  for (const linea of lineas) {
    ctx.fillText(linea, x, y);
    y += interlineado;
  }

  return y;
}

/** Espera a que la tipografía esté disponible, para que el PNG no salga en Arial. */
async function esperarTipografia() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {
    // Si el navegador no expone la API de fuentes se dibuja igual, con la
    // alternativa del sistema.
  }
}

/**
 * Dibuja la invitación y devuelve el canvas ya recortado a su alto real.
 *
 * @param {Object} datos
 * @param {string} datos.evento
 * @param {string} datos.fecha        Ya formateada para mostrar.
 * @param {string} datos.ubicacion
 * @param {string} datos.nombre
 * @param {string} datos.dui          Ya formateado.
 * @param {string} datos.urlQr
 * @param {Object} [datos.config]   Cómo se ve la invitación de este evento.
 */
async function dibujar(datos) {
  await esperarTipografia();

  /*
   * El modelo decide qué se dice y de qué color; acá solo se pinta.
   *
   * Sin configuración devuelve el diseño de siempre, así que este archivo no
   * necesita un camino de respaldo: pinta el modelo y ya.
   */
  const modelo = construirModelo(datos.config, datos);
  const { colores } = modelo;
  const textoDe = (papel) => {
    const bloque = modelo.bloques.find((b) => b.papel === papel);
    return bloque ? bloque.texto : '';
  };
  const hay = (papel) => modelo.bloques.some((b) => b.papel === papel);

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO * ESCALA;
  lienzo.height = ALTO_MAXIMO * ESCALA;

  const ctx = lienzo.getContext('2d');
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = colores.fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO_MAXIMO);

  const centro = ANCHO / 2;
  const anchoUtil = ANCHO - MARGEN * 2;
  let y = 36;

  // --- Encabezado: logo y título -------------------------------------------
  try {
    if (!hay('logo')) throw new Error('sin logo');
    const logo = await cargarImagen(LOGO);
    const lado = 72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centro, y + lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = colores.franja;
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, centro - lado / 2, y, lado, lado);
    ctx.restore();
    y += lado + 26;
  } catch {
    // Sin logo la invitación sigue sirviendo; es decoración.
    y += 12;
  }

  y = escribir(ctx, textoDe('titulo'), {
    x: centro, y, anchoMaximo: anchoUtil,
    fuente: `700 26px ${TIPOGRAFIA}`, color: colores.texto, interlineado: 32
  });

  y = escribir(ctx, textoDe('subtitulo'), {
    x: centro, y: y + 4, anchoMaximo: anchoUtil,
    fuente: `400 13px ${TIPOGRAFIA}`, color: colores.textoTenue, interlineado: 18
  });

  y += 22;

  // --- Tarjeta --------------------------------------------------------------
  const tarjetaX = MARGEN;
  const tarjetaAncho = anchoUtil;
  const tarjetaY = y;
  const anchoTexto = tarjetaAncho - 40;

  // La franja de marca se mide antes de pintarla: su alto depende de cuántas
  // líneas ocupen el nombre del evento y la ubicación.
  const medirFranja = () => {
    let alto = 20;
    if (textoDe('encabezado')) alto += 16;
    ctx.font = `700 20px ${TIPOGRAFIA}`;
    alto += contarLineas(ctx, textoDe('evento'), anchoTexto) * 26;
    if (hay('fecha')) alto += 20;
    if (hay('lugar')) alto += 20;
    return alto + 18;
  };

  const altoFranja = medirFranja();

  ctx.save();
  rectangulo(ctx, tarjetaX, tarjetaY, tarjetaAncho, ALTO_MAXIMO, 16);
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tarjetaX, tarjetaY, tarjetaAncho, ALTO_MAXIMO);
  // En la compacta no hay banda de color: los textos del evento van sobre el
  // blanco de la tarjeta, y por eso el modelo ya les dio colores oscuros.
  if (modelo.conFranja) {
    ctx.fillStyle = colores.franja;
    ctx.fillRect(tarjetaX, tarjetaY, tarjetaAncho, altoFranja);
  }
  ctx.restore();

  let yFranja = tarjetaY + 30;

  // El espaciado entre letras no existe en canvas, así que se simula con
  // espacios: es lo que le da al rótulo el aire del diseño de la pantalla.
  for (const bloque of bloquesDe(modelo, 'evento')) {
    if (bloque.papel === 'encabezado') {
      yFranja = escribir(ctx, espaciar(bloque.texto), {
        x: centro, y: yFranja, anchoMaximo: anchoTexto,
        fuente: `600 10px ${TIPOGRAFIA}`, color: bloque.color, interlineado: 16
      });
    } else if (bloque.papel === 'evento') {
      yFranja = escribir(ctx, bloque.texto, {
        x: centro, y: yFranja + 12, anchoMaximo: anchoTexto,
        fuente: `700 20px ${TIPOGRAFIA}`, color: bloque.color, interlineado: 26
      });
    } else {
      // Fecha y lugar comparten tamaño; se distinguen solo por el aire de
      // arriba, que es el que tenían en el diseño original.
      yFranja = escribir(ctx, bloque.texto, {
        x: centro, y: yFranja + (bloque.papel === 'fecha' ? 4 : 2), anchoMaximo: anchoTexto,
        fuente: `400 13px ${TIPOGRAFIA}`, color: bloque.color, interlineado: 20
      });
    }
  }

  // --- Cuerpo: nombre, DUI y QR --------------------------------------------
  y = tarjetaY + altoFranja + 34;

  y = escribir(ctx, textoDe('nombre'), {
    x: centro, y, anchoMaximo: anchoTexto,
    fuente: `700 20px ${TIPOGRAFIA}`, color: colores.texto, interlineado: 26
  });

  if (hay('dui')) {
    y = escribir(ctx, `DUI ${textoDe('dui')}`, {
      x: centro, y: y + 4, anchoMaximo: anchoTexto,
      fuente: `400 13px ${TIPOGRAFIA}`, color: colores.textoTenue, interlineado: 18
    });
  }

  y += 18;

  // El QR siempre sobre blanco, aunque el teléfono esté en modo oscuro: los
  // lectores necesitan ese contraste.
  const ladoQr = 208;
  const cajaQr = ladoQr + 28;
  const cajaX = centro - cajaQr / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(16, 24, 40, 0.10)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  rectangulo(ctx, cajaX, y, cajaQr, cajaQr, 16);
  ctx.fill();
  ctx.restore();

  // Si el QR no se puede dibujar, la imagen no sirve para nada: acá sí se deja
  // fallar para poder avisarlo en pantalla.
  const qr = await cargarImagen(datos.urlQr, true);
  ctx.drawImage(qr, centro - ladoQr / 2, y + 14, ladoQr, ladoQr);

  y += cajaQr + 28;

  y = escribir(ctx, textoDe('pie'), {
    x: centro, y, anchoMaximo: anchoTexto,
    fuente: `400 13px ${TIPOGRAFIA}`, color: colores.textoTenue, interlineado: 18
  });

  y += 26;

  // --- Recorte al alto real -------------------------------------------------
  const altoFinal = Math.min(Math.round(y), ALTO_MAXIMO);
  const recortado = document.createElement('canvas');
  recortado.width = ANCHO * ESCALA;
  recortado.height = altoFinal * ESCALA;
  recortado.getContext('2d').drawImage(
    lienzo,
    0, 0, ANCHO * ESCALA, altoFinal * ESCALA,
    0, 0, ANCHO * ESCALA, altoFinal * ESCALA
  );

  return recortado;
}

/**
 * Separa las letras de un texto.
 *
 * El lienzo no tiene `letter-spacing`, así que el aire del rótulo se simula
 * metiendo espacios: una letra, un espacio; entre palabras, tres. Es lo que le
 * daba al «E S T Á S   I N V I T A D O   A» del diseño original su aspecto, y
 * ahora se calcula porque ese texto lo elige cada evento.
 */
function espaciar(texto) {
  return String(texto || '')
    .trim()
    .toLocaleUpperCase('es')
    .split(/\s+/)
    .map((palabra) => palabra.split('').join(' '))
    .join('   ');
}

/** Cuántas líneas ocupa un texto con la fuente que ya tiene el contexto. */
function contarLineas(ctx, texto, anchoMaximo) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return 0;

  let lineas = 1;
  let actual = palabras[0];

  for (let i = 1; i < palabras.length; i++) {
    const tentativa = `${actual} ${palabras[i]}`;
    if (ctx.measureText(tentativa).width <= anchoMaximo) {
      actual = tentativa;
    } else {
      lineas++;
      actual = palabras[i];
    }
  }
  return lineas;
}

/**
 * Convierte un trozo de la página en un lienzo.
 *
 * Hace falta para las plantillas HTML: ahí la invitación la maqueta el
 * administrador y no hay forma de redibujarla a mano en el lienzo, porque no se
 * sabe de antemano qué puso.
 *
 * La técnica es meter el HTML dentro de un `<foreignObject>` de un SVG y cargar
 * ese SVG como imagen. Lo dibuja el propio navegador, así que sale con el
 * maquetado de verdad —flexbox, redondeos, degradados— sin librería de por
 * medio. `html2canvas` haría lo mismo con doscientos kilobytes que habría que
 * bajar en el teléfono de cada empleado, y volviendo a implementar el
 * maquetado en vez de usar el que ya existe.
 *
 * El límite: dentro del SVG no llegan las tipografías del documento, porque es
 * un documento aparte. Una fuente web se pierde y sale la del sistema. Por eso
 * la plantilla de arranque usa una pila de fuentes del sistema, y el editor lo
 * dice.
 */
async function rasterizarNodo(contenedor) {
  /*
   * Se dibuja la tarjeta, no la caja que la contiene.
   *
   * El contenedor ocupa todo el ancho disponible y la plantilla suele traer un
   * `max-width` con margen automático. Rasterizando el contenedor, en una
   * pantalla ancha el PNG sale con dos franjas blancas a los lados. Con un solo
   * hijo —el caso normal— se rasteriza ese y la imagen queda al talle.
   */
  const nodo = contenedor.children.length === 1 ? contenedor.children[0] : contenedor;

  const ancho = Math.ceil(nodo.offsetWidth);
  const alto = Math.ceil(nodo.offsetHeight);
  if (!ancho || !alto) throw new Error('La invitación no está visible.');

  const copia = nodo.cloneNode(true);
  copia.style.width = `${ancho}px`;
  copia.style.margin = '0';
  await incrustarImagenes(copia);

  /*
   * El SVG es XML, no HTML: una etiqueta sin cerrar que el navegador perdonaría
   * acá tira el dibujo entero. `XMLSerializer` devuelve XML bien formado y le
   * pone el espacio de nombres de XHTML al elemento.
   */
  const serializado = new XMLSerializer().serializeToString(copia);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${serializado}</foreignObject>` +
    '</svg>';

  const imagen = await cargarImagen(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho * ESCALA;
  lienzo.height = alto * ESCALA;

  const ctx = lienzo.getContext('2d');
  // Fondo blanco: una plantilla con el fondo transparente quedaría negra en la
  // galería del teléfono.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

  return lienzo;
}

/**
 * Mete las imágenes adentro del HTML, como datos.
 *
 * Dentro del `<foreignObject>` no se puede pedir nada por red: el SVG se carga
 * como imagen y ahí no hay más peticiones. Sin esto, el QR sale en blanco.
 */
async function incrustarImagenes(raiz) {
  const imagenes = [...raiz.querySelectorAll('img')];

  await Promise.all(imagenes.map(async (imagen) => {
    const origen = imagen.getAttribute('src') || '';
    if (origen === '' || origen.startsWith('data:')) return;
    imagen.setAttribute('src', await aDatosIncrustados(origen));
  }));
}

/**
 * Trae una imagen y la devuelve incrustada.
 *
 * Si falla, revienta y no se salta la imagen. Saltarla dejaría bajar una
 * invitación sin el QR, y nadie lo notaría hasta la puerta del evento; que
 * falle acá muestra el aviso de sacar una captura, que al menos sirve.
 */
async function aDatosIncrustados(url) {
  const respuesta = await fetch(url, { mode: 'cors' });
  if (!respuesta.ok) throw new Error(`No se pudo traer la imagen ${url}`);

  const blob = await respuesta.blob();
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(blob);
  });
}

export const servicioInvitacion = {
  /**
   * Genera la invitación y la descarga como PNG.
   *
   * En iPhone el atributo `download` se ignora, así que ahí la imagen se abre
   * en una pestaña para que se pueda mantener pulsado y guardar. Devuelve cómo
   * terminó, para que la pantalla explique qué hacer en cada caso.
   *
   * Con `nodo` se rasteriza lo que hay en pantalla, que es lo que corresponde
   * cuando el evento usa una plantilla HTML: el dibujo a mano no sabría qué
   * puso el administrador. Sin `nodo` se dibuja el diseño guiado como siempre.
   */
  async descargar(datos) {
    const lienzo = datos.nodo
      ? await rasterizarNodo(datos.nodo)
      : await dibujar(datos);

    const blob = await new Promise((resolver, rechazar) => {
      lienzo.toBlob(
        (resultado) => (resultado ? resolver(resultado) : rechazar(new Error('No se pudo generar la imagen.'))),
        'image/png'
      );
    });

    const url = URL.createObjectURL(blob);
    const nombre = `invitacion-${String(datos.dui || '').replace(/[^0-9]/g, '') || 'qr'}.png`;

    const enlace = document.createElement('a');
    const soportaDescarga = 'download' in enlace && !esIOS();

    if (soportaDescarga) {
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Se libera después: revocarlo enseguida cancela la descarga en Firefox.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { descargada: true };
    }

    const pestana = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { descargada: false, abierta: Boolean(pestana) };
  }
};

/** iOS ignora `download`: ahí hay que abrir la imagen y guardarla a mano. */
function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
