/**
 * Lectura de la petición entrante.
 *
 * Vercel a veces ya trae el body parseado y a veces no (depende del
 * Content-Type que mande el cliente), así que necesitamos cubrir ambos casos.
 */

/**
 * Devuelve el cuerpo de la petición como objeto.
 * Si viene vacío o el JSON está malformado, devuelve {} en vez de explotar:
 * los controladores ya validan campo por campo más adelante.
 */
export function leerCuerpo(req) {
  // El cuerpo se guarda en la petición la primera vez que se lee. Sin esto, un
  // controlador que lo consulte dos veces (por ejemplo para decidir la acción y
  // después para procesarla) se quedaría colgado esperando un stream que ya
  // fue consumido.
  if (req._cuerpoParseado) return req._cuerpoParseado;

  req._cuerpoParseado = new Promise((resolver) => {
    // Camino rápido: Vercel ya lo parseó por nosotros.
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      resolver(req.body);
      return;
    }

    // Si el body llegó como string (pasa con algunos clientes), lo parseamos.
    if (typeof req.body === 'string') {
      try { resolver(JSON.parse(req.body)); } catch { resolver({}); }
      return;
    }

    // Último recurso: leerlo del stream a mano.
    const trozos = [];
    req.on('data', (trozo) => trozos.push(trozo));
    req.on('end', () => {
      const crudo = Buffer.concat(trozos).toString('utf8');
      if (!crudo) { resolver({}); return; }
      try { resolver(JSON.parse(crudo)); } catch { resolver({}); }
    });
    req.on('error', () => resolver({}));
  });

  return req._cuerpoParseado;
}

/**
 * Lee un parámetro del query string y lo devuelve siempre como texto limpio.
 * Si el parámetro viene repetido (?a=1&a=2) nos quedamos con el primero.
 */
export function leerParametro(req, nombre, porDefecto = '') {
  const valor = req.query ? req.query[nombre] : undefined;
  if (valor === undefined || valor === null) return porDefecto;
  if (Array.isArray(valor)) return String(valor[0] || porDefecto).trim();
  return String(valor).trim();
}

/**
 * La acción que se quiere ejecutar dentro de un recurso.
 * Ejemplo: /api/asistencias?action=registrar → 'registrar'
 *
 * Aceptamos tanto "accion" como "action" porque el frontend viejo usaba el
 * nombre en inglés y no queremos romper nada que haya quedado en caché.
 */
export function leerAccion(req) {
  return leerParametro(req, 'accion') || leerParametro(req, 'action');
}
