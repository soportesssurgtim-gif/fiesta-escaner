-- Permisos del módulo tarjetas para los 4 roles existentes
INSERT INTO permisos (rol, modulo, puede_ver, puede_agregar, puede_editar, puede_eliminar) VALUES
  ('b4ca7611-2e2a-4c96-a46a-1262535e88d3', 'tarjetas', 'TRUE', 'TRUE', 'TRUE', 'TRUE'),
  ('6df16bcd-13ad-4b91-8f33-7ae8cabfc469', 'tarjetas', 'TRUE', 'TRUE', 'TRUE', 'FALSE'),
  ('c8ce503c-66ad-4515-8cb7-fddf27ee63d9', 'tarjetas', 'FALSE', 'FALSE', 'FALSE', 'FALSE'),
  ('3dcdef10-9ed2-49f5-8d00-4c3d3ed7484a', 'tarjetas', 'FALSE', 'FALSE', 'FALSE', 'FALSE')
ON CONFLICT DO NOTHING;
