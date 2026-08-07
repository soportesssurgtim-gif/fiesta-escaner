/**
 * Parámetros generales del sistema.
 *
 * La tabla `configuracion` es un simple clave/valor. La pantalla de
 * configuración mostraba unos "kill switches" que en realidad estaban pintados
 * a mano en el HTML, sin nada detrás. Ahora sí tienen dónde guardarse.
 */

import { supabase } from '../supabase.js';
import { TABLAS } from '../configuracion.js';
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

  return responderOk(res, { interruptores, parametros: data || [] });
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

  // Los interruptores conocidos se normalizan a TRUE/FALSE; cualquier otro
  // parámetro se guarda tal cual vino.
  const esInterruptor = INTERRUPTORES.some((i) => i.clave === clave);
  const valor = esInterruptor ? aBandera(cuerpo.valor) : aTexto(cuerpo.valor);

  const { error } = await supabase
    .from(TABLAS.configuracion)
    .upsert({ clave, valor, descripcion: aTexto(cuerpo.descripcion) }, { onConflict: 'clave' });

  if (error) throw error;

  return responderOk(res, { ok: true, clave, valor });
}

export const controladorConfiguracion = {
  async manejar(contexto) {
    const { res, metodo } = contexto;

    if (metodo === 'GET') return listarConfiguracion(contexto);
    if (metodo === 'POST' || metodo === 'PUT') return guardarConfiguracion(contexto);

    return responderMetodoNoPermitido(res);
  }
};
