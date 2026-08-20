/**
 * Diagramas de flujo del manual.
 *
 * Son SVG que se generan acá y se insertan en la pantalla. Se dibujan en lugar
 * de guardarse como imágenes por tres razones: siguen el color primario que
 * haya configurado la institución, se leen bien en claro y en oscuro, y pesan
 * unos pocos kilobytes en vez de unos cuantos cientos.
 *
 * Dos orientaciones
 * -----------------
 * En pantalla ancha el flujo va de izquierda a derecha. En un teléfono eso
 * obligaba a desplazar el diagrama a lo ancho para verlo entero, que es lo peor
 * que se le puede pedir a alguien que está tratando de entender un proceso. En
 * pantalla angosta el mismo flujo se dibuja de arriba hacia abajo, que además
 * es la dirección en la que ya se está leyendo.
 *
 * La animación
 * ------------
 * El punto que recorre las líneas no es un adorno: representa a la persona
 * avanzando por el proceso. Por eso pasa por los tramos EN ORDEN, uno después
 * del otro, y no todos a la vez: lo que se quiere mostrar es la secuencia. Al
 * llegar a un nodo, el nodo late; así el ojo sigue dónde está el proceso.
 *
 * Cada diagrama emite sus propios fotogramas porque los tiempos dependen de
 * cuántos tramos tenga, y los porcentajes de un @keyframes no se pueden
 * calcular con variables CSS. Los nombres llevan el identificador del diagrama
 * para que no se pisen entre sí: un <style> dentro de un SVG es global.
 */

/** Colores de las ramas, para los finales que no son todos iguales. */
const TONOS = {
  marca: 'var(--marca-500)',
  exito: 'var(--exito-500)',
  alerta: 'var(--alerta-500)',
  error: 'var(--error-500)'
};

/** Cuánto dura el recorrido de un tramo, en segundos. */
const DURACION_TRAMO = 1.1;

const escapar = (texto) => String(texto)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Parte una etiqueta en renglones que entren en el ancho disponible. */
function enRenglones(texto, porRenglon) {
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

function etiqueta({ x, y, texto, ancla = 'middle', porRenglon = 14 }) {
  return enRenglones(texto, porRenglon)
    .map((renglon, i) =>
      `<text x="${x}" y="${y + i * 15}" class="diagrama-etiqueta" text-anchor="${ancla}">${escapar(renglon)}</text>`)
    .join('');
}

/**
 * Los fotogramas de un diagrama.
 *
 * `tramos` es cuántos segmentos recorre el punto. Cada uno se mueve durante su
 * turno y queda invisible el resto del ciclo, que es lo que produce la
 * sensación de una sola cosa avanzando en vez de varias moviéndose a la vez.
 */
function fotogramas(id, tramos, vertical, terminaEnRamas = false) {
  const total = Math.max(1, tramos) * DURACION_TRAMO;
  const porcion = 100 / Math.max(1, tramos);
  const eje = vertical ? 'Y' : 'X';

  let css = '';

  for (let i = 0; i < tramos; i++) {
    const desde = i * porcion;
    const hasta = (i + 1) * porcion;
    // Un respiro al final de cada tramo, para que el nodo alcance a latir
    // antes de que arranque el siguiente.
    const llegada = hasta - porcion * 0.12;

    css += `
      @keyframes viaje-${id}-${i} {
        0%, ${desde.toFixed(2)}% { transform: translate${eje}(0); opacity: 0; }
        ${(desde + porcion * 0.08).toFixed(2)}% { opacity: 1; }
        ${llegada.toFixed(2)}% { transform: translate${eje}(var(--largo)); opacity: 1; }
        ${hasta.toFixed(2)}%, 100% { transform: translate${eje}(var(--largo)); opacity: 0; }
      }
      #${id} .viajero-${i} {
        animation: viaje-${id}-${i} ${total.toFixed(2)}s linear infinite;
      }`;

    /*
     * Lo que hay al final del tramo late cuando el punto le llega.
     *
     * En el último tramo de un diagrama con ramas no hay un nodo numerado sino
     * el abanico de resultados: laten los tres a la vez, que es justamente lo
     * que se quiere decir —de acá sale uno de estos—.
     */
    const destino = (terminaEnRamas && i === tramos - 1)
      ? `#${id} .diagrama-rama .diagrama-circulo`
      : `#${id} .late-${i + 1} .diagrama-circulo`;

    css += `
      @keyframes latido-${id}-${i} {
        0%, ${Math.max(0, llegada - 1).toFixed(2)}% { transform: scale(1); }
        ${llegada.toFixed(2)}% { transform: scale(1.14); }
        ${Math.min(100, hasta + porcion * 0.15).toFixed(2)}%, 100% { transform: scale(1); }
      }
      ${destino} {
        animation: latido-${id}-${i} ${total.toFixed(2)}s ease-out infinite;
        transform-box: fill-box;
        transform-origin: center;
      }`;
  }

  return css;
}

/**
 * Un flujo de pasos, en la orientación que se pida.
 *
 * `vertical` cambia la disposición entera, no solo el ancho: los nodos se
 * apilan, la etiqueta pasa al costado —que es donde hay lugar en un teléfono—
 * y las ramas se abren en abanico hacia abajo.
 */
export function flujo(id, pasos, opciones = {}) {
  const { ramas = [], titulo = '', vertical = false } = opciones;

  const tramos = pasos.length - 1 + (ramas.length > 0 ? 1 : 0);
  let cuerpo = '';
  let ancho;
  let alto;

  if (vertical) {
    // --- De arriba hacia abajo, con la etiqueta al costado -----------------
    const separacion = 78;
    const x = 46;
    const margen = 34;
    ancho = 300;
    alto = margen * 2 + separacion * (pasos.length - 1) + (ramas.length > 0 ? 150 : 0);

    for (let i = 0; i < pasos.length - 1; i++) {
      const desde = margen + separacion * i + 22;
      const hasta = margen + separacion * (i + 1) - 22;
      cuerpo += `
        <g class="diagrama-conector" style="--largo: ${hasta - desde}px; --retraso: ${i * 0.2}s">
          <line x1="${x}" y1="${desde}" x2="${x}" y2="${hasta}" class="diagrama-linea" />
          <circle cx="${x}" cy="${desde}" r="4" class="diagrama-viajero viajero-${i}" />
        </g>`;
    }

    pasos.forEach((paso, i) => {
      const y = margen + separacion * i;
      const texto = typeof paso === 'string' ? paso : paso.texto;
      cuerpo += `
        <g class="diagrama-nodo late-${i}" style="--retraso: ${i * 0.2}s">
          <circle cx="${x}" cy="${y}" r="20" class="diagrama-circulo" style="--tono: ${TONOS.marca}" />
          <text x="${x}" y="${y + 6}" class="diagrama-numero" text-anchor="middle">${i + 1}</text>
          ${etiqueta({ x: x + 34, y: y + (enRenglones(texto, 22).length === 1 ? 5 : -2), texto, ancla: 'start', porRenglon: 22 })}
        </g>`;
    });

    if (ramas.length > 0) {
      const desdeY = margen + separacion * (pasos.length - 1) + 22;
      const ramaY = desdeY + 76;
      const paso = ancho / (ramas.length + 1);

      cuerpo += `
        <g style="--largo: ${ramaY - 18 - desdeY}px">
          <circle cx="${x}" cy="${desdeY}" r="4" class="diagrama-viajero viajero-${tramos - 1}" />
        </g>`;

      ramas.forEach((rama, i) => {
        const rx = paso * (i + 1);
        const tono = TONOS[rama.tono] || TONOS.marca;
        cuerpo += `
          <g class="diagrama-rama" style="--retraso: ${pasos.length * 0.2 + i * 0.14}s">
            <path d="M ${x} ${desdeY + 26} C ${x} ${ramaY - 30}, ${rx} ${desdeY + 40}, ${rx} ${ramaY - 16}"
                  class="diagrama-linea diagrama-curva" fill="none" />
            <circle cx="${rx}" cy="${ramaY}" r="15" class="diagrama-circulo" style="--tono: ${tono}" />
            <text x="${rx}" y="${ramaY + 5}" class="diagrama-numero diagrama-simbolo" text-anchor="middle">${escapar(rama.simbolo || '')}</text>
            ${etiqueta({ x: rx, y: ramaY + 34, texto: rama.texto, porRenglon: 12 })}
          </g>`;
      });
    }
  } else {
    // --- De izquierda a derecha --------------------------------------------
    const separacion = 150;
    const margen = 70;
    const y = ramas.length > 0 ? 58 : 56;
    ancho = margen * 2 + separacion * (pasos.length - 1);
    alto = ramas.length > 0 ? 208 : 128;

    for (let i = 0; i < pasos.length - 1; i++) {
      const desde = margen + separacion * i + 26;
      const hasta = margen + separacion * (i + 1) - 26;
      cuerpo += `
        <g class="diagrama-conector" style="--largo: ${hasta - desde}px; --retraso: ${i * 0.2}s">
          <line x1="${desde}" y1="${y}" x2="${hasta}" y2="${y}" class="diagrama-linea" />
          <polygon points="${hasta},${y} ${hasta - 6},${y - 4} ${hasta - 6},${y + 4}" class="diagrama-punta" />
          <circle cx="${desde}" cy="${y}" r="4" class="diagrama-viajero viajero-${i}" />
        </g>`;
    }

    pasos.forEach((paso, i) => {
      const x = margen + separacion * i;
      const texto = typeof paso === 'string' ? paso : paso.texto;
      cuerpo += `
        <g class="diagrama-nodo late-${i}" style="--retraso: ${i * 0.2}s">
          <circle cx="${x}" cy="${y}" r="22" class="diagrama-circulo" style="--tono: ${TONOS.marca}" />
          <text x="${x}" y="${y + 6}" class="diagrama-numero" text-anchor="middle">${i + 1}</text>
          ${etiqueta({ x, y: y + 44, texto })}
        </g>`;
    });

    if (ramas.length > 0) {
      const origenX = margen + separacion * (pasos.length - 1);
      const ramaY = 156;
      const anchoRama = ancho / (ramas.length + 1);

      cuerpo += `
        <g style="--largo: ${ramaY - 16 - (y + 22)}px">
          <circle cx="${origenX}" cy="${y + 22}" r="4" class="diagrama-viajero viajero-${tramos - 1}" />
        </g>`;

      ramas.forEach((rama, i) => {
        const x = anchoRama * (i + 1);
        const tono = TONOS[rama.tono] || TONOS.marca;
        cuerpo += `
          <g class="diagrama-rama" style="--retraso: ${pasos.length * 0.2 + i * 0.14}s">
            <path d="M ${origenX} ${y + 46} C ${origenX} ${ramaY - 28}, ${x} ${y + 52}, ${x} ${ramaY - 16}"
                  class="diagrama-linea diagrama-curva" fill="none" />
            <circle cx="${x}" cy="${ramaY}" r="16" class="diagrama-circulo" style="--tono: ${tono}" />
            <text x="${x}" y="${ramaY + 5}" class="diagrama-numero diagrama-simbolo" text-anchor="middle">${escapar(rama.simbolo || '')}</text>
            ${etiqueta({ x, y: ramaY + 36, texto: rama.texto })}
          </g>`;
      });
    }
  }

  const elemento = `${id}-${vertical ? 'v' : 'h'}`;

  return `<svg id="${elemento}" viewBox="0 0 ${ancho} ${alto}" class="diagrama" role="img"
       aria-label="${escapar(titulo || 'Diagrama de flujo')}"
       preserveAspectRatio="xMidYMid meet">
    <style>${fotogramas(elemento, tramos, vertical, ramas.length > 0)}
      @media (prefers-reduced-motion: reduce) {
        #${elemento} .diagrama-viajero { display: none; }
        #${elemento} .diagrama-circulo { animation: none !important; }
      }
    </style>${cuerpo}
  </svg>`;
}

/**
 * Los pasos de cada diagrama.
 * Se guardan como datos y no como SVG ya armado porque de los mismos pasos
 * salen las dos orientaciones.
 */
export const DEFINICIONES = {
  general: {
    titulo: 'El orden general: evento, personal, invitaciones, puerta y sorteos',
    pasos: ['Crear el evento', 'Cargar al personal', 'Repartir invitaciones',
            'Escanear en la puerta', 'Sortear los premios']
  },

  escaner: {
    titulo: 'Escanear una invitación y sus tres resultados posibles',
    pasos: ['Abrir la cámara', 'Apuntar al código', 'Se lee solo'],
    ramas: [
      { simbolo: '✓', texto: 'Entró bien', tono: 'exito' },
      { simbolo: '!', texto: 'Ya había entrado', tono: 'alerta' },
      { simbolo: '✕', texto: 'No está en la lista', tono: 'error' }
    ]
  },

  asistencias: {
    titulo: 'De la puerta a la lista de asistentes',
    pasos: ['Alguien escanea', 'Se guarda', 'Aparece en la lista', 'Participa del sorteo']
  },

  sorteo: {
    titulo: 'Sacar un ganador y entregarle el premio',
    pasos: ['Elegir el premio', 'Cuántos ganadores', 'Extraer', 'Anunciar', 'Marcar entregado']
  },

  'preparar-sorteo': {
    titulo: 'Armar el sorteo de la fiesta con sus premios',
    pasos: ['Crear el sorteo', 'Agregar premios', 'Poner cantidades', 'Queda listo']
  },

  catalogo: {
    titulo: 'Cargar un elemento del catálogo',
    pasos: ['Agregar', 'Completar los datos', 'Guardar', 'Ya se puede usar']
  },

  empleados: {
    titulo: 'Cargar al personal desde una planilla',
    pasos: ['Descargar plantilla', 'Llenar en Excel', 'Subir el archivo', 'Revisar el resultado'],
    ramas: [
      { simbolo: '✓', texto: 'Filas cargadas', tono: 'exito' },
      { simbolo: '✕', texto: 'Filas rechazadas', tono: 'error' }
    ]
  },

  eventos: {
    titulo: 'Crear un evento y activarlo',
    pasos: ['Crear el evento', 'Marcarlo activo', 'Todo se guarda ahí']
  },

  invitaciones: {
    titulo: 'Diseñar y repartir las invitaciones',
    pasos: ['Subir el diseño', 'Ubicar el código', 'Guardar', 'Generar', 'Repartir']
  },

  usuarios: {
    titulo: 'Dar acceso a alguien',
    pasos: ['Crear el rol', 'Darle permisos', 'Crear el usuario', 'Asignarle el rol']
  },

  permisos: {
    titulo: 'Configurar los permisos de un rol',
    pasos: ['Elegir el rol', 'Marcar qué puede', 'Guardar', 'Volver a entrar']
  },

  configuracion: {
    titulo: 'Revisar el sistema antes del evento',
    pasos: ['Revisión previa', 'Corregir lo que falta', 'Abrir las puertas']
  }
};

/**
 * El diagrama de un capítulo, o cadena vacía si no tiene.
 * `vertical` pide la versión apilada, que es la que entra en un teléfono.
 */
export function diagramaDe(clave, { vertical = false } = {}) {
  const definicion = DEFINICIONES[clave];
  if (!definicion) return '';

  return flujo(clave, definicion.pasos, {
    ramas: definicion.ramas || [],
    titulo: definicion.titulo,
    vertical
  });
}
