/**
 * Guías de usuario, una por vista.
 *
 * Se abren con el botón de ayuda del encabezado. Están pensadas para alguien
 * que opera el sistema una vez al año, el día del evento, y no recuerda nada:
 * por eso los pasos son cortos y en imperativo.
 *
 * Los iconos son de Font Awesome. Antes convivían dos sistemas —Font Awesome en
 * un layout y LordIcon en otro— y las guías se veían distintas según por dónde
 * se abrieran. Ahora es uno solo.
 */

export const GUIAS = {
  scanner: {
    titulo: 'Escáner QR',
    icono: 'fa-qrcode',
    color: 'brand',
    pasos: [
      { icono: 'fa-camera', titulo: 'Abre la cámara', desc: 'Pulsa "Abrir cámara" y autoriza el permiso cuando el navegador lo pida.' },
      { icono: 'fa-qrcode', titulo: 'Apunta al QR', desc: 'Encuadra el código de la invitación. Se detecta solo, no hay que pulsar nada.' },
      { icono: 'fa-circle-check', titulo: 'Confirma', desc: 'Verás el nombre de la persona en verde si entró bien, o en ámbar si ya estaba registrada.' },
      { icono: 'fa-keyboard', titulo: 'Si el QR no lee', desc: 'Escribe el DUI a mano en el campo de abajo, o sube una foto del código.' }
    ],
    tip: 'Sin señal el escáner sigue funcionando: los registros se guardan en el dispositivo y se suben solos cuando vuelve la conexión.'
  },

  asistentes: {
    titulo: 'Asistencias',
    icono: 'fa-clipboard-check',
    color: 'success',
    pasos: [
      { icono: 'fa-list', titulo: 'Consulta el registro', desc: 'Aquí aparece todo el personal que ya marcó asistencia, del más reciente al más antiguo.' },
      { icono: 'fa-magnifying-glass', titulo: 'Busca a alguien', desc: 'Escribe el nombre o el DUI. No hace falta poner las tildes.' },
      { icono: 'fa-cloud-arrow-up', titulo: 'Sube los pendientes', desc: 'Si el contador de pendientes no está en cero, pulsa "Sincronizar" para enviarlos.' }
    ],
    tip: 'El listado corresponde al evento activo. Si ves menos gente de la esperada, revisa cuál evento está activo.'
  },

  rifa: {
    titulo: 'Sorteos y rifas',
    icono: 'fa-gift',
    color: 'warning',
    pasos: [
      { icono: 'fa-ticket', titulo: 'Elige el sorteo', desc: 'Selecciona de la lista el sorteo que vas a realizar.' },
      { icono: 'fa-play', titulo: 'Extrae al ganador', desc: 'Pulsa "Sortear". El sistema elige al azar entre los presentes.' },
      { icono: 'fa-trophy', titulo: 'Anuncia', desc: 'Aparece el nombre en pantalla grande, listo para leerlo al público.' }
    ],
    tip: 'Solo participa quien tenga la asistencia registrada. Nadie gana dos veces el mismo sorteo.'
  },

  tarjetas: {
    titulo: 'Tarjetas de invitación',
    icono: 'fa-id-card',
    color: 'brand',
    pasos: [
      { icono: 'fa-upload', titulo: 'Sube la plantilla', desc: 'Un PNG con fondo transparente, de al menos 800x600 px, en el espacio donde irá el QR.' },
      { icono: 'fa-arrows-up-down-left-right', titulo: 'Coloca el QR', desc: 'Arrástralo hasta su lugar. Con la rueda del ratón cambias su tamaño.' },
      { icono: 'fa-floppy-disk', titulo: 'Guarda el diseño', desc: 'Queda disponible para reutilizarlo en próximos eventos.' },
      { icono: 'fa-download', titulo: 'Genera las invitaciones', desc: 'Una por persona, o todas juntas en un archivo ZIP.' }
    ],
    tip: 'El ZIP admite hasta 100 tarjetas por tanda. Si el personal es más numeroso, hazlo por departamento.'
  },

  departamentos: {
    titulo: 'Departamentos',
    icono: 'fa-building',
    color: 'blue-light',
    pasos: [
      { icono: 'fa-plus', titulo: 'Agrega una unidad', desc: 'Pulsa "Nuevo" y escribe el código y el nombre del departamento.' },
      { icono: 'fa-pen', titulo: 'Corrige', desc: 'Usa el lápiz de cada fila para editar los datos.' },
      { icono: 'fa-file-csv', titulo: 'Carga masiva', desc: 'Exporta la plantilla en CSV, complétala en Excel y vuelve a subirla.' }
    ],
    tip: 'Al importar, los departamentos se reconocen por su nombre: si ya existe se actualiza, si no se crea.'
  },

  empleados: {
    titulo: 'Empleados',
    icono: 'fa-users',
    color: 'blue-light',
    pasos: [
      { icono: 'fa-plus', titulo: 'Registra a alguien', desc: 'DUI, nombres y apellidos son obligatorios. Lo demás es opcional.' },
      { icono: 'fa-pen', titulo: 'Actualiza', desc: 'Edita cargo, teléfono, correo o departamento cuando cambien.' },
      { icono: 'fa-file-csv', titulo: 'Carga masiva', desc: 'Exporta el CSV, edítalo en Excel y súbelo. Se reconocen por el DUI.' }
    ],
    tip: 'El DUI no se repite: es la llave de todo el sistema. Si al importar cambias un DUI, se crea una persona nueva.'
  },

  eventos: {
    titulo: 'Eventos',
    icono: 'fa-calendar-day',
    color: 'error',
    pasos: [
      { icono: 'fa-plus', titulo: 'Crea el evento', desc: 'Ponle nombre, fecha y lugar.' },
      { icono: 'fa-toggle-on', titulo: 'Actívalo', desc: 'Marca cuál es el evento en curso. Solo puede haber uno activo.' }
    ],
    tip: 'El evento activo manda: contra él se registran las asistencias y se hacen los sorteos. Actívalo antes de abrir las puertas.'
  },

  sorteos: {
    titulo: 'Administrar sorteos',
    icono: 'fa-ticket',
    color: 'warning',
    pasos: [
      { icono: 'fa-plus', titulo: 'Crea el sorteo', desc: 'Dale un nombre y vincúlalo al premio que corresponde.' },
      { icono: 'fa-play', titulo: 'Pruébalo', desc: 'Puedes extraer ganadores desde aquí o desde la pantalla de rifas.' }
    ],
    tip: 'Cuando ya no queda nadie elegible, el sorteo se marca como realizado automáticamente.'
  },

  premios: {
    titulo: 'Premios',
    icono: 'fa-trophy',
    color: 'warning',
    pasos: [
      { icono: 'fa-plus', titulo: 'Registra el premio', desc: 'Nombre, descripción y cuántas unidades hay disponibles.' },
      { icono: 'fa-pen', titulo: 'Ajusta el inventario', desc: 'La cantidad baja sola con cada ganador extraído.' }
    ],
    tip: 'Un premio con cantidad en cero sigue apareciendo, pero ya no descuenta más.'
  },

  configuracion: {
    titulo: 'Configuración',
    icono: 'fa-sliders',
    color: 'gray',
    pasos: [
      { icono: 'fa-toggle-on', titulo: 'Interruptores', desc: 'Apaga un módulo si necesitas bloquearlo durante el evento.' },
      { icono: 'fa-heart-pulse', titulo: 'Diagnóstico', desc: 'Revisa antes de abrir puertas que haya evento activo y personal cargado.' }
    ],
    tip: 'Apagar el escáner detiene el registro de asistencias al instante, para todos los dispositivos.'
  },

  usuarios: {
    titulo: 'Usuarios',
    icono: 'fa-user-shield',
    color: 'brand',
    pasos: [
      { icono: 'fa-plus', titulo: 'Crea la cuenta', desc: 'Define usuario y contraseña, y asígnale un rol.' },
      { icono: 'fa-link', titulo: 'Vincula al empleado', desc: 'Opcional, pero así el sistema muestra su nombre real en vez del usuario.' }
    ],
    tip: 'La contraseña solo se cambia si escribes una nueva. Dejar el campo vacío al editar conserva la actual.'
  },

  permisos: {
    titulo: 'Permisos',
    icono: 'fa-shield-halved',
    color: 'error',
    pasos: [
      { icono: 'fa-user-tag', titulo: 'Elige el rol', desc: 'Selecciona a qué rol le vas a configurar los accesos.' },
      { icono: 'fa-table-cells-large', titulo: 'Marca la matriz', desc: 'Cruza módulo con acción: ver, agregar, editar o eliminar.' },
      { icono: 'fa-floppy-disk', titulo: 'Guarda', desc: 'Los cambios aplican la próxima vez que esa persona inicie sesión.' }
    ],
    tip: '"Ver" es la base: sin ese permiso los otros tres no tienen efecto, y por eso se activa solo al marcar cualquiera.'
  }
};

/** Devuelve la guía de una vista, con una de respaldo si no tiene la suya. */
export function guiaDe(vista) {
  return GUIAS[vista] || GUIAS.scanner;
}
