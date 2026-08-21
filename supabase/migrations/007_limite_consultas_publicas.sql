-- ---------------------------------------------------------------------
-- 007 · El limitador del portal público
-- ---------------------------------------------------------------------
--
-- El portal de invitaciones se atiende sin sesión, así que un script puede
-- recorrer números de DUI y juntar la lista de nombres del municipio. El
-- desafío de trabajo encarece cada intento; esto le pone un techo.
--
-- Por qué en la base y no en memoria
-- ----------------------------------
-- El backend son funciones de Vercel: hay varias instancias a la vez y se
-- apagan solas cuando no se usan. Un contador en memoria empieza de cero en
-- cada instancia, así que el límite real terminaría siendo el que se quiso
-- poner multiplicado por la cantidad de instancias, que además cambia sola.
-- La base es lo único que todas comparten.
--
-- Cómo cuenta
-- -----------
-- Por ventanas fijas. La clave es el rastro de quien consulta más el minuto en
-- que arranca su ventana, así que al terminar la ventana la clave cambia sola y
-- el conteo vuelve a cero sin que nadie tenga que limpiar.
--
-- No guarda la IP, guarda un resumen. Alcanza para contar y no arma un registro
-- de quién consultó su invitación y desde dónde, que es un dato que este
-- sistema no necesita tener.
--
-- Es idempotente y no borra nada de lo que ya existe.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS limite_consultas (
  clave      TEXT PRIMARY KEY,
  intentos   INTEGER NOT NULL DEFAULT 0,
  vence      TIMESTAMPTZ NOT NULL
);

-- Para que el barrido de vencidos no recorra la tabla entera.
CREATE INDEX IF NOT EXISTS limite_consultas_vence_idx ON limite_consultas (vence);

-- ---------------------------------------------------------------------
-- Contar un intento y devolver cuántos van.
--
-- Va como función y no como tres consultas desde el backend porque tiene que
-- ser una sola operación: leer, sumar y escribir por separado deja que dos
-- pedidos simultáneos lean el mismo número y guarden el mismo, y así el límite
-- se pasa por alto justo cuando más pedidos hay, que es cuando importa.
--
-- `ON CONFLICT` hace la suma dentro del mismo INSERT, que es atómico.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_intento(
  p_clave TEXT,
  p_ventana_segundos INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_intentos INTEGER;
BEGIN
  -- Barrido oportunista: lo viejo se va solo, sin tarea programada. Son pocas
  -- filas y el índice las encuentra directo.
  DELETE FROM limite_consultas WHERE vence < NOW();

  INSERT INTO limite_consultas (clave, intentos, vence)
  VALUES (p_clave, 1, NOW() + (p_ventana_segundos || ' seconds')::INTERVAL)
  ON CONFLICT (clave) DO UPDATE
    SET intentos = limite_consultas.intentos + 1
  RETURNING intentos INTO v_intentos;

  RETURN v_intentos;
END;
$$;

-- ---------------------------------------------------------------------
-- Nadie más que el backend toca esto.
--
-- La llave de servicio, que es la que usa el backend, se salta estas políticas
-- por diseño. Encender RLS sin escribir ninguna política es entonces la forma
-- de decir «desde afuera, nada»: con la llave pública no se lee ni se escribe.
-- ---------------------------------------------------------------------
ALTER TABLE limite_consultas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE limite_consultas IS
  'Conteo por ventana para el portal público. La clave es un resumen del rastro de quien consulta, nunca su IP.';
