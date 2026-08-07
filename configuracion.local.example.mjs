/**
 * Plantilla de configuración local.
 *
 * Cópiala como `configuracion.local.js` y completa tus datos:
 *
 *     copy configuracion.local.example.js configuracion.local.js
 *
 * `configuracion.local.js` está en .gitignore y no se sube nunca.
 * En producción no se usa: Vercel inyecta las variables de entorno.
 *
 * Este archivo (el .example) SÍ está versionado, así que no pongas
 * credenciales reales aquí.
 */

export const configuracion = {
  // Supabase → Settings → API → Project URL
  supabaseUrl: 'https://tu-proyecto.supabase.co',

  /*
   * Supabase → Settings → API → service_role (secret)
   *
   * Esta llave salta todas las políticas RLS: con ella se lee y escribe la base
   * completa. Solo puede vivir en el servidor.
   *
   * En este proyecto el navegador NUNCA habla directo con Supabase (las
   * políticas RLS deniegan todo a `anon`), así que la llave se queda del lado
   * del backend y por eso hace falta levantarlo con `npm run dev`.
   */
  supabaseServiceRoleKey: 'pega-aqui-tu-llave-service-role'
};
