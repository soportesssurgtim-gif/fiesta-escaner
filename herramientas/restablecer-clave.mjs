/**
 * Restablece la contraseña de un usuario del sistema.
 *
 * Este proyecto NO usa Supabase Auth: las cuentas viven en la tabla `usuarios`
 * con la contraseña hasheada por bcrypt. Por eso el panel Authentication → Users
 * de Supabase aparece vacío, y por eso no se puede cambiar la clave editando la
 * fila a mano (habría que escribir el hash, no el texto).
 *
 * Uso:
 *   node herramientas/restablecer-clave.mjs --listar
 *   node herramientas/restablecer-clave.mjs --usuario "Soporte GTIM" --clave "MiClaveNueva123"
 *   node herramientas/restablecer-clave.mjs --correo soporte.ti@sansalvadorsur.gob.sv --clave "MiClaveNueva123"
 *
 * Toma las credenciales de configuracion.local.mjs, igual que el servidor local.
 */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const RONDAS_BCRYPT = 10;
const LARGO_MINIMO = 8;

/* ---------------------------------------------------------------- */

function leerArgumento(nombre) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice > -1 ? process.argv[indice + 1] : null;
}

function tieneBandera(nombre) {
  return process.argv.includes(`--${nombre}`);
}

async function conectar() {
  const archivo = join(RAIZ, 'configuracion.local.mjs');
  if (!existsSync(archivo)) {
    console.error('\n  Falta configuracion.local.mjs. Cópialo de la plantilla:\n');
    console.error('      copy configuracion.local.example.mjs configuracion.local.mjs\n');
    process.exit(1);
  }

  const { configuracion } = await import(pathToFileURL(archivo).href);
  return createClient(configuracion.supabaseUrl, configuracion.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** Muestra las cuentas existentes, con lo que hace falta para diagnosticar. */
async function listar(supabase) {
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('id, usuario, correo, rol, activo, configurado, password');
  if (error) throw error;

  const { data: roles } = await supabase.from('roles').select('id, nombre_rol');
  const nombrePorRol = new Map((roles || []).map((r) => [r.id, r.nombre_rol]));

  console.log(`\n  ${usuarios.length} cuenta(s) en la tabla usuarios:\n`);

  for (const cuenta of usuarios) {
    const rol = nombrePorRol.get(cuenta.rol) || (cuenta.rol ? 'rol desconocido' : 'SIN ROL');
    const hash = String(cuenta.password || '');
    // Distinguir bcrypt de un SHA-256 heredado importa: el segundo se migra
    // solo en el primer inicio de sesión.
    const tipo = hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')
      ? 'bcrypt'
      : (hash.length === 64 ? 'SHA-256 heredado' : 'formato desconocido');

    console.log(`    usuario   : ${cuenta.usuario}`);
    console.log(`    correo    : ${cuenta.correo || '(sin correo)'}`);
    console.log(`    rol       : ${rol}`);
    console.log(`    activo    : ${cuenta.activo}`);
    console.log(`    clave     : ${tipo}`);

    // Avisos de cosas que impedirían iniciar sesión aunque la clave sea correcta.
    if (String(cuenta.activo || '').toUpperCase() !== 'TRUE') {
      console.log(`    \x1b[31m⚠ activo no es TRUE: el login la rechaza\x1b[0m`);
    }
    if (!cuenta.rol) {
      console.log(`    \x1b[33m⚠ sin rol: entra pero no verá ningún módulo\x1b[0m`);
    } else if (!['ADMIN', 'ADMINISTRADOR'].includes(String(rol).toUpperCase())) {
      console.log(`    \x1b[33m  (rol no administrador: verá solo lo que permita la matriz)\x1b[0m`);
    }
    console.log('');
  }
}

/** Cambia la contraseña y comprueba que el hash resultante valide. */
async function restablecer(supabase, { usuario, correo, clave }) {
  if (clave.length < LARGO_MINIMO) {
    console.error(`\n  La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.\n`);
    process.exit(1);
  }

  // Buscamos con ilike para no depender de mayúsculas.
  const columna = usuario ? 'usuario' : 'correo';
  const valor = usuario || correo;

  const { data: cuentas, error: errorBusqueda } = await supabase
    .from('usuarios')
    .select('id, usuario, correo, rol, activo')
    .ilike(columna, valor);

  if (errorBusqueda) throw errorBusqueda;

  if (!cuentas || cuentas.length === 0) {
    console.error(`\n  No hay ninguna cuenta con ${columna} = "${valor}".`);
    console.error('  Usa --listar para ver las que existen.\n');
    process.exit(1);
  }
  if (cuentas.length > 1) {
    console.error(`\n  Hay ${cuentas.length} cuentas que coinciden. Afina la búsqueda.\n`);
    process.exit(1);
  }

  const cuenta = cuentas[0];
  const hash = await bcrypt.hash(clave, RONDAS_BCRYPT);

  const { error: errorGuardado } = await supabase
    .from('usuarios')
    .update({
      password: hash,
      // temp_pass en null: la contraseña ya no es temporal, la definió una
      // persona a propósito.
      temp_pass: null,
      configurado: 'TRUE',
      // Nos aseguramos de que la cuenta pueda entrar.
      activo: 'TRUE'
    })
    .eq('id', cuenta.id);

  if (errorGuardado) throw errorGuardado;

  // Comprobación real: releemos lo guardado y validamos contra bcrypt. Si esto
  // pasa, el login va a funcionar.
  const { data: verificacion } = await supabase
    .from('usuarios')
    .select('password')
    .eq('id', cuenta.id)
    .single();

  const valida = await bcrypt.compare(clave, verificacion.password);

  console.log('');
  console.log(`  Contraseña actualizada para \x1b[1m${cuenta.usuario}\x1b[0m`);
  console.log('');
  console.log(`    Verificación del hash : ${valida ? '\x1b[32mcorrecta\x1b[0m' : '\x1b[31mFALLÓ\x1b[0m'}`);
  console.log(`    Puedes entrar con     : ${cuenta.usuario}`);
  if (cuenta.correo) console.log(`                       o : ${cuenta.correo}`);
  console.log('');

  if (!cuenta.rol) {
    console.log('  \x1b[33m⚠ Esta cuenta no tiene rol asignado. Va a poder entrar, pero no');
    console.log('    verá ningún módulo en el menú. Asígnale un rol desde la tabla');
    console.log('    `usuarios` (columna `rol`) apuntando a un id de la tabla `roles`.\x1b[0m');
    console.log('');
  }

  if (!valida) process.exit(1);
}

/* ---------------------------------------------------------------- */

async function principal() {
  const supabase = await conectar();

  if (tieneBandera('listar')) {
    await listar(supabase);
    return;
  }

  const usuario = leerArgumento('usuario');
  const correo = leerArgumento('correo');
  const clave = leerArgumento('clave');

  if ((!usuario && !correo) || !clave) {
    console.log('\n  Restablecer la contraseña de una cuenta del sistema.\n');
    console.log('    node herramientas/restablecer-clave.mjs --listar');
    console.log('    node herramientas/restablecer-clave.mjs --usuario "Soporte GTIM" --clave "NuevaClave123"');
    console.log('    node herramientas/restablecer-clave.mjs --correo alguien@dominio.sv --clave "NuevaClave123"\n');
    process.exit(1);
  }

  await restablecer(supabase, { usuario, correo, clave });
}

principal().catch((fallo) => {
  console.error('\n  Error:', fallo.message || fallo, '\n');
  process.exit(1);
});
