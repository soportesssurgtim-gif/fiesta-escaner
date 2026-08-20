/**
 * Diagramas de flujo del manual.
 *
 * Son SVG que se generan acá y se insertan en la pantalla. Se dibujan en lugar
 * de guardarse como imágenes por tres razones: siguen el color primario que
 * haya configurado la institución, se leen bien en claro y en oscuro, y pesan
 * unos pocos kilobytes en vez de unos cuantos cientos.
 *
 * La animación —la línea que se traza y el punto que la recorre— está en
 * assets/css/sistema-diseno.css, no acá, porque tiene que poder apagarse
 * cuando el sistema operativo pide menos movimiento.
 *
 * No llevan texto suelto que haya que traducir ni iconos: cada nodo es un
 * número y una etiqueta corta. Un diagrama con demasiada letra a 12 píxeles no
 * lo lee nadie.
 */

/** Colores de las ramas, para los finales que no son todos iguales. */
const TONOS = {
  marca: 'var(--marca-500)',
  exito: 'var(--exito-500)',
  alerta: 'var(--alerta-500)',
  error: 'var(--error-500)'
};

const escapar = (texto) => String(texto)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * Parte una etiqueta en dos renglones si no entra en uno.
 * A doce píxeles, más de catorce caracteres por renglón se pisa con el nodo de
 * al lado.
 */
function enRenglones(texto, porRenglon = 14) {
  const palabras = String(texto).split(' ');
  const renglones = [];
  let actual = '';

  for (const palabra of palabras) {
    if (actual && (actual + ' ' + palabra).length > porRenglon) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = actual ? actual + ' ' + palabra : palabra;
    }
  }
  if (actual) renglones.push(actual);

  return renglones.slice(0, 2);
}

function etiqueta(x, y, texto, clase = 'diagrama-etiqueta') {
  const renglones = enRenglones(texto);
  return renglones
    .map((renglon, i) => `<text x="${x}" y="${y + i * 14}" class="${clase}" text-anchor="middle">${escapar(renglon)}</text>`)
    .join('');
}

/**
 * Un nodo del flujo: círculo numerado con su etiqueta debajo.
 * `retraso` escalona la aparición para que el diagrama se arme de izquierda a
 * derecha, que es el orden en que se leen los pasos.
 */
function nodo({ x, y, numero, texto, tono = TONOS.marca, retraso = 0 }) {
  return `
    <g class="diagrama-nodo" style="--retraso: ${retraso}s">
      <circle cx="${x}" cy="${y}" r="22" class="diagrama-circulo" style="--tono: ${tono}" />
      <text x="${x}" y="${y + 6}" class="diagrama-numero" text-anchor="middle">${numero}</text>
      ${etiqueta(x, y + 44, texto)}
    </g>`;
}

/**
 * La línea entre dos nodos, con el punto que la recorre.
 *
 * El punto se mueve con una animación CSS y no con las de SVG. Las de SVG
 * —las etiquetas `<animate>`— no las alcanza la regla que apaga el movimiento
 * cuando el sistema operativo lo pide, así que seguirían girando delante de
 * alguien que pidió expresamente que no.
 */
function conector({ desde, hasta, y, retraso = 0, tono = TONOS.marca }) {
  const inicio = desde + 26;
  const fin = hasta - 26;
  const largo = fin - inicio;
  if (largo <= 0) return '';

  return `
    <g class="diagrama-conector" style="--retraso: ${retraso}s; --largo: ${largo}px">
      <line x1="${inicio}" y1="${y}" x2="${fin}" y2="${y}" class="diagrama-linea" />
      <polygon points="${fin},${y} ${fin - 6},${y - 4} ${fin - 6},${y + 4}" class="diagrama-punta" />
      <circle cx="${inicio}" cy="${y}" r="3.5" class="diagrama-viajero" style="--tono: ${tono}" />
    </g>`;
}

/**
 * Un flujo lineal de pasos.
 *
 * El ancho se calcula según cuántos pasos haya, y el SVG escala solo al ancho
 * que tenga disponible: en un teléfono se ve más chico pero completo, sin
 * necesidad de una versión aparte.
 */
export function flujo(pasos, opciones = {}) {
  const { ramas = [], titulo = '' } = opciones;

  const separacion = 150;
  const margen = 70;
  const y = ramas.length > 0 ? 60 : 58;
  const ancho = margen * 2 + separacion * (pasos.length - 1);
  const alto = ramas.length > 0 ? 210 : 130;

  let cuerpo = '';

  // Conectores primero, para que queden por debajo de los círculos.
  for (let i = 0; i < pasos.length - 1; i++) {
    cuerpo += conector({
      desde: margen + separacion * i,
      hasta: margen + separacion * (i + 1),
      y,
      retraso: i * 0.25
    });
  }

  pasos.forEach((paso, i) => {
    cuerpo += nodo({
      x: margen + separacion * i,
      y,
      numero: i + 1,
      texto: typeof paso === 'string' ? paso : paso.texto,
      tono: (typeof paso === 'object' && paso.tono && TONOS[paso.tono]) || TONOS.marca,
      retraso: i * 0.25
    });
  });

  // Las ramas salen del último nodo y se abren hacia abajo.
  if (ramas.length > 0) {
    const origenX = margen + separacion * (pasos.length - 1);
    const ramaY = 158;
    const anchoRama = ancho / (ramas.length + 1);

    ramas.forEach((rama, i) => {
      const x = anchoRama * (i + 1);
      const tono = TONOS[rama.tono] || TONOS.marca;
      const retraso = pasos.length * 0.25 + i * 0.15;

      cuerpo += `
        <g class="diagrama-rama" style="--retraso: ${retraso}s">
          <path d="M ${origenX} ${y + 26} C ${origenX} ${ramaY - 30}, ${x} ${y + 30}, ${x} ${ramaY - 24}"
                class="diagrama-linea diagrama-curva" fill="none" />
          <circle cx="${x}" cy="${ramaY}" r="16" class="diagrama-circulo" style="--tono: ${tono}" />
          <text x="${x}" y="${ramaY + 5}" class="diagrama-numero" text-anchor="middle">${escapar(rama.simbolo || '')}</text>
          ${etiqueta(x, ramaY + 36, rama.texto)}
        </g>`;
    });
  }

  return `<svg viewBox="0 0 ${ancho} ${alto}" class="diagrama" role="img"
       aria-label="${escapar(titulo || 'Diagrama de flujo')}"
       preserveAspectRatio="xMidYMid meet">${cuerpo}
  </svg>`;
}

export const DIAGRAMAS = {
  general: flujo(
    ['Crear el evento', 'Cargar al personal', 'Repartir invitaciones', 'Escanear en la puerta', 'Sortear los premios'],
    { titulo: 'El orden general: evento, personal, invitaciones, puerta y sorteos' }
  ),

  escaner: flujo(
    ['Abrir la cámara', 'Apuntar al código', 'Se lee solo'],
    {
      titulo: 'Escanear una invitación y sus tres resultados posibles',
      ramas: [
        { simbolo: '✓', texto: 'Entró bien', tono: 'exito' },
        { simbolo: '!', texto: 'Ya había entrado', tono: 'alerta' },
        { simbolo: '✕', texto: 'No está en la lista', tono: 'error' }
      ]
    }
  ),

  asistencias: flujo(
    ['Alguien escanea', 'Se guarda', 'Aparece en la lista', 'Participa del sorteo'],
    { titulo: 'De la puerta a la lista de asistentes' }
  ),

  sorteo: flujo(
    ['Elegir el premio', 'Cuántos ganadores', 'Extraer', 'Anunciar', 'Marcar entregado'],
    { titulo: 'Sacar un ganador y entregarle el premio' }
  ),

  'preparar-sorteo': flujo(
    ['Crear el sorteo', 'Agregar premios', 'Poner cantidades', 'Queda listo'],
    { titulo: 'Armar el sorteo de la fiesta con sus premios' }
  ),

  catalogo: flujo(
    ['Agregar', 'Completar los datos', 'Guardar', 'Ya se puede usar'],
    { titulo: 'Cargar un elemento del catálogo' }
  ),

  empleados: flujo(
    ['Descargar plantilla', 'Llenar en Excel', 'Subir el archivo', 'Revisar el resultado'],
    {
      titulo: 'Cargar al personal desde una planilla',
      ramas: [
        { simbolo: '✓', texto: 'Filas cargadas', tono: 'exito' },
        { simbolo: '✕', texto: 'Filas rechazadas', tono: 'error' }
      ]
    }
  ),

  eventos: flujo(
    ['Crear el evento', 'Marcarlo activo', 'Todo se guarda ahí'],
    { titulo: 'Crear un evento y activarlo' }
  ),

  invitaciones: flujo(
    ['Subir el diseño', 'Ubicar el código', 'Guardar', 'Generar', 'Repartir'],
    { titulo: 'Diseñar y repartir las invitaciones' }
  ),

  usuarios: flujo(
    ['Crear el rol', 'Darle permisos', 'Crear el usuario', 'Asignarle el rol'],
    { titulo: 'Dar acceso a alguien' }
  ),

  permisos: flujo(
    ['Elegir el rol', 'Marcar qué puede', 'Guardar', 'Volver a entrar'],
    { titulo: 'Configurar los permisos de un rol' }
  ),

  configuracion: flujo(
    ['Revisión previa', 'Corregir lo que falta', 'Abrir las puertas'],
    { titulo: 'Revisar el sistema antes del evento' }
  )
};

/** El diagrama de un capítulo, o cadena vacía si no tiene. */
export function diagramaDe(clave) {
  return DIAGRAMAS[clave] || '';
}
