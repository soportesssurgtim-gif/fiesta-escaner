/**
 * Diseño y generación de tarjetas de invitación.
 *
 * El flujo: se sube un PNG con fondo transparente, se arrastra el QR hasta
 * donde tiene que ir, se guarda la plantilla, y después se generan las
 * invitaciones de todo el personal en un ZIP.
 *
 * La previsualización trabaja a escala reducida para que quepa en pantalla,
 * pero la exportación siempre se hace a 1200x1800 px, que es el tamaño de
 * impresión. Por eso las coordenadas se guardan en el sistema de la imagen
 * original y se escalan al vuelo.
 */

const LIENZO_ANCHO = 1200;
const LIENZO_ALTO = 1800;
const PREVIA_ANCHO_MAX = 800;
const PREVIA_ALTO_MAX = 600;

// Cuántas tarjetas entran en un ZIP. Más de esto y el navegador se queda sin
// memoria armando el archivo en el cliente.
export const MAXIMO_POR_LOTE = 100;

const LOGO_MUNICIPAL = 'https://sansalvadorsur.gob.sv/images/logo-circulo-blanco.png';

/** Posiciones habituales del QR, relativas a una tarjeta de 1200x1800. */
export const ZONAS_PREDEFINIDAS = {
  'Inferior derecha': { x: 800, y: 1400, ancho: 300 },
  'Centro inferior': { x: 450, y: 1500, ancho: 300 },
  'Superior izquierda': { x: 100, y: 100, ancho: 300 },
  'Centro': { x: 450, y: 700, ancho: 300 }
};

/** Arma la URL del QR de QuickChart para un empleado. */
export function urlQr(empleado, campo = 'dui') {
  let contenido;
  if (campo === 'codigo') contenido = empleado.codigo || empleado.dui || '';
  else if (campo === 'url') contenido = `${window.location.origin}/?invitacion=1&dui=${empleado.dui || ''}`;
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
    this.campoQr = 'dui';

    // Posición y tamaño del QR, en coordenadas de la imagen original.
    this.qr = { x: 800, y: 1400, ancho: 300 };

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
      const x = this.qr.x * this.escala;
      const y = this.qr.y * this.escala;
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
    this.centrarQrPorDefecto();
    await this.dibujarPrevia();

    return imagen;
  }

  /** Posición inicial razonable: abajo a la derecha, como la mayoría. */
  centrarQrPorDefecto() {
    if (!this.plantilla) return;
    this.qr.ancho = Math.round(this.plantilla.width * 0.18);
    this.qr.x = Math.round(this.plantilla.width * 0.72);
    this.qr.y = Math.round(this.plantilla.height * 0.76);
  }

  /** Salta a una de las posiciones predefinidas. */
  aplicarZona(nombre) {
    const zona = ZONAS_PREDEFINIDAS[nombre];
    if (!zona || !this.plantilla) return;

    // Las zonas están expresadas para 1200x1800; las trasladamos al tamaño
    // real de esta plantilla.
    const factorX = this.plantilla.width / LIENZO_ANCHO;
    const factorY = this.plantilla.height / LIENZO_ALTO;

    this.qr.x = Math.round(zona.x * factorX);
    this.qr.y = Math.round(zona.y * factorY);
    this.qr.ancho = Math.round(zona.ancho * factorX);

    this.dibujarPrevia();
  }

  /** Redibuja la previsualización con el QR en su posición actual. */
  async dibujarPrevia() {
    if (!this.plantilla || !this.contexto) return;

    this.escala = Math.min(
      PREVIA_ANCHO_MAX / this.plantilla.width,
      PREVIA_ALTO_MAX / this.plantilla.height,
      1
    );

    this.lienzo.width = Math.round(this.plantilla.width * this.escala);
    this.lienzo.height = Math.round(this.plantilla.height * this.escala);

    const ctx = this.contexto;
    ctx.clearRect(0, 0, this.lienzo.width, this.lienzo.height);

    // Cuadros de damero para que se note qué partes son transparentes.
    this._dibujarDamero();
    ctx.drawImage(this.plantilla, 0, 0, this.lienzo.width, this.lienzo.height);

    const x = this.qr.x * this.escala;
    const y = this.qr.y * this.escala;
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
    lienzo.width = LIENZO_ANCHO;
    lienzo.height = LIENZO_ALTO;
    const ctx = lienzo.getContext('2d');

    ctx.drawImage(plantilla, 0, 0, LIENZO_ANCHO, LIENZO_ALTO);

    const qr = await cargarImagen(urlQr(empleado, campo), true);

    const factorX = LIENZO_ANCHO / plantilla.width;
    const factorY = LIENZO_ALTO / plantilla.height;

    ctx.drawImage(
      qr,
      this.qr.x * factorX,
      this.qr.y * factorY,
      this.qr.ancho * factorX,
      this.qr.ancho * factorX
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
      campo_qr: this.campoQr,
      activo: 'TRUE'
    };
  }
}

/** Instancia única: solo hay un diseñador abierto a la vez. */
export const disenador = new DisenadorTarjetas();
