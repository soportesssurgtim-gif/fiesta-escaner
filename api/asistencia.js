import { supabase, requireAuth, getSession, jsonResponse, parseBody } from './_lib/supabase.js';

function buscarEmpleadoPorIdentificador(identificador, empleadosRaw) {
  const valorCrudo = String(identificador || '').trim();
  if (!valorCrudo) return null;
  const soloNumeros = /^[0-9]+$/.test(valorCrudo);
  const valorLimpio = soloNumeros ? (valorCrudo.replace(/^0+/, '') || '0') : valorCrudo;
  const lista = empleadosRaw || [];

  if (soloNumeros) {
    const idNum = parseInt(valorLimpio, 10);
    const porId = lista.find(function(e) { return Number(e.id) === idNum; });
    if (porId) return porId;
  }

  const duiNormalizado = valorLimpio.length === 8 ? '0' + valorLimpio : valorLimpio;
  const porDui = lista.find(function(e) {
    const d = String(e.dui || '').replace(/[^0-9]/g, '');
    const dN = d.length === 8 ? '0' + d : d;
    const dLimpio = d.replace(/^0+/, '') || '0';
    return d === valorLimpio || dN === duiNormalizado || dLimpio === valorLimpio || String(e.dui || '') === valorCrudo;
  });
  if (porDui) return porDui;

  const porCodigo = lista.find(function(e) {
    const c = String(e.codigo || '').trim();
    return c && (c === valorCrudo || c === valorLimpio || c === String(identificador).trim());
  });
  if (porCodigo) return porCodigo;

  return null;
}

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

  if (req.method === 'POST' && action === 'registrar') {
    return registrarAsistencia(req, res, sesion);
  }

  if (req.method === 'POST' && action === 'sincronizar-pendientes') {
    return sincronizarPendientes(req, res, sesion);
  }

  if (req.method === 'GET' && action === 'diagnostico') {
    return diagnosticoAsistencia(req, res);
  }

  if (req.method === 'GET') {
    return listarAsistencias(req, res);
  }

  return jsonResponse(res, 404, { error: 'Endpoint no encontrado.' });
}

async function registrarAsistencia(req, res, sesion) {
  const body = await parseBody(req);
  const { dui, dispositivo, id_cliente } = body;
  const identificador = String(dui || '').trim();

  if (!identificador) {
    return jsonResponse(res, 400, { error: 'DUI, código o ID inválido.' });
  }

  try {
    const { data: evento, error: errEvt } = await supabase
      .from('eventos')
      .select('*')
      .eq('activo', 'TRUE')
      .limit(1)
      .maybeSingle();

    if (errEvt || !evento) {
      return jsonResponse(res, 400, { error: 'No hay un evento activo configurado.' });
    }

    const { data: empleadosRaw, error: errEmp } = await supabase
      .from('empleados')
      .select('*')
      .eq('activo', 'TRUE');

    if (errEmp) throw errEmp;

    const empleado = buscarEmpleadoPorIdentificador(identificador, empleadosRaw);

    if (!empleado) {
      return jsonResponse(res, 404, { error: 'No se encontró un empleado activo con el DUI, código o ID: ' + identificador });
    }

    // Si viene id_cliente, verificar duplicado por cliente
    if (id_cliente) {
      const { data: existenteCliente } = await supabase
        .from('asistencias')
        .select('*')
        .eq('evento', evento.id)
        .eq('empleado', empleado.id)
        .or('id_cliente.eq.' + id_cliente + ',dispositivo.eq.' + (dispositivo || 'offline'))
        .maybeSingle();

      if (existenteCliente) {
        return jsonResponse(res, 200, {
          duplicado: true,
          empleado: { nombres: empleado.nombres, apellidos: empleado.apellidos },
          mensaje: '⚠️ Asistencia YA registrada anteriormente (sincronizada).'
        });
      }
    }

    // Verificar duplicado normal (empleado + evento)
    const { data: existente } = await supabase
      .from('asistencias')
      .select('*')
      .eq('evento', evento.id)
      .eq('empleado', empleado.id)
      .maybeSingle();

    if (existente) {
      return jsonResponse(res, 200, {
        duplicado: true,
        empleado: { nombres: empleado.nombres, apellidos: empleado.apellidos },
        mensaje: '⚠️ Asistencia YA registrada anteriormente.'
      });
    }

    const { data: asistencia, error: errIns } = await supabase
      .from('asistencias')
      .insert({
        evento: evento.id,
        empleado: empleado.id,
        escaneado_por: sesion.usuarioId,
        dispositivo: dispositivo || 'desconocido',
        fuente: 'qr',
        id_cliente: id_cliente || null
      })
      .select()
      .maybeSingle();

    if (errIns) {
      if (String(errIns.message || '').includes('duplicate') || errIns.code === '23505') {
        return jsonResponse(res, 200, {
          duplicado: true,
          empleado: { nombres: empleado.nombres, apellidos: empleado.apellidos },
          mensaje: '⚠️ Asistencia YA registrada anteriormente.'
        });
      }
      throw errIns;
    }

    return jsonResponse(res, 200, {
      duplicado: false,
      empleado: { nombres: empleado.nombres, apellidos: empleado.apellidos, dpto: empleado.dpto },
      mensaje: '✅ Asistencia registrada correctamente.'
    });

  } catch (error) {
    console.error('registrarAsistencia error:', error);
    return jsonResponse(res, 500, { error: 'Error al registrar asistencia.' });
  }
}

async function sincronizarPendientes(req, res, sesion) {
  const body = await parseBody(req);
  const registros = Array.isArray(body.registros) ? body.registros : [];

  if (registros.length === 0) {
    return jsonResponse(res, 400, { error: 'No hay registros para sincronizar.' });
  }

  const resultados = { sincronizados: 0, duplicados: 0, errores: 0, detalle: [] };

  for (const registro of registros) {
    try {
      const { dui, dispositivo, id_cliente } = registro;
      const identificador = String(dui || '').trim();

      if (!identificador) {
        resultados.errores++;
        resultados.detalle.push({ id_cliente, estado: 'error', mensaje: 'Identificador vacío' });
        continue;
      }

      const { data: evento } = await supabase
        .from('eventos')
        .select('*')
        .eq('activo', 'TRUE')
        .limit(1)
        .maybeSingle();

      if (!evento) {
        resultados.errores++;
        resultados.detalle.push({ id_cliente, estado: 'error', mensaje: 'No hay evento activo' });
        continue;
      }

      const { data: empleadosRaw } = await supabase
        .from('empleados')
        .select('*')
        .eq('activo', 'TRUE');

      const empleado = buscarEmpleadoPorIdentificador(identificador, empleadosRaw);

      if (!empleado) {
        resultados.errores++;
        resultados.detalle.push({ id_cliente, estado: 'error', mensaje: 'Empleado no encontrado (' + identificador + ')' });
        continue;
      }

      // Verificar duplicado
      const { data: existente } = await supabase
        .from('asistencias')
        .select('*')
        .eq('evento', evento.id)
        .eq('empleado', empleado.id)
        .maybeSingle();

      if (existente) {
        resultados.duplicados++;
        resultados.detalle.push({ id_cliente, estado: 'duplicado', mensaje: 'Ya registrado' });
        continue;
      }

      // Insertar
      const { error: errIns } = await supabase
        .from('asistencias')
        .insert({
          evento: evento.id,
          empleado: empleado.id,
          escaneado_por: sesion.usuarioId,
          dispositivo: dispositivo || 'offline-sync',
          fuente: 'qr',
          id_cliente: id_cliente || null
        });

      if (errIns) {
        if (String(errIns.message || '').includes('duplicate') || errIns.code === '23505') {
          resultados.duplicados++;
          resultados.detalle.push({ id_cliente, estado: 'duplicado', mensaje: 'Ya registrado (DB unique)' });
        } else {
          throw errIns;
        }
      } else {
        resultados.sincronizados++;
        resultados.detalle.push({ id_cliente, estado: 'sincronizado', mensaje: 'OK' });
      }
    } catch (e) {
      resultados.errores++;
      resultados.detalle.push({ id_cliente: registro.id_cliente, estado: 'error', mensaje: e.message || 'Error' });
    }
  }

  return jsonResponse(res, 200, resultados);
}

async function listarAsistencias(req, res) {
  try {
    const { data: asistenciasRaw } = await supabase
      .from('asistencias')
      .select('*, empleado!inner(nombres, apellidos, dui), eventos(nombre)')
      .order('fecha_hora_asistencia', { ascending: false })
      .limit(500);

    const asistencias = (asistenciasRaw || []).map(a => ({
      id: a.id,
      fechaHora: a.fecha_hora_asistencia ? String(a.fecha_hora_asistencia) : '',
      empleadoNombre: a.empleado ? (a.empleado.nombres + ' ' + a.empleado.apellidos) : 'Desconocido',
      dui: a.empleado?.dui || 'N/A',
      fuente: a.fuente || 'qr',
      eventoNombre: a.eventos?.nombre || ''
    }));

    return jsonResponse(res, 200, { asistencias, resumen: { total: asistencias.length } });
  } catch (e) {
    console.error('listarAsistencias error:', e);
    return jsonResponse(res, 500, { error: 'Error al listar asistencias.' });
  }
}

async function diagnosticoAsistencia(req, res) {
  const inicio = Date.now();
  const alertas = [];
  try {
    const { data: eventos } = await supabase.from('eventos').select('*').eq('activo', 'TRUE').limit(1);
    const activo = (eventos || [])[0];
    if (!activo) alertas.push('No hay ningún evento activo configurado.');

    const { count: empleadosActivos } = await supabase
      .from('empleados')
      .select('*', { count: 'exact', head: true })
      .eq('activo', 'TRUE');

    if (!empleadosActivos) alertas.push('No hay empleados activos en el catálogo.');

    let asistentesEvento = 0;
    if (activo) {
      const { count: cnt } = await supabase
        .from('asistencias')
        .select('*', { count: 'exact', head: true })
        .eq('evento', activo.id);
      asistentesEvento = cnt || 0;
    }

    return jsonResponse(res, 200, {
      ok: alertas.length === 0,
      eventoActivo: activo ? activo.nombre : null,
      empleadosActivos: empleadosActivos || 0,
      asistentesRegistrados: asistentesEvento,
      alertas,
      latenciaMs: Date.now() - inicio
    });
  } catch (e) {
    return jsonResponse(res, 200, {
      ok: false,
      alertas: [e.message || String(e)],
      latenciaMs: Date.now() - inicio
    });
  }
}
