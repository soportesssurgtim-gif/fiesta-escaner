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
    const action = (req.query && req.query.action) || '';
    if (action === 'tarjetas') {
      try {
        const { data } = await supabase.from('empleados').select('*').eq('activo', 'TRUE').order('apellidos');
        return jsonResponse(res, 200, data || []);
      } catch (e) {
        return jsonResponse(res, 500, { error: 'Error al listar empleados.' });
      }
    }
    if (action === 'exportar-csv') {
      return exportarCsv(req, res);
    }
    try {
      const { data } = await supabase.from('empleados').select('*').order('apellidos');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar empleados.' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const action = (req.query && req.query.action) || '';
    if (action === 'importar-csv') {
      if (!isAdmin(sesion.rol)) {
        return jsonResponse(res, 403, { error: 'No tienes permisos de administrador.' });
      }
      return importarCsv(req, res);
    }
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

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function exportarCsv(req, res) {
  try {
    const { data } = await supabase.from('empleados').select('id, distrito, dpto, cargo, nombres, apellidos, fecha_nacimiento, telefono, correo, dui, activo').order('apellidos');
    const filas = data || [];
    const cabecera = ['id', 'distrito', 'dpto', 'cargo', 'nombres', 'apellidos', 'fecha_nacimiento', 'telefono', 'correo', 'dui', 'activo'];
    const csv = [cabecera.join(',')];
    for (const row of filas) {
      csv.push([row.id, row.distrito || '', row.dpto || '', row.cargo || '', row.nombres || '', row.apellidos || '', row.fecha_nacimiento || '', row.telefono || '', row.correo || '', row.dui || '', row.activo || ''].map(csvEscape).join(','));
    }
    const contenido = csv.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="empleados.csv"');
    return res.status(200).send(contenido);
  } catch (e) {
    return jsonResponse(res, 500, { error: 'Error al exportar empleados.' });
  }
}

async function importarCsv(req, res) {
  const body = await parseBody(req);
  const csvTexto = (body && body.csv) ? String(body.csv).trim() : '';
  if (!csvTexto) {
    return jsonResponse(res, 400, { error: 'No se recibió contenido CSV.' });
  }
  try {
    const lineas = csvTexto.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    const resultados = { insertados: 0, actualizados: 0, errores: [] };
    for (let i = 0; i < lineas.length; i++) {
      if (i === 0) continue; // saltar cabecera
      const cols = lineas[i].split(',').map(function(c) { return c.replace(/^"|"$/g, '').replace(/""/g, '"'); });
      // Esperado: distrito,dpto,cargo,nombres,apellidos,fecha_nacimiento,telefono,correo,dui,activo
      const distrito = (cols[0] || '').trim();
      const dpto = (cols[1] || '').trim() || null;
      const cargo = (cols[2] || '').trim();
      const nombres = (cols[3] || '').trim();
      const apellidos = (cols[4] || '').trim();
      const fecha_nacimiento = (cols[5] || '').trim();
      const telefono = (cols[6] || '').trim();
      const correo = (cols[7] || '').trim();
      const dui = (cols[8] || '').trim();
      const activo = (cols[9] || 'TRUE').trim() || 'TRUE';
      if (!nombres || !apellidos || !dui) {
        resultados.errores.push('Fila ' + (i + 1) + ': nombres, apellidos y DUI son requeridos');
        continue;
      }
      const { data: existente } = await supabase.from('empleados').select('id').eq('dui', dui).maybeSingle();
      if (existente && existente.id) {
        await supabase.from('empleados').update({ distrito, dpto, cargo, nombres, apellidos, fecha_nacimiento, telefono, correo, activo }).eq('id', existente.id);
        resultados.actualizados += 1;
      } else {
        await supabase.from('empleados').insert({ distrito, dpto, cargo, nombres, apellidos, fecha_nacimiento, telefono, correo, dui, activo });
        resultados.insertados += 1;
      }
    }
    return jsonResponse(res, 200, resultados);
  } catch (e) {
    console.error('importarCsv error:', e);
    return jsonResponse(res, 500, { error: 'Error al importar empleados.' });
  }
}
