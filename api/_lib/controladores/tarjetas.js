/**
 * Plantillas de tarjetas de invitación.
 *
 * Una plantilla es la imagen de fondo más la posición donde va el QR. Se diseña
 * una vez y sirve para generar las invitaciones de todo el personal.
 *
 * Nota importante sobre la subida de imágenes: antes el navegador intentaba
 * hablar directo con Supabase Storage, pero el frontend nunca tuvo el cliente
 * de Supabase cargado, así que esa función siempre lanzaba "supabase is not
 * defined" y guardar una plantilla simplemente no funcionaba. Ahora la imagen
 * viaja en base64 hasta acá y es el backend —que sí tiene credenciales— el que
 * la sube.
 */

import { supabase } from '../supabase.js';
import { Repositorio } from '../repositorio.js';
import { TABLAS, BUCKET_PLANTILLAS, SI } from '../configuracion.js';
import { aTexto, aEntero, aBandera, nuevoUuid } from '../valores.js';

/*
 * Las medidas de la tarjeta.
 *
 * Van repetidas acá y en el navegador a propósito: el navegador las necesita
 * para acotar mientras alguien teclea, y el servidor no puede confiar en que lo
 * que llega haya pasado por ese navegador.
 *
 * Las de por defecto son las que el sistema usaba antes de que cada plantilla
 * tuviera las suyas, y son las que quedan para las que ya existían.
 */
const ANCHO_POR_DEFECTO = 1200;
const ALTO_POR_DEFECTO = 1800;
const MEDIDA_MINIMA = { ancho: 800, alto: 600 };
const MEDIDA_MAXIMA = 6000;
import { leerCuerpo } from '../peticion.js';
import { esAdministrador } from '../seguridad.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderSinPermiso,
  responderMetodoNoPermitido
} from '../respuestas.js';
import { repositorioEmpleados } from './empleados.js';

const repositorioPlantillas = new Repositorio(TABLAS.plantillasTarjetas, {
  ordenarPor: 'created_at',
  ascendente: false
});

// Dónde puede ir anclado el QR dentro de la tarjeta.
const CAMPOS_QR_VALIDOS = ['dui', 'codigo', 'url'];

// Las plantillas son PNG de alta resolución; 8 MB da margen de sobra y evita
// que alguien suba un archivo que reviente el límite de la función serverless.
const PESO_MAXIMO_BYTES = 8 * 1024 * 1024;

/** Plantillas disponibles para elegir. */
async function listarPlantillas({ res }) {
  const filas = await repositorioPlantillas.listar({ activo: SI });

  // Adjuntamos la URL pública ya resuelta para que el frontend no tenga que
  // saber cómo se arma una ruta de Storage.
  const conUrl = filas.map((plantilla) => ({
    ...plantilla,
    imagen_publica: obtenerUrlPublica(plantilla.imagen_url)
  }));

  return responderOk(res, conUrl);
}

/** Empleados en versión mínima, para el selector de generación masiva. */
async function listarEmpleadosParaTarjetas({ res }) {
  const filas = await repositorioEmpleados.listar(
    { activo: SI },
    'id, nombres, apellidos, dui, codigo'
  );
  return responderOk(res, filas);
}

/** Convierte la ruta guardada en Storage a una URL que el navegador pueda abrir. */
function obtenerUrlPublica(ruta) {
  if (!ruta) return '';
  const { data } = supabase.storage.from(BUCKET_PLANTILLAS).getPublicUrl(ruta);
  return data?.publicUrl || '';
}

/**
 * Sube la imagen de la plantilla a Storage.
 * Recibe el data URL que produce el canvas del navegador
 * ("data:image/png;base64,iVBORw0...") y devuelve la ruta guardada.
 */
async function subirImagen(dataUrl) {
  const coincidencia = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!coincidencia) {
    throw Object.assign(new Error('La imagen debe ser un PNG o JPEG en base64.'), {
      esDeUsuario: true
    });
  }

  const extension = coincidencia[1] === 'jpeg' ? 'jpg' : 'png';
  const binario = Buffer.from(coincidencia[2], 'base64');

  if (binario.length > PESO_MAXIMO_BYTES) {
    throw Object.assign(new Error('La imagen supera los 8 MB permitidos.'), {
      esDeUsuario: true
    });
  }

  const ruta = `plantillas/${Date.now()}-${nuevoUuid()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_PLANTILLAS)
    .upload(ruta, binario, {
      contentType: `image/${coincidencia[1]}`,
      upsert: false
    });

  if (error) throw error;
  return ruta;
}

/** Crea o actualiza una plantilla. */
async function guardarPlantilla({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);

  const campoQr = aTexto(cuerpo.campo_qr || cuerpo.campoQr) || 'dui';
  if (!CAMPOS_QR_VALIDOS.includes(campoQr)) {
    return responderSolicitudInvalida(
      res,
      `El campo del QR debe ser uno de: ${CAMPOS_QR_VALIDOS.join(', ')}.`
    );
  }

  // La imagen puede venir de tres formas: nueva en base64, una ruta ya subida,
  // o nada (cuando solo se está moviendo el QR de una plantilla existente).
  let rutaImagen = aTexto(cuerpo.imagen_url);
  if (cuerpo.imagenBase64) {
    rutaImagen = await subirImagen(cuerpo.imagenBase64);
  }

  if (!rutaImagen) {
    return responderSolicitudInvalida(res, 'Falta la imagen de fondo de la plantilla.');
  }

  /*
   * Las medidas de salida.
   *
   * Se acotan acá además de en la base. La base es la que manda —su CHECK no lo
   * puede saltear nadie— pero rebotar con un error de Postgres le muestra a
   * quien está guardando un mensaje que no dice nada; acotando primero, un
   * número absurdo se convierte en el más cercano que sí sirve y la plantilla
   * se guarda.
   *
   * Los topes son los mismos que la migración 009: por debajo del mínimo la
   * tarjeta impresa se ve pixelada, y por encima del máximo cien tarjetas no
   * entran en la memoria del navegador que arma el ZIP.
   */
  const acotar = (valor, porDefecto, minimo) =>
    Math.max(minimo, Math.min(MEDIDA_MAXIMA, aEntero(valor, porDefecto)));

  const datos = {
    nombre: aTexto(cuerpo.nombre) || `Plantilla ${new Date().toLocaleDateString('es-SV')}`,
    imagen_url: rutaImagen,
    qr_x: aEntero(cuerpo.qr_x, 0),
    qr_y: aEntero(cuerpo.qr_y, 0),
    qr_w: aEntero(cuerpo.qr_w, 200),
    qr_h: aEntero(cuerpo.qr_h, 200),
    ancho: acotar(cuerpo.ancho, ANCHO_POR_DEFECTO, MEDIDA_MINIMA.ancho),
    alto: acotar(cuerpo.alto, ALTO_POR_DEFECTO, MEDIDA_MINIMA.alto),
    campo_qr: campoQr,
    activo: aBandera(cuerpo.activo ?? 'TRUE')
  };

  const guardada = await repositorioPlantillas.guardar(cuerpo.id, datos);

  return responderOk(res, {
    ...guardada,
    imagen_publica: obtenerUrlPublica(guardada.imagen_url)
  });
}

/** Borra la plantilla y también su imagen, para no dejar basura en Storage. */
async function eliminarPlantilla({ req, res, sesion }) {
  if (!esAdministrador(sesion.rol)) {
    return responderSinPermiso(res, 'No tienes permisos de administrador.');
  }

  const cuerpo = await leerCuerpo(req);
  const id = aTexto(cuerpo.id);

  if (!id) {
    return responderSolicitudInvalida(res, 'Falta indicar la plantilla a eliminar.');
  }

  const plantilla = await repositorioPlantillas.obtenerPorId(id, 'id, imagen_url');
  if (!plantilla) {
    return responderSolicitudInvalida(res, 'La plantilla ya no existe.');
  }

  if (plantilla.imagen_url) {
    try {
      await supabase.storage.from(BUCKET_PLANTILLAS).remove([plantilla.imagen_url]);
    } catch (fallo) {
      // Si el archivo ya no está en Storage no es motivo para abortar: lo que
      // importa es que desaparezca de la lista.
      console.warn('[tarjetas] No se pudo borrar la imagen del bucket:', fallo);
    }
  }

  await repositorioPlantillas.eliminar(id);
  return responderOk(res, { ok: true });
}

export const controladorTarjetas = {
  async manejar(contexto) {
    const { res, accion, metodo } = contexto;

    if (metodo === 'GET' && accion === 'empleados') {
      return listarEmpleadosParaTarjetas(contexto);
    }
    if (metodo === 'GET') {
      return listarPlantillas(contexto);
    }
    if (metodo === 'POST' && accion === 'eliminar') {
      return eliminarPlantilla(contexto);
    }
    if (metodo === 'POST' || metodo === 'PUT') {
      return guardarPlantilla(contexto);
    }

    return responderMetodoNoPermitido(res);
  }
};
