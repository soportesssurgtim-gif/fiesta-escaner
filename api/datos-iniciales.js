import { supabase, requireAuth, getSession, jsonResponse } from './_lib/supabase.js';

export default async function handler(req, res) {
  const action = (req.query && req.query.action) || '';

  if (req.method === 'GET' && action === 'salud') {
    return jsonResponse(res, 200, { ok: true, ts: new Date().toISOString() });
  }

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Método no permitido' });
  }

  const auth = requireAuth(req);
  if (auth.error) {
    return jsonResponse(res, auth.status || 401, { error: auth.error });
  }

  const sesion = await getSession(auth.token);
  if (!sesion) {
    return jsonResponse(res, 401, { error: 'Sesión expirada, inicia sesión nuevamente.' });
  }

  try {
    const [emp, dpto, prm, rls, evts, srt, perm, usrRaw, asistenciasRaw] = await Promise.all([
      supabase.from('empleados').select('id, distrito, dpto, cargo, nombres, apellidos, fecha_nacimiento, telefono, correo, dui, codigo, activo').order('apellidos'),
      supabase.from('dpto').select('*').order('nombre_dpto'),
      supabase.from('premios').select('*').order('nombre'),
      supabase.from('roles').select('*').order('nombre_rol'),
      supabase.from('eventos').select('*').order('created_at', { ascending: false }),
      supabase.from('sorteos').select('*').order('fecha_hora_sorteo', { ascending: false }),
      supabase.from('permisos').select('*'),
      supabase.from('usuarios').select('*'),
      supabase.from('asistencias').select('*').order('fecha_hora_asistencia', { ascending: false })
    ]);

    const empleados = emp.data || [];
    const departamentos = dpto.data || [];
    const premios = prm.data || [];
    const roles = rls.data || [];
    const eventos = evts.data || [];
    const sorteos = srt.data || [];
    const permisos = perm.data || [];

    const rolMap = new Map(roles.map(r => [r.id, r.nombre_rol]));
    const empMap = new Map(empleados.map(e => [e.id, (e.nombres + ' ' + e.apellidos).trim()]));
    const empDuiMap = new Map(empleados.map(e => [e.id, e.dui || '']));

    const usuarios = (usrRaw.data || []).map(u => ({
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

    const asistencias = (asistenciasRaw.data || []).map(a => ({
      id: a.id,
      fechaHora: a.fecha_hora_asistencia ? String(a.fecha_hora_asistencia) : '',
      empleadoNombre: empMap.get(a.empleado) || 'Desconocido',
      dui: empDuiMap.get(a.empleado) || 'N/A',
      fuente: a.fuente || 'qr'
    }));

    return jsonResponse(res, 200, {
      empleados,
      departamentos,
      premios,
      roles,
      eventos,
      sorteos,
      permisos,
      usuarios,
      asistencias,
      resumen: { total: asistencias.length }
    });

  } catch (error) {
    console.error('datos-iniciales error:', error);
    return jsonResponse(res, 500, { error: 'Error al cargar datos.' });
  }
}
