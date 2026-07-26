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
      const { data } = await supabase.from('permisos').select('*');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar permisos.' });
    }
  }

  if (req.method === 'POST' && action === 'rol') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarPermisosRol(req, res);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarPermiso(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarPermiso(req, res) {
  const body = await parseBody(req);
  const data = {
    rol: body.rol || null,
    modulo: body.modulo,
    puede_ver: body.puedeVer || 'FALSE',
    puede_agregar: body.puedeAgregar || 'FALSE',
    puede_editar: body.puedeEditar || 'FALSE',
    puede_eliminar: body.puedeEliminar || 'FALSE'
  };

  if (!data.modulo || !data.rol) {
    return jsonResponse(res, 400, { error: 'Rol y módulo son requeridos.' });
  }

  try {
    if (body.id) {
      await supabase.from('permisos').update(data).eq('id', body.id);
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const { data: inserted } = await supabase.from('permisos').insert(data).select().maybeSingle();
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el permiso.' });
  }
}

async function guardarPermisosRol(req, res) {
  const body = await parseBody(req);
  const permisosData = Array.isArray(body) ? body : (body.permisos || []);

  try {
    const operaciones = permisosData.map(p => ({
      id: p.id || cryptoRandom(),
      rol: p.rol,
      modulo: p.modulo,
      puede_ver: String(p.puedeVer || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
      puede_agregar: String(p.puedeAgregar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
      puede_editar: String(p.puedeEditar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
      puede_eliminar: String(p.puedeEliminar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
    }));

    for (const p of operaciones) {
      try {
        if (p.id && p.id !== '') {
          const { error } = await supabase.from('permisos').update(p).eq('id', p.id);
          if (error) {
            await supabase.from('permisos').insert(p);
          }
        } else {
          p.id = cryptoRandom();
          await supabase.from('permisos').insert(p);
        }
      } catch (err) {
        try {
          if (p.id) {
            await supabase.from('permisos').insert(p);
          }
        } catch (_) { /* ignore */ }
      }
    }

    return jsonResponse(res, 200, { ok: true, saved: operaciones.length });
  } catch (e) {
    console.error('guardarPermisosRol error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar permisos.' });
  }
}

function cryptoRandom() {
  try {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
