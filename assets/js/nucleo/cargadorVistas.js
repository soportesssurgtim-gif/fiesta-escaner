/**
 * Carga las plantillas HTML y las ensambla en una sola.
 *
 * El proyecto no usa bundler, así que las vistas son archivos .html sueltos que
 * se piden con fetch. Antes se concatenaban en un orden fijo escrito a mano en
 * un arreglo, lo que traía dos problemas: había fragmentos que solo servían
 * para abrir un <div> y otros para cerrarlo (imposibles de leer por separado),
 * y cambiar el orden rompía el HTML sin avisar.
 *
 * Acá hay una plantilla principal con marcadores de inclusión:
 *
 *     <!--#incluir: vistas/escaner.html-->
 *
 * Cada marcador se reemplaza por el contenido de ese archivo. Las inclusiones
 * pueden anidarse. Así cada vista es un archivo completo y válido por su
 * cuenta, y el layout se lee de corrido en un solo lugar.
 */

const MARCADOR = /<!--#incluir:\s*([^\s>]+?)\s*-->/g;

// Tope de anidamiento. Es una red de seguridad: si dos archivos se incluyen
// mutuamente sin esto el navegador se queda colgado pidiendo archivos.
const PROFUNDIDAD_MAXIMA = 5;

const cache = new Map();

async function traer(ruta, base) {
  if (cache.has(ruta)) return cache.get(ruta);

  const respuesta = await fetch(base + ruta, { cache: 'no-cache' });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar "${ruta}" (HTTP ${respuesta.status})`);
  }

  const contenido = await respuesta.text();
  if (!contenido.trim()) {
    throw new Error(`La plantilla "${ruta}" está vacía`);
  }

  cache.set(ruta, contenido);
  return contenido;
}

/** Resuelve las inclusiones de un texto, recursivamente. */
async function resolver(html, base, profundidad) {
  if (profundidad > PROFUNDIDAD_MAXIMA) {
    throw new Error('Las inclusiones de plantillas están anidadas demasiado profundo.');
  }

  const pendientes = [...html.matchAll(MARCADOR)];
  if (pendientes.length === 0) return html;

  // Se piden todas juntas: son decenas de archivos pequeños y hacerlo en serie
  // agrega un segundo largo de espera al arranque.
  const contenidos = await Promise.all(
    pendientes.map((coincidencia) => traer(coincidencia[1], base))
  );

  const resueltos = await Promise.all(
    contenidos.map((contenido) => resolver(contenido, base, profundidad + 1))
  );

  let resultado = html;
  pendientes.forEach((coincidencia, indice) => {
    resultado = resultado.replace(coincidencia[0], () => resueltos[indice]);
  });

  return resultado;
}

/**
 * Devuelve el HTML completo de la aplicación, ya ensamblado.
 *
 * @param {string} plantillaPrincipal Ruta relativa a `base`.
 * @param {string} base               Carpeta donde viven las plantillas.
 * @param {Function} [alAvanzar]      Recibe un texto de estado para la pantalla de carga.
 */
export async function cargarPlantillas(
  plantillaPrincipal = 'aplicacion.html',
  base = '/assets/views/',
  alAvanzar = null
) {
  if (alAvanzar) alAvanzar('Cargando la interfaz…');

  const principal = await traer(plantillaPrincipal, base);
  const completo = await resolver(principal, base, 0);

  if (alAvanzar) alAvanzar('Preparando el sistema…');
  return completo;
}
