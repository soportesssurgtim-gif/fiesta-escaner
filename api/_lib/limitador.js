/**
 * El limitador del portal público.
 *
 * Pone un techo a cuántas veces se puede consultar desde el mismo lugar en un
 * rato. Es lo que de verdad frena el raspado: el desafío de trabajo encarece
 * cada intento, pero solo esto le pone un número.
 *
 * Cómo identifica a quien consulta
 * --------------------------------
 * Por la dirección IP que reporta Vercel, resumida con SHA-256 antes de tocar
 * la base. Alcanza para contar y no arma un registro de quién consultó su
 * invitación y desde dónde, que es un dato que este sistema no necesita tener.
 *
 * Tiene los defectos conocidos de contar por IP: una oficina entera sale por la
 * misma y comparte el cupo, y quien quiera saltárselo cambia de red. Por eso
 * los límites son holgados —incomodan a un script, no a una familia mirando su
 * invitación— y no son la única defensa.
 *
 * Qué pasa si la base no responde
 * -------------------------------
 * Se deja pasar, y se avisa en el log.
 *
 * Es una decisión, no un descuido: al otro lado hay empleados mirando su QR en
 * la puerta del evento, y un limitador caído dejaría a todos afuera para evitar
 * que alguien junte una lista de nombres que de todos modos van impresos en los
 * gafetes. El costo de equivocarse cerrando es más alto que el de equivocarse
 * abriendo. El diagnóstico avisa si la tabla no está.
 */

import { createHash } from 'node:crypto';
import { supabase } from './supabase.js';

/**
 * Los cupos.
 *
 * Consultar de más suele ser alguien que se equivocó de DUI y reintenta, así
 * que el cupo aguanta varios intentos seguidos. Pedir desafíos es más barato y
 * pasa una vez por consulta, así que va más suelto.
 */
export const LIMITES = {
  consulta: { intentos: 15, ventanaSegundos: 600 },
  desafio: { intentos: 40, ventanaSegundos: 600 }
};

/**
 * De dónde viene el pedido.
 *
 * Vercel pone la IP real del visitante en `x-forwarded-for`; lo que sigue en esa
 * lista son los saltos intermedios, así que se toma el primero. Se mira también
 * `x-real-ip` por si se sirve desde otro lado.
 *
 * Sin ninguna de las dos queda 'desconocido', y todos esos pedidos comparten un
 * mismo cupo. Es lo correcto: si no se puede distinguir de dónde vienen, se los
 * trata como uno solo y no como infinitos anónimos sin límite.
 */
function rastroDe(req) {
  const cabeceras = (req && req.headers) || {};
  const reenviado = String(cabeceras['x-forwarded-for'] || '').split(',')[0].trim();
  const directo = String(cabeceras['x-real-ip'] || '').trim();
  return reenviado || directo || 'desconocido';
}

/**
 * La clave con la que cuenta la base.
 *
 * Lleva pegado el minuto en que arranca la ventana, así que al terminar la
 * ventana la clave cambia sola y el conteo vuelve a cero sin limpiar nada.
 */
function claveDe(rastro, accion, ventanaSegundos) {
  const ventana = Math.floor(Date.now() / 1000 / ventanaSegundos);
  const resumen = createHash('sha256').update(`${accion}:${rastro}`).digest('hex').slice(0, 32);
  return `${accion}:${resumen}:${ventana}`;
}

/**
 * Cuenta un intento y dice si se pasó del cupo.
 *
 * Devuelve `{ permitido, intentos, limite, esperaSegundos }`.
 */
export async function registrarIntento(req, accion) {
  const limite = LIMITES[accion];
  if (!limite) throw new Error(`Acción sin límite definido: ${accion}`);

  const clave = claveDe(rastroDe(req), accion, limite.ventanaSegundos);

  try {
    const { data, error } = await supabase.rpc('registrar_intento', {
      p_clave: clave,
      p_ventana_segundos: limite.ventanaSegundos
    });

    if (error) throw error;

    const intentos = Number(data) || 0;

    return {
      permitido: intentos <= limite.intentos,
      intentos,
      limite: limite.intentos,
      esperaSegundos: limite.ventanaSegundos
    };
  } catch (fallo) {
    console.warn(
      `[limitador] No se pudo contar el intento de "${accion}": ${fallo.message}. ` +
      'Se deja pasar. Si esto se repite, revisa que la migración 007 esté aplicada.'
    );
    return {
      permitido: true,
      intentos: 0,
      limite: limite.intentos,
      esperaSegundos: limite.ventanaSegundos
    };
  }
}
