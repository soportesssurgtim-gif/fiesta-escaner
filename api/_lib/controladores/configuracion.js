/**
 * Parámetros generales del sistema.
 *
 * La tabla `configuracion` es un simple clave/valor. La pantalla de
 * configuración mostraba unos "kill switches" que en realidad estaban pintados
 * a mano en el HTML, sin nada detrás. Ahora sí tienen dónde guardarse.
 */

import { supabase } from '../supabase.js';
import { TABLAS, BUCKET_PLANTILLAS } from '../configuracion.js';
import { aTexto, aBandera, esVerdadero } from '../valores.js';
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
 * Parámetros de opción múltiple.
 *
 * A diferencia de los interruptores, que son sí o no, estos guardan uno de
 * varios valores. Las opciones se declaran acá y el guardado las valida: un
 * valor fuera de la lista dejaría a la pantalla sin saber qué mostrar.
 */
export const PARAMETROS = [
  {
    clave: 'tema_sistema',
    etiqueta: 'Tema de la interfaz',
    descripcion: 'El aspecto con el que arranca la aplicación en todos los dispositivos.',
    porDefecto: 'sistema',
    opciones: [
      { valor: 'sistema', etiqueta: 'Según el dispositivo', detalle: 'Sigue la preferencia del sistema operativo.' },
      { valor: 'claro', etiqueta: 'Claro', detalle: 'Fondo blanco. Se lee mejor de día y en proyección.' },
      { valor: 'oscuro', etiqueta: 'Oscuro', detalle: 'Fondo oscuro. Cansa menos la vista de noche.' }
    ]
  }
];

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
  // valor efectivo, aunque la fila todavía no exista en la base.
  const parametros = PARAMETROS.map((parametro) => {
    const guardado = guardados.get(parametro.clave);
    const valido = parametro.opciones.some((o) => o.valor === guardado);

    return { ...parametro, valor: valido ? guardado : parametro.porDefecto };
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

  // Los interruptores conocidos se normalizan a TRUE/FALSE; los parámetros de
  // opción múltiple se validan contra su lista; cualquier otra clave se guarda
  // tal cual vino.
  const esInterruptor = INTERRUPTORES.some((i) => i.clave === clave);
  const parametro = PARAMETROS.find((p) => p.clave === clave);

  const valor = esInterruptor ? aBandera(cuerpo.valor) : aTexto(cuerpo.valor);

  if (parametro) {
    if (!parametro.opciones.some((o) => o.valor === valor)) {
      return responderSolicitudInvalida(
        res,
        `"${valor}" no es un valor válido para ${parametro.etiqueta}. ` +
        `Las opciones son: ${parametro.opciones.map((o) => o.valor).join(', ')}.`
      );
    }
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
