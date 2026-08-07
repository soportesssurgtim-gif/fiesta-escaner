/**
 * Notificaciones tipo "toast".
 *
 * La versión anterior tenía una sola notificación reactiva: si llegaban dos
 * seguidas (muy común escaneando en fila), la segunda pisaba a la primera y el
 * operador nunca veía el primer mensaje. Acá se apilan y cada una se va sola.
 */

const { ref } = Vue;

// Cuánto dura cada tipo en pantalla. Los errores se quedan más porque suelen
// requerir que la persona haga algo al respecto.
const DURACIONES = {
  exito: 2600,
  info: 3000,
  alerta: 4000,
  error: 5000
};

export function usarNotificaciones() {
  const notificaciones = ref([]);
  let siguienteId = 1;

  function cerrar(id) {
    const indice = notificaciones.value.findIndex((n) => n.id === id);
    if (indice === -1) return;

    // Marcamos que va saliendo para que corra la animación y recién después la
    // sacamos del arreglo.
    notificaciones.value[indice].saliendo = true;
    setTimeout(() => {
      notificaciones.value = notificaciones.value.filter((n) => n.id !== id);
    }, 250);
  }

  function mostrar(mensaje, tipo = 'exito') {
    const id = siguienteId++;

    notificaciones.value.push({
      id,
      mensaje,
      tipo,
      icono: {
        exito: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        alerta: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
      }[tipo] || 'fa-circle-info',
      saliendo: false
    });

    // Más de cuatro a la vez tapan la pantalla; sacamos la más vieja.
    if (notificaciones.value.length > 4) {
      cerrar(notificaciones.value[0].id);
    }

    setTimeout(() => cerrar(id), DURACIONES[tipo] || DURACIONES.info);
    return id;
  }

  return {
    notificaciones,
    cerrarNotificacion: cerrar,
    notificar: mostrar,
    notificarExito: (mensaje) => mostrar(mensaje, 'exito'),
    notificarError: (mensaje) => mostrar(mensaje, 'error'),
    notificarAlerta: (mensaje) => mostrar(mensaje, 'alerta'),
    notificarInfo: (mensaje) => mostrar(mensaje, 'info')
  };
}
