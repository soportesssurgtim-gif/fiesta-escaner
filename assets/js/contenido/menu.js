/**
 * Estructura del menú lateral.
 *
 * Cada entrada declara a qué módulo de permisos corresponde. La barra lateral
 * filtra sola: si el rol no tiene permiso de "ver" sobre ese módulo, la opción
 * ni se dibuja.
 *
 * Para agregar una pantalla nueva alcanza con sumar una entrada acá y crear su
 * archivo en `assets/views/vistas/`. No hay que tocar la barra lateral.
 */

export const MENU = [
  {
    titulo: 'Operación',
    items: [
      { vista: 'scanner',     modulo: 'scanner',     etiqueta: 'Escáner QR',   icono: 'fa-qrcode' },
      { vista: 'asistentes',  modulo: 'asistencias', etiqueta: 'Asistencias',  icono: 'fa-clipboard-check' },
      { vista: 'rifa',        modulo: 'sorteos',     etiqueta: 'Sorteos',      icono: 'fa-gift' },
      { vista: 'tarjetas',    modulo: 'tarjetas',    etiqueta: 'Invitaciones', icono: 'fa-id-card' }
    ]
  },
  {
    titulo: 'Catálogos',
    items: [
      { vista: 'empleados',     modulo: 'empleados',     etiqueta: 'Empleados',     icono: 'fa-users' },
      { vista: 'departamentos', modulo: 'departamentos', etiqueta: 'Departamentos', icono: 'fa-building' },
      { vista: 'eventos',       modulo: 'eventos',       etiqueta: 'Eventos',       icono: 'fa-calendar-day' },
      { vista: 'premios',       modulo: 'premios',       etiqueta: 'Premios',       icono: 'fa-trophy' },
      { vista: 'sorteos',       modulo: 'sorteos',       etiqueta: 'Administrar sorteos', icono: 'fa-ticket' }
    ]
  },
  {
    titulo: 'Administración',
    items: [
      { vista: 'usuarios',      modulo: 'usuarios',      etiqueta: 'Usuarios y roles', icono: 'fa-user-shield' },
      { vista: 'permisos',      modulo: 'permisos',      etiqueta: 'Permisos',         icono: 'fa-shield-halved' },
      { vista: 'configuracion', modulo: 'configuracion', etiqueta: 'Configuración',    icono: 'fa-sliders' }
    ]
  }
];

/**
 * Distritos del municipio de San Salvador Sur.
 * Se usan en la ficha del empleado. Están fijos porque son los que define la
 * ley de reorganización territorial, no un catálogo que se edite día a día.
 */
export const DISTRITOS = [
  'Panchimalco',
  'Rosario de Mora',
  'San Marcos',
  'Santiago Texacuangos',
  'Santo Tomás'
];

/** Cuántas filas por página ofrece cada tabla. */
export const OPCIONES_PAGINACION = [10, 25, 50, 100, 'Todos'];
