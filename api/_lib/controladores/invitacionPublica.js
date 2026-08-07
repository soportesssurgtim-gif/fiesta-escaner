/**
 * Portal público de invitaciones.
 *
 * Es el único recurso que se atiende sin sesión: el empleado entra desde su
 * teléfono, escribe su DUI y los últimos 4 dígitos, y obtiene su QR.
 *
 * Sobre la seguridad de este endpoint: los últimos 4 dígitos NO son una
 * contraseña fuerte, son una verificación de que quien consulta tiene el
 * documento a mano. Por eso solo devolvemos nombre, apellido y el QR. Nada de
 * teléfono, correo, cargo ni salario. Si alguien adivina un DUI, lo máximo que
 * obtiene es un nombre que de todos modos aparece en el gafete del evento.
 */

import { BASE_QR, SI } from '../configuracion.js';
import { aTexto, normalizarDui, ultimosCuatroDigitos } from '../valores.js';
import { leerParametro } from '../peticion.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoEncontrado,
  responderSinPermiso,
  responderMetodoNoPermitido
} from '../respuestas.js';
import { repositorioEmpleados } from './empleados.js';
import { obtenerEventoActivo } from './eventos.js';

/** Arma la URL del QR que se le muestra al empleado. */
export function construirUrlQr(texto) {
  const parametros = new URLSearchParams({
    text: texto,
    size: '600',
    margin: '2',
    bgcolor: 'ffffff',
    color: '101828'
  });
  return `${BASE_QR}?${parametros.toString()}`;
}

export const controladorInvitacionPublica = {
  publico: true,

  async manejar({ req, res, metodo }) {
    if (metodo !== 'GET') {
      return responderMetodoNoPermitido(res);
    }

    const duiConsultado = aTexto(leerParametro(req, 'dui'));
    const verificacion = aTexto(leerParametro(req, 'ultimos4'));

    if (!duiConsultado || !verificacion) {
      return responderSolicitudInvalida(res, 'Ingresa tu DUI y los últimos 4 dígitos.');
    }

    const evento = await obtenerEventoActivo();
    if (!evento) {
      return responderSolicitudInvalida(
        res,
        'Todavía no hay un evento activo. Consulta más tarde.'
      );
    }

    // Traemos solo las columnas necesarias: aunque el filtrado final ocurre en
    // memoria, no tiene sentido cargar datos que nunca vamos a devolver.
    const empleados = await repositorioEmpleados.listar(
      { activo: SI },
      'id, nombres, apellidos, dui, codigo'
    );

    const duiBuscado = normalizarDui(duiConsultado);
    const empleado = empleados.find((fila) => normalizarDui(fila.dui) === duiBuscado);

    if (!empleado) {
      return responderNoEncontrado(res, 'No encontramos ese DUI en la lista de invitados.');
    }

    if (ultimosCuatroDigitos(empleado.dui) !== verificacion) {
      return responderSinPermiso(res, 'Los últimos 4 dígitos no coinciden con el DUI.');
    }

    return responderOk(res, {
      evento: evento.nombre,
      fechaEvento: evento.fecha_evento || '',
      ubicacion: evento.ubicacion || '',
      empleado: {
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        dui: empleado.dui,
        codigo: empleado.codigo || '',
        qr_url: construirUrlQr(normalizarDui(empleado.dui))
      }
    });
  }
};
