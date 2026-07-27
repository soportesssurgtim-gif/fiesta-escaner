const GUIAS_VISTAS = {
  scanner: {
    titulo: 'Escáner QR',
    icono: 'fa-qrcode',
    color: '#001ba0',
    pasos: [
      { icono: 'lewtedlh', titulo: 'Abrir cámara', desc: 'Pulsa el botón "Abrir Cámara y Escanear QR" para activar la cámara del dispositivo.' },
      { icono: 'nfldjhgf', titulo: 'Escanear código', desc: 'Apunta al código QR de la invitación del empleado. El sistema lo detectará automáticamente.' },
      { icono: 'check-circle', titulo: 'Confirmar asistencia', desc: 'Si el QR es válido, se registrará la asistencia automáticamente. Verás un mensaje de confirmación.' }
    ],
    tips: 'Puedes también escanear una foto del QR usando el botón "Escanear QR con Foto / Imagen".'
  },
  asistentes: {
    titulo: 'Asistencias',
    icono: 'fa-clipboard-list',
    color: '#059669',
    pasos: [
      { icono: 'list', titulo: 'Ver registros', desc: 'Aquí se muestran todos los empleados que han registrado su asistencia mediante QR.' },
      { icono: 'search', titulo: 'Buscar', desc: 'Usa la barra de búsqueda para filtrar por nombre o DUI del empleado.' },
      { icono: 'sync', titulo: 'Sincronizar', desc: 'Si hay registros pendientes offline, pulsa "Sincronizar pendientes" para enviarlos al servidor.' }
    ],
    tips: 'Los registros se agrupan por evento activo. Asegúrate de tener un evento activo configurado.'
  },
  rifa: {
    titulo: 'Sorteos y Rifas',
    icono: 'fa-gift',
    color: '#d97706',
    pasos: [
      { icono: 'ticket-alt', titulo: 'Seleccionar sorteo', desc: 'Elige el sorteo activo del menú desplegable.' },
      { icono: 'play', titulo: 'Ejecutar sorteo', desc: 'Pulsa "Ejecutar sorteo" para seleccionar un ganador aleatorio entre los asistentes.' },
      { icono: 'trophy', titulo: 'Ver ganador', desc: 'El ganador se mostrará en pantalla con su nombre y DUI.' }
    ],
    tips: 'El sorteo solo considera empleados con asistencia registrada y QR escaneado.'
  },
  tarjetas: {
    titulo: 'Tarjetas de Invitación',
    icono: 'fa-id-card',
    color: '#7c3aed',
    pasos: [
      { icono: 'upload', titulo: 'Cargar plantilla', desc: 'Sube una imagen de fondo para la tarjeta de invitación.' },
      { icono: 'mouse-pointer', titulo: 'Posicionar QR', desc: 'Arrastra y ajusta la posición y tamaño del código QR sobre la plantilla.' },
      { icono: 'save', titulo: 'Guardar plantilla', desc: 'Guarda la configuración de la plantilla para usarla en generaciones futuras.' },
      { icono: 'download', titulo: 'Generar invitaciones', desc: 'Selecciona empleados y genera las invitaciones individuales o en lote.' }
    ],
    tips: 'Puedes generar invitaciones una por una o en lote para todos los empleados seleccionados.'
  },
  departamentos: {
    titulo: 'Departamentos',
    icono: 'fa-building',
    color: '#2563eb',
    pasos: [
      { icono: 'plus', titulo: 'Nuevo departamento', desc: 'Pulsa "Nuevo Departamento" para agregar un departamento o unidad.' },
      { icono: 'edit', titulo: 'Editar', desc: 'Usa el menú de acciones para editar o eliminar departamentos existentes.' },
      { icono: 'file-import', titulo: 'Importar CSV', desc: 'Puedes importar departamentos desde un archivo CSV con columnas: código, nombre.' }
    ],
    tips: 'Los departamentos son necesarios para clasificar a los empleados.'
  },
  empleados: {
    titulo: 'Empleados',
    icono: 'fa-id-card',
    color: '#0891b2',
    pasos: [
      { icono: 'plus', titulo: 'Nuevo empleado', desc: 'Registra un nuevo empleado con DUI, nombres, apellidos, cargo y departamento.' },
      { icono: 'edit', titulo: 'Editar / Eliminar', desc: 'Gestiona la información de empleados existentes.' },
      { icono: 'file-import', titulo: 'Importar CSV', desc: 'Importa empleados desde CSV: DUI, nombres, apellidos, cargo, departamento, teléfono.' }
    ],
    tips: 'El DUI debe ser único. El código de empleado es opcional y lo asigna TI manualmente.'
  },
  eventos: {
    titulo: 'Eventos / Fiestas',
    icono: 'fa-calendar-alt',
    color: '#db2777',
    pasos: [
      { icono: 'plus', titulo: 'Crear evento', desc: 'Define un nuevo evento con nombre, fecha y ubicación.' },
      { icono: 'toggle-on', titulo: 'Activar evento', desc: 'Solo puede haber un evento activo a la vez. Actívalo para comenzar a registrar asistencias.' }
    ],
    tips: 'El evento activo es el que se usa para todos los escaneos de QR y generación de invitaciones.'
  },
  sorteos: {
    titulo: 'Sorteos',
    icono: 'fa-ticket-alt',
    color: '#ea580c',
    pasos: [
      { icono: 'plus', titulo: 'Crear sorteo', desc: 'Configura un nuevo sorteo asociado a un premio.' },
      { icono: 'play', titulo: 'Sortear', desc: 'Ejecuta el sorteo para elegir un ganador aleatorio.' }
    ],
    tips: 'Los sorteos usan la lista de empleados con asistencia confirmada.'
  },
  premios: {
    titulo: 'Premios',
    icono: 'fa-trophy',
    color: '#ca8a04',
    pasos: [
      { icono: 'plus', titulo: 'Nuevo premio', desc: 'Registra un premio con nombre, descripción y cantidad disponible.' },
      { icono: 'edit', titulo: 'Gestionar', desc: 'Edita o elimina premios existentes.' }
    ],
    tips: 'Los premios se vinculan a sorteos para su asignación.'
  },
  configuracion: {
    titulo: 'Configuración',
    icono: 'fa-sliders-h',
    color: '#4b5563',
    pasos: [
      { icono: 'cog', titulo: 'Parámetros', desc: 'Ajusta la configuración general del sistema.' }
    ],
    tips: 'Los cambios pueden afectar el comportamiento general de la aplicación.'
  },
  usuarios: {
    titulo: 'Usuarios y Roles',
    icono: 'fa-user-shield',
    color: '#1d4ed8',
    pasos: [
      { icono: 'plus', titulo: 'Nuevo usuario', desc: 'Crea un usuario del sistema vinculado a un empleado.' },
      { icono: 'edit', titulo: 'Editar', desc: 'Modifica roles, estados y credenciales de acceso.' }
    ],
    tips: 'Los roles determinan los permisos de acceso a cada módulo.'
  },
  permisos: {
    titulo: 'Permisos',
    icono: 'fa-shield-alt',
    color: '#991b1b',
    pasos: [
      { icono: 'list', titulo: 'Matriz de permisos', desc: 'Visualiza la matriz completa de roles y permisos.' },
      { icono: 'toggle-on', titulo: 'Activar/desactivar', desc: 'Habilita o deshabilita permisos por rol y módulo.' }
    ],
    tips: 'Los cambios se aplican inmediatamente al iniciar sesión.'
  }
};

if (typeof window !== 'undefined') {
  window.GUIAS_VISTAS = GUIAS_VISTAS;
}
