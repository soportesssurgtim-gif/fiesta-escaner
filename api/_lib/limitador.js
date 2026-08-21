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
 * Por qué son tan holgados
 * ------------------------
 * Contar por IP castiga a quien comparte una. Acá eso no es un caso raro: la
 * telefonía móvil salvadoreña reparte pocas direcciones públicas entre muchos
 * clientes, así que decenas de empleados mirando su invitación desde el celular
 * pueden salir todos por la misma. Un cupo apretado los deja afuera a todos por
 * culpa del primero.
 *
 * Sesenta consultas cada diez minutos es invisible para cualquier persona
 * —incluso para una familia entera revisando sus invitaciones— y sigue siendo
 * un techo real: con el desafío costando algo más de un décimo de segundo de
 * cálculo cada uno, juntar los novecientos empleados desde una sola dirección
 * lleva dos horas y media largas.
 *
 * El desafío casi no se limita
 * ----------------------------
 * Tenía un cupo de 40 y fue un error: se pide al abrir la pantalla, antes de
 * que nadie escriba nada, y se vuelve a pedir después de cada consulta. Basta
 * recargar la página unas cuantas veces para agotarlo, y como sin desafío no se
 * puede consultar, el resultado era dejar afuera a alguien que todavía no había
 * consultado ni una vez. Pasó de verdad.
 *
 * Limitarlo tampoco aportaba nada: un desafío sin resolver no sirve, resolverlo
 * cuesta el cálculo, y usarlo cuesta un lugar del cupo de consultas. El techo
 * real siempre fue el otro.
 *
 * Queda un tope alto, solo para que nadie nos haga firmar desafíos sin fin: a
 * trescientos cada diez minutos, un pedido cada dos segundos sostenido, ninguna
 * persona se acerca.
 */
export const LIMITES = {
  consulta: { intentos: 60, ventanaSegundos: 600 },
  desafio: { intentos: 300, ventanaSegundos: 600 }
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
      esperaSegundos: limite.ventanaSegundos,
      minutos: Math.ceil(limite.ventanaSegundos / 60)
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
      esperaSegundos: limite.ventanaSegundos,
      minutos: Math.ceil(limite.ventanaSegundos / 60)
    };
  }
}
