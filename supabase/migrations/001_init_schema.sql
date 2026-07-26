-- Tabla: roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_rol TEXT NOT NULL,
  activo TEXT DEFAULT 'TRUE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: dpto (departamentos)
CREATE TABLE IF NOT EXISTS dpto (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_dpto TEXT,
  nombre_dpto TEXT NOT NULL,
  activo TEXT DEFAULT 'TRUE'
);

-- Tabla: empleados
CREATE TABLE IF NOT EXISTS empleados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  distrito TEXT,
  dpto UUID REFERENCES dpto(id),
  cargo TEXT,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento TEXT,
  telefono TEXT,
  correo TEXT,
  dui TEXT UNIQUE NOT NULL,
  activo TEXT DEFAULT 'TRUE'
);

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado UUID REFERENCES empleados(id),
  telefono TEXT,
  correo TEXT,
  usuario TEXT UNIQUE NOT NULL,
  temp_pass TEXT,
  password TEXT NOT NULL,
  rol UUID REFERENCES roles(id),
  configurado TEXT DEFAULT 'FALSE',
  activo TEXT DEFAULT 'TRUE'
);

-- Tabla: eventos
CREATE TABLE IF NOT EXISTS eventos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  fecha_evento TEXT,
  ubicacion TEXT,
  activo TEXT DEFAULT 'FALSE',
  creado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: premios
CREATE TABLE IF NOT EXISTS premios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  cantidad INTEGER DEFAULT 1,
  activo TEXT DEFAULT 'TRUE'
);

-- Tabla: sorteos
CREATE TABLE IF NOT EXISTS sorteos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evento UUID REFERENCES eventos(id),
  nombre TEXT NOT NULL,
  premio UUID REFERENCES premios(id),
  fecha_hora_sorteo TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  realizado TEXT DEFAULT 'FALSE'
);

-- Tabla: asistencias
CREATE TABLE IF NOT EXISTS asistencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evento UUID REFERENCES eventos(id),
  fecha_hora_asistencia TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  empleado UUID REFERENCES empleados(id),
  escaneado_por UUID,
  dispositivo TEXT,
  fuente TEXT DEFAULT 'qr',
  UNIQUE(evento, empleado)
);

-- Tabla: ganadores
CREATE TABLE IF NOT EXISTS ganadores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sorteo UUID REFERENCES sorteos(id),
  premio UUID REFERENCES premios(id),
  empleado UUID REFERENCES empleados(id),
  asistencia UUID REFERENCES asistencias(id),
  fecha_hora_sorteo TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  entregado_por UUID,
  entregado TEXT DEFAULT 'FALSE'
);

-- Tabla: permisos
CREATE TABLE IF NOT EXISTS permisos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rol UUID REFERENCES roles(id),
  modulo TEXT NOT NULL,
  puede_ver TEXT DEFAULT 'FALSE',
  puede_agregar TEXT DEFAULT 'FALSE',
  puede_editar TEXT DEFAULT 'FALSE',
  puede_eliminar TEXT DEFAULT 'FALSE'
);

-- Tabla: configuracion (opcional)
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT,
  descripcion TEXT
);

-- Tabla: sesiones (para manejo de tokens en servidor)
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id),
  data JSONB,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_asistencias_evento ON asistencias(evento);
CREATE INDEX IF NOT EXISTS idx_asistencias_empleado ON asistencias(empleado);
CREATE INDEX IF NOT EXISTS idx_sorteos_evento ON sorteos(evento);
CREATE INDEX IF NOT EXISTS idx_ganadores_sorteo ON ganadores(sorteo);
CREATE INDEX IF NOT EXISTS idx_empleados_dui ON empleados(dui);
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_sesiones_expires ON sesiones(expires_at);

-- Insertar roles por defecto
INSERT INTO roles (nombre_rol, activo) VALUES
  ('ADMIN', 'TRUE'),
  ('LOGISTICA', 'TRUE'),
  ('LECTOR', 'TRUE')
ON CONFLICT DO NOTHING;

-- Insertar permisos por defecto para ADMIN
DO $$
DECLARE
  admin_id UUID;
  modulos TEXT[] := ARRAY['scanner','asistencia','empleados','departamentos','premios','usuarios','roles','permisos','eventos','sorteos','configuracion'];
  m TEXT;
BEGIN
  SELECT id INTO admin_id FROM roles WHERE nombre_rol = 'ADMIN' LIMIT 1;
  IF admin_id IS NOT NULL THEN
    FOREACH m IN ARRAY modulos LOOP
      INSERT INTO permisos (rol, modulo, puede_ver, puede_agregar, puede_editar, puede_eliminar)
      VALUES (admin_id, m, 'TRUE', 'TRUE', 'TRUE', 'TRUE')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - DEFENSA EN PROFUNDIDAD
-- IMPORTANTE: Los endpoints Vercel usan SERVICE_ROLE_KEY
-- que Bypassea RLS por diseño. Pero activamos RLS +
-- policies restrictivas como CAPA ADICIONAL DE SEGURIDAD
-- por si alguien:
--   (a) Expone la ANON key por error en el navegador
--   (b) Olvida poner requireAuth() en un endpoint
--   (c) Accede directamente a Postgres
-- =====================================================

-- 1. Activar RLS en TODAS las tablas
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dpto ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE premios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE ganadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;

-- 2. FORCE RLS para que incluso OWNER/tables roles pasen por policies
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE dpto FORCE ROW LEVEL SECURITY;
ALTER TABLE empleados FORCE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;
ALTER TABLE eventos FORCE ROW LEVEL SECURITY;
ALTER TABLE premios FORCE ROW LEVEL SECURITY;
ALTER TABLE sorteos FORCE ROW LEVEL SECURITY;
ALTER TABLE asistencias FORCE ROW LEVEL SECURITY;
ALTER TABLE ganadores FORCE ROW LEVEL SECURITY;
ALTER TABLE permisos FORCE ROW LEVEL SECURITY;
ALTER TABLE configuracion FORCE ROW LEVEL SECURITY;
ALTER TABLE sesiones FORCE ROW LEVEL SECURITY;

-- 3. Revocar permisos por defecto de PUBLIC para estar seguros
REVOKE ALL ON TABLE roles FROM PUBLIC;
REVOKE ALL ON TABLE dpto FROM PUBLIC;
REVOKE ALL ON TABLE empleados FROM PUBLIC;
REVOKE ALL ON TABLE usuarios FROM PUBLIC;
REVOKE ALL ON TABLE eventos FROM PUBLIC;
REVOKE ALL ON TABLE premios FROM PUBLIC;
REVOKE ALL ON TABLE sorteos FROM PUBLIC;
REVOKE ALL ON TABLE asistencias FROM PUBLIC;
REVOKE ALL ON TABLE ganadores FROM PUBLIC;
REVOKE ALL ON TABLE permisos FROM PUBLIC;
REVOKE ALL ON TABLE configuracion FROM PUBLIC;
REVOKE ALL ON TABLE sesiones FROM PUBLIC;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- =====================================================
-- POLICIES RESTRICTIVAS (DENY BY DEFAULT para anon/authenticated)
-- Solo service_role y postgres tienen acceso total por encima
-- de estas policies. anon y authenticated = NINGUN ACCESO.
-- =====================================================

-- Roles: solo lectura de activos, nadie escribe por anon
DROP POLICY IF EXISTS roles_select_deny_anon ON roles;
CREATE POLICY roles_select_deny_anon ON roles
  FOR SELECT USING (false);

DROP POLICY IF EXISTS roles_wr_deny_all ON roles;
CREATE POLICY roles_wr_deny_all ON roles
  FOR ALL USING (false) WITH CHECK (false);

-- Departamentos
DROP POLICY IF EXISTS dpto_select_deny_anon ON dpto;
CREATE POLICY dpto_select_deny_anon ON dpto
  FOR SELECT USING (false);
DROP POLICY IF EXISTS dpto_wr_deny_all ON dpto;
CREATE POLICY dpto_wr_deny_all ON dpto
  FOR ALL USING (false) WITH CHECK (false);

-- Empleados
DROP POLICY IF EXISTS empleados_select_deny_anon ON empleados;
CREATE POLICY empleados_select_deny_anon ON empleados
  FOR SELECT USING (false);
DROP POLICY IF EXISTS empleados_wr_deny_all ON empleados;
CREATE POLICY empleados_wr_deny_all ON empleados
  FOR ALL USING (false) WITH CHECK (false);

-- Usuarios (Muy sensible: contiene passwords hasheados)
DROP POLICY IF EXISTS usuarios_select_deny_anon ON usuarios;
CREATE POLICY usuarios_select_deny_anon ON usuarios
  FOR SELECT USING (false);
DROP POLICY IF EXISTS usuarios_wr_deny_all ON usuarios;
CREATE POLICY usuarios_wr_deny_all ON usuarios
  FOR ALL USING (false) WITH CHECK (false);

-- Eventos
DROP POLICY IF EXISTS eventos_select_deny_anon ON eventos;
CREATE POLICY eventos_select_deny_anon ON eventos
  FOR SELECT USING (false);
DROP POLICY IF EXISTS eventos_wr_deny_all ON eventos;
CREATE POLICY eventos_wr_deny_all ON eventos
  FOR ALL USING (false) WITH CHECK (false);

-- Premios
DROP POLICY IF EXISTS premios_select_deny_anon ON premios;
CREATE POLICY premios_select_deny_anon ON premios
  FOR SELECT USING (false);
DROP POLICY IF EXISTS premios_wr_deny_all ON premios;
CREATE POLICY premios_wr_deny_all ON premios
  FOR ALL USING (false) WITH CHECK (false);

-- Sorteos
DROP POLICY IF EXISTS sorteos_select_deny_anon ON sorteos;
CREATE POLICY sorteos_select_deny_anon ON sorteos
  FOR SELECT USING (false);
DROP POLICY IF EXISTS sorteos_wr_deny_all ON sorteos;
CREATE POLICY sorteos_wr_deny_all ON sorteos
  FOR ALL USING (false) WITH CHECK (false);

-- Asistencias
DROP POLICY IF EXISTS asistencias_select_deny_anon ON asistencias;
CREATE POLICY asistencias_select_deny_anon ON asistencias
  FOR SELECT USING (false);
DROP POLICY IF EXISTS asistencias_wr_deny_all ON asistencias;
CREATE POLICY asistencias_wr_deny_all ON asistencias
  FOR ALL USING (false) WITH CHECK (false);

-- Ganadores
DROP POLICY IF EXISTS ganadores_select_deny_anon ON ganadores;
CREATE POLICY ganadores_select_deny_anon ON ganadores
  FOR SELECT USING (false);
DROP POLICY IF EXISTS ganadores_wr_deny_all ON ganadores;
CREATE POLICY ganadores_wr_deny_all ON ganadores
  FOR ALL USING (false) WITH CHECK (false);

-- Permisos
DROP POLICY IF EXISTS permisos_select_deny_anon ON permisos;
CREATE POLICY permisos_select_deny_anon ON permisos
  FOR SELECT USING (false);
DROP POLICY IF EXISTS permisos_wr_deny_all ON permisos;
CREATE POLICY permisos_wr_deny_all ON permisos
  FOR ALL USING (false) WITH CHECK (false);

-- Configuracion
DROP POLICY IF EXISTS config_select_deny_anon ON configuracion;
CREATE POLICY config_select_deny_anon ON configuracion
  FOR SELECT USING (false);
DROP POLICY IF EXISTS config_wr_deny_all ON configuracion;
CREATE POLICY config_wr_deny_all ON configuracion
  FOR ALL USING (false) WITH CHECK (false);

-- Sesiones (Muy sensible: tokens de auth)
DROP POLICY IF EXISTS sesiones_select_deny_anon ON sesiones;
CREATE POLICY sesiones_select_deny_anon ON sesiones
  FOR SELECT USING (false);
DROP POLICY IF EXISTS sesiones_wr_deny_all ON sesiones;
CREATE POLICY sesiones_wr_deny_all ON sesiones
  FOR ALL USING (false) WITH CHECK (false);

