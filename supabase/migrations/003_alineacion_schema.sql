-- =====================================================================
-- 003 - Alineación del schema con lo que el código realmente usa
-- =====================================================================
--
-- Al consolidar el backend salió a la luz que las migraciones 001 y 002 se
-- quedaron atrás respecto del código. Estas cosas el código las usa pero no
-- estaban declaradas en ningún archivo de migración:
--
--   · empleados.codigo        → lo lee el escáner y lo imprime en las tarjetas
--   · asistencias.id_cliente  → es la llave de deduplicación del modo offline
--   · plantillas_tarjetas     → la tabla entera del módulo de invitaciones
--   · permisos (rol, modulo)  → sin índice único no se puede hacer upsert
--
-- Es posible que en la base de producción ya existan (alguien las habrá creado
-- a mano desde el panel de Supabase). Por eso todo acá es idempotente: se puede
-- correr las veces que haga falta sin romper nada ni perder datos.
--
-- CÓMO APLICARLA:
--   Supabase → SQL Editor → pegar este archivo → Run
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Código interno de empleado
-- ---------------------------------------------------------------------
-- Lo asigna TI a mano. Es opcional, pero cuando existe el QR puede llevarlo en
-- lugar del DUI.
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_empleados_codigo
  ON empleados (codigo)
  WHERE codigo IS NOT NULL AND codigo <> '';


-- ---------------------------------------------------------------------
-- 2. Identificador de cliente para la sincronización offline
-- ---------------------------------------------------------------------
-- Cuando el escáner trabaja sin señal, cada registro se guarda en IndexedDB con
-- un UUID generado en el dispositivo. Al recuperar la conexión se sube con ese
-- mismo UUID, y así podemos distinguir un reintento de un escaneo nuevo.
ALTER TABLE asistencias ADD COLUMN IF NOT EXISTS id_cliente TEXT;

CREATE INDEX IF NOT EXISTS idx_asistencias_id_cliente
  ON asistencias (id_cliente)
  WHERE id_cliente IS NOT NULL;


-- ---------------------------------------------------------------------
-- 3. Plantillas de tarjetas de invitación
-- ---------------------------------------------------------------------
-- Guarda la imagen de fondo (su ruta en Storage) y dónde va colocado el QR.
CREATE TABLE IF NOT EXISTS plantillas_tarjetas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  imagen_url  TEXT NOT NULL,               -- ruta dentro del bucket 'plantillas'
  qr_x        INTEGER DEFAULT 0,
  qr_y        INTEGER DEFAULT 0,
  qr_w        INTEGER DEFAULT 200,
  qr_h        INTEGER DEFAULT 200,
  campo_qr    TEXT DEFAULT 'dui',          -- qué se codifica: dui | codigo | url
  activo      TEXT DEFAULT 'TRUE',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Que nadie meta un campo_qr que el frontend no sepa dibujar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantillas_tarjetas_campo_qr_valido'
  ) THEN
    ALTER TABLE plantillas_tarjetas
      ADD CONSTRAINT plantillas_tarjetas_campo_qr_valido
      CHECK (campo_qr IN ('dui', 'codigo', 'url'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plantillas_activo ON plantillas_tarjetas (activo);


-- ---------------------------------------------------------------------
-- 4. Índice único de permisos  ← IMPRESCINDIBLE
-- ---------------------------------------------------------------------
-- La pantalla de permisos guarda la matriz completa de un rol con un solo
-- upsert sobre (rol, modulo). Sin este índice, Postgres rechaza el upsert con
-- "no unique or exclusion constraint matching the ON CONFLICT specification" y
-- guardar permisos falla.
--
-- Antes de crearlo hay que limpiar duplicados: el guardado viejo, cuando el
-- UPDATE fallaba, hacía un INSERT de respaldo y podía dejar dos filas para el
-- mismo par. Nos quedamos con la más permisiva de cada grupo.
DELETE FROM permisos p
WHERE p.ctid NOT IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY rol, modulo
             ORDER BY
               (CASE WHEN upper(puede_ver)      = 'TRUE' THEN 1 ELSE 0 END) +
               (CASE WHEN upper(puede_agregar)  = 'TRUE' THEN 1 ELSE 0 END) +
               (CASE WHEN upper(puede_editar)   = 'TRUE' THEN 1 ELSE 0 END) +
               (CASE WHEN upper(puede_eliminar) = 'TRUE' THEN 1 ELSE 0 END) DESC,
               id ASC
           ) AS posicion
    FROM permisos
  ) AS ordenados
  WHERE posicion = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permisos_rol_modulo
  ON permisos (rol, modulo);


-- ---------------------------------------------------------------------
-- 5. Parámetros de configuración
-- ---------------------------------------------------------------------
-- Los interruptores que muestra la pantalla de Configuración. Antes estaban
-- pintados en el HTML sin nada detrás; ahora se guardan de verdad.
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('modulo_escaner_activo', 'TRUE', 'Permite registrar asistencias con el escáner.'),
  ('modulo_sorteos_activo', 'TRUE', 'Permite extraer ganadores en los sorteos.'),
  ('portal_publico_activo', 'TRUE', 'Habilita la consulta pública de invitaciones por DUI.')
ON CONFLICT (clave) DO NOTHING;


-- ---------------------------------------------------------------------
-- 6. RLS para las tablas nuevas
-- ---------------------------------------------------------------------
-- Mismo criterio que en 001: todo cerrado para anon y authenticated. El backend
-- entra con service_role, que pasa por encima de las policies.
ALTER TABLE plantillas_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_tarjetas FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE plantillas_tarjetas FROM PUBLIC;
GRANT ALL ON TABLE plantillas_tarjetas TO postgres, service_role;

DROP POLICY IF EXISTS plantillas_deny_all ON plantillas_tarjetas;
CREATE POLICY plantillas_deny_all ON plantillas_tarjetas
  FOR ALL USING (false) WITH CHECK (false);


-- =====================================================================
-- PASO MANUAL PENDIENTE (no se puede hacer desde SQL)
-- =====================================================================
--
-- Crear el bucket de Storage donde se guardan las imágenes de plantilla:
--
--   Supabase → Storage → New bucket
--     Nombre : plantillas
--     Público: SÍ  (el navegador tiene que poder mostrar la imagen de fondo
--                   mientras se posiciona el QR)
--
-- Solo se suben ahí las plantillas de diseño. No hay datos personales.
-- =====================================================================
