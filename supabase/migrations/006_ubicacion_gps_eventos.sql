-- ---------------------------------------------------------------------
-- 006 · La ubicación del evento en el mapa
-- ---------------------------------------------------------------------
--
-- `ubicacion` guarda el nombre del lugar ("Hotel Real Intercontinental"),
-- que sirve para leerlo pero no para llegar. Con las coordenadas, la
-- invitación puede ofrecer un botón que abre el mapa del teléfono con la
-- ruta puesta.
--
-- Van como números y no como un texto "13.7,-89.2" porque así se pueden
-- validar los rangos y, si algún día hace falta, buscar por cercanía.
--
-- Es idempotente y no borra nada: los eventos que ya existen quedan sin
-- coordenadas, que es un estado válido —hasta ahora nadie las cargó— y la
-- invitación simplemente no muestra el botón.
-- ---------------------------------------------------------------------

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS latitud  DOUBLE PRECISION;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;

-- Los rangos del planeta. Sin esto, un error de tipeo en la carga deja una
-- coordenada imposible que el mapa muestra en medio del océano sin avisar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eventos_latitud_valida'
  ) THEN
    ALTER TABLE eventos ADD CONSTRAINT eventos_latitud_valida
      CHECK (latitud IS NULL OR (latitud >= -90 AND latitud <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eventos_longitud_valida'
  ) THEN
    ALTER TABLE eventos ADD CONSTRAINT eventos_longitud_valida
      CHECK (longitud IS NULL OR (longitud >= -180 AND longitud <= 180));
  END IF;
END $$;

COMMENT ON COLUMN eventos.latitud  IS 'Latitud del lugar del evento, para el botón "cómo llegar" de la invitación.';
COMMENT ON COLUMN eventos.longitud IS 'Longitud del lugar del evento.';
