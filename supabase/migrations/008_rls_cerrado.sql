-- ---------------------------------------------------------------------
-- 008 · Cerrar las tablas a todo lo que no sea el backend
-- ---------------------------------------------------------------------
--
-- Cómo entra hoy cada dato
-- ------------------------
-- El navegador nunca habla con Supabase. Habla con `/api`, y esa función es la
-- que habla con Supabase usando la llave de servicio, que vive solo en las
-- variables de entorno de Vercel. Toda la autorización real —quién puede ver
-- qué, quién puede escribir— la decide `seguridad.js` antes de tocar la base.
--
-- Entonces, ¿para qué esto?
-- -------------------------
-- Porque la dirección del proyecto de Supabase y su llave pública son, por
-- diseño, cosas que se pueden averiguar. Con RLS apagada, cualquiera que las
-- tenga puede consultar las tablas directamente y saltarse el backend entero:
-- la lista de empleados con sus DUI, los usuarios, las sesiones activas.
--
-- Encender RLS sin escribir ninguna política es la forma de decir «desde
-- afuera, nada». La llave de servicio se salta las políticas por diseño, así
-- que el backend sigue funcionando exactamente igual; lo que deja de funcionar
-- es el atajo.
--
-- Si esta migración rompiera algo, el síntoma sería que la aplicación deja de
-- leer datos. Eso significaría que algo está entrando con la llave pública, y
-- sería un hallazgo, no un problema de esta migración.
--
-- Es idempotente y no borra nada.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_tabla TEXT;
  v_tablas TEXT[] := ARRAY[
    'roles', 'dpto', 'empleados', 'usuarios', 'eventos', 'premios',
    'sorteos', 'asistencias', 'ganadores', 'sorteo_premios', 'permisos',
    'configuracion', 'sesiones', 'plantillas_tarjetas'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    -- Se pregunta antes: una tabla que no existe en esta instalación no debe
    -- hacer fallar la migración entera.
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabla);
      RAISE NOTICE 'RLS encendida en %', v_tabla;
    ELSE
      RAISE NOTICE 'No existe la tabla %, se omite', v_tabla;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Para comprobarlo después de correr esto.
--
-- La columna `rowsecurity` tiene que decir `true` en todas las filas. Si alguna
-- dice `false`, esa tabla quedó abierta a la llave pública.
-- ---------------------------------------------------------------------
-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--  ORDER BY rowsecurity, tablename;
