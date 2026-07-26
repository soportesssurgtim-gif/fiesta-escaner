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
    const action = (req.query && req.query.action) || '';
    if (action === 'exportar-csv') {
      return exportarCsv(req, res);
    }
    try {
      const { data } = await supabase.from('dpto').select('*').order('nombre_dpto');
      return jsonResponse(res, 200, data || []);
    } catch (e) {
      return jsonResponse(res, 500, { error: 'Error al listar departamentos.' });
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

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function exportarCsv(req, res) {
  try {
    const { data } = await supabase.from('dpto').select('id, cod_dpto, nombre_dpto, activo').order('nombre_dpto');
    const filas = data || [];
    const cabecera = ['id', 'cod_dpto', 'nombre_dpto', 'activo'];
    const csv = [cabecera.join(',')];
    for (const row of filas) {
      csv.push([row.id, row.cod_dpto || '', row.nombre_dpto || '', row.activo || ''].map(csvEscape).join(','));
    }
    const contenido = csv.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="departamentos.csv"');
    return res.status(200).send(contenido);
  } catch (e) {
    return jsonResponse(res, 500, { error: 'Error al exportar departamentos.' });
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
      // Esperado: cod_dpto,nombre_dpto,activo
      const cod_dpto = (cols[0] || '').trim();
      const nombre_dpto = (cols[1] || '').trim();
      const activo = (cols[2] || 'TRUE').trim() || 'TRUE';
      if (!nombre_dpto) {
        resultados.errores.push('Fila ' + (i + 1) + ': nombre_dpto vacío');
        continue;
      }
      const { data: existente } = await supabase.from('dpto').select('id').eq('nombre_dpto', nombre_dpto).maybeSingle();
      if (existente && existente.id) {
        await supabase.from('dpto').update({ cod_dpto: cod_dpto || null, activo }).eq('id', existente.id);
        resultados.actualizados += 1;
      } else {
        await supabase.from('dpto').insert({ cod_dpto: cod_dpto || null, nombre_dpto, activo });
        resultados.insertados += 1;
      }
    }
    return jsonResponse(res, 200, resultados);
  } catch (e) {
    console.error('importarCsv error:', e);
    return jsonResponse(res, 500, { error: 'Error al importar departamentos.' });
  }
}
