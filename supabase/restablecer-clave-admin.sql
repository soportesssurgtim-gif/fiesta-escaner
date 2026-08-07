-- =====================================================================
-- Restablecer la contraseña del usuario administrador
-- =====================================================================
--
-- Se ejecuta en: Supabase → SQL Editor → pegar → Run
--
-- POR QUÉ HACE FALTA ESTE SCRIPT Y NO UN UPDATE NORMAL
--
-- La columna `usuarios.password` guarda un hash de bcrypt, no la contraseña.
-- Si escribes el texto directo con un UPDATE, el login va a comparar bcrypt
-- contra texto plano y siempre va a fallar.
--
-- pgcrypto resuelve esto: `crypt(clave, gen_salt('bf', 10))` genera un hash
-- con el mismo formato ($2a$10$...) que produce bcryptjs en el backend, así
-- que son compatibles.
--
-- NOTA: este proyecto NO usa Supabase Auth. El panel Authentication → Users
-- está vacío a propósito. Las cuentas viven en la tabla `usuarios`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Asegurar pgcrypto
-- ---------------------------------------------------------------------
-- En Supabase suele venir instalado en el esquema `extensions`.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ---------------------------------------------------------------------
-- 2. Ver qué cuentas existen (opcional, para confirmar a cuál apuntar)
-- ---------------------------------------------------------------------
SELECT
  u.usuario,
  u.correo,
  r.nombre_rol AS rol,
  u.activo,
  u.configurado,
  CASE
    WHEN u.password LIKE '$2%' THEN 'bcrypt'
    WHEN length(u.password) = 64 THEN 'SHA-256 heredado'
    ELSE 'formato desconocido'
  END AS tipo_de_clave
FROM usuarios u
LEFT JOIN roles r ON r.id = u.rol
ORDER BY u.usuario;


-- ---------------------------------------------------------------------
-- 3. Restablecer la contraseña
-- ---------------------------------------------------------------------
-- CAMBIA los dos valores de abajo antes de ejecutar:
--   · la contraseña temporal
--   · el correo (o el usuario) de la cuenta
--
-- La contraseña debe tener al menos 8 caracteres: el backend rechaza las
-- más cortas al guardarlas desde la interfaz.

UPDATE usuarios
SET
  password    = extensions.crypt('Temporal2026#', extensions.gen_salt('bf', 10)),
  temp_pass   = 'Temporal2026#',   -- queda visible para quien administre
  configurado = 'FALSE',           -- marca que sigue siendo temporal
  activo      = 'TRUE'             -- por si la cuenta estaba desactivada
WHERE lower(correo) = lower('soporte.ti@sansalvadorsur.gob.sv');

-- Si prefieres apuntar por nombre de usuario, usa esta condición en su lugar:
--   WHERE lower(usuario) = lower('Soporte GTIM');


-- ---------------------------------------------------------------------
-- 4. Verificar que quedó bien
-- ---------------------------------------------------------------------
-- `clave_valida` tiene que salir true. Si sale true, el login va a funcionar:
-- es exactamente la misma comprobación que hace bcrypt en el backend.

SELECT
  u.usuario,
  u.correo,
  r.nombre_rol AS rol,
  u.activo,
  u.configurado,
  (u.password = extensions.crypt('Temporal2026#', u.password)) AS clave_valida
FROM usuarios u
LEFT JOIN roles r ON r.id = u.rol
WHERE lower(u.correo) = lower('soporte.ti@sansalvadorsur.gob.sv');


-- =====================================================================
-- DESPUÉS DE ENTRAR
-- =====================================================================
--
-- Cambia la contraseña desde la propia aplicación:
--
--   Menú de usuario (arriba a la derecha) → Cambiar mi contraseña
--
-- O, si la cuenta es administradora, también desde:
--
--   Usuarios y roles → editar la cuenta → escribir la contraseña nueva
--
-- Al hacerlo, `temp_pass` se limpia y `configurado` pasa a TRUE, con lo que
-- desaparece el aviso de "contraseña temporal".
-- =====================================================================
