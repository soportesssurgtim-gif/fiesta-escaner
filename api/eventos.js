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
      const { data } = await supabase.from('eventos').select('*').order('created_at', { ascending: false });
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar eventos.' });
    }
  }

  if (req.method === 'POST' && action === 'set-activo') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return setEventoActivo(req, res, sesion);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarEvento(req, res, sesion);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarEvento(req, res, sesion) {
  const body = await parseBody(req);
  const data = {
    nombre: body.nombre,
    fecha_evento: body.fechaEvento || '',
    ubicacion: body.ubicacion || '',
    activo: body.activo || 'FALSE'
  };

  if (!data.nombre) {
    return jsonResponse(res, 400, { error: 'Nombre del evento requerido.' });
  }

  try {
    if (body.id) {
      await supabase.from('eventos').update(data).eq('id', body.id);
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const insertData = { ...data, creado_por: sesion.usuarioId };
      const { data: inserted } = await supabase.from('eventos').insert(insertData).select().maybeSingle();
      return jsonResponse(res, 200, inserted || { ...insertData });
    }
  } catch (e) {
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el evento.' });
  }
}

async function setEventoActivo(req, res, sesion) {
  const body = await parseBody(req);
  const eventoId = body.eventoId || (req.query && req.query.eventoId);

  if (!eventoId) {
    return jsonResponse(res, 400, { error: 'eventoId es requerido.' });
  }

  try {
    const { data: todos } = await supabase.from('eventos').select('id');
    const updates = (todos || []).map(e => {
      return supabase.from('eventos')
        .update({ activo: e.id === eventoId ? 'TRUE' : 'FALSE' })
        .eq('id', e.id);
    });
    await Promise.all(updates);
    return jsonResponse(res, 200, { ok: true, message: 'Evento activo actualizado.' });
  } catch (e) {
    return jsonResponse(res, 500, { error: e.message || 'Error al cambiar el evento activo.' });
  }
}
