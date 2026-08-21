/**
 * Formateo y normalización de datos para mostrar en pantalla.
 *
 * Todo lo que sea "convertir un dato crudo en algo legible" va acá. Antes
 * estaba desperdigado dentro del componente principal y algunas funciones
 * estaban duplicadas con variantes sutilmente distintas.
 */

/**
 * Da formato al DUI salvadoreño: 9 dígitos con guion antes del verificador.
 * Ejemplo: "012345678" → "01234567-8"
 *
 * Los DUI digitados sin el cero inicial se completan solos, porque en la base
 * conviven las dos formas de la época en que se cargaron desde hojas de cálculo.
 */
export function formatearDui(valor) {
  let digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  if (!digitos) return '';
  if (digitos.length === 8) digitos = '0' + digitos;
  digitos = digitos.slice(0, 9);
  return digitos.length === 9 ? `${digitos.slice(0, 8)}-${digitos.slice(8)}` : digitos;
}

/** Solo los dígitos del DUI, que es como se compara y como viaja en el QR. */
export function duiPlano(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  return digitos.length === 8 ? '0' + digitos : digitos;
}

/**
 * Quita tildes y diéresis para poder buscar sin preocuparse por los acentos.
 * Así "Panchimalco" encuentra a "PANCHIMALCO" y "José" a "Jose".
 *
 * (La versión anterior de esta función tenía las clases de caracteres corruptas
 * por un problema de codificación del archivo y no quitaba nada.)
 */
export function limpiarTildes(valor) {
  return String(valor ?? '')
    .normalize('NFD')                 // separa la letra de su acento
    .replace(/[̀-ͯ]/g, '')  // borra los acentos ya sueltos
    .normalize('NFC');
}

/** Texto normalizado para comparar en los buscadores: sin tildes y minúscula. */
export function paraBuscar(valor) {
  return limpiarTildes(valor).toLowerCase().trim();
}

/**
 * ¿Este texto contiene lo que se está buscando?
 * Ignora tildes, mayúsculas y espacios sobrantes en ambos lados.
 */
export function coincide(texto, busqueda) {
  const aguja = paraBuscar(busqueda);
  if (!aguja) return true;
  return paraBuscar(texto).includes(aguja);
}

/**
 * Convierte un valor a Date sin que una fecha sin hora se corra de día.
 *
 * `new Date('2026-08-28')` no da el 28 a medianoche local: el estándar manda
 * interpretar una fecha sola como UTC, y en El Salvador —seis horas atrás— eso
 * cae el 27 a las seis de la tarde. El evento del 28 se mostraba como 27.
 *
 * Cuando el valor trae hora, en cambio, sí es un instante y hay que respetar la
 * zona: una asistencia registrada a las 21:45 tiene que decir 21:45.
 *
 * Así que se separan los dos casos: la fecha sola se arma con los números
 * puestos a mano, que construyen medianoche local; lo demás se deja como está.
 */
function aFecha(valor) {
  const texto = String(valor ?? '').trim();

  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (soloFecha) {
    const [, anio, mes, dia] = soloFecha.map(Number);
    const fecha = new Date(anio, mes - 1, dia);

    /*
     * JavaScript acomoda lo que no existe: pedirle el 45 de diciembre le da
     * mediados de enero sin quejarse, y el 29 de febrero de un año que no es
     * bisiesto le da el 1 de marzo. Una fecha imposible tiene que verse como lo
     * que es —un dato mal cargado— y no como una fecha plausible de otro mes,
     * así que se comprueba que los números hayan sobrevivido.
     */
    const sobrevivio = fecha.getFullYear() === anio &&
                       fecha.getMonth() === mes - 1 &&
                       fecha.getDate() === dia;

    return sobrevivio ? fecha : new Date(NaN);
  }

  return new Date(valor);
}

/** Fecha y hora en formato salvadoreño: "06/08/2026, 21:45" */
export function formatearFechaHora(valor) {
  if (!valor) return '';
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString('es-SV', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Solo la hora, para la lista de asistencias del día. */
export function formatearHora(valor) {
  if (!valor) return '';
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
}

/** Fecha sola: "6 de agosto de 2026" */
export function formatearFechaLarga(valor) {
  if (!valor) return '';
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** ¿Este valor de la base significa "sí"? La base guarda 'TRUE'/'FALSE' como texto. */
export function esVerdadero(valor) {
  const texto = String(valor ?? '').trim().toUpperCase();
  return texto === 'TRUE' || texto === '1' || texto === 'SI' || texto === 'SÍ';
}

/** Convierte un booleano de JavaScript al texto que espera la base. */
export function aBandera(valor) {
  return valor === true || esVerdadero(valor) ? 'TRUE' : 'FALSE';
}

/*
 * Las palabras que van en minúscula aunque empiecen una palabra.
 *
 * En español los enlaces de un nombre no se capitalizan: María de los Ángeles,
 * José del Carmen, Pérez y Gómez. Capitalizarlos —«María De Los Ángeles»— es el
 * error típico de aplicar mayúscula a cada palabra sin mirar cuál es.
 *
 * Las de cargo van por lo mismo: «Jefe de la Unidad», no «Jefe De La Unidad».
 */
const ENLACES = new Set([
  'de', 'del', 'la', 'las', 'lo', 'los', 'y', 'e', 'en', 'el',
  'a', 'al', 'con', 'para', 'por', 'the', 'da', 'das', 'do', 'dos',
  'van', 'von', 'di', 'san'
]);

/*
 * Lo que se escribe todo en mayúscula y no es un grito.
 *
 * Sin esta lista, «JEFE DE UACI» quedaría «Jefe de Uaci», que se lee peor que
 * el original. Están las de la municipalidad y las instituciones con las que
 * trata, más los números romanos, que aparecen en los grados de un cargo
 * —«Técnico II»— y que sin esto quedarían «Ii».
 *
 * Agregar una sigla nueva es agregarla acá. Es una lista y no una regla del
 * tipo «tres letras o menos» porque esa regla convertiría «Sub» o «Ing» en
 * siglas.
 */
const SIGLAS = new Set([
  // Unidades y dependencias municipales
  'UACI', 'UFI', 'UAIP', 'UATM', 'UMA', 'CAM', 'TIC', 'RRHH', 'RH', 'UPAC',
  // Instituciones
  'ISSS', 'AFP', 'PNC', 'CNR', 'MINSAL', 'MOP', 'ANDA', 'FODES', 'ISDEM',
  'COMURES', 'MARN', 'MAG', 'ONG', 'FGR', 'PGR', 'CSJ',
  // De uso general
  'DUI', 'NIT', 'ISR', 'IVA', 'SV', 'QR', 'PDF',
  // Los grados de un cargo
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'
]);

/** Pone en mayúscula la primera letra y deja el resto como está. */
function capitalizar(palabra) {
  if (!palabra) return palabra;
  return palabra[0].toLocaleUpperCase('es') + palabra.slice(1);
}

/*
 * ¿Es una sigla escrita con puntos, tipo «R.E.F.»?
 *
 * Va como regla y no como lista porque no hay forma de saber de antemano cuáles
 * van a aparecer, y la forma sola alcanza para reconocerlas: una letra suelta
 * entre puntos no es una palabra abreviada, es una inicial.
 *
 * Distingue de las abreviaturas, que son otra cosa y sí llevan minúscula:
 *
 *   R.E.F.    tres iniciales      -> R.E.F.
 *   AUX.      una palabra cortada -> Aux.
 *   MANTTO.   una palabra cortada -> Mantto.
 *
 * Lo que las separa es el largo de cada pedazo: si alguno tiene más de una
 * letra, es una palabra abreviada y no una sigla.
 */
function esSiglaConPuntos(palabra) {
  if (!palabra.includes('.')) return false;

  const pedazos = palabra.split('.').filter(Boolean);
  return pedazos.length >= 2 && pedazos.every((pedazo) => pedazo.length === 1);
}

/**
 * Texto en formato de nombre propio: solo las iniciales en mayúscula.
 *
 * La base guarda los nombres y los cargos todo en mayúscula, que es como
 * vinieron de la planilla. Sirve para buscar y comparar, pero leer «JOSÉ ANTONIO
 * MEJÍA DE GONZÁLEZ» en una lista de novecientos cansa, y en una invitación
 * impresa parece un grito.
 *
 * Esto es solo para mostrar. Lo que se guarda no cambia: los formularios siguen
 * escribiendo lo que la persona escriba, y las búsquedas siguen comparando
 * sobre el dato crudo.
 *
 * Lo que no puede hacer: si el dato vino sin tildes —«MEJIA»— no hay forma de
 * saber que llevaba una. Sale «Mejia», y eso se arregla en el dato, no acá.
 */
export function aNombrePropio(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';

  /*
   * Se corta por espacios, pero también por guiones y apóstrofos, porque cada
   * pedazo lleva su propia mayúscula: «García-López», «D'Aubuisson». El
   * separador se conserva en el resultado.
   */
  return texto
    .toLocaleLowerCase('es')
    .split(/\s+/)
    .map((palabra, indice) => {
      const enMayuscula = palabra.toLocaleUpperCase('es');

      // Una sigla se reconoce entera, antes de partirla por guiones.
      if (SIGLAS.has(enMayuscula)) return enMayuscula;
      if (esSiglaConPuntos(palabra)) return enMayuscula;

      // Un enlace va en minúscula, salvo que arranque el texto: un apellido que
      // empieza con «de» sí se capitaliza, como «De León».
      if (indice > 0 && ENLACES.has(palabra)) return palabra;

      return palabra
        .split(/([-'’])/)
        .map((parte) => (/^[-'’]$/.test(parte) ? parte : capitalizar(parte)))
        .join('');
    })
    .join(' ');
}

/**
 * Nombre completo a partir de un empleado, listo para mostrar.
 *
 * Devuelve el nombre en formato propio porque no hay ningún lugar donde se
 * quiera mostrar el original a los gritos. Para el dato crudo están los campos
 * del empleado, que es lo que usan las búsquedas y lo que se guarda.
 */
export function nombreCompleto(persona) {
  if (!persona) return '';
  return aNombrePropio(`${persona.nombres || ''} ${persona.apellidos || ''}`.trim());
}

/**
 * Iniciales para el avatar. Toma la primera letra del nombre y del apellido.
 * Si solo hay una palabra, usa sus dos primeras letras.
 */
export function iniciales(texto) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

/** Recorta un texto largo para que no rompa el ancho de una celda. */
export function recortar(texto, largoMaximo = 40) {
  const limpio = String(texto ?? '');
  return limpio.length <= largoMaximo ? limpio : limpio.slice(0, largoMaximo - 1) + '…';
}

/**
 * Fecha en el formato que se lee de un vistazo: "24/03/1985".
 *
 * Es el que se usa en las exportaciones y en las plantillas de Excel. En la
 * base se guarda siempre en ISO (yyyy-mm-dd), que es inequívoco y ordena bien,
 * pero nadie escribe una fecha así en una planilla.
 *
 * Acepta lo que sea que haya en la base: ISO, día/mes/año de los registros
 * viejos importados desde Excel, o vacío.
 */
export function formatearFechaCorta(valor) {
  const iso = aFechaIso(valor);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/**
 * Normaliza una fecha al formato ISO "1985-03-24" que espera <input type="date">.
 *
 * Hace falta porque algunos registros viejos se importaron desde Excel con el
 * formato invertido ("24/03/1985") y el input los rechaza en silencio: se ve
 * vacío y quien edita cree que la persona no tiene fecha cargada.
 */
export function aFechaIso(valor) {
  if (!valor) return '';

  const partes = String(valor).split(/[-T/]/);
  if (partes.length < 3) return '';

  // Ya viene en ISO.
  if (partes[0].length === 4) {
    return `${partes[0]}-${String(partes[1]).padStart(2, '0')}-${String(partes[2]).padStart(2, '0')}`;
  }
  // Viene como día/mes/año.
  if (partes[2].length === 4) {
    return `${partes[2]}-${String(partes[1]).padStart(2, '0')}-${String(partes[0]).padStart(2, '0')}`;
  }
  return '';
}

/**
 * El enlace de WhatsApp de un telefono salvadoreño, o cadena vacia.
 *
 * En El Salvador los moviles empiezan con 6, 7, 8 o 9, y los fijos con 2. A un
 * fijo no se le puede escribir, asi que ahi no se ofrece el enlace: un boton
 * que no va a funcionar es peor que no tener boton.
 *
 * El pais es el 503 y los numeros locales son de ocho digitos. Si ya viene con
 * el codigo de pais se respeta, que es como los guarda quien copio el contacto
 * del telefono.
 */
export function enlaceWhatsapp(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  if (!digitos) return '';

  // Con el codigo de pais adelante, se le quita para mirar el numero local.
  const local = digitos.length === 11 && digitos.startsWith('503')
    ? digitos.slice(3)
    : digitos;

  if (local.length !== 8) return '';
  if (!/^[6789]/.test(local)) return '';

  return `https://wa.me/503${local}`;
}
