import bcrypt from 'bcryptjs';
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
      const { data: empleados } = await supabase.from('empleados').select('id, nombres, apellidos');
      const { data: roles } = await supabase.from('roles').select('id, nombre_rol');
      const { data: usuarios } = await supabase.from('usuarios').select('id, empleado, telefono, correo, usuario, rol, activo');

      const empMap = new Map((empleados || []).map(e => [e.id, (e.nombres + ' ' + e.apellidos).trim()]));
      const rolMap = new Map((roles || []).map(r => [r.id, r.nombre_rol]));

      const lista = (usuarios || []).map(u => ({
        id: u.id,
        empleadoId: u.empleado || '',
        empleadoNombre: empMap.get(u.empleado) || 'Sin Empleado Vinculado',
        telefono: u.telefono || '',
        correo: u.correo || '',
        usuario: u.usuario || '',
        rolId: u.rol || '',
        rolNombre: rolMap.get(u.rol) || 'Sin Rol',
        activo: u.activo || 'TRUE'
      }));

      return jsonResponse(res, 200, lista);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar usuarios.' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isAdmin(sesion.rol)) {
      return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
    }
    return guardarUsuario(req, res);
  }

  return jsonResponse(res, 405, { error: 'Método no permitido.' });
}

async function guardarUsuario(req, res) {
  const body = await parseBody(req);

  if (!body.id && !body.passwordPlano) {
    return jsonResponse(res, 400, { error: 'La contraseña es requerida para crear un usuario.' });
  }

  if (!body.usuario) {
    return jsonResponse(res, 400, { error: 'El nombre de usuario es requerido.' });
  }

  const data = {
    empleado: body.empleado || null,
    telefono: body.telefono || '',
    correo: body.correo || '',
    usuario: body.usuario,
    rol: body.rol || null,
    activo: body.activo || 'TRUE'
  };

  try {
    if (body.id) {
      const updateData = { ...data };
      if (body.passwordPlano) {
        updateData.password = await bcrypt.hash(body.passwordPlano, 10);
        updateData.temp_pass = body.passwordPlano;
        updateData.configurado = 'FALSE';
      }
      const { error } = await supabase.from('usuarios').update(updateData).eq('id', body.id);
      if (error) {
        if (error.code === '23505') return jsonResponse(res, 400, { error: 'El usuario ya existe.' });
        throw error;
      }
      return jsonResponse(res, 200, { ...data, id: body.id });
    } else {
      const hashed = await bcrypt.hash(body.passwordPlano || 'Admin123#', 10);
      const insertData = {
        ...data,
        password: hashed,
        temp_pass: body.passwordPlano || 'Admin123#',
        configurado: 'FALSE'
      };
      const { data: inserted, error } = await supabase.from('usuarios').insert(insertData).select().maybeSingle();
      if (error) {
        if (error.code === '23505') return jsonResponse(res, 400, { error: 'El usuario ya existe.' });
        throw error;
      }
      return jsonResponse(res, 200, inserted || { ...data });
    }
  } catch (e) {
    console.error('guardarUsuario error:', e);
    return jsonResponse(res, 500, { error: e.message || 'Error al guardar el usuario.' });
  }
}
