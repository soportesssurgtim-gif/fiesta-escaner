-- =====================================================================
-- 004 - Descripción de los roles
-- =====================================================================
--
-- La pantalla de Roles y Permisos muestra cada rol como una tarjeta con su
-- nombre y una línea que explica para qué sirve. Sin esto, la tarjeta queda
-- con el puro nombre y hay que adivinar qué hace "LOGISTICA".
--
-- Idempotente: se puede correr las veces que haga falta.
--
-- Aplicar en: Supabase → SQL Editor → pegar → Run
-- =====================================================================

ALTER TABLE roles ADD COLUMN IF NOT EXISTS descripcion TEXT;


-- Descripciones para los roles que ya existen, solo si están vacías.
-- El WHERE evita pisar lo que alguien haya escrito a mano.
UPDATE roles SET descripcion = 'Acceso total al sistema, sin restricciones.'
WHERE upper(nombre_rol) IN ('ADMIN', 'ADMINISTRADOR')
  AND (descripcion IS NULL OR descripcion = '');

UPDATE roles SET descripcion = 'Operación del evento: escáner, asistencias y sorteos.'
WHERE upper(nombre_rol) = 'LOGISTICA'
  AND (descripcion IS NULL OR descripcion = '');

UPDATE roles SET descripcion = 'Solo consulta de información, sin poder modificar.'
WHERE upper(nombre_rol) IN ('LECTOR', 'INVITADO')
  AND (descripcion IS NULL OR descripcion = '');

UPDATE roles SET descripcion = 'Personal sin acceso al sistema administrativo.'
WHERE upper(nombre_rol) = 'EMPLEADO'
  AND (descripcion IS NULL OR descripcion = '');


-- Verificación: deberían salir todos los roles con su descripción.
SELECT nombre_rol, descripcion, activo FROM roles ORDER BY nombre_rol;
