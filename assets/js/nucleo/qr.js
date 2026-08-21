/**
 * El código QR de una persona, y el enlace a su invitación.
 *
 * Estas tres funciones vivían dentro del módulo de tarjetas impresas, que se
 * retiró. Se quedan porque no eran de ese módulo: el QR del detalle de un
 * empleado y el enlace para compartir su invitación se usan desde la pantalla de
 * empleados, que sigue en pie.
 *
 * El QR lo dibuja QuickChart y no una librería propia. Es una dependencia de
 * red, con lo que eso implica —sin señal no hay QR— pero a cambio el sistema no
 * carga los treinta kilobytes de un generador para algo que se pide de a uno y
 * casi siempre con conexión. El escáner, que es lo que sí tiene que funcionar
 * sin señal, no necesita generar nada: solo lee.
 */

/*
 * El logo va en el centro del código.
 *
 * Un QR aguanta que le tapen parte del dibujo: lleva corrección de errores, y
 * el centro es la zona donde menos información hay. El escudo ahí adentro es lo
 * que hace que la invitación se vea de la alcaldía y no de cualquier lado.
 */
const LOGO_MUNICIPAL = 'https://sansalvadorsur.gob.sv/images/logo-circulo-blanco.png';

/** Enlace del portal público con el DUI ya precargado en el formulario. */
export function enlaceInvitacion(empleado) {
  return `${window.location.origin}/?invitacion=1&dui=${(empleado && empleado.dui) || ''}`;
}

/**
 * Arma la URL del QR de QuickChart para un empleado.
 *
 * `campo` decide qué lleva codificado el QR:
 *
 *   dui      los dígitos del DUI, que es lo que el escáner espera leer
 *   codigo   el código interno, para instituciones que lo usan como legajo
 *   url      el enlace al portal, para quien prefiera que abra una página
 */
export function urlQr(empleado, campo = 'dui') {
  let contenido;
  if (campo === 'codigo') contenido = empleado.codigo || empleado.dui || '';
  else if (campo === 'url') contenido = enlaceInvitacion(empleado);
  else contenido = String(empleado.dui || '').replace(/[^0-9]/g, '');

  const parametros = new URLSearchParams({
    text: contenido,
    size: '400',
    margin: '2',
    light: 'ffffff',
    dark: '101828',
    centerImageUrl: LOGO_MUNICIPAL
  });

  return `https://quickchart.io/qr?${parametros.toString()}`;
}

/**
 * Descarga el QR suelto de una persona.
 *
 * Va por fetch y no por canvas a propósito: así se conserva el PNG tal como lo
 * devuelve QuickChart, sin recomprimirlo ni depender de que el lienzo no quede
 * «manchado» por una imagen de otro dominio.
 */
export async function descargarQr(empleado, campo = 'dui') {
  const respuesta = await fetch(urlQr(empleado, campo));
  if (!respuesta.ok) {
    throw new Error('No se pudo obtener el código. Revisa la conexión.');
  }

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `qr-${empleado.codigo || empleado.dui || empleado.id}.png`;
  enlace.click();
  URL.revokeObjectURL(url);
}
