/**
 * Registro de asistencias sin conexión.
 *
 * El salón del evento suele tener mala señal justo en la puerta, que es donde
 * está el escáner. La regla es simple: un escaneo nunca se pierde. Si no hay
 * red, el registro se guarda en IndexedDB y se sube cuando vuelve la señal.
 *
 * Cada registro lleva un `idCliente` (un UUID generado en el dispositivo) que
 * viaja al servidor. Sirve para que un reintento no se confunda con un escaneo
 * nuevo.
 *
 * ---
 * Nota sobre un error que estuvo activo mucho tiempo: la versión anterior
 * mandaba la sincronización a `/api/asistencias` cuando el endpoint se llamaba
 * `/api/asistencia`, en singular. El 404 se tragaba en un `if (!res.ok)` que
 * devolvía "errores" sin avisar a nadie, así que la sincronización nunca
 * funcionó y nadie se enteró. Ahora todo pasa por servicioApi, que es el único
 * lugar donde se escriben las rutas.
 */

import { api } from './servicioApi.js';

const NOMBRE_BD = 'fiesta-escaner-offline';
const VERSION_BD = 1;
const ALMACEN = 'asistencias_pendientes';

let conexion = null;

/** Abre (y crea si hace falta) la base local. */
function abrir() {
  if (conexion) return Promise.resolve(conexion);

  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(NOMBRE_BD, VERSION_BD);

    solicitud.onupgradeneeded = (evento) => {
      const bd = evento.target.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) {
        const almacen = bd.createObjectStore(ALMACEN, { keyPath: 'idCliente' });
        almacen.createIndex('sincronizado', 'sincronizado', { unique: false });
        almacen.createIndex('momento', 'momento', { unique: false });
      }
    };

    solicitud.onsuccess = (evento) => {
      conexion = evento.target.result;
      resolver(conexion);
    };

    solicitud.onerror = (evento) => rechazar(evento.target.error);
  });
}

/** Envuelve una transacción de IndexedDB en una promesa. */
function transaccion(modo, operacion) {
  return abrir().then(
    (bd) =>
      new Promise((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN, modo);
        const almacen = tx.objectStore(ALMACEN);
        let resultado;

        try {
          resultado = operacion(almacen);
        } catch (fallo) {
          rechazar(fallo);
          return;
        }

        // Esperamos a que la transacción cierre, no solo a que la operación
        // responda: en IndexedDB una escritura no está firme hasta el commit.
        tx.oncomplete = () => resolver(resultado);
        tx.onerror = () => rechazar(tx.error);
        tx.onabort = () => rechazar(tx.error);
      })
  );
}

function nuevoIdCliente() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const servicioOffline = {
  /** Guarda un escaneo que no se pudo enviar. */
  async guardar({ identificador, empleado, dispositivo }) {
    const registro = {
      idCliente: nuevoIdCliente(),
      identificador,
      empleadoId: empleado?.id || null,
      nombres: empleado?.nombres || 'Sin identificar',
      apellidos: empleado?.apellidos || '',
      dispositivo: dispositivo || 'escaner-offline',
      fuente: 'qr',
      sincronizado: false,
      momento: Date.now()
    };

    await transaccion('readwrite', (almacen) => almacen.add(registro));
    return registro;
  },

  /** Los que todavía no llegaron al servidor. */
  async pendientes() {
    // `almacen.getAll()` se completa antes del commit, así que para cuando la
    // transacción cierra el resultado ya está disponible en la solicitud.
    const solicitud = await transaccion('readonly', (almacen) => almacen.getAll());
    return (solicitud.result || []).filter((registro) => registro.sincronizado !== true);
  },

  async contarPendientes() {
    return (await this.pendientes()).length;
  },

  /** Marca varios registros como ya subidos, en una sola transacción. */
  async marcarSincronizados(idsCliente) {
    if (!idsCliente || idsCliente.length === 0) return;

    await transaccion('readwrite', (almacen) => {
      for (const id of idsCliente) {
        const solicitud = almacen.get(id);
        solicitud.onsuccess = () => {
          const registro = solicitud.result;
          if (registro) {
            registro.sincronizado = true;
            registro.sincronizadoEn = new Date().toISOString();
            almacen.put(registro);
          }
        };
      }
    });
  },

  /** Borra lo ya sincronizado para que la base local no crezca sin control. */
  async limpiarSincronizados() {
    await transaccion('readwrite', (almacen) => {
      const solicitud = almacen.getAll();
      solicitud.onsuccess = () => {
        for (const registro of solicitud.result || []) {
          if (registro.sincronizado === true) almacen.delete(registro.idCliente);
        }
      };
    });
  },

  /**
   * Sube todo lo pendiente.
   * Devuelve el conteo de lo que pasó para poder informarlo en pantalla.
   */
  async sincronizar() {
    const pendientes = await this.pendientes();
    if (pendientes.length === 0) {
      return { sincronizados: 0, duplicados: 0, errores: 0, sinConexion: false };
    }

    try {
      const resultado = await api.asistencias.sincronizar(
        pendientes.map((registro) => ({
          dui: registro.identificador,
          dispositivo: registro.dispositivo,
          id_cliente: registro.idCliente
        }))
      );

      // Marcamos solo lo que el servidor confirmó (subido o ya existente).
      // Lo que falló queda pendiente para el siguiente intento.
      const confirmados = (resultado.detalle || [])
        .filter((fila) => fila.estado === 'sincronizado' || fila.estado === 'duplicado')
        .map((fila) => fila.id_cliente)
        .filter(Boolean);

      await this.marcarSincronizados(confirmados);
      await this.limpiarSincronizados();

      return { ...resultado, sinConexion: false };
    } catch (fallo) {
      // Sin red no es un fallo real: los registros siguen a salvo en el
      // dispositivo y se reintentará cuando vuelva la señal.
      return {
        sincronizados: 0,
        duplicados: 0,
        errores: pendientes.length,
        sinConexion: fallo.esFallaDeRed === true
      };
    }
  }
};
