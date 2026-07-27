import { supabase, jsonResponse } from './_lib/supabase.js';

function extraerUltimos4(dui) {
  const limpio = String(dui || '').replace(/[^0-9]/g, '');
  if (limpio.length < 4) return '';
  return limpio.slice(-4);
}

function buscarEmpleadoPorDui(dui, empleados) {
  const limpio = String(dui || '').replace(/[^0-9]/g, '');
  const normalizado = limpio.length === 8 ? '0' + limpio : limpio;
  return (empleados || []).find(function(e) {
    const d = String(e.dui || '').replace(/[^0-9]/g, '');
    const dN = d.length === 8 ? '0' + d : d;
    return d === limpio || dN === normalizado || String(e.dui || '') === String(dui || '');
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Método no permitido.' });
  }

  const dui = String((req.query && req.query.dui) || '').trim();
  const ultimos4 = String((req.query && req.query.ultimos4) || '').trim();

  if (!dui || !ultimos4) {
    return jsonResponse(res, 400, { error: 'DUI y últimos 4 dígitos son requeridos.' });
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
      .select('id, nombres, apellidos, dui, codigo, activo')
      .eq('activo', 'TRUE');

    if (errEmp) throw errEmp;

    const empleado = buscarEmpleadoPorDui(dui, empleadosRaw);

    if (!empleado) {
      return jsonResponse(res, 404, { error: 'No se encontró un empleado activo con el DUI proporcionado.' });
    }

    if (extraerUltimos4(empleado.dui) !== ultimos4) {
      return jsonResponse(res, 403, { error: 'La verificación de los últimos 4 dígitos del DUI no coincide.' });
    }

    const qrTexto = String(empleado.dui || '').replace(/[^0-9]/g, '');
    const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(qrTexto) + '&size=600&bgcolor=ffffff&color=001ba0';

    return jsonResponse(res, 200, {
      evento: evento.nombre,
      empleado: {
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        dui: empleado.dui,
        codigo: empleado.codigo,
        qr_url: qrUrl
      }
    });

  } catch (error) {
    console.error('invitacion-publica error:', error);
    return jsonResponse(res, 500, { error: 'Error al consultar la invitación.' });
  }
}
