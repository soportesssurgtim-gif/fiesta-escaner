/**
 * Portal público de invitaciones.
 *
 * Es el único recurso que se atiende sin sesión: el empleado entra desde su
 * teléfono, escribe su DUI y obtiene su QR.
 *
 * Qué se devuelve y por qué tan poco
 * ----------------------------------
 * Nombre, apellido y el QR. Nada de teléfono, correo, cargo ni salario. Si
 * alguien acierta un DUI, lo más que obtiene es un nombre que de todos modos va
 * impreso en el gafete del evento. Esa es la contención de fondo: no hay nada
 * caro que robar acá, y conviene que siga siendo así.
 *
 * Los «últimos 4 dígitos» que ya no están
 * ---------------------------------------
 * Antes había que escribir el DUI y además sus últimos cuatro dígitos. Sonaba a
 * segundo factor y no lo era: se comparaban contra los últimos cuatro del DUI
 * que la persona acababa de escribir, así que quien supiera el DUI los sabía por
 * definición. Era un campo más para equivocarse, sin nada a cambio.
 *
 * En su lugar hay tres cosas que sí cuestan algo a un script y nada a una
 * persona:
 *
 *   El desafío   antes de responder hay que resolver un acertijo de fuerza
 *                bruta. Décimas de segundo mientras se termina de escribir el
 *                DUI; una vez por consulta para quien quiera las novecientas.
 *   El límite    un techo de consultas por rato desde el mismo lugar. Es lo que
 *                de verdad pone un número al raspado.
 *   La trampa    un campo que no se ve y que nadie llena a mano. El que lo
 *                llena se delata solo.
 *
 * Ninguna de las tres, sola, distingue a una persona de un robot. Juntas hacen
 * que juntar la lista deje de salir gratis, que es lo que se puede lograr en un
 * portal que por definición atiende a cualquiera.
 */

import { BASE_QR, SI } from '../configuracion.js';
import { aTexto, normalizarDui } from '../valores.js';
import { leerParametro } from '../peticion.js';
import { crearDesafio, verificarDesafio, leerSolucion } from '../desafio.js';
import { registrarIntento } from '../limitador.js';
import {
  responderOk,
  responderSolicitudInvalida,
  responderNoEncontrado,
  responderDemasiadasSolicitudes,
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

/**
 * El nombre del campo trampa.
 *
 * Suena a campo de verdad a propósito: uno llamado «honeypot» lo saltea
 * cualquiera. En la pantalla está escondido y marcado para que los lectores de
 * pantalla lo ignoren, así que una persona no puede llenarlo ni sin querer.
 */
const CAMPO_TRAMPA = 'segundo_apellido';

/**
 * Qué se le dice a quien se pasó del cupo.
 *
 * Con el tiempo concreto y no «unos minutos»: quien está en la puerta del
 * evento necesita saber si son dos minutos o media hora para decidir si espera
 * o busca a alguien que le ayude.
 */
function mensajeDeEspera(cupo) {
  const minutos = cupo.minutos || Math.ceil((cupo.esperaSegundos || 600) / 60);
  return `Demasiadas consultas desde esta conexión. Vuelve a intentar en ${minutos} minutos.`;
}

export const controladorInvitacionPublica = {
  publico: true,

  async manejar({ req, res, metodo, accion }) {
    if (metodo !== 'GET') {
      return responderMetodoNoPermitido(res);
    }

    if (accion === 'desafio') {
      return entregarDesafio(req, res);
    }

    return consultarInvitacion(req, res);
  }
};

/**
 * Entrega un acertijo nuevo.
 *
 * Su cupo es altísimo a propósito, casi un no-límite. Se pide al abrir la
 * pantalla, antes de que nadie escriba nada, así que un cupo apretado deja
 * afuera a quien todavía no consultó. Lo que de verdad pone el techo es el cupo
 * de las consultas; esto solo evita que alguien nos haga firmar desafíos sin
 * fin.
 */
async function entregarDesafio(req, res) {
  const cupo = await registrarIntento(req, 'desafio');

  if (!cupo.permitido) {
    return responderDemasiadasSolicitudes(res, mensajeDeEspera(cupo), cupo.esperaSegundos);
  }

  return responderOk(res, crearDesafio());
}

async function consultarInvitacion(req, res) {
  /*
   * El campo trampa se mira antes que nada.
   *
   * Se responde igual que a un DUI que no está: si se le dijera «te
   * descubrimos», quien escribe el script corrige y vuelve. Callado, sigue
   * creyendo que ese DUI no existe.
   */
  if (aTexto(leerParametro(req, CAMPO_TRAMPA))) {
    return responderNoEncontrado(res, 'No encontramos ese DUI en la lista de invitados.');
  }

  const cupo = await registrarIntento(req, 'consulta');
  if (!cupo.permitido) {
    return responderDemasiadasSolicitudes(res, mensajeDeEspera(cupo), cupo.esperaSegundos);
  }

  const solucion = leerSolucion(leerParametro(req, 'desafio'));
  const veredicto = verificarDesafio(solucion);

  if (!veredicto.valido) {
    // El motivo va al log del servidor y no a la pantalla: distinguir «venció»
    // de «está mal» le sirve más a quien prueba que a quien consulta.
    console.warn(`[invitacion] Desafío rechazado: ${veredicto.motivo}`);
    return responderSolicitudInvalida(
      res,
      'La verificación de seguridad venció. Vuelve a intentar.'
    );
  }

  const duiConsultado = aTexto(leerParametro(req, 'dui'));
  if (!duiConsultado) {
    return responderSolicitudInvalida(res, 'Ingresa tu DUI.');
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

  return responderOk(res, {
    evento: evento.nombre,
    fechaEvento: evento.fecha_evento || '',
    ubicacion: evento.ubicacion || '',
    // Para el botón de cómo llegar. Van como números o como null; la
    // pantalla no muestra el botón si falta alguna.
    latitud: evento.latitud ?? null,
    longitud: evento.longitud ?? null,
    empleado: {
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      dui: empleado.dui,
      codigo: empleado.codigo || '',
      qr_url: construirUrlQr(normalizarDui(empleado.dui))
    }
  });
}
