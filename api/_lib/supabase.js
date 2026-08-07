/**
 * Cliente de Supabase para el backend.
 *
 * Usa la llave service_role, que salta las políticas RLS. Eso es intencional:
 * toda la autorización real la hace este backend (ver seguridad.js). Por eso
 * mismo esta llave NUNCA debe terminar en el navegador.
 */

import { createClient } from '@supabase/supabase-js';

const URL_SUPABASE = process.env.SUPABASE_URL;
const LLAVE_SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Si faltan las variables preferimos avisar fuerte en el log en vez de fallar
// con un error críptico de red en la primera consulta.
if (!URL_SUPABASE || !LLAVE_SERVICIO) {
  console.warn(
    '[supabase] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. ' +
    'Configúralas en Vercel → Settings → Environment Variables.'
  );
}

export const supabase = createClient(
  URL_SUPABASE || 'http://localhost',
  LLAVE_SERVICIO || 'llave-inexistente',
  {
    auth: {
      // Somos un backend sin estado: no hay sesión de Supabase que refrescar ni
      // que persistir entre invocaciones de la función serverless.
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/** Nos dice si el entorno quedó bien configurado; lo usa el diagnóstico. */
export function hayConexionConfigurada() {
  return Boolean(URL_SUPABASE && LLAVE_SERVICIO);
}
