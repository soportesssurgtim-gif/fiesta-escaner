-- =====================================================
-- 011: género del empleado
--
-- Hace falta para poder filtrar y reportar la asistencia por género, que es un
-- corte que la municipalidad pide en los informes.
--
-- Se guarda como texto y no como booleano ni como enum:
--
--   * Un booleano obliga a elegir dos y a que uno sea "el otro".
--   * Un enum de Postgres se cambia con una migración cada vez que hay que
--     agregar un valor, y este es justo un campo donde eso pasa.
--
-- Los valores que usa el sistema son 'F', 'M' y vacío. El vacío es un estado
-- válido y esperado: los empleados que ya están cargados no lo tienen, y nadie
-- va a rellenar novecientas filas de una sentada. Los reportes lo muestran
-- como "Sin especificar" en lugar de esconderlo, porque un total que no cuadra
-- con la suma de sus partes hace dudar del reporte entero.
--
-- Sin DEFAULT: una columna nueva con valor por defecto inventaría un dato que
-- nadie cargó, y después no habría forma de distinguir lo inventado de lo real.
-- =====================================================

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS genero TEXT;

-- El índice sirve al filtro de la pantalla de asistencias y a los reportes.
-- Parcial, porque filtrar por "sin especificar" no es un caso que se consulte y
-- así el índice no carga con las filas vacías, que hoy son todas.
CREATE INDEX IF NOT EXISTS idx_empleados_genero
  ON empleados (genero)
  WHERE genero IS NOT NULL AND genero <> '';

COMMENT ON COLUMN empleados.genero IS
  'Género del empleado: F, M o vacío cuando no se especificó.';
