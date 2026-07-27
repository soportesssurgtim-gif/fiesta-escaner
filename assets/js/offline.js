(function() {
  'use strict';

  const DB_NAME = 'fiesta-escaner-offline';
  const DB_VERSION = 1;
  const STORE_NAME = 'asistencias_pendientes';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id_cliente' });
          store.createIndex('sincronizado', 'sincronizado', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function guardarAsistenciaOffline(empleadoId, dui, nombres, apellidos, fuente) {
    if (!db) await openDB();
    const id_cliente = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const registro = {
      id_cliente,
      empleado_id: empleadoId,
      dui,
      nombres,
      apellidos,
      fuente: fuente || 'qr',
      fecha_hora_asistencia: new Date().toISOString(),
      sincronizado: false,
      timestamp: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(registro);
      request.onsuccess = () => resolve(registro);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function obtenerPendientes() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []).filter(function(r) { return r.sincronizado !== true; }));
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function marcarSincronizado(id_cliente) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id_cliente);
      getRequest.onsuccess = () => {
        const registro = getRequest.result;
        if (registro) {
          registro.sincronizado = true;
          registro.sincronizado_en = new Date().toISOString();
          store.put(registro);
        }
        resolve();
      };
      getRequest.onerror = (event) => reject(event.target.error);
    });
  }

  async function eliminarSincronizado(id_cliente) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id_cliente);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function contarPendientes() {
    const pendientes = await obtenerPendientes();
    return pendientes.length;
  }

  async function sincronizarPendientes(token) {
    const pendientes = await obtenerPendientes();
    if (pendientes.length === 0) return { sincronizados: 0, duplicados: 0, errores: 0 };

    try {
      const res = await fetch('/api/asistencias?action=sincronizar-pendientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ registros: pendientes.map(r => ({
          dui: r.dui,
          dispositivo: r.dispositivo,
          id_cliente: r.id_cliente
        })) })
      });

      if (!res.ok) {
        return { sincronizados: 0, duplicados: 0, errores: pendientes.length, offline: true };
      }

      const data = await res.json();
      const sincronizados = (data && data.sincronizados) || 0;
      const duplicados = (data && data.duplicados) || 0;
      const errores = (data && data.errores) || 0;

      // Marcar todos los pendientes como sincronizados si el servidor los procesó
      if (sincronizados > 0 || duplicados > 0) {
        const ids = pendientes.map(r => r.id_cliente);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of ids) {
          const req = store.get(id);
          req.onsuccess = () => {
            const reg = req.result;
            if (reg) {
              reg.sincronizado = true;
              reg.sincronizado_en = new Date().toISOString();
              store.put(reg);
            }
          };
        }
      }

      return { sincronizados, duplicados, errores, offline: false };
    } catch (e) {
      return { sincronizados: 0, duplicados: 0, errores: pendientes.length, offline: true };
    }
  }

  window.OfflineApp = {
    openDB,
    guardarAsistenciaOffline,
    obtenerPendientes,
    marcarSincronizado,
    eliminarSincronizado,
    contarPendientes,
    sincronizarPendientes
  };
})();
