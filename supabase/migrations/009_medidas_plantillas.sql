-- ---------------------------------------------------------------------
-- 009 · Cada plantilla con sus propias medidas
-- ---------------------------------------------------------------------
--
-- El problema que arregla
-- -----------------------
-- Hasta ahora la tarjeta se exportaba siempre a 1200x1800, y el arte subido se
-- dibujaba estirado hasta llenar ese rectángulo. Un diseño cuadrado —el típico
-- de redes, 1080x1080— salía achatado, y uno horizontal salía deformado sin que
-- nadie avisara nada.
--
-- No se notó antes porque todas las plantillas se hicieron a esa medida. El
-- primer diseño con otra proporción lo habría mostrado.
--
-- Qué guardan estas dos columnas
-- ------------------------------
-- El tamaño de salida de la tarjeta. Al subir un arte se toman los de la propia
-- imagen, así que lo normal es que coincidan y no haya ninguna transformación.
-- Se pueden cambiar a mano cuando la salida tiene que tener una medida concreta
-- —un tamaño de impresión, por ejemplo—; en ese caso el arte se dibuja centrado
-- y a escala, respetando su proporción. Estirarlo no es una opción.
--
-- Por qué el valor por defecto es 1200x1800
-- -----------------------------------------
-- Es lo que el sistema venía usando. Las plantillas que ya existen quedan con
-- esa medida y siguen exportando exactamente igual que antes, que es lo correcto
-- para ellas: su arte se hizo a ese tamaño.
--
-- Es idempotente y no borra nada.
-- ---------------------------------------------------------------------

ALTER TABLE plantillas_tarjetas ADD COLUMN IF NOT EXISTS ancho INTEGER DEFAULT 1200;
ALTER TABLE plantillas_tarjetas ADD COLUMN IF NOT EXISTS alto  INTEGER DEFAULT 1800;

-- Las filas que ya existían quedan con NULL si la columna se agregó sin valor;
-- se las lleva al tamaño de siempre para que nada dependa de un NULL.
UPDATE plantillas_tarjetas SET ancho = 1200 WHERE ancho IS NULL;
UPDATE plantillas_tarjetas SET alto  = 1800 WHERE alto  IS NULL;

/*
 * Los límites.
 *
 * El mínimo es el que el editor ya exigía al subir el arte: por debajo de eso la
 * tarjeta impresa se ve pixelada.
 *
 * El máximo existe porque las tarjetas se arman en el navegador y se juntan en
 * un ZIP: cien tarjetas de 8000 px son varios gigabytes de píxeles en memoria y
 * la pestaña se cae sin decir por qué.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantillas_tarjetas_ancho_valido'
  ) THEN
    ALTER TABLE plantillas_tarjetas ADD CONSTRAINT plantillas_tarjetas_ancho_valido
      CHECK (ancho IS NULL OR (ancho >= 800 AND ancho <= 6000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantillas_tarjetas_alto_valido'
  ) THEN
    ALTER TABLE plantillas_tarjetas ADD CONSTRAINT plantillas_tarjetas_alto_valido
      CHECK (alto IS NULL OR (alto >= 600 AND alto <= 6000));
  END IF;
END $$;

COMMENT ON COLUMN plantillas_tarjetas.ancho IS
  'Ancho de salida de la tarjeta, en píxeles. Al subir un arte se toma el suyo.';
COMMENT ON COLUMN plantillas_tarjetas.alto IS
  'Alto de salida de la tarjeta, en píxeles.';
