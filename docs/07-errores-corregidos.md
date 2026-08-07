# Errores Corregidos

## 1. IDBKeyRange.only(false) en IndexedDB

**Fecha:** 2026-08-06  
**Severidad:** Alta  
**Módulo:** Offline / Asistencias

### Síntoma
Al escanear un QR sin conexión, el sistema mostraba:
```
Error al guardar offline: Failed to execute 'only' on 'IDBKeyRange': 
The parameter is not a valid key.
```

### Causa Raíz
En `assets/js/offline.js`, la función `obtenerPendientes()` utilizaba:
```javascript
const index = store.index('sincronizado');
const request = index.getAll(IDBKeyRange.only(false));
```
El índice `sincronizado` era de tipo booleano/texto, y `IDBKeyRange.only(false)` no es válido para claves no numéricas en algunos navegadores (especialmente móviles).

### Solución
Eliminar el uso del índice y filtrar en memoria:
```javascript
const request = store.getAll();
request.onsuccess = () => resolve((request.result || []).filter(function(r) { 
  return r.sincronizado !== true; 
}));
```

### Lección
No asumir que `IDBKeyRange.only()` funciona con booleanos en todos los navegadores. Filtrar en memoria cuando el dataset es pequeño (asistencias offline).

---

## 2. Select nativo de departamentos sin búsqueda

**Fecha:** 2026-08-06  
**Severidad:** Media  
**Módulo:** Empleados / Formulario

### Síntoma
El formulario de empleados usaba un `<select>` nativo con todos los departamentos. En listas largas era imposible encontrar opciones rápidamente.

### Causa Raíz
Uso de elemento nativo `<select>` sin capacidad de búsqueda ni filtrado.

### Solución
Reemplazar por combo custom con:
- Input de búsqueda que filtra en tiempo real.
- Lista desplegable con resultados filtrados.
- Variables reactivas: `busquedaDptoModal`, `departamentosFiltradosModal`, `departamentoSeleccionadoNombre`.

---

## 3. Layout sin ancho completo en desktop

**Fecha:** 2026-08-06  
**Severidad:** Media  
**Módulo:** CSS / Layout global

### Síntoma
En tablets y escritorio, el contenido no ocupaba todo el ancho disponible, dejando márgenes excesivos.

### Causa Raíz
Clases `max-w-7xl mx-auto` en `main-inicio.html` y contenedores con anchos máximos fijos.

### Solución
- Eliminar `max-w-7xl mx-auto` del `<main>`.
- Agregar CSS para que `main` use `max-width: 100%` con padding responsivo.
- Ajustar margen dinámico según estado del sidebar (`md:ml-64` / `md:ml-20`).

---

## 4. Sidebar oculto por defecto sin botón hamburguesa

**Fecha:** 2026-08-06  
**Severidad:** Media  
**Módulo:** Navegación / Sidebar

### Síntoma
El sidebar iniciaba oculto en desktop, pero no existía forma de abrirlo.

### Causa Raíz
Falta de botón de toggle y estado inicial sin control.

### Solución
- Agregar botón hamburguesa fijo en navbar (`z-50`).
- State inicial `sidebarAbierto = ref(false)`.
- En desktop, al cerrar sidebar muestra solo íconos (`w-20`) con tooltips.
- En mobile, overlay para cerrar al tocar fuera.

---

## 5. Vista principal debajo del sidebar

**Fecha:** 2026-08-06  
**Severidad:** Alta  
**Módulo:** CSS / Layout

### Síntoma
Al abrir el sidebar, el contenido principal quedaba debajo (oculto) en vez de desplazarse.

### Causa Raíz
- `z-index` insuficiente en sidebar (`z-20`).
- Margen estático `md:ml-64` sin transición.
- Overlay mobile con `z-20` menor que el contenido.

### Solución
- Aumentar `z-index` de sidebar a `z-40`.
- Aumentar `z-index` de navbar a `z-50`.
- Cambiar margen base a `md:ml-20` con transición a `md:ml-64`.
- Overlay mobile a `z-30`.

---

## 6. Tooltips del sidebar cortados horizontalmente

**Fecha:** 2026-08-06  
**Severidad:** Baja  
**Módulo:** Sidebar / CSS

### Síntoma
Los tooltips con nombres de vistas se cortaban al salir del sidebar.

### Causa Raíz
`overflow: hidden` en el contenedor del sidebar.

### Solución
Agregar `overflow-x-visible` al `<aside>`.

---

## 7. Error de compilación ESM en Vercel (falso positivo)

**Fecha:** 2026-08-06  
**Severidad:** Baja  
**Módulo:** Deployment / Vercel

### Síntoma
Vercel mostraba warning:
```
Node.js functions are compiled from ESM to CommonJS. 
If this is not intended, add "type": "module" to your package.json file.
```

### Causa Raíz
Proyecto sin `package.json` ni configuración de módulos.

### Solución
Agregar `"type": "module"` a `package.json`. El warning desaparece y la compilación es transparente.

---

## 8. Límite de 12 Serverless Functions en Vercel Hobby

**Fecha:** 2026-08-06  
**Severidad:** Alta (bloqueante para deploy)

### Síntoma
Vercel fallaba el build por exceder el límite de funciones serverless.

### Causa Raíz
Existían 14 archivos en `/api` (contando `_lib`).

### Solución
Fusionar funciones relacionadas usando parámetros `?action=`:
- `auth.js`: absorbe `datos-iniciales`.
- `roles.js`: absorbe `permisos`, `guardar-permiso`, `guardar-permisos-rol`.
- `premios.js`: absorbe `sorteos` y `sortear-ganador`.

Resultado: 11 funciones serverless (dentro del límite).

---

*Documento vivo. Agregar cada error corregido con formato estándar.*
