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

  if (req.method === 'GET') {
    try {
      const { data } = await supabase.from('premios').select('*').order('nombre');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar premios.' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarPremio(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarPremio(req, res) {
  const body = await parseBody(req);
  const data = {
    nombre: body.nombre,
    descripcion: body.descripcion || '',
    cantidad: Number(body.cantidad) || 1,
    activo: body.activo || 'TRUE'
  };

  if (!data.nombre) {
    return jsonResponse(res, 400, { error: 'Nombre del premio requerido.' });
  }

  try {
    if (body.id) {
      await supabase.from('premios').update(data).eq('id', body.id);
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted } = await supabase.from('premios').insert(data).select().maybeSingle();
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    console.error('guardarPremio error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el premio.' });
  }
}
