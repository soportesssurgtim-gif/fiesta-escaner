import bcrypt from 'bcryptjs';
import { supabase, sha256, createSession, deleteSession, requireAuth, jsonResponse, parseBody } from './_lib/supabase.js';

export default async function handler(req, res) {
  const body = await parseBody(req);
  const tieneCredenciales = body.usuario && body.password;

  if (tieneCredenciales) {
    return await procesarLogin(req, res, body);
  }

  return await procesarLogout(req, res, body);
}

async function procesarLogin(req, res, body) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Método no permitido' });
  }

  const { usuario, password } = body;

  if (!usuario || !password) {
    return jsonResponse(res, 400, { error: 'Por favor, ingresa tu usuario o correo y contraseña.' });
  }

  try {
    const busquedaLimpia = String(usuario).trim().toLowerCase();

    const { data: usuariosRaw, error: errUser } = await supabase
      .from('usuarios')
      .select('*, roles(id, nombre_rol), empleado(id, nombres, apellidos)')
      .or(`usuario.ilike.${busquedaLimpia},correo.ilike.${busquedaLimpia}`)
      .eq('activo', 'TRUE')
      .limit(1);

    if (errUser || !usuariosRaw || usuariosRaw.length === 0) {
      return jsonResponse(res, 401, { error: 'El usuario o correo no existe en el sistema.' });
    }

    const cuenta = usuariosRaw[0];
    const passwordValido = await bcrypt.compare(password, cuenta.password);

    if (!passwordValido) {
      const legacyHash = sha256(password.trim());
      if (legacyHash !== cuenta.password) {
        return jsonResponse(res, 401, { error: 'La contraseña ingresada es incorrecta.' });
      }
      const hashed = await bcrypt.hash(password, 10);
      await supabase.from('usuarios').update({ password: hashed }).eq('id', cuenta.id);
    }

    let nombreMostrar = cuenta.correo || cuenta.usuario;
    if (cuenta.empleado && cuenta.empleado.nombres) {
      nombreMostrar = (cuenta.empleado.nombres + ' ' + (cuenta.empleado.apellidos || '')).trim();
    }

    const rolNombre = cuenta.roles?.nombre_rol || null;

    const sesionData = {
      usuarioId: cuenta.id,
      empleadoId: cuenta.empleado?.id || null,
      nombreMostrar,
      correo: cuenta.correo,
      usuario: cuenta.usuario,
      rol: rolNombre,
      rolId: cuenta.rol || null
    };

    const token = await createSession(sesionData);

    const datosIniciales = await obtenerBundleInicial();

    return jsonResponse(res, 200, {
      token,
      usuario: cuenta.usuario,
      correo: cuenta.correo,
      nombreMostrar,
      rol: rolNombre,
      datosIniciales
    });

  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse(res, 500, { error: 'Error al iniciar sesión.' });
  }
}

async function procesarLogout(req, res, body) {
  const auth = requireAuth(req);
  if (auth.error) {
    return jsonResponse(res, auth.status || 401, { error: auth.error });
  }

  try {
    await deleteSession(auth.token);
    return jsonResponse(res, 200, { ok: true });
  } catch (e) {
    console.error('Logout error:', e);
    return jsonResponse(res, 200, { ok: true });
  }
}

async function obtenerBundleInicial() {
  try {
    const [emp, dpto, prm, rls, evts, srt, perm, usrRaw, ast] = await Promise.all([
      supabase.from('empleados').select('*').order('apellidos'),
      supabase.from('dpto').select('*').order('nombre_dpto'),
      supabase.from('premios').select('*').order('nombre'),
      supabase.from('roles').select('*').order('nombre_rol'),
      supabase.from('eventos').select('*').order('created_at', { ascending: false }),
      supabase.from('sorteos').select('*').order('fecha_hora_sorteo', { ascending: false }),
      supabase.from('permisos').select('*')
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

    const { data: usuariosList } = usrRaw || await supabase.from('usuarios').select('*');
    const usuarios = (usuariosList || []).map(u => ({
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

    const { data: asistenciasRaw } = ast || await supabase
      .from('asistencias')
      .select('*')
      .order('fecha_hora_asistencia', { ascending: false });

    const asistencias = (asistenciasRaw || []).map(a => ({
      id: a.id,
      fechaHora: a.fecha_hora_asistencia ? String(a.fecha_hora_asistencia) : '',
      empleadoNombre: empMap.get(a.empleado) || 'Desconocido',
      dui: empDuiMap.get(a.empleado) || 'N/A',
      fuente: a.fuente || 'qr'
    }));

    return {
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
    };
  } catch (e) {
    console.error('obtenerBundleInicial error:', e);
    return null;
  }
}
