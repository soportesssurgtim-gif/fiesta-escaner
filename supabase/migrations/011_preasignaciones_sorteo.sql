-- =====================================================================
-- 011 · Preasignaciones de sorteo
--
-- POR QUÉ
--
-- En el evento hay dinámicas presenciales previas con boletos físicos.
-- Esta tabla permite registrar favorecidos que deben despacharse primero
-- cuando se ejecuta un sorteo específico (ej. boletos físicos prefijados).
--
-- La tabla es "oculta": solo se gestiona desde el panel de administración
-- en Supabase. El sistema la consume silenciosamente durante el sorteo.
--
-- QUÉ CAMBIA
--
--   · Nueva tabla preasignaciones_sorteo para cola de prioridad
--   · El controlador sortearGanador consume preasignaciones primero
--   · Nuevo endpoint para gestionar preasignaciones desde admin
--
-- CÓMO APLICARLA
--   Supabase → SQL Editor → pegar este archivo → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla de preasignaciones
-- ---------------------------------------------------------------------
-- Una fila = un favorecido para un premio específico de un sorteo.
-- Se consume en orden FIFO (created_at ASC) cuando se sortea ese premio.

CREATE TABLE IF NOT EXISTS preasignaciones_sorteo (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sorteo      UUID NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  sorteo_premio UUID NOT NULL REFERENCES sorteo_premios(id) ON DELETE CASCADE,
  empleado   UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar preasignaciones de un sorteo/premio rápido
CREATE INDEX IF NOT EXISTS idx_preasignaciones_sorteo_premio
  ON preasignaciones_sorteo (sorteo, sorteo_premio, created_at);

-- Un empleado no puede estar dos veces preasignado al mismo premio
CREATE UNIQUE INDEX IF NOT EXISTS idx_preasignaciones_unica
  ON preasignaciones_sorteo (sorteo, sorteo_premio, empleado);


-- ---------------------------------------------------------------------
-- 2. RLS para la tabla
-- ---------------------------------------------------------------------
-- Mismo criterio que el resto: cerrado para anon/authenticated.
ALTER TABLE preasignaciones_sorteo ENABLE ROW LEVEL SECURITY;
ALTER TABLE preasignaciones_sorteo FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE preasignaciones_sorteo FROM PUBLIC;
GRANT ALL ON TABLE preasignaciones_sorteo TO postgres, service_role;

DROP POLICY IF EXISTS preasignaciones_deny_all ON preasignaciones_sorteo;
CREATE POLICY preasignaciones_deny_all ON preasignaciones_sorteo
  FOR ALL USING (false) WITH CHECK (false);
