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
      const { data } = await supabase.from('dpto').select('*').order('nombre_dpto');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar departamentos.' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarDepartamento(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarDepartamento(req, res) {
  const body = await parseBody(req);
  const data = {
    cod_dpto: body.codDpto || '',
    nombre_dpto: body.nombreDpto,
    activo: body.activo || 'TRUE'
  };

  if (!data.nombre_dpto) {
    return jsonResponse(res, 400, { error: 'Nombre de departamento requerido.' });
  }

  try {
    if (body.id) {
      await supabase.from('dpto').update(data).eq('id', body.id);
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted } = await supabase.from('dpto').insert(data).select().maybeSingle();
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    console.error('guardarDepartamento error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el departamento.' });
  }
}
