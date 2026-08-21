/**
 * Diseño y generación de tarjetas de invitación.
 *
 * El flujo: se sube un PNG con fondo transparente, se arrastra el QR hasta
 * donde tiene que ir, se guarda la plantilla, y después se generan las
 * invitaciones de todo el personal en un ZIP.
 *
 * La previsualización trabaja a escala reducida para que quepa en pantalla. Las
 * coordenadas del QR se guardan en el sistema de la imagen original y se
 * escalan al vuelo.
 *
 * Las medidas de la tarjeta
 * -------------------------
 * Cada plantilla tiene las suyas, y salen del arte que se sube.
 *
 * Antes la exportación era siempre 1200x1800 y el arte se dibujaba estirado
 * hasta llenar ese rectángulo. Un diseño cuadrado —el típico de redes,
 * 1080x1080— salía achatado; uno horizontal, deformado. No se notó porque todas
 * las plantillas se hicieron a esa medida, pero el primer diseño con otra
 * proporción lo habría mostrado.
 *
 * Ahora la medida de salida se puede cambiar a mano, para cuando la tarjeta
 * tiene que tener un tamaño concreto de impresión. Si no coincide con la
 * proporción del arte, el arte se dibuja centrado y a escala, con transparente
 * alrededor. Estirarlo no es una opción: deformar la cara de alguien en una
 * invitación es peor que una franja vacía.
 */

/** Lo que se usaba antes, y lo que siguen usando las plantillas ya guardadas. */
const ANCHO_POR_DEFECTO = 1200;
const ALTO_POR_DEFECTO = 1800;

const PREVIA_ANCHO_MAX = 800;
const PREVIA_ALTO_MAX = 600;

/*
 * Medidas habituales, para quien está por diseñar el arte.
 *
 * Las de impresión van a 300 puntos por pulgada, que es lo que pide una
 * imprenta. Las de pantalla son las que usan las redes.
 */
export const MEDIDAS_SUGERIDAS = {
  'Media carta (impresión)': { ancho: 1650, alto: 2550 },
  'A5 (impresión)': { ancho: 1748, alto: 2480 },
  'Historia de Instagram': { ancho: 1080, alto: 1920 },
  'Cuadrada para redes': { ancho: 1080, alto: 1080 },
  'Horizontal para pantalla': { ancho: 1920, alto: 1080 }
};

/** Los topes, los mismos que valida la base en la migración 009. */
export const MEDIDA_MINIMA = { ancho: 800, alto: 600 };
export const MEDIDA_MAXIMA = 6000;

// Cuántas tarjetas entran en un ZIP. Más de esto y el navegador se queda sin
// memoria armando el archivo en el cliente.
export const MAXIMO_POR_LOTE = 100;

const LOGO_MUNICIPAL = 'https://sansalvadorsur.gob.sv/images/logo-circulo-blanco.png';

/**
 * Dónde y de qué tamaño va el arte dentro de la tarjeta.
 *
 * Se escala hasta que entre entero, conservando su proporción, y se centra. Lo
 * que sobra queda transparente.
 *
 * La escala es una sola para ancho y alto: ahí está la diferencia con lo que
 * hacía antes, que usaba una por eje y por eso deformaba. Como es una sola,
 * también sirve para el QR, que es cuadrado y tiene que seguir siéndolo.
 *
 * Cuando la medida de salida es la del arte —lo normal, porque al subirlo se
 * toma la suya— la escala da 1 y los desplazamientos dan 0: no se transforma
 * nada.
 */
export function encajar(arte, ancho, alto) {
  const anchoArte = Number(arte && arte.width) || 0;
  const altoArte = Number(arte && arte.height) || 0;

  if (!anchoArte || !altoArte) {
    return { escala: 1, x: 0, y: 0, ancho: 0, alto: 0 };
  }

  const escala = Math.min(ancho / anchoArte, alto / altoArte);
  const dibujoAncho = anchoArte * escala;
  const dibujoAlto = altoArte * escala;

  return {
    escala,
    x: (ancho - dibujoAncho) / 2,
    y: (alto - dibujoAlto) / 2,
    ancho: dibujoAncho,
    alto: dibujoAlto
  };
}

/**
 * ¿El arte y la medida de salida tienen la misma proporción?
 *
 * Si no la tienen va a quedar transparente alrededor, y eso hay que decirlo
 * antes de generar cien tarjetas, no después.
 */
export function mismaProporcion(arte, ancho, alto) {
  if (!arte || !arte.width || !arte.height || !ancho || !alto) return true;
  // Un punto de tolerancia: 1080x1919 y 1080x1920 son lo mismo en la práctica.
  return Math.abs((arte.width / arte.height) - (ancho / alto)) < 0.01;
}

/**
 * Posiciones habituales del QR.
 *
 * Están expresadas sobre una tarjeta de 1200x1800 y se trasladan a la medida
 * real de cada plantilla al aplicarlas, así siguen cayendo donde corresponde
 * sea cual sea el tamaño del arte.
 */
export const ZONAS_PREDEFINIDAS = {
  'Inferior derecha': { x: 800, y: 1400, ancho: 300 },
  'Centro inferior': { x: 450, y: 1500, ancho: 300 },
  'Superior izquierda': { x: 100, y: 100, ancho: 300 },
  'Centro': { x: 450, y: 700, ancho: 300 }
};

/** Enlace del portal público con el DUI ya precargado en el formulario. */
export function enlaceInvitacion(empleado) {
  return `${window.location.origin}/?invitacion=1&dui=${(empleado && empleado.dui) || ''}`;
}

/** Arma la URL del QR de QuickChart para un empleado. */
export function urlQr(empleado, campo = 'dui') {
  let contenido;
  if (campo === 'codigo') contenido = empleado.codigo || empleado.dui || '';
  else if (campo === 'url') contenido = enlaceInvitacion(empleado);
  else contenido = String(empleado.dui || '').replace(/[^0-9]/g, '');

  const parametros = new URLSearchParams({
    text: contenido,
    size: '400',
    margin: '2',
    light: 'ffffff',
    dark: '101828',
    centerImageUrl: LOGO_MUNICIPAL
  });

  return `https://quickchart.io/qr?${parametros.toString()}`;
}

/**
 * Descarga el QR suelto de una persona, sin plantilla de por medio.
 *
 * Va por fetch y no por canvas a propósito: así se conserva el PNG tal como lo
 * devuelve QuickChart, sin recomprimirlo ni depender de que el lienzo no quede
 * "manchado" por la imagen de otro dominio.
 */
export async function descargarQr(empleado, campo = 'dui') {
  const respuesta = await fetch(urlQr(empleado, campo));
  if (!respuesta.ok) {
    throw new Error('No se pudo obtener el código. Revisa la conexión.');
  }

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `qr-${empleado.codigo || empleado.dui || empleado.id}.png`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Carga una imagen y espera a que esté lista para dibujarse. */
function cargarImagen(origen, conCors = false) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    // Sin crossOrigin el canvas queda "manchado" y toDataURL lanza una
    // excepción de seguridad. Solo aplica a imágenes de otro dominio.
    if (conCors) imagen.crossOrigin = 'anonymous';
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => rechazar(new Error('No se pudo cargar la imagen.'));
    imagen.src = origen;
  });
}

export class DisenadorTarjetas {
  constructor() {
    this.plantilla = null;         // HTMLImageElement del fondo
    this.lienzo = null;            // canvas de la previsualización
    this.contexto = null;
    this.escala = 1;               // previsualización respecto al original

    /*
     * Dónde arranca el arte dentro de la previa.
     *
     * Es cero mientras la medida de salida sea la del arte, que es lo normal.
     * Deja de serlo cuando alguien fija otra medida y quedan franjas
     * transparentes: sin este desplazamiento, el QR se dibujaría bien pero el
     * arrastre lo agarraría corrido, porque la prueba de «¿el dedo cayó sobre
     * el QR?» se hace en coordenadas de la previa.
     */
    this._desplazamientoPrevia = { x: 0, y: 0 };
    this.campoQr = 'dui';

    // Posición y tamaño del QR, en coordenadas de la imagen original.
    this.qr = { x: 800, y: 1400, ancho: 300 };

    /*
     * La medida de salida de la tarjeta.
     *
     * Arranca en la de siempre y se reemplaza por la del arte apenas se sube
     * uno. Se puede fijar a mano cuando la tarjeta tiene que salir en un tamaño
     * concreto; ahí el arte se centra y se escala, nunca se estira.
     */
    this.medidas = { ancho: ANCHO_POR_DEFECTO, alto: ALTO_POR_DEFECTO };

    this.arrastrando = false;
    this._inicio = { x: 0, y: 0, qrX: 0, qrY: 0 };
    this._qrPrevio = null;         // QR de muestra cacheado para la previa
    this._desatar = [];            // funciones de limpieza de los listeners
  }

  /** Engancha el diseñador a un <canvas> del DOM. */
  montar(idLienzo = 'canvasTarjeta') {
    const lienzo = document.getElementById(idLienzo);
    if (!lienzo) return false;

    // Si ya estaba montado (al volver a entrar a la vista) soltamos los
    // listeners viejos: si no, se acumulan y el QR se mueve al doble de rápido.
    this.desmontar();

    this.lienzo = lienzo;
    this.contexto = lienzo.getContext('2d');
    this._engancharEventos();
    return true;
  }

  /** Suelta todos los listeners. Se llama al salir de la vista. */
  desmontar() {
    for (const soltar of this._desatar) soltar();
    this._desatar = [];
  }

  _engancharEventos() {
    const lienzo = this.lienzo;

    const posicion = (evento) => {
      const marco = lienzo.getBoundingClientRect();
      const punto = evento.touches ? evento.touches[0] : evento;
      // El canvas se muestra con CSS a un tamaño distinto al de sus píxeles
      // reales, así que hay que corregir por esa diferencia.
      const factorX = lienzo.width / marco.width;
      const factorY = lienzo.height / marco.height;
      return {
        x: (punto.clientX - marco.left) * factorX,
        y: (punto.clientY - marco.top) * factorY
      };
    };

    const empezar = (evento) => {
      const punto = posicion(evento);
      // Donde se ve el QR, que es donde el dedo espera encontrarlo.
      const x = this._desplazamientoPrevia.x + this.qr.x * this.escala;
      const y = this._desplazamientoPrevia.y + this.qr.y * this.escala;
      const lado = this.qr.ancho * this.escala;

      if (punto.x >= x && punto.x <= x + lado && punto.y >= y && punto.y <= y + lado) {
        this.arrastrando = true;
        this._inicio = { x: punto.x, y: punto.y, qrX: this.qr.x, qrY: this.qr.y };
      }
    };

    const mover = (evento) => {
      if (!this.arrastrando || !this.plantilla) return;
      const punto = posicion(evento);
      const dx = (punto.x - this._inicio.x) / this.escala;
      const dy = (punto.y - this._inicio.y) / this.escala;

      // El QR no puede salirse de la tarjeta.
      this.qr.x = Math.max(0, Math.min(this._inicio.qrX + dx, this.plantilla.width - this.qr.ancho));
      this.qr.y = Math.max(0, Math.min(this._inicio.qrY + dy, this.plantilla.height - this.qr.ancho));
      this.dibujarPrevia();
    };

    const soltar = () => { this.arrastrando = false; };

    const rueda = (evento) => {
      if (!this.plantilla) return;
      evento.preventDefault();
      const paso = evento.deltaY > 0 ? -12 : 12;
      const maximo = Math.min(this.plantilla.width, this.plantilla.height) * 0.5;
      this.qr.ancho = Math.max(80, Math.min(maximo, this.qr.ancho + paso));
      this.dibujarPrevia();
    };

    const registrar = (destino, tipo, manejador, opciones) => {
      destino.addEventListener(tipo, manejador, opciones);
      this._desatar.push(() => destino.removeEventListener(tipo, manejador, opciones));
    };

    registrar(lienzo, 'mousedown', empezar);
    registrar(lienzo, 'touchstart', (e) => { e.preventDefault(); empezar(e); }, { passive: false });
    registrar(window, 'mousemove', mover);
    registrar(window, 'touchmove', (e) => { if (this.arrastrando) { e.preventDefault(); mover(e); } }, { passive: false });
    registrar(window, 'mouseup', soltar);
    registrar(window, 'touchend', soltar);
    registrar(lienzo, 'wheel', rueda, { passive: false });
  }

  /**
   * Carga el PNG de fondo que eligió el usuario.
   * Validamos acá y no en el servidor porque el aviso tiene que ser inmediato:
   * si la imagen no sirve, hay que decirlo antes de que empiece a posicionar.
   */
  async cargarPlantillaDesdeArchivo(archivo) {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('El archivo debe ser una imagen.');
    }
    if (archivo.type !== 'image/png') {
      throw new Error('La plantilla debe ser un PNG (necesita fondo transparente).');
    }

    const dataUrl = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = (evento) => resolver(evento.target.result);
      lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
      lector.readAsDataURL(archivo);
    });

    const imagen = await cargarImagen(dataUrl);

    if (imagen.width < 800 || imagen.height < 600) {
      throw new Error('La imagen es muy pequeña. Mínimo 800x600 px.');
    }

    this.plantilla = imagen;
    this.dataUrlPlantilla = dataUrl;

    // La tarjeta sale del tamaño del arte. Es lo que evita cualquier
    // transformación: sin esto habría que elegir una medida y deformar.
    this.medidas = { ancho: imagen.width, alto: imagen.height };

    this.centrarQrPorDefecto();
    await this.dibujarPrevia();

    return imagen;
  }

  /*
   * Mete el QR dentro de la tarjeta.
   *
   * Hace falta porque la posición puede venir de tres lados —la de por defecto,
   * una de las posiciones rápidas, o una plantilla guardada— y ninguno de los
   * tres sabe qué forma tiene el arte que está en pantalla ahora.
   *
   * Se descubrió con un arte horizontal de 1600x601: el QR quedaba 144 píxeles
   * por debajo del borde y no se veía en la tarjeta generada. Con los diseños
   * verticales de siempre nunca pasaba, porque sobraba altura.
   *
   * Primero se achica y después se corre: al revés, un QR más grande que la
   * tarjeta quedaría en cero y seguiría saliéndose.
   */
  _meterQrAdentro() {
    if (!this.plantilla) return;

    const { width: ancho, height: alto } = this.plantilla;

    this.qr.ancho = Math.min(this.qr.ancho, ancho, alto);
    this.qr.x = Math.max(0, Math.min(this.qr.x, ancho - this.qr.ancho));
    this.qr.y = Math.max(0, Math.min(this.qr.y, alto - this.qr.ancho));
  }

  /**
   * Posición inicial razonable: abajo a la derecha, como la mayoría.
   *
   * El tamaño sale del lado más corto y no del ancho. Sobre un arte horizontal,
   * un QR proporcional al ancho es más alto que la tarjeta entera.
   */
  centrarQrPorDefecto() {
    if (!this.plantilla) return;

    const lado = Math.min(this.plantilla.width, this.plantilla.height);

    this.qr.ancho = Math.round(lado * 0.22);
    this.qr.x = Math.round(this.plantilla.width - this.qr.ancho - lado * 0.06);
    this.qr.y = Math.round(this.plantilla.height - this.qr.ancho - lado * 0.06);

    this._meterQrAdentro();
  }

  /** Salta a una de las posiciones predefinidas. */
  aplicarZona(nombre) {
    const zona = ZONAS_PREDEFINIDAS[nombre];
    if (!zona || !this.plantilla) return;

    // Las zonas están expresadas para 1200x1800; las trasladamos al tamaño
    // real de esta plantilla.
    const factorX = this.plantilla.width / ANCHO_POR_DEFECTO;
    const factorY = this.plantilla.height / ALTO_POR_DEFECTO;

    this.qr.x = Math.round(zona.x * factorX);
    this.qr.y = Math.round(zona.y * factorY);
    this.qr.ancho = Math.round(zona.ancho * factorX);

    // Las zonas están pensadas sobre una tarjeta vertical. Sobre una horizontal,
    // «inferior derecha» cae fuera del borde de abajo si no se la acota.
    this._meterQrAdentro();

    this.dibujarPrevia();
  }

  /** Redibuja la previsualización con el QR en su posición actual. */
  async dibujarPrevia() {
    if (!this.plantilla || !this.contexto) return;

    /*
     * La previa es la tarjeta entera, no el arte.
     *
     * Antes el lienzo tomaba la forma del arte, así que la previa nunca podía
     * mostrar que la salida iba a ser distinta. Ahora se dibuja la caja de
     * salida y el arte dentro: si sobra lugar, el damero lo deja a la vista y
     * se ve acá en lugar de descubrirse al abrir el ZIP.
     */
    const encogido = Math.min(
      PREVIA_ANCHO_MAX / this.medidas.ancho,
      PREVIA_ALTO_MAX / this.medidas.alto,
      1
    );

    this.lienzo.width = Math.round(this.medidas.ancho * encogido);
    this.lienzo.height = Math.round(this.medidas.alto * encogido);

    const caja = encajar(this.plantilla, this.lienzo.width, this.lienzo.height);

    // `escala` sigue significando lo mismo que antes —píxeles de previa por
    // píxel del arte— así que el arrastre no cambia.
    this.escala = caja.escala;
    this._desplazamientoPrevia = { x: caja.x, y: caja.y };

    const ctx = this.contexto;
    ctx.clearRect(0, 0, this.lienzo.width, this.lienzo.height);

    // Cuadros de damero para que se note qué partes son transparentes.
    this._dibujarDamero();
    ctx.drawImage(this.plantilla, caja.x, caja.y, caja.ancho, caja.alto);

    const x = caja.x + this.qr.x * this.escala;
    const y = caja.y + this.qr.y * this.escala;
    const lado = this.qr.ancho * this.escala;

    // QR de muestra. Se cachea porque si no, cada píxel de arrastre dispara una
    // petición a QuickChart y el arrastre se vuelve un salto de cuadros.
    if (!this._qrPrevio) {
      try {
        this._qrPrevio = await cargarImagen(
          urlQr({ dui: '01234567-8', codigo: 'EMP-001' }, this.campoQr),
          true
        );
      } catch {
        this._qrPrevio = null;
      }
    }

    if (this._qrPrevio) {
      ctx.drawImage(this._qrPrevio, x, y, lado, lado);
    } else {
      // Sin internet dibujamos un marcador para no dejar el hueco vacío.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, lado, lado);
      ctx.fillStyle = '#667085';
      ctx.font = '600 14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR', x + lado / 2, y + lado / 2);
      ctx.textAlign = 'left';
    }

    // Guía punteada de la zona del QR: ayuda a ver el área arrastrable.
    ctx.strokeStyle = '#465fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, lado, lado);
    ctx.setLineDash([]);
  }

  /** Fondo a cuadros que delata la transparencia del PNG. */
  _dibujarDamero() {
    const ctx = this.contexto;
    const lado = 12;
    for (let y = 0; y < this.lienzo.height; y += lado) {
      for (let x = 0; x < this.lienzo.width; x += lado) {
        const par = ((x / lado) + (y / lado)) % 2 === 0;
        ctx.fillStyle = par ? '#f2f4f7' : '#e4e7ec';
        ctx.fillRect(x, y, lado, lado);
      }
    }
  }

  /** Cambia qué dato se codifica en el QR e invalida la muestra cacheada. */
  establecerCampoQr(campo) {
    this.campoQr = campo;
    this._qrPrevio = null;
    this.dibujarPrevia();
  }

  /**
   * Genera la tarjeta final de un empleado, a tamaño de impresión.
   * Devuelve un data URL PNG.
   */
  async generarTarjeta(empleado, campo = this.campoQr, plantilla = this.plantilla) {
    if (!plantilla) throw new Error('No hay ninguna plantilla cargada.');

    const lienzo = document.createElement('canvas');
    lienzo.width = this.medidas.ancho;
    lienzo.height = this.medidas.alto;
    const ctx = lienzo.getContext('2d');

    /*
     * El arte entero, sin deformar.
     *
     * La versión anterior lo estiraba hasta llenar 1200x1800 y además escalaba
     * el QR con un factor por eje: sobre un arte que no fuera 2:3, el dibujo
     * salía deformado y el QR encima quedaba corrido de donde se lo había
     * puesto. Con una sola escala las dos cosas se arreglan juntas.
     */
    const caja = encajar(plantilla, this.medidas.ancho, this.medidas.alto);
    ctx.drawImage(plantilla, caja.x, caja.y, caja.ancho, caja.alto);

    const qr = await cargarImagen(urlQr(empleado, campo), true);
    const lado = this.qr.ancho * caja.escala;

    ctx.drawImage(
      qr,
      caja.x + this.qr.x * caja.escala,
      caja.y + this.qr.y * caja.escala,
      lado,
      lado
    );

    return lienzo.toDataURL('image/png');
  }

  /** Descarga la tarjeta de una sola persona. */
  async descargarIndividual(empleado, campo = this.campoQr) {
    const dataUrl = await this.generarTarjeta(empleado, campo);
    const enlace = document.createElement('a');
    enlace.download = `tarjeta-${empleado.codigo || empleado.dui || empleado.id}.png`;
    enlace.href = dataUrl;
    enlace.click();
  }

  /**
   * Arma un ZIP con las tarjetas de varios empleados.
   * `alAvanzar` recibe (procesados, total) para poder mover la barra.
   */
  async generarLoteZip(empleados, campo = this.campoQr, alAvanzar = null) {
    if (typeof JSZip === 'undefined') {
      throw new Error('La librería de compresión no cargó. Recarga la página.');
    }

    const seleccion = empleados.slice(0, MAXIMO_POR_LOTE);
    const zip = new JSZip();
    const carpeta = zip.folder('tarjetas-invitacion');
    const fallidos = [];

    for (let i = 0; i < seleccion.length; i++) {
      const empleado = seleccion[i];
      try {
        const dataUrl = await this.generarTarjeta(empleado, campo);
        const nombre = `tarjeta-${empleado.codigo || empleado.dui || empleado.id}.png`;
        carpeta.file(nombre, dataUrl.split(',')[1], { base64: true });
      } catch {
        // Una tarjeta que falla no debe abortar el lote entero: se anota y se
        // informa al final.
        fallidos.push(`${empleado.nombres || ''} ${empleado.apellidos || ''}`.trim());
      }

      if (alAvanzar) alAvanzar(i + 1, seleccion.length);
    }

    const archivo = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `tarjetas-invitacion-${new Date().toISOString().slice(0, 10)}.zip`;
    enlace.click();
    URL.revokeObjectURL(url);

    return { generadas: seleccion.length - fallidos.length, fallidos };
  }

  /**
   * Fija la medida de salida a mano.
   *
   * Se recorta a los límites en lugar de rechazar: quien escribe 50 en el ancho
   * está tanteando, no pidiendo una tarjeta de 50 píxeles, y devolverle un error
   * mientras teclea molesta más de lo que ayuda. Los mismos topes los valida la
   * base, así que un valor absurdo no llega a guardarse igual.
   */
  establecerMedidas(ancho, alto) {
    const acotar = (valor, minimo) => {
      const numero = Math.round(Number(valor));
      if (!Number.isFinite(numero)) return minimo;
      return Math.max(minimo, Math.min(MEDIDA_MAXIMA, numero));
    };

    this.medidas = {
      ancho: acotar(ancho, MEDIDA_MINIMA.ancho),
      alto: acotar(alto, MEDIDA_MINIMA.alto)
    };

    return this.medidas;
  }

  /** ¿Va a quedar transparente alrededor con la medida elegida? */
  get hayFranjas() {
    return !mismaProporcion(this.plantilla, this.medidas.ancho, this.medidas.alto);
  }

  /** Carga una plantilla ya guardada para volver a generar con ella. */
  async usarPlantillaGuardada(plantilla) {
    if (!plantilla.imagen_publica) {
      throw new Error('La plantilla no tiene una imagen accesible.');
    }

    const imagen = await cargarImagen(plantilla.imagen_publica, true);

    this.plantilla = imagen;
    this.campoQr = plantilla.campo_qr || 'dui';
    this.qr = {
      x: Number(plantilla.qr_x) || 0,
      y: Number(plantilla.qr_y) || 0,
      ancho: Number(plantilla.qr_w) || 200
    };

    // Las plantillas guardadas antes de la migración 009 no traen medidas, y
    // para ellas la de siempre es la correcta: su arte se hizo a ese tamaño.
    this.medidas = {
      ancho: Number(plantilla.ancho) || ANCHO_POR_DEFECTO,
      alto: Number(plantilla.alto) || ALTO_POR_DEFECTO
    };

    this._meterQrAdentro();
    this._qrPrevio = null;

    return imagen;
  }

  /** Los datos que hay que mandarle al backend para guardar esta plantilla. */
  datosParaGuardar(nombre) {
    return {
      nombre: nombre || `Plantilla ${new Date().toLocaleDateString('es-SV')}`,
      imagenBase64: this.dataUrlPlantilla || null,
      qr_x: Math.round(this.qr.x),
      qr_y: Math.round(this.qr.y),
      qr_w: Math.round(this.qr.ancho),
      qr_h: Math.round(this.qr.ancho),
      ancho: this.medidas.ancho,
      alto: this.medidas.alto,
      campo_qr: this.campoQr,
      activo: 'TRUE'
    };
  }
}

/** Instancia única: solo hay un diseñador abierto a la vez. */
export const disenador = new DisenadorTarjetas();
