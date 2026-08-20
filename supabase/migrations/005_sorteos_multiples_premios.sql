-- =====================================================================
-- 005 · Un sorteo para toda la fiesta
--
-- POR QUÉ
--
-- El modelo original ataba un sorteo a UN premio y lo marcaba `realizado`
-- apenas salía un ganador. Pero así no se hace un sorteo de verdad: hay una
-- persona con un micrófono que va llamando ganadores durante toda la noche, y
-- los premios pueden ser veinte o más.
--
-- Con el modelo viejo eso obligaba a crear veinte sorteos, elegir uno por uno
-- en un desplegable y perder el hilo de cuál ya se entregó. El sorteo pasa a
-- ser el contenedor de la jornada, y los premios cuelgan de él con su cantidad.
--
-- QUÉ CAMBIA
--
--   · sorteos gana estado, descripción y la regla de si alguien puede ganar
--     dos veces.
--   · sorteo_premios: la lista de premios de cada sorteo, con cuántas unidades
--     hay de cada uno y en qué orden se llaman.
--   · ganadores gana el vínculo a la línea de premio y el orden en que salió,
--     para poder reconstruir la locución después.
--
-- QUÉ NO CAMBIA
--
-- No se borra ninguna columna ni ninguna fila. `sorteos.premio` queda donde
-- está: los sorteos que ya existan siguen teniéndolo, y la migración los
-- convierte a una línea de sorteo_premios para que sigan funcionando.
--
-- Es idempotente: se puede correr las veces que haga falta.
--
-- CÓMO APLICARLA
--   Supabase → SQL Editor → pegar este archivo → Run
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. El sorteo como contenedor de la jornada
-- ---------------------------------------------------------------------

-- Para que quien locuta sepa de qué se trata sin abrir nada más.
ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- ABIERTO   se puede seguir sorteando
-- CERRADO   se dio por terminado a mano, o ya no quedan premios
--
-- Convive con `realizado`, que se mantiene sincronizado para no romper nada
-- que todavía lo consulte.
ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ABIERTO';

-- ¿Una misma persona puede llevarse más de un premio en este sorteo?
--
-- Por defecto NO, que es lo habitual en una fiesta de empleados: si con
-- doscientos asistentes y veinte premios alguien se lleva tres, se nota y
-- se comenta. Pero en sorteos chicos, con más premios que gente presente,
-- hace falta permitirlo o el sorteo se queda sin poder repartir.
ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS permite_repetir_ganador TEXT DEFAULT 'FALSE';

-- Los sorteos que ya existen quedan con los valores por defecto explícitos.
UPDATE sorteos SET estado = CASE
    WHEN UPPER(COALESCE(realizado, 'FALSE')) = 'TRUE' THEN 'CERRADO'
    ELSE 'ABIERTO'
  END
  WHERE estado IS NULL;

UPDATE sorteos SET permite_repetir_ganador = 'FALSE' WHERE permite_repetir_ganador IS NULL;


-- ---------------------------------------------------------------------
-- 2. Los premios de cada sorteo
-- ---------------------------------------------------------------------
-- Una fila por premio del sorteo. `cantidad` son las unidades a repartir:
-- diez termos son una sola línea con cantidad 10, no diez líneas.
--
-- ON DELETE CASCADE: si se borra el sorteo, su lista de premios no tiene
-- sentido sola. Los ganadores NO se borran en cascada a propósito: son el
-- registro de lo que pasó en la fiesta.
CREATE TABLE IF NOT EXISTS sorteo_premios (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sorteo      UUID NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  premio      UUID NOT NULL REFERENCES premios(id),
  cantidad    INTEGER NOT NULL DEFAULT 1,
  -- En qué orden los va a llamar quien locuta. Se suele dejar el mejor
  -- premio para el final.
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Un premio no puede estar dos veces en el mismo sorteo: para repetirlo se
-- sube la cantidad. Además, este índice es el que permite el upsert al
-- guardar la lista completa desde la pantalla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sorteo_premios_unico
  ON sorteo_premios (sorteo, premio);

CREATE INDEX IF NOT EXISTS idx_sorteo_premios_sorteo
  ON sorteo_premios (sorteo, orden);


-- ---------------------------------------------------------------------
-- 3. Los sorteos que ya existían
-- ---------------------------------------------------------------------
-- Cada uno tenía un premio suelto en `sorteos.premio`. Se convierte en su
-- primera línea, con la cantidad que ya se haya entregado como mínimo, para
-- que el conteo de lo repartido no quede en negativo.
INSERT INTO sorteo_premios (sorteo, premio, cantidad, orden)
SELECT
  s.id,
  s.premio,
  GREATEST(1, (SELECT COUNT(*) FROM ganadores g WHERE g.sorteo = s.id)),
  0
FROM sorteos s
WHERE s.premio IS NOT NULL
ON CONFLICT (sorteo, premio) DO NOTHING;


-- ---------------------------------------------------------------------
-- 4. Los ganadores
-- ---------------------------------------------------------------------
-- A qué línea de premio corresponde este ganador. Sin esto no se puede saber
-- cuántas unidades de cada premio quedan por repartir.
ALTER TABLE ganadores ADD COLUMN IF NOT EXISTS sorteo_premio UUID REFERENCES sorteo_premios(id);

-- El orden en que fueron saliendo, para poder reconstruir la locución y
-- mostrar la lista tal como se llamó.
ALTER TABLE ganadores ADD COLUMN IF NOT EXISTS orden INTEGER;

-- Quién estaba operando cuando salió. `entregado_por` ya existía pero se usaba
-- para otra cosa (quién hizo la extracción), así que se deja como está y se
-- agrega este para el momento de la entrega física.
ALTER TABLE ganadores ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMP WITH TIME ZONE;

-- Los ganadores que ya existen se enganchan a la línea que se creó arriba.
UPDATE ganadores g
SET sorteo_premio = sp.id
FROM sorteo_premios sp
WHERE g.sorteo_premio IS NULL
  AND sp.sorteo = g.sorteo
  AND sp.premio = g.premio;

-- Los que no tenían premio se enganchan a la primera línea de su sorteo.
UPDATE ganadores g
SET sorteo_premio = (
  SELECT sp.id FROM sorteo_premios sp
  WHERE sp.sorteo = g.sorteo
  ORDER BY sp.orden, sp.created_at
  LIMIT 1
)
WHERE g.sorteo_premio IS NULL;

CREATE INDEX IF NOT EXISTS idx_ganadores_sorteo ON ganadores (sorteo);
CREATE INDEX IF NOT EXISTS idx_ganadores_sorteo_premio ON ganadores (sorteo_premio);


-- ---------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------
-- El módulo ya existía; esto solo se asegura de que los administradores lo
-- tengan si la fila faltaba.
INSERT INTO permisos (rol, modulo, puede_ver, puede_agregar, puede_editar, puede_eliminar)
SELECT r.id, 'sorteos', 'TRUE', 'TRUE', 'TRUE', 'TRUE'
FROM roles r
WHERE UPPER(r.nombre_rol) IN ('ADMIN', 'ADMINISTRADOR')
ON CONFLICT (rol, modulo) DO NOTHING;
