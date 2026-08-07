/**
 * Constantes compartidas por todo el backend.
 *
 * Todo lo que sea un "número mágico" o un texto que se repita en más de un
 * controlador termina aquí. Así, cuando haya que cambiar algo (por ejemplo la
 * duración de la sesión), se cambia en un solo lugar.
 */

// Cuánto dura una sesión antes de expirar. Seis horas alcanza de sobra para una
// jornada de evento y evita dejar tokens vivos toda la noche.
export const DURACION_SESION_SEGUNDOS = 6 * 60 * 60;

// Nombres de las tablas en Supabase. Ojo: "dpto" está así en la base de datos,
// no es un error de tipeo. Lo mapeamos aquí para no repetir el nombre feo.
export const TABLAS = {
  roles: 'roles',
  departamentos: 'dpto',
  empleados: 'empleados',
  usuarios: 'usuarios',
  eventos: 'eventos',
  premios: 'premios',
  sorteos: 'sorteos',
  asistencias: 'asistencias',
  ganadores: 'ganadores',
  permisos: 'permisos',
  configuracion: 'configuracion',
  sesiones: 'sesiones',
  plantillasTarjetas: 'plantillas_tarjetas'
};

// La base guarda los booleanos como texto 'TRUE' / 'FALSE'. Es una herencia del
// origen del proyecto (venía de hojas de cálculo) y cambiarlo implicaría migrar
// todas las filas, así que convivimos con ello a través de estos helpers.
export const SI = 'TRUE';
export const NO = 'FALSE';

// Módulos sobre los que se puede otorgar permiso. Si se agrega una vista nueva
// al sistema, su módulo debe aparecer acá para que salga en la matriz.
export const MODULOS = [
  'scanner',
  'asistencias',
  'tarjetas',
  'departamentos',
  'empleados',
  'eventos',
  'sorteos',
  'premios',
  'configuracion',
  'usuarios',
  'permisos'
];

// Nombres de rol que se consideran administrador total. Se comparan en
// mayúsculas, por eso están escritos así.
export const ROLES_ADMINISTRADORES = ['ADMIN', 'ADMINISTRADOR'];

// Bucket de Supabase Storage donde viven las plantillas de tarjetas.
export const BUCKET_PLANTILLAS = 'plantillas';

// Servicio externo que genera los códigos QR. Es público y gratuito.
export const BASE_QR = 'https://quickchart.io/qr';
