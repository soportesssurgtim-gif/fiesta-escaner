import { supabase, requireAuth, getSession, isAdmin, jsonResponse, parseBody } from './_lib/supabase.js';

export default async function handler(req, res) {
  const auth = requireAuth(req);
  if (auth.error) {
    return jsonResponse(res, auth.status || 401, { error: auth.error });
  }

  const sesion = await getSession(auth.token);
  if (!sesion) {
    return jsonResponse(res, 401, { error: 'Sesión expirada, inicia sesión nuevamente.' });
  }

  const action = (req.query && req.query.action) || '';

  if (req.method === 'GET') {
    try {
      const { data } = await supabase
        .from('sorteos')
        .select('*, premios(nombre)')
        .order('fecha_hora_sorteo', { ascending: false });
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar sorteos.' });
    }
  }

  if (req.method === 'POST' && action === 'sortear') {
    return sortearGanador(req, res, sesion);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarSorteo(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarSorteo(req, res) {
  const body = await parseBody(req);

  const { data: evento, error: errEvt } = await supabase
    .from('eventos')
    .select('*')
    .eq('activo', 'TRUE')
    .limit(1)
    .maybeSingle();

  if (errEvt || !evento) {
    return jsonResponse(res, 400, { error: 'No hay un evento activo configurado.' });
  }

  const data = {
    evento: evento.id,
    nombre: body.nombre,
    premio: body.premio || null,
    realizado: 'FALSE'
  };

  if (!data.nombre) {
    return jsonResponse(res, 400, { error: 'Nombre del sorteo requerido.' });
  }

  try {
    if (body.id) {
      await supabase.from('sorteos').update(data).eq('id', body.id);
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted } = await supabase.from('sorteos').insert(data).select().maybeSingle();
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el sorteo.' });
  }
}

async function sortearGanador(req, res, sesion) {
  const body = await parseBody(req);
  const sorteoId = body.sorteoId || (req.query && req.query.sorteoId);

  if (!sorteoId) {
    return jsonResponse(res, 400, { error: 'sorteoId es requerido.' });
  }

  try {
    const { data: evento, error: errEvt } = await supabase
      .from('eventos')
      .select('*')
      .eq('activo', 'TRUE')
      .limit(1)
      .maybeSingle();

    if (errEvt || !evento) {
      return jsonResponse(res, 400, { error: 'No hay un evento activo configurado.' });
    }

    const { data: sorteo, error: errSrt } = await supabase
      .from('sorteos')
      .select('*')
      .eq('id', sorteoId)
      .maybeSingle();

    if (errSrt || !sorteo) {
      return jsonResponse(res, 404, { error: 'Sorteo no encontrado.' });
    }

    if (String(sorteo.realizado).toUpperCase() === 'TRUE') {
      return jsonResponse(res, 400, { error: 'Este sorteo ya fue realizado.' });
    }

    const { data: asistencias } = await supabase
      .from('asistencias')
      .select('*, empleado!inner(*)')
      .eq('evento', evento.id);

    const asistentesEvento = (asistencias || []).map(a => ({
      empleadoId: a.empleado.id,
      asistenciaId: a.id,
      empleado: a.empleado
    }));

    if (asistentesEvento.length === 0) {
      return jsonResponse(res, 400, { error: 'No hay asistentes registrados para este evento.' });
    }

    const { data: ganadoresDelSorteo } = await supabase
      .from('ganadores')
      .select('empleado')
      .eq('sorteo', sorteoId);

    const ganadoresIds = new Set((ganadoresDelSorteo || []).map(g => g.empleado));

    const elegibles = asistentesEvento.filter(a => !ganadoresIds.has(a.empleadoId));

    if (elegibles.length === 0) {
      await supabase.from('sorteos').update({ realizado: 'TRUE' }).eq('id', sorteoId);
      return jsonResponse(res, 400, { error: 'Todos los asistentes ya fueron ganadores en este sorteo.' });
    }

    const seleccionado = elegibles[Math.floor(Math.random() * elegibles.length)];
    const empleado = seleccionado.empleado;
    const premioId = sorteo.premio || null;

    const { data: ganador, error: errIns } = await supabase
      .from('ganadores')
      .insert({
        sorteo: sorteoId,
        premio: premioId,
        empleado: seleccionado.empleadoId,
        asistencia: seleccionado.asistenciaId,
        entregado_por: sesion.usuarioId,
        entregado: 'FALSE'
      })
      .select()
      .maybeSingle();

    if (errIns) throw errIns;

    if (premioId) {
      try {
        const { data: premio } = await supabase.from('premios').select('*').eq('id', premioId).maybeSingle();
        if (premio && (Number(premio.cantidad) || 0) > 0) {
          await supabase.from('premios').update({ cantidad: Number(premio.cantidad) - 1 }).eq('id', premioId);
        }
      } catch (_) { /* ignore premio count */ }
    }

    const restantes = elegibles.length - 1;
    const esUltimo = restantes <= 0;
    if (esUltimo) {
      await supabase.from('sorteos').update({ realizado: 'TRUE' }).eq('id', sorteoId);
    }

    return jsonResponse(res, 200, {
      ganador: ganador || null,
      empleado: empleado ? {
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        dui: empleado.dui,
        cargo: empleado.cargo || ''
      } : null,
      sorteoId: sorteoId,
      esUltimo,
      mensaje: '¡Ganador del sorteo!'
    });
  } catch (e) {
    console.error('sortearGanador error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al sortear.' });
  }
}
