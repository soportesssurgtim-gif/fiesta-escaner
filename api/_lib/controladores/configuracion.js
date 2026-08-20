/**
 * Parámetros generales del sistema.
 *
 * La tabla `configuracion` es un simple clave/valor. La pantalla de
 * configuración mostraba unos "kill switches" que en realidad estaban pintados
 * a mano en el HTML, sin nada detrás. Ahora sí tienen dónde guardarse.
 */

import { supabase } from '../supabase.js';
import { TABLAS, BUCKET_PLANTILLAS } from '../configuracion.js';
import { aTexto, aEntero, aBandera, esVerdadero } from '../valores.js';
import { leerCuerpo } from '../peticion.js';
import { esAdministrador } from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderSinPermiso,
  responderMetodoNoPermitido
} from '../respuestas.js';

/**
 * Interruptores que la operación puede necesitar apagar en caliente durante el
 * evento. Se declaran acá para que la pantalla los muestre aunque la fila
 * todavía no exista en la base.
 */
export const INTERRUPTORES = [
  {
    clave: 'modulo_escaner_activo',
    etiqueta: 'Escáner de asistencia',
    descripcion: 'Si se apaga, el escáner deja de registrar entradas.',
    porDefecto: 'TRUE'
  },
  {
    clave: 'modulo_sorteos_activo',
    etiqueta: 'Sorteos y rifas',
    descripcion: 'Bloquea la extracción de ganadores.',
    porDefecto: 'TRUE'
  },
  {
    clave: 'portal_publico_activo',
    etiqueta: 'Portal público de invitaciones',
    descripcion: 'Habilita la consulta de QR por DUI.',
    porDefecto: 'TRUE'
  }
];

/**
 * Parámetros de apariencia.
 *
 * A diferencia de los interruptores, que son sí o no, estos guardan un valor de
 * un tipo declarado. El tipo decide cómo se valida al guardar y qué control
 * dibuja la pantalla:
 *
 *   opcion  uno de una lista cerrada
 *   color   un hexadecimal de seis dígitos
 *   numero  un entero dentro de un rango
 *
 * Validar contra la declaración y no contra lo que mande la pantalla es lo que
 * evita que un valor raro deje la interfaz sin saber qué mostrar. Es la
 * diferencia entre un color mal escrito y una aplicación sin color.
 */
export const PARAMETROS = [
  {
    clave: 'tema_sistema',
    tipo: 'opcion',
    etiqueta: 'Tema de la interfaz',
    descripcion: 'El aspecto con el que arranca la aplicación en todos los dispositivos.',
    porDefecto: 'sistema',
    opciones: [
      { valor: 'sistema', etiqueta: 'Según el dispositivo', detalle: 'Sigue la preferencia del sistema operativo.' },
      { valor: 'claro', etiqueta: 'Claro', detalle: 'Fondo blanco. Se lee mejor de día y en proyección.' },
      { valor: 'oscuro', etiqueta: 'Oscuro', detalle: 'Fondo oscuro. Cansa menos la vista de noche.' }
    ]
  },
  {
    clave: 'color_primario',
    tipo: 'color',
    etiqueta: 'Color primario',
    descripcion: 'El color de los botones, los enlaces activos y todo lo que la interfaz destaca.',
    porDefecto: '#465fff',
    // Sugerencias, no un límite: la pantalla también acepta cualquier otro.
    sugerencias: [
      { valor: '#465fff', etiqueta: 'Azul original' },
      { valor: '#0a1f8f', etiqueta: 'Azul institucional' },
      { valor: '#0369a1', etiqueta: 'Celeste' },
      { valor: '#047857', etiqueta: 'Verde' },
      { valor: '#b91c1c', etiqueta: 'Rojo' },
      { valor: '#6d28d9', etiqueta: 'Violeta' },
      { valor: '#c2410c', etiqueta: 'Naranja' },
      { valor: '#1f2937', etiqueta: 'Gris oscuro' }
    ]
  },
  {
    clave: 'logo_forma',
    tipo: 'opcion',
    etiqueta: 'Forma del logo',
    descripcion: 'Cuál de las dos versiones del logo municipal se usa en la interfaz.',
    porDefecto: 'escudo',
    opciones: [
      { valor: 'escudo', etiqueta: 'Solo el escudo', detalle: 'El escudo sobre una placa del color primario, con el nombre al lado.' },
      { valor: 'vertical', etiqueta: 'Vertical', detalle: 'El escudo con «San Salvador Sur» debajo, en cuadrado.' },
      { valor: 'horizontal', etiqueta: 'Horizontal', detalle: 'El escudo con «San Salvador Sur» al costado, apaisado.' }
    ]
  },
  {
    clave: 'logo_ancho_sidebar',
    tipo: 'numero',
    etiqueta: 'Tamaño en la barra lateral',
    descripcion: 'Ancho del logo en el menú, en píxeles.',
    porDefecto: '40',
    minimo: 28,
    maximo: 240,
    // Cada forma se ve bien en un rango distinto. El escudo es cuadrado y va
    // sobre una placa. El vertical lleva el nombre debajo, así que necesita
    // alto —y siendo cuadrado, ese alto es también su ancho—. El horizontal
    // necesita más del doble de ancho para que se lea su texto.
    recomendado: { escudo: 40, vertical: 56, horizontal: 150 }
  },
  {
    clave: 'logo_ancho_login',
    tipo: 'numero',
    etiqueta: 'Tamaño en el inicio de sesión',
    descripcion: 'Ancho del logo en la pantalla de entrada, en píxeles.',
    porDefecto: '56',
    minimo: 32,
    maximo: 320,
    recomendado: { escudo: 56, vertical: 110, horizontal: 190 }
  }
];

/** ¿Es un hexadecimal de seis dígitos? */
const ES_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Valida y normaliza el valor de un parámetro.
 * Devuelve `{ valor }` si está bien, o `{ error }` con qué tiene de malo.
 */
function validarParametro(parametro, crudo) {
  if (parametro.tipo === 'color') {
    const color = '#' + String(crudo || '').trim().replace(/^#/, '').toLowerCase();
    if (!ES_HEX.test(color)) {
      return { error: `"${crudo}" no es un color válido. Se espera un hexadecimal como #465fff.` };
    }
    return { valor: color };
  }

  if (parametro.tipo === 'numero') {
    const numero = aEntero(crudo, NaN);
    if (!Number.isFinite(numero)) {
      return { error: `"${crudo}" no es un número.` };
    }
    if (numero < parametro.minimo || numero > parametro.maximo) {
      return {
        error: `${parametro.etiqueta} tiene que estar entre ${parametro.minimo} y ${parametro.maximo}.`
      };
    }
    return { valor: String(numero) };
  }

  const valor = aTexto(crudo);
  if (!parametro.opciones.some((o) => o.valor === valor)) {
    return {
      error: `"${valor}" no es un valor válido para ${parametro.etiqueta}. ` +
             `Las opciones son: ${parametro.opciones.map((o) => o.valor).join(', ')}.`
    };
  }
  return { valor };
}

/**
 * Conjuntos de datos que se pueden vaciar desde la pantalla de configuración.
 *
 * Existe para no tener que entrar a Supabase a borrar a mano entre prueba y
 * prueba. Solo se ofrecen datos de operación: lo que se genera durante un
 * evento y se puede volver a generar.
 *
 * Los catálogos que cuestan cargar (empleados, departamentos, usuarios, roles,
 * permisos) NO están y no deben estarse: son el padrón de la institución, no
 * datos de una fiesta. Si alguien necesita vaciarlos, que sea a mano y sabiendo
 * lo que hace.
 *
 * `dependientes` es lo que hay que borrar ANTES para no chocar contra las
 * llaves foráneas, y va en orden. Por ejemplo, `ganadores` apunta a `sorteos`,
 * a `asistencias` y a `premios`: si se vacía cualquiera de esas tres sin
 * limpiar antes `ganadores`, PostgreSQL rechaza el borrado entero.
 */
export const PURGABLES = [
  {
    clave: 'asistencias',
    etiqueta: 'Asistencias',
    descripcion: 'Todos los ingresos registrados con el escáner.',
    tabla: TABLAS.asistencias,
    dependientes: [TABLAS.ganadores]
  },
  {
    clave: 'ganadores',
    etiqueta: 'Sorteos (ganadores)',
    descripcion: 'Los ganadores ya extraídos. Los sorteos quedan sin realizar.',
    tabla: TABLAS.ganadores,
    dependientes: []
  },
  {
    clave: 'sorteos',
    etiqueta: 'Administrar sorteos',
    descripcion: 'Los sorteos configurados, junto con sus ganadores.',
    tabla: TABLAS.sorteos,
    dependientes: [TABLAS.ganadores]
  },
  {
    clave: 'premios',
    etiqueta: 'Premios',
    descripcion: 'El catálogo de premios, sus sorteos y sus ganadores.',
    tabla: TABLAS.premios,
    dependientes: [TABLAS.ganadores, TABLAS.sorteos]
  },
  {
    clave: 'eventos',
    etiqueta: 'Eventos',
    descripcion: 'Los eventos y todo lo que cuelga de ellos: asistencias, sorteos y ganadores.',
    tabla: TABLAS.eventos,
    dependientes: [TABLAS.ganadores, TABLAS.sorteos, TABLAS.asistencias]
  },
  {
    clave: 'invitaciones',
    etiqueta: 'Invitaciones',
    descripcion: 'Las plantillas de tarjeta, junto con sus imágenes de fondo.',
    tabla: TABLAS.plantillasTarjetas,
    dependientes: []
  }
];

/** Cuántas filas hay, sin traérselas. */
async function contarFilas(tabla) {
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

/**
 * Vacía una tabla entera.
 *
 * PostgREST se niega a ejecutar un DELETE sin filtro, que es una buena
 * protección contra un borrado accidental. Como acá el borrado total es
 * justamente lo que se pide, se usa un filtro que siempre se cumple.
 */
async function vaciarTabla(tabla) {
  const total = await contarFilas(tabla);
  if (total === 0) return 0;

  const { error } = await supabase.from(tabla).delete().not('id', 'is', null);
  if (error) throw error;

  return total;
}

/**
 * Borra también las imágenes del bucket.
 * Sin esto, vaciar las plantillas deja los PNG huérfanos ocupando la cuota
 * gratuita de Storage sin que nada los referencie.
 */
async function vaciarImagenesDePlantillas() {
  const { data } = await supabase.from(TABLAS.plantillasTarjetas).select('imagen_url');
  const rutas = (data || []).map((fila) => fila.imagen_url).filter(Boolean);
  if (rutas.length === 0) return 0;

  const { error } = await supabase.storage.from(BUCKET_PLANTILLAS).remove(rutas);
  if (error) {
    // Que falle el borrado de las imágenes no debe abortar el purgado: los
    // registros son lo que importa y un PNG huérfano no rompe nada.
    console.warn('[configuracion] No se pudieron borrar las imágenes:', error.message);
    return 0;
  }
  return rutas.length;
}

async function listarPurgables({ res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  // Se informa cuánto hay en cada conjunto para que nadie confirme a ciegas.
  const conjuntos = await Promise.all(
    PURGABLES.map(async ({ clave, etiqueta, descripcion, tabla, dependientes }) => ({
      clave,
      etiqueta,
      descripcion,
      total: await contarFilas(tabla),
      arrastra: dependientes
    }))
  );

  return responderOk(res, { conjuntos });
}

/**
 * Vacía uno de los conjuntos declarados en PURGABLES.
 *
 * Pide que el cuerpo repita la etiqueta exacta del conjunto. Es a propósito:
 * un borrado total no debe poder dispararse con un clic de más, y el nombre
 * escrito a mano obliga a leer qué se está por borrar.
 */
async function purgarConjunto({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'Solo un administrador puede vaciar registros.');
  }

  const cuerpo = await leerCuerpo(req);
  const clave = aTexto(cuerpo.conjunto);
  const conjunto = PURGABLES.find((p) => p.clave === clave);

  if (!conjunto) {
    return responderSolicitudInvalida(res, 'Ese conjunto de datos no se puede vaciar desde aquí.');
  }

  if (aTexto(cuerpo.confirmacion).trim().toLowerCase() !== conjunto.etiqueta.toLowerCase()) {
    return responderSolicitudInvalida(
      res,
      `Para confirmar, escribe exactamente: ${conjunto.etiqueta}`
    );
  }

  const borrados = [];

  // Primero lo que depende, después la tabla pedida. El orden de
  // `dependientes` ya viene resuelto en la declaración.
  for (const tabla of conjunto.dependientes) {
    borrados.push({ tabla, filas: await vaciarTabla(tabla) });
  }

  let imagenes = 0;
  if (conjunto.tabla === TABLAS.plantillasTarjetas) {
    imagenes = await vaciarImagenesDePlantillas();
  }

  borrados.push({ tabla: conjunto.tabla, filas: await vaciarTabla(conjunto.tabla) });

  const total = borrados.reduce((suma, fila) => suma + fila.filas, 0);

  console.info(
    `[configuracion] ${sesion.usuario || 'desconocido'} vació "${conjunto.etiqueta}": ` +
    borrados.map((b) => `${b.tabla}=${b.filas}`).join(', ')
  );

  return responderOk(res, {
    ok: true,
    conjunto: conjunto.etiqueta,
    total,
    imagenes,
    detalle: borrados
  });
}

async function listarConfiguracion({ res }) {
  const { data, error } = await supabase.from(TABLAS.configuracion).select('*');
  if (error) throw error;

  const guardados = new Map((data || []).map((fila) => [fila.clave, fila.valor]));

  // Devolvemos siempre los tres interruptores, tomando el valor por defecto
  // cuando todavía nadie los tocó.
  const interruptores = INTERRUPTORES.map((interruptor) => ({
    ...interruptor,
    valor: guardados.has(interruptor.clave)
      ? guardados.get(interruptor.clave)
      : interruptor.porDefecto,
    activo: esVerdadero(
      guardados.has(interruptor.clave) ? guardados.get(interruptor.clave) : interruptor.porDefecto
    )
  }));

  // Los parámetros se devuelven resueltos igual que los interruptores: con su
  // valor efectivo, aunque la fila todavía no exista en la base. Si lo guardado
  // ya no pasa la validación —porque cambió el rango o la lista de opciones—
  // se cae al valor por defecto en vez de devolver algo que la pantalla no
  // sabría dibujar.
  const parametros = PARAMETROS.map((parametro) => {
    const guardado = guardados.get(parametro.clave);
    const revisado = guardado === undefined ? null : validarParametro(parametro, guardado);

    return {
      ...parametro,
      valor: revisado && !revisado.error ? revisado.valor : parametro.porDefecto
    };
  });

  return responderOk(res, { interruptores, parametros, filas: data || [] });
}

async function guardarConfiguracion({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);
  const clave = aTexto(cuerpo.clave);

  if (!clave) {
    return responderSolicitudInvalida(res, 'Falta la clave del parámetro.');
  }

  // Los interruptores conocidos se normalizan a TRUE/FALSE; los parámetros
  // declarados se validan según su tipo; cualquier otra clave se guarda tal
  // cual vino.
  const esInterruptor = INTERRUPTORES.some((i) => i.clave === clave);
  const parametro = PARAMETROS.find((p) => p.clave === clave);

  let valor;
  if (parametro) {
    const revisado = validarParametro(parametro, cuerpo.valor);
    if (revisado.error) return responderSolicitudInvalida(res, revisado.error);
    valor = revisado.valor;
  } else {
    valor = esInterruptor ? aBandera(cuerpo.valor) : aTexto(cuerpo.valor);
  }

  const { error } = await supabase
    .from(TABLAS.configuracion)
    .upsert({ clave, valor, descripcion: aTexto(cuerpo.descripcion) }, { onConflict: 'clave' });

  if (error) throw error;

  return responderOk(res, { ok: true, clave, valor });
}

export const controladorConfiguracion = {
  async manejar(contexto) {
    const { res, metodo, accion } = contexto;

    if (metodo === 'GET') {
      if (accion === 'purgables') return listarPurgables(contexto);
      return listarConfiguracion(contexto);
    }

    if (metodo === 'POST' || metodo === 'PUT') {
      if (accion === 'purgar') return purgarConjunto(contexto);
      return guardarConfiguracion(contexto);
    }

    return responderMetodoNoPermitido(res);
  }
};
