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

const MARCA = '#465fff';
const MARCA_CLARA = '#c2d6ff';
const FONDO = '#f9fafb';
const TEXTO_FUERTE = '#101828';
const TEXTO_TENUE = '#667085';

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
 */
async function dibujar(datos) {
  await esperarTipografia();

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO * ESCALA;
  lienzo.height = ALTO_MAXIMO * ESCALA;

  const ctx = lienzo.getContext('2d');
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO, ALTO_MAXIMO);

  const centro = ANCHO / 2;
  const anchoUtil = ANCHO - MARGEN * 2;
  let y = 36;

  // --- Encabezado: logo y título -------------------------------------------
  try {
    const logo = await cargarImagen(LOGO);
    const lado = 72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centro, y + lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = MARCA;
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, centro - lado / 2, y, lado, lado);
    ctx.restore();
    y += lado + 26;
  } catch {
    // Sin logo la invitación sigue sirviendo; es decoración.
    y += 12;
  }

  y = escribir(ctx, 'Tu invitación', {
    x: centro, y, anchoMaximo: anchoUtil,
    fuente: `700 26px ${TIPOGRAFIA}`, color: TEXTO_FUERTE, interlineado: 32
  });

  y = escribir(ctx, 'Alcaldía Municipal de San Salvador Sur', {
    x: centro, y: y + 4, anchoMaximo: anchoUtil,
    fuente: `400 13px ${TIPOGRAFIA}`, color: TEXTO_TENUE, interlineado: 18
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
    alto += 16;                                              // "ESTÁS INVITADO A"
    ctx.font = `700 20px ${TIPOGRAFIA}`;
    alto += contarLineas(ctx, datos.evento, anchoTexto) * 26;
    if (datos.fecha) alto += 20;
    if (datos.ubicacion) alto += 20;
    return alto + 18;
  };

  const altoFranja = medirFranja();

  ctx.save();
  rectangulo(ctx, tarjetaX, tarjetaY, tarjetaAncho, ALTO_MAXIMO, 16);
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tarjetaX, tarjetaY, tarjetaAncho, ALTO_MAXIMO);
  ctx.fillStyle = MARCA;
  ctx.fillRect(tarjetaX, tarjetaY, tarjetaAncho, altoFranja);
  ctx.restore();

  let yFranja = tarjetaY + 30;

  // El espaciado entre letras no existe en canvas, así que se simula con
  // espacios: es lo que le da al rótulo el aire del diseño de la pantalla.
  yFranja = escribir(ctx, 'E S T Á S   I N V I T A D O   A', {
    x: centro, y: yFranja, anchoMaximo: anchoTexto,
    fuente: `600 10px ${TIPOGRAFIA}`, color: MARCA_CLARA, interlineado: 16
  });

  yFranja = escribir(ctx, datos.evento, {
    x: centro, y: yFranja + 12, anchoMaximo: anchoTexto,
    fuente: `700 20px ${TIPOGRAFIA}`, color: '#ffffff', interlineado: 26
  });

  if (datos.fecha) {
    yFranja = escribir(ctx, datos.fecha, {
      x: centro, y: yFranja + 4, anchoMaximo: anchoTexto,
      fuente: `400 13px ${TIPOGRAFIA}`, color: MARCA_CLARA, interlineado: 20
    });
  }

  if (datos.ubicacion) {
    yFranja = escribir(ctx, datos.ubicacion, {
      x: centro, y: yFranja + 2, anchoMaximo: anchoTexto,
      fuente: `400 13px ${TIPOGRAFIA}`, color: MARCA_CLARA, interlineado: 20
    });
  }

  // --- Cuerpo: nombre, DUI y QR --------------------------------------------
  y = tarjetaY + altoFranja + 34;

  y = escribir(ctx, datos.nombre, {
    x: centro, y, anchoMaximo: anchoTexto,
    fuente: `700 20px ${TIPOGRAFIA}`, color: TEXTO_FUERTE, interlineado: 26
  });

  if (datos.dui) {
    y = escribir(ctx, `DUI ${datos.dui}`, {
      x: centro, y: y + 4, anchoMaximo: anchoTexto,
      fuente: `400 13px ${TIPOGRAFIA}`, color: TEXTO_TENUE, interlineado: 18
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

  y = escribir(ctx, 'Muestra este código en la entrada del evento.', {
    x: centro, y, anchoMaximo: anchoTexto,
    fuente: `400 13px ${TIPOGRAFIA}`, color: TEXTO_TENUE, interlineado: 18
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

export const servicioInvitacion = {
  /**
   * Genera la invitación y la descarga como PNG.
   *
   * En iPhone el atributo `download` se ignora, así que ahí la imagen se abre
   * en una pestaña para que se pueda mantener pulsado y guardar. Devuelve cómo
   * terminó, para que la pantalla explique qué hacer en cada caso.
   */
  async descargar(datos) {
    const lienzo = await dibujar(datos);

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
