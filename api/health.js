import { supabase, jsonResponse } from './_lib/supabase.js';

export default async function handler(req, res) {
  const inicio = Date.now();
  try {
    const tablasNombres = ['roles', 'dpto', 'empleados', 'usuarios', 'eventos', 'premios', 'sorteos', 'asistencias', 'ganadores', 'permisos'];
    const tablas = [];

    for (const name of tablasNombres) {
      try {
        const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
        if (error) {
          tablas.push({ tabla: name, filas: -1, error: error.message });
        } else {
          tablas.push({ tabla: name, filas: count || 0 });
        }
      } catch (e) {
        tablas.push({ tabla: name, filas: -1, error: String(e.message || e) });
      }
    }

    return jsonResponse(res, 200, {
      ok: true,
      latenciaMs: Date.now() - inicio,
      tablas,
      fecha: new Date().toISOString()
    });
  } catch (e) {
    return jsonResponse(res, 200, {
      ok: false,
      latenciaMs: Date.now() - inicio,
      error: e.message || String(e),
      fecha: new Date().toISOString()
    });
  }
}
