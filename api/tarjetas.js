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

  if (req.method === 'GET' && action === 'listar') {
    try {
      const { data } = await supabase
        .from('plantillas_tarjetas')
        .select('*')
        .eq('activo', 'TRUE')
        .order('created_at', { ascending: false });
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar plantillas.' });
    }
  }

  if (req.method === 'GET' && action === 'empleados') {
    try {
      const { data } = await supabase
        .from('empleados')
        .select('id, nombres, apellidos, dui, codigo')
        .eq('activo', 'TRUE')
        .order('apellidos');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar empleados.' });
    }
  }

  if (req.method === 'POST' && action === 'guardar') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarPlantilla(req, res);
  }

  if (req.method === 'POST' && action === 'eliminar') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return eliminarPlantilla(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarPlantilla(req, res) {
  const body = await parseBody(req);
  const data = {
    nombre: body.nombre || '',
    imagen_url: body.imagen_url || '',
    qr_x: Number(body.qr_x) || 0,
    qr_y: Number(body.qr_y) || 0,
    qr_w: Number(body.qr_w) || 200,
    qr_h: Number(body.qr_h) || 200,
    campo_qr: body.campo_qr || 'dui',
    activo: body.activo || 'TRUE'
  };

  if (!data.nombre || !data.imagen_url) {
    return jsonResponse(res, 400, { error: 'Nombre y URL de imagen son requeridos.' });
  }

  if (!['dui', 'codigo', 'url'].includes(data.campo_qr)) {
    return jsonResponse(res, 400, { error: 'Campo QR inválido.' });
  }

  try {
    if (body.id) {
      const { error } = await supabase
        .from('plantillas_tarjetas')
        .update(data)
        .eq('id', body.id);
      if (error) throw error;
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted, error } = await supabase
        .from('plantillas_tarjetas')
        .insert(data)
        .select()
        .maybeSingle();
      if (error) throw error;
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    console.error('guardarPlantilla error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar la plantilla.' });
  }
}

async function eliminarPlantilla(req, res) {
  const body = await parseBody(req);
  const id = body.id;
  if (!id) {
    return jsonResponse(res, 400, { error: 'ID de plantilla requerido.' });
  }

  try {
    const { data: plantilla } = await supabase
      .from('plantillas_tarjetas')
      .select('imagen_url')
      .eq('id', id)
      .maybeSingle();

    if (plantilla && plantilla.imagen_url) {
      await supabase.storage.from('plantillas').remove([plantilla.imagen_url]);
    }

    const { error } = await supabase
      .from('plantillas_tarjetas')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return jsonResponse(res, 200, { ok: true });
  } catch (e) {
    console.error('eliminarPlantilla error:', e);
    return jsonResponse(res, 500, { error: 'Error al eliminar la plantilla.' });
  }
}
