/**
 * Lectura y escritura de archivos .xlsx.
 *
 * Un .xlsx es un ZIP con unos cuantos XML adentro, y JSZip ya está cargado para
 * armar los lotes de tarjetas. Así que en vez de sumar SheetJS (medio megabyte
 * para lo que acá son dos tablas planas) se escriben esos XML a mano.
 *
 * Solo se cubre lo que el sistema necesita: una hoja, texto en todas las celdas
 * y encabezado en negrita. Nada de fórmulas, formatos ni varias hojas. Si
 * alguna vez hiciera falta algo de eso, ahí sí conviene traer una librería.
 *
 * ---
 * Sobre por qué todo va como texto:
 *
 * Los DUI, los códigos de empleado y los teléfonos empiezan con cero. Si se
 * escriben como número, Excel se come ese cero y "04793293" se convierte en
 * "4793293". Es un problema real y silencioso: el archivo se ve bien hasta que
 * alguien lo reimporta y la mitad de los DUI ya no coinciden con nadie.
 */

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Escapa lo que XML no admite en crudo. */
function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Los caracteres de control rompen el archivo y Excel lo declara dañado.
    // Vienen en datos pegados desde sistemas viejos más seguido de lo que uno
    // esperaría.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Número de columna a letra: 1 → A, 27 → AA. */
export function letraDeColumna(numero) {
  let letra = '';
  let n = numero;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/** Letra de columna a número: A → 1, AA → 27. */
function numeroDeColumna(letra) {
  let numero = 0;
  for (const caracter of String(letra).toUpperCase()) {
    numero = numero * 26 + (caracter.charCodeAt(0) - 64);
  }
  return numero;
}

// --- Escritura --------------------------------------------------------------

/**
 * Las listas desplegables de una hoja.
 *
 * Excel las llama "validación de datos". Se apuntan a un rango con nombre en
 * lugar de escribir las opciones dentro de la fórmula porque esa fórmula tiene
 * un tope de 255 caracteres: con veinte departamentos ya se pasa, y Excel
 * declara el archivo dañado en vez de avisar que la lista era muy larga.
 */
function validacionesXml(validaciones) {
  if (!validaciones || validaciones.length === 0) return '';

  const cuerpo = validaciones
    .map((v) =>
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"` +
      ` errorTitle="${escapar(v.tituloError)}" error="${escapar(v.mensajeError)}"` +
      ` promptTitle="${escapar(v.titulo)}" prompt="${escapar(v.ayuda)}"` +
      ` sqref="${v.rango}"><formula1>${escapar(v.nombreRango)}</formula1></dataValidation>`
    )
    .join('');

  return `<dataValidations count="${validaciones.length}">${cuerpo}</dataValidations>`;
}

function hojaXml(filas, anchos, validaciones) {
  const columnas = anchos.length
    ? `<cols>${anchos
        .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const cuerpo = filas
    .map((celdas, indiceFila) => {
      const numeroFila = indiceFila + 1;
      // La primera fila es el encabezado y lleva el estilo 1 (negrita).
      const estilo = indiceFila === 0 ? ' s="1"' : '';

      const contenido = celdas
        .map((celda, indiceCelda) => {
          const texto = String(celda ?? '');
          if (texto === '') return '';
          const referencia = `${letraDeColumna(indiceCelda + 1)}${numeroFila}`;
          return `<c r="${referencia}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escapar(texto)}</t></is></c>`;
        })
        .join('');

      return `<row r="${numeroFila}">${contenido}</row>`;
    })
    .join('');

  // El orden importa: el esquema de Excel exige dataValidations DESPUÉS de
  // sheetData. Al revés, el archivo no abre.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}">${columnas}<sheetData>${cuerpo}</sheetData>${validacionesXml(validaciones)}</worksheet>`;
}

const TIPO_HOJA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

function contentTypes(conListas) {
  const segunda = conListas
    ? `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="${TIPO_HOJA}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TIPO_HOJA}"/>${segunda}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function relsLibro(conListas) {
  const segunda = conListas
    ? `<Relationship Id="rId2" Type="${NS_REL}/worksheet" Target="worksheets/sheet2.xml"/>`
    : '';
  const estilos = conListas ? 'rId3' : 'rId2';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>${segunda}
  <Relationship Id="${estilos}" Type="${NS_REL}/styles" Target="styles.xml"/>
</Relationships>`;
}

// Dos fuentes (normal y negrita) y dos formatos de celda. El encabezado usa el
// segundo, que es el que apunta a la negrita y pinta el fondo gris.
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF101828"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE4E7EC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

const HOJA_LISTAS = 'Listas';

function libroXml(nombreHoja, rangos) {
  const hojaDeListas = rangos.length
    ? `<sheet name="${HOJA_LISTAS}" sheetId="2" r:id="rId2"/>`
    : '';

  // Los rangos con nombre son lo que hace que las listas funcionen sin el tope
  // de 255 caracteres de la fórmula. Van después de <sheets>, que es donde el
  // esquema los espera.
  const nombres = rangos.length
    ? `<definedNames>${rangos
        .map((r) => `<definedName name="${escapar(r.nombre)}">${HOJA_LISTAS}!$${r.columna}$2:$${r.columna}$${r.ultimaFila}</definedName>`)
        .join('')}</definedNames>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS}" xmlns:r="${NS_REL}">
  <sheets><sheet name="${escapar(nombreHoja)}" sheetId="1" r:id="rId1"/>${hojaDeListas}</sheets>${nombres}
</workbook>`;
}

// Hasta qué fila alcanzan las listas desplegables. Mil filas cubre de sobra
// cualquier carga del padrón y evita tener que arrastrar la validación a mano.
const FILAS_CON_LISTA = 1000;

/**
 * Arma el .xlsx y devuelve un Blob.
 *
 * @param {Object} opciones
 * @param {string[]} opciones.encabezados
 * @param {Array<Array>} opciones.filas
 * @param {string} [opciones.nombreHoja]
 * @param {Array<Object>} [opciones.listas]  Columnas que se eligen de un
 *   desplegable en vez de escribirse: `{ columna, titulo, valores }`, donde
 *   `columna` es el nombre del encabezado. Las opciones van a una hoja aparte
 *   y la columna queda validada contra ella.
 */
export async function generarXlsx({ encabezados, filas, nombreHoja = 'Hoja1', listas = [] }) {
  if (typeof JSZip === 'undefined') {
    throw new Error('La librería de compresión no cargó. Recarga la página.');
  }

  const todas = [encabezados, ...(filas || [])];

  // Ancho por columna según el contenido más largo, para que no haya que
  // ensanchar a mano ni se vea una fila de "#####".
  const anchos = encabezados.map((titulo, indice) => {
    const largos = todas.map((fila) => String(fila[indice] ?? '').length);
    return Math.min(48, Math.max(12, ...largos) + 3);
  });

  // Cada lista ocupa una columna de la hoja "Listas" y se referencia por un
  // rango con nombre. Se descartan las que no tengan opciones: una validación
  // contra una lista vacía bloquea la celda y no deja escribir nada.
  const utiles = listas.filter(
    (lista) => encabezados.includes(lista.columna) && (lista.valores || []).length > 0
  );

  const rangos = utiles.map((lista, indice) => ({
    nombre: nombreDeRango(lista.columna),
    columna: letraDeColumna(indice + 1),
    ultimaFila: lista.valores.length + 1
  }));

  const validaciones = utiles.map((lista, indice) => {
    const letra = letraDeColumna(encabezados.indexOf(lista.columna) + 1);
    return {
      nombreRango: rangos[indice].nombre,
      rango: `${letra}2:${letra}${FILAS_CON_LISTA}`,
      titulo: lista.titulo || lista.columna,
      ayuda: 'Elige una opción de la lista.',
      tituloError: 'Valor no válido',
      mensajeError:
        `"${lista.titulo || lista.columna}" tiene que ser una de las opciones de la lista. ` +
        'Si falta alguna, agrégala primero en el sistema.'
    };
  });

  const conListas = utiles.length > 0;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes(conListas));
  zip.folder('_rels').file('.rels', RELS);
  zip.folder('xl').file('workbook.xml', libroXml(nombreHoja, rangos));
  zip.folder('xl').file('styles.xml', ESTILOS);
  zip.folder('xl/_rels').file('workbook.xml.rels', relsLibro(conListas));
  zip.folder('xl/worksheets').file('sheet1.xml', hojaXml(todas, anchos, validaciones));

  if (conListas) {
    zip.folder('xl/worksheets').file('sheet2.xml', hojaDeListasXml(utiles));
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE'
  });
}

/**
 * Nombre del rango para una columna.
 * Los nombres definidos de Excel no admiten espacios, tildes ni empezar con un
 * número, así que se limpian y se les antepone una palabra.
 */
function nombreDeRango(columna) {
  const limpio = String(columna)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '');
  return `Lista_${limpio || 'Opciones'}`;
}

/** La hoja auxiliar: una columna por lista, con su título arriba. */
function hojaDeListasXml(listas) {
  const alto = Math.max(...listas.map((lista) => lista.valores.length));
  const filas = [];

  filas.push(listas.map((lista) => lista.titulo || lista.columna));
  for (let i = 0; i < alto; i++) {
    filas.push(listas.map((lista) => lista.valores[i] ?? ''));
  }

  const anchos = listas.map((lista) => {
    const largos = [String(lista.titulo || '').length, ...lista.valores.map((v) => String(v).length)];
    return Math.min(48, Math.max(14, ...largos) + 3);
  });

  return hojaXml(filas, anchos, []);
}

/** Genera el .xlsx y lo descarga. */
export async function descargarXlsx({ encabezados, filas, nombreHoja, nombreArchivo, listas }) {
  const blob = await generarXlsx({ encabezados, filas, nombreHoja, listas });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  // Revocarlo enseguida cancela la descarga en Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// --- Fechas -----------------------------------------------------------------

/*
 * Excel no guarda las fechas como texto: guarda un NÚMERO de días y aparte,
 * en los estilos, el formato con que hay que mostrarlo. Una celda con
 * 24/03/1990 a la vista contiene un 32955.
 *
 * Sin traducirlo, al importar se guardaba ese número en la base. Después
 * `aFechaIso("32955")` no podía interpretarlo y devolvía vacío, así que la
 * fecha desaparecía de la ficha, del formulario y de la siguiente exportación.
 * Parecía que no se había guardado; en realidad se guardaba mal.
 */

// Formatos de fecha que Excel trae de fábrica. Los personalizados se detectan
// por su código, más abajo.
const FORMATOS_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * ¿Este código de formato representa una fecha?
 * Se ignora lo que esté entre comillas: un formato como `0" días"` lleva una
 * "d" que no tiene nada que ver con un día.
 */
function esFormatoDeFecha(codigo) {
  const sinLiterales = String(codigo || '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '');
  return /[dmyhs]/i.test(sinLiterales) && !/^[#0.,%]+$/.test(sinLiterales);
}

/**
 * Convierte el número de días de Excel a una fecha dd/mm/yyyy.
 *
 * El desfase de 1900:
 *
 * Excel cree que 1900 fue bisiesto y reserva el número 60 para un 29 de
 * febrero que no existió. Es un error heredado de Lotus 1-2-3 que nunca
 * corrigieron para no romper las hojas de cálculo del mundo.
 *
 * La consecuencia práctica: para las series de 61 en adelante la cuenta parte
 * del 30 de diciembre de 1899, y para las de antes hay que sumar un día. La
 * 60 no corresponde a ninguna fecha real.
 *
 * En fechas de nacimiento esto no se va a cruzar nunca —serían de enero o
 * febrero de 1900—, pero dejarlo mal sería dejar una resta que da un día menos
 * sin que nadie sepa por qué.
 */
export function fechaDesdeSerie(serie) {
  const numero = Number(serie);
  if (!Number.isFinite(numero) || numero <= 0) return '';

  const dias = Math.floor(numero);
  if (dias === 60) return '';   // el 29 de febrero que Excel inventó

  const base = dias < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const fecha = new Date(base + dias * 86400000);
  if (Number.isNaN(fecha.getTime())) return '';
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

/**
 * Qué formato usa cada estilo de celda.
 * Devuelve un arreglo donde el índice es el `s` de la celda y el valor dice si
 * ese estilo es de fecha.
 */
function leerEstilosDeFecha(xml, analizador) {
  const documento = analizador.parseFromString(xml, 'application/xml');

  // Formatos personalizados: numFmtId propio con su código.
  const personalizados = new Map();
  const numFmts = documento.getElementsByTagName('numFmt');
  for (let i = 0; i < numFmts.length; i++) {
    const id = Number(numFmts[i].getAttribute('numFmtId'));
    personalizados.set(id, esFormatoDeFecha(numFmts[i].getAttribute('formatCode')));
  }

  // cellXfs: la lista que indexa el atributo `s` de cada celda.
  const bloques = documento.getElementsByTagName('cellXfs');
  if (bloques.length === 0) return [];

  const estilos = [];
  const xfs = bloques[0].getElementsByTagName('xf');
  for (let i = 0; i < xfs.length; i++) {
    const id = Number(xfs[i].getAttribute('numFmtId') || 0);
    estilos.push(personalizados.has(id) ? personalizados.get(id) : FORMATOS_FECHA.has(id));
  }
  return estilos;
}

// --- Lectura ----------------------------------------------------------------

/** Saca el texto de un nodo, juntando los <t> que pueda tener adentro. */
function textoDeNodo(nodo) {
  if (!nodo) return '';
  const partes = nodo.getElementsByTagName('t');
  if (partes.length === 0) return nodo.textContent || '';

  let texto = '';
  for (let i = 0; i < partes.length; i++) texto += partes[i].textContent || '';
  return texto;
}

/**
 * Lee un .xlsx y devuelve sus filas como arreglos de texto.
 *
 * Solo la primera hoja: los archivos que llegan acá son la plantilla que
 * descargó el propio sistema o una exportación suya, y ninguna trae más.
 */
export async function leerXlsx(archivo) {
  if (typeof JSZip === 'undefined') {
    throw new Error('La librería de compresión no cargó. Recarga la página.');
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(archivo);
  } catch {
    throw new Error('El archivo no parece un Excel válido.');
  }

  const hoja = zip.file('xl/worksheets/sheet1.xml');
  if (!hoja) throw new Error('El Excel no tiene ninguna hoja legible.');

  const analizador = new DOMParser();

  // Las cadenas compartidas: Excel guarda ahí los textos repetidos y en la
  // celda deja solo su número. Sin resolverlas, un archivo guardado por Excel
  // se lee como una tabla de números sueltos.
  const compartidas = [];
  const archivoCompartidas = zip.file('xl/sharedStrings.xml');
  if (archivoCompartidas) {
    const xml = analizador.parseFromString(await archivoCompartidas.async('string'), 'application/xml');
    const items = xml.getElementsByTagName('si');
    for (let i = 0; i < items.length; i++) compartidas.push(textoDeNodo(items[i]));
  }

  // Los estilos dicen qué celdas numéricas son en realidad fechas.
  let estilosDeFecha = [];
  const archivoEstilos = zip.file('xl/styles.xml');
  if (archivoEstilos) {
    try {
      estilosDeFecha = leerEstilosDeFecha(await archivoEstilos.async('string'), analizador);
    } catch {
      // Sin estilos legibles se sigue: las fechas escritas como texto, que son
      // las de nuestras propias plantillas, se leen igual.
    }
  }

  const xmlHoja = analizador.parseFromString(await hoja.async('string'), 'application/xml');
  const filasXml = xmlHoja.getElementsByTagName('row');
  const filas = [];

  for (let i = 0; i < filasXml.length; i++) {
    const celdasXml = filasXml[i].getElementsByTagName('c');
    const fila = [];

    for (let j = 0; j < celdasXml.length; j++) {
      const celda = celdasXml[j];
      const referencia = celda.getAttribute('r') || '';
      const columna = numeroDeColumna((referencia.match(/^[A-Za-z]+/) || ['A'])[0]);

      // Las celdas vacías no se escriben en el XML, así que hay que rellenar
      // los huecos: si no, una columna en blanco corre todas las siguientes.
      while (fila.length < columna - 1) fila.push('');

      const tipo = celda.getAttribute('t');
      let valor = '';

      if (tipo === 'inlineStr') {
        valor = textoDeNodo(celda.getElementsByTagName('is')[0]);
      } else if (tipo === 's') {
        const indice = Number(textoDeNodo(celda.getElementsByTagName('v')[0]));
        valor = compartidas[indice] ?? '';
      } else {
        valor = textoDeNodo(celda.getElementsByTagName('v')[0]);

        // Celda numérica con formato de fecha: se traduce a dd/mm/yyyy. Sin
        // esto llegaría el número de días de Excel y la fecha se perdería.
        const estilo = Number(celda.getAttribute('s') || 0);
        if (estilosDeFecha[estilo] && valor !== '') {
          const comoFecha = fechaDesdeSerie(valor);
          if (comoFecha) valor = comoFecha;
        }
      }

      fila.push(String(valor).trim());
    }

    filas.push(fila);
  }

  return filas;
}

/**
 * Convierte un .xlsx al texto CSV que espera el importador del servidor.
 *
 * Se hace acá y no en el backend a propósito: el servidor ya sabe importar CSV
 * y ese código está probado. Traducir el formato en el navegador deja esa parte
 * intacta y evita subir un ZIP en base64 a una función serverless.
 */
export async function xlsxComoCsv(archivo) {
  const filas = await leerXlsx(archivo);

  const escaparCelda = (valor) => {
    const texto = String(valor ?? '');
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  return filas
    .filter((fila) => fila.some((celda) => String(celda).trim() !== ''))
    .map((fila) => fila.map(escaparCelda).join(','))
    .join('\n');
}

/**
 * Lee un Excel y devuelve sus filas como objetos, con el encabezado por clave.
 *
 * Los nombres de columna se normalizan igual que en el servidor —minúscula y
 * los espacios como guion bajo— para que un archivo abra igual venga por donde
 * venga. Cada fila lleva `_linea`, el número de renglón del Excel, que es lo
 * que se le muestra a quien tiene que ir a corregirlo.
 *
 * Devuelve objetos y no texto CSV porque la conciliación de departamentos
 * necesita leer y reescribir columnas antes de enviar nada, y armar y volver a
 * partir un CSV en el medio solo agrega dos lugares donde se pueden romper las
 * comillas.
 */
export async function leerXlsxComoObjetos(archivo) {
  const matriz = await leerXlsx(archivo);

  const conContenido = matriz.filter(
    (fila) => fila.some((celda) => String(celda ?? '').trim() !== '')
  );

  if (conContenido.length === 0) return { encabezados: [], filas: [] };

  const encabezados = conContenido[0].map((celda) =>
    String(celda ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  );

  const filas = [];
  for (let i = 1; i < conContenido.length; i++) {
    // El número de renglón es el de la matriz original, no el de las filas con
    // contenido: si alguien deja una fila vacía en el medio, el número que se
    // le informa tiene que ser el que ve en su Excel.
    const enOriginal = matriz.indexOf(conContenido[i]);
    const fila = { _linea: (enOriginal >= 0 ? enOriginal : i) + 1 };

    encabezados.forEach((encabezado, columna) => {
      if (!encabezado) return;
      fila[encabezado] = String(conContenido[i][columna] ?? '').trim();
    });

    filas.push(fila);
  }

  return { encabezados, filas };
}

/** ¿Este archivo es un Excel? */
export function esExcel(archivo) {
  const nombre = String(archivo?.name || '').toLowerCase();
  return nombre.endsWith('.xlsx') || nombre.endsWith('.xlsm');
}
