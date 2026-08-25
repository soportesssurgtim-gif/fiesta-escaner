/**
 * La plantilla HTML de la invitación.
 *
 * Qué es
 * ------
 * El diseño guiado —colores, franja, cuatro casillas— cubre lo que cambia entre
 * una fiesta y otra, pero no deja mover nada de lugar. Para eso está esto: un
 * administrador escribe el HTML de la invitación con marcadores como {nombre} o
 * {evento}, y el sistema los reemplaza por los datos de cada persona.
 *
 * Es lo mismo que hacen las plantillas de correo, y por la misma razón: quien
 * diseña quiere control del maquetado, y quien administra no quiere pedirle un
 * cambio de código a nadie para mover un logo.
 *
 * Por qué el HTML no se confía
 * ----------------------------
 * La plantilla se guarda una vez y se muestra a cualquiera que entre al portal
 * público, sin sesión. Un `<script>` guardado ahí correría en el navegador de
 * cada empleado que consulte su invitación, en una página que además recibe
 * DUIs escritos a mano.
 *
 * Guardar solo la puede un administrador, pero eso protege de un extraño, no de
 * un descuido ni de una cuenta prestada. Así que el HTML se limpia siempre
 * antes de mostrarlo, en el navegador, y el servidor además rechaza de plano lo
 * que venga con `<script>` o con manejadores de eventos. Las dos cosas: la del
 * servidor evita que se guarde, la del navegador evita que se muestre si
 * llegara a estar guardado.
 *
 * Y los datos que se meten en la plantilla se escapan. Un apellido con un `<`
 * no puede abrir una etiqueta.
 */

/**
 * Los marcadores que se pueden usar, con un ejemplo para la vista previa.
 *
 * No están el cargo ni el departamento a propósito. El portal público devuelve
 * nombre, DUI y QR y nada más —está escrito en `invitacionPublica.js`— porque
 * cualquiera que sepa un DUI puede consultar. Ofrecer {cargo} acá seria ofrecer
 * un marcador que siempre sale vacío, o peor, empujar a que se publique.
 */
export const MARCADORES = Object.freeze([
  { clave: 'nombre', etiqueta: 'Nombre completo', ejemplo: 'María José Hernández de González' },
  { clave: 'dui', etiqueta: 'DUI', ejemplo: '01234567-8' },
  { clave: 'evento', etiqueta: 'Nombre del evento', ejemplo: 'Fiesta de fin de año' },
  { clave: 'fecha', etiqueta: 'Fecha del evento', ejemplo: '19 de diciembre de 2026' },
  { clave: 'lugar', etiqueta: 'Lugar del evento', ejemplo: 'Casa de la Cultura' },
  {
    clave: 'qr', etiqueta: 'Dirección del código QR', enAtributo: true,
    ejemplo: 'https://quickchart.io/qr?text=012345678&size=400'
  },
  {
    clave: 'logo', etiqueta: 'Dirección del escudo', enAtributo: true,
    ejemplo: '/assets/iconos/icono-192.png'
  }
]);

/** Las claves sueltas, para comprobar rápido si un `{algo}` es de los nuestros. */
const CLAVES = new Set(MARCADORES.map((m) => m.clave));

/** El escudo sale del propio dominio; ver la nota de CORS en servicioInvitacion. */
export const LOGO = '/assets/iconos/icono-192.png';

/**
 * La plantilla con la que se arranca.
 *
 * Reproduce el diseño de siempre, para que quien abra el editor por primera vez
 * encuentre algo terminado que retocar en lugar de una caja vacía.
 *
 * Va con estilos en línea y una tipografía del sistema, sin clases ni hojas
 * externas, por dos razones: se ve igual dentro del editor que en el portal, y
 * al convertirla en imagen no depende de que haya cargado una fuente de otro
 * dominio.
 */
export const PLANTILLA_POR_DEFECTO = `<div style="max-width:420px;margin:0 auto;overflow:hidden;
     border-radius:16px;background:#ffffff;
     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <div style="background:#1e3a8a;padding:24px 20px;text-align:center;">
    <img src="{logo}" alt="" width="64" height="64"
         style="display:block;margin:0 auto 12px;border-radius:50%;background:#ffffff;padding:6px;" />
    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c2d6ff;">
      Estás invitado a
    </p>
    <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">{evento}</p>
    <p style="margin:8px 0 0;font-size:13px;color:#c2d6ff;">{fecha}</p>
    <p style="margin:2px 0 0;font-size:13px;color:#c2d6ff;">{lugar}</p>
  </div>

  <div style="padding:24px 20px;text-align:center;">
    <p style="margin:0;font-size:19px;font-weight:700;color:#101828;">{nombre}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#667085;">{dui}</p>

    <img src="{qr}" alt="Código QR de tu invitación" width="200" height="200"
         style="display:block;margin:20px auto 0;border-radius:12px;background:#ffffff;" />

    <p style="margin:20px 0 0;font-size:13px;color:#667085;">
      Muestra este código en la entrada del evento.
    </p>
  </div>
</div>`;

/** Escapa un valor para que sirva tanto dentro de un texto como de un atributo. */
export function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reemplaza los marcadores por los datos de la persona.
 *
 * Un `{algo}` que no sea de los nuestros se deja tal cual y no se borra: el CSS
 * de la plantilla está lleno de llaves, y vaciar cualquier cosa entre llaves
 * romperia los estilos de quien escribió `p{color:red}`.
 */
export function rellenar(html, datos = {}) {
  const valores = {
    nombre: datos.nombre || '',
    dui: datos.dui || '',
    evento: datos.evento || '',
    fecha: datos.fecha || '',
    lugar: datos.ubicacion || datos.lugar || '',
    qr: datos.urlQr || datos.qr || '',
    logo: datos.logo || LOGO
  };

  return String(html || '').replace(/\{([a-zA-Z]+)\}/g, (crudo, clave) => (
    CLAVES.has(clave) ? escapar(valores[clave]) : crudo
  ));
}

/** Datos de mentira para la vista previa del editor. */
export function datosDeEjemplo() {
  const ejemplo = {};
  for (const marcador of MARCADORES) ejemplo[marcador.clave] = marcador.ejemplo;
  return {
    nombre: ejemplo.nombre,
    dui: ejemplo.dui,
    evento: ejemplo.evento,
    fecha: ejemplo.fecha,
    ubicacion: ejemplo.lugar,
    urlQr: ejemplo.qr,
    logo: ejemplo.logo
  };
}

/*
 * Lo que no puede quedar en la plantilla.
 *
 * `script` es lo evidente. `iframe`, `object` y `embed` traen una página entera
 * de otro lado, con su propio código. `form`, `input` y `button` dibujan algo
 * que parece del sistema y puede pedir datos que después van a cualquier parte:
 * en la pantalla donde alguien acaba de escribir su DUI, eso es lo peor que
 * podria haber. `link` y `base` cambian de dónde carga la página el resto de
 * las cosas.
 *
 * Y `style`, que no es un peligro de seguridad pero sí un desastre.
 * -----------------------------------------------------------------
 * La plantilla se inserta dentro de la página del portal, no en un marco
 * aparte. Un bloque de estilos ahí adentro no queda contenido: `p { color:red }`
 * pinta de rojo todos los párrafos de la página, incluidos los botones y los
 * avisos del sistema. Con una regla desafortunada, la plantilla puede dejar
 * ilegible el propio portal que la muestra.
 *
 * Por eso los estilos van en línea, atributo por atributo. Es exactamente lo
 * que hacen las plantillas de correo y por el mismo motivo. Se pierden las
 * medias queries y las pseudoclases; a cambio, lo que se ve en la vista previa
 * es lo que se ve en el portal y lo que sale en la imagen descargada.
 */
const ETIQUETAS_PROHIBIDAS = [
  'script', 'iframe', 'object', 'embed', 'link', 'base', 'meta',
  'form', 'input', 'textarea', 'select', 'button', 'noscript', 'style'
];

/** Atributos que traen una dirección y hay que mirarles el esquema. */
const ATRIBUTOS_CON_DIRECCION = ['href', 'src', 'action', 'poster', 'background', 'xlink:href'];

/** Los esquemas que se dejan pasar. */
const ESQUEMAS_BUENOS = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * ¿Esta dirección es de fiar?
 *
 * Los espacios y los caracteres de control se quitan antes de mirar: el
 * navegador los ignora al navegar, asi que `java\tscript:alert(1)` le funciona
 * igual y hay que verlo como lo ve él.
 */
function direccionSegura(valor) {
  const limpio = String(valor || '').replace(/[\u0000-\u0020]/g, '');
  if (limpio === '') return false;

  // Sin esquema es una dirección relativa o un ancla: no lleva a ningún lado
  // que no sea esta misma página.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(limpio)) return true;

  // Las imágenes incrustadas hacen falta: la plantilla puede traer su fondo
  // adentro, y es lo que deja convertirla en imagen sin pedir nada por red.
  if (/^data:image\//i.test(limpio)) return true;

  const enMinusculas = limpio.toLowerCase();
  return ESQUEMAS_BUENOS.some((esquema) => enMinusculas.startsWith(esquema));
}

/**
 * Limpia la plantilla antes de mostrarla.
 *
 * Se hace con el analizador del propio navegador y no con expresiones
 * regulares. Un `<scr<script>ipt>` o un `<img src=x onerror=alert(1)>` escritos
 * con mayúsculas raras y entidades HTML se le escapan a cualquier regex, pero
 * el analizador ve el mismo árbol que verá la página y ahí no hay disfraz que
 * valga.
 *
 * `DOMParser` arma un documento aparte, sin ejecutar nada: las imágenes no se
 * piden y los scripts no corren aunque estén escritos.
 */
export function sanear(html) {
  const texto = String(html || '');
  if (texto.trim() === '') return '';
  if (typeof DOMParser === 'undefined') return '';

  const documento = new DOMParser().parseFromString(texto, 'text/html');
  const cuerpo = documento.body;

  for (const etiqueta of ETIQUETAS_PROHIBIDAS) {
    for (const nodo of [...cuerpo.querySelectorAll(etiqueta)]) nodo.remove();
  }

  for (const nodo of [...cuerpo.querySelectorAll('*')]) {
    for (const atributo of [...nodo.attributes]) {
      const nombre = atributo.name.toLowerCase();

      // `onclick`, `onerror` y los otros ochenta.
      if (nombre.startsWith('on')) { nodo.removeAttribute(atributo.name); continue; }

      // `srcdoc` mete una página entera dentro de un atributo.
      if (nombre === 'srcdoc' || nombre === 'formaction') {
        nodo.removeAttribute(atributo.name);
        continue;
      }

      if (ATRIBUTOS_CON_DIRECCION.includes(nombre) && !direccionSegura(atributo.value)) {
        nodo.removeAttribute(atributo.name);
      }
    }
  }

  return cuerpo.innerHTML;
}

/**
 * Lo que el servidor no deja ni guardar.
 *
 * Acá no se limpia: se rechaza. Limpiar en el servidor obligaria a llevar un
 * analizador de HTML en una función sin navegador, y guardar a medias lo que
 * alguien escribió es peor que decirle que no. La limpieza fina la hace
 * `sanear` en el navegador, cada vez que se muestra.
 *
 * Devuelve el motivo, o cadena vacía si está bien.
 */
export function motivoDeRechazo(html) {
  const texto = String(html || '');
  if (texto.trim() === '') return '';

  if (/<\s*script/i.test(texto)) return 'La plantilla no puede llevar <script>.';
  if (/<\s*(iframe|object|embed)/i.test(texto)) {
    return 'La plantilla no puede llevar <iframe>, <object> ni <embed>.';
  }
  if (/<\s*(form|input|button|textarea|select)/i.test(texto)) {
    return 'La plantilla no puede llevar formularios ni campos: la invitación no pide datos.';
  }
  if (/\son[a-z]+\s*=/i.test(texto)) {
    return 'La plantilla no puede llevar manejadores de eventos como onclick u onerror.';
  }
  if (/javascript\s*:/i.test(texto)) return 'La plantilla no puede llevar direcciones javascript:.';
  if (/<\s*(link|base|meta)/i.test(texto)) {
    return 'La plantilla no puede llevar <link>, <base> ni <meta>.';
  }

  /*
   * El `<style>` se avisa en lugar de quitarlo callado.
   *
   * `sanear` lo quita igual al mostrar, pero quien escribio la plantilla veria
   * desaparecer sus estilos sin saber por que. Decirselo al guardar, con el
   * motivo, le ahorra la tarde.
   */
  if (/<\s*style/i.test(texto)) {
    return 'La plantilla no puede llevar <style>: sus reglas se aplicarían a toda la ' +
      'página del portal. Usa el atributo style en cada elemento.';
  }

  return '';
}

/** El largo máximo de una plantilla. Cien mil caracteres es una barbaridad ya. */
export const LARGO_MAXIMO = 100000;
