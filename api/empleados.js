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

  if (req.method === 'GET' && action === 'tarjetas') {
    try {
      const { data } = await supabase.from('empleados').select('*').eq('activo', 'TRUE').order('apellidos');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar empleados.' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data } = await supabase.from('empleados').select('*').order('apellidos');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar empleados.' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarEmpleado(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarEmpleado(req, res) {
  const body = await parseBody(req);
  const data = {
    distrito: body.distrito || '',
    dpto: body.dpto || null,
    cargo: body.cargo || '',
    nombres: body.nombres,
    apellidos: body.apellidos,
    fecha_nacimiento: body.fechaNacimiento || '',
    telefono: body.telefono || '',
    correo: body.correo || '',
    dui: body.dui,
    activo: body.activo || 'TRUE'
  };

  if (!data.nombres || !data.apellidos || !data.dui) {
    return jsonResponse(res, 400, { error: 'Nombres, apellidos y DUI son requeridos.' });
  }

  try {
    if (body.id) {
      const { error } = await supabase.from('empleados').update(data).eq('id', body.id);
      if (error) {
        if (error.code === '23505') return jsonResponse(res, 400, { error: 'El DUI ya existe en el sistema.' });
        throw error;
      }
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted, error } = await supabase.from('empleados').insert(data).select().maybeSingle();
      if (error) {
        if (error.code === '23505') return jsonResponse(res, 400, { error: 'El DUI ya existe en el sistema.' });
        throw error;
      }
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    console.error('guardarEmpleado error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el empleado.' });
  }
}
