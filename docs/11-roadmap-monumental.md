# Roadmap Monumental - Sistema Reutilizable para Eventos Municipales

> **Visión:** Transformar el sistema en una plataforma reutilizable, profesional y escalable para cualquier evento municipal de empleados, sin cambiar de plan (Vercel Free + Supabase Free).

---

## 1. Filosofía de Reusabilidad

El sistema actual está hardcodeado para un solo evento a la vez. Para volverlo **reutilizable**, debemos eliminar esa restricción sin agregar complejidad innecesaria.

### Principios
1. **Multi-evento nativo**: cualquier empleado puede tener QR para eventos diferentes.
2. **Configuración por evento**: cada evento tiene su propia plantilla de tarjeta, premios y sorteos.
3. **Histórico preserved**: los eventos pasados no se borran, se archivan.
4. **Sin migraciones de schema**: todo se logra con datos existentes + nuevas columnas opcionales.

---

## 2. Mejoras Arquitectónicas (Sin Build Tools)

### 2.1 Router por Hash para URLs limpias
**Problema:** El sistema usa una variable `vista` sin enrutador real.  
**Solución:** Implementar un hash router simple en `app.js`:
```javascript
// Sin librerías externas
function getVistaFromHash() {
  const hash = location.hash.replace('#', '');
  return ['scanner', 'asistentes', 'rifa', 'tarjetas', ...].includes(hash) ? hash : 'scanner';
}
```
**Impacto:** URLs como `/?invitacion=1#asistentes` funcionan al recargar. Compartir vistas específicas.

### 2.2 Componentes Web Components para Views
**Problema:** Templates HTML planos sin encapsulamiento.  
**Solución:** Usar Custom Elements nativos (sin framework) para vistas reutilizables:
```javascript
class VistaEmpleados extends HTMLElement { ... }
customElements.define('vista-empleados', VistaEmpleados);
```
**Impacto:** Código modular, reutilizable, sin dependencias.

### 2.3 Estado Global con Pub/Sub
**Problema:** Estado fragmentado entre componentes Vue y vanilla JS.  
**Solución:** Implementar un store minimalista con eventos:
```javascript
const Store = {
  _state: { eventoActivo: null, sesion: null },
  _listeners: {},
  set(key, val) { ... },
  on(key, fn) { ... },
  emit(key, val) { ... }
};
```
**Impacto:** Comunicación desacoplada entre módulos.

---

## 3. Mejoras de Datos y Multi-Evento

### 3.1 QR con ID de Evento (QR Universal)
**Problema:** Un empleado solo puede tener un QR. Si hay 2 eventos en el año, necesita 2 QR diferentes.  
**Solución:** Generar QR con payload `eventoId|dui` (ej: `550e8400-e29b-41d4-a716-446655440000|12345678-9`).  
**Backend:** Al escanear, separar el evento del DUI y validar que el evento esté activo.  
**Impacto:** Un solo QR sirve para todos los eventos del año.

### 3.2 Histórico de Eventos y Archivado
**Problema:** Eventos pasados se mezclan con el activo.  
**Solución:** Agregar estado `archivado` a eventos. Frontend muestra solo activos en selector, pero mantiene historial accesible.  
**Impacto:** Reutilización del sistema año tras año sin perder trazabilidad.

### 3.3 Plantillas de Tarjetas por Evento
**Problema:** Una sola plantilla global para todos los eventos.  
**Solución:** Agregar `evento UUID` a `plantillas_tarjetas`. Cada evento puede tener su diseño único.  
**Impacto:** Cada fiesta puede tener su propia identidad visual.

### 3.4 Catálogo de Distritos Reutilizable
**Problema:** Distritos hardcodeados en `app.js`.  
**Solución:** Tabla `distritos` en Supabase. CRUD administrativo.  
**Impacto:** Reutilizable para cualquier municipio.

---

## 4. Mejoras de UX Profesionales

### 4.1 Onboarding Interactivo para Operadores
**Problema:** Guía estática con LordIcon.  
**Solución:** Tour paso a paso con `driver.js` (CDN, 12KB) o similar:
```javascript
import Driver from 'driver.js';
const driver = new Driver({ 
  showProgress: true,
  steps: [
    { element: '#btn-escaner', popover: { title: 'Escáner', description: '...' } }
  ]
});
driver.drive();
```
**Impacto:** Capacitación autoguiada para nuevo personal.

### 4.2 Modo Kiosko para Puntos de Acceso
**Problema:** Escáner requiere intervención humana para cerrar/abrir cámara.  
**Solución:** Modo kiosko fullscreen con:
- Inicio automático de cámara al cargar.
- Sin botones de navegación visibles.
- Feedback visual grande (✅ verde / ❌ rojo) al escanear.
- Timeout automático para volver a escanear.
**Impacto:** Terminales de acceso autónomos sin operador.

### 4.3 PWA Instalable (Sin Service Worker Complejo)
**Problema:** Solo cache offline, sin instalación.  
**Solución:** Agregar `manifest.json` + meta tags:
```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
```
**Impacto:** Instalable en móviles/tablets como app nativa.

### 4.4 Escaneo por Voz
**Problema:** Operador debe teclear DUI manual si QR falla.  
**Solución:** Web Speech API para dictado:
```javascript
const recognition = new webkitSpeechRecognition();
recognition.lang = 'es-SV';
recognition.onresult = (e) => { duiManual.value = e.results[0][0].transcript; };
```
**Impacto:** Registro rápido sin teclado en tablets.

---

## 5. Mejoras de Seguridad y Auditoría

### 5.1 Log de Auditoría Completo
**Problema:** Solo se registra quién escaneó, no qué hizo después.  
**Solución:** Tabla `auditoria` con trigger en Supabase:
```sql
CREATE TABLE auditoria (
  id UUID DEFAULT gen_random_uuid(),
  tabla TEXT,
  registro_id UUID,
  accion TEXT, -- INSERT, UPDATE, DELETE
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  usuario UUID,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
**Impacto:** Trazabilidad total para compliance municipal.

### 5.2 Caducidad de Invitaciones
**Problema:** QR válido indefinidamente.  
**Solución:** Agregar `fecha_limite` a eventos. El portal público valida que no haya expirado.  
**Impacto:** Control temporal de acceso.

### 5.3 Bloqueo por Intento Fallido en Portal Público
**Problema:** Portal público sin límite de intentos.  
**Solución:** Rate limiting por IP en `/api/invitacion-publica` usando tabla `intentos_fallidos`:
```sql
CREATE TABLE intentos_fallidos (
  ip TEXT,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
**Impacto:** Prevención de fuerza bruta.

---

## 6. Mejoras de Observabilidad (Sin Costo)

### 6.1 Analytics con PostHog (Open Source Self-hosted)
**Problema:** Sin métricas de uso.  
**Solución:** PostHog open source en Vercel Edge Functions (gratis hasta 1M eventos/mes).  
**Impacto:** Saber qué vistas se usan más, tasa de escaneo exitoso, etc.

### 6.2 Alertas por Telegram/Discord
**Problema:** No hay notificación de eventos críticos.  
**Solución:** Webhook a Telegram bot cuando:
- Un evento se activa.
- Se registra más de 100 asistencias en 1 hora.
- Hay error en sincronización offline.
**Impacto:** Monitoreo en tiempo real sin costo.

---

## 7. Mejoras de Infrastructure (Vercel Free)

### 7.1 `vercel.json` Optimizado
```json
{
  "functions": {
    "api/**/*.js": { "memory": 1024, "maxDuration": 10 }
  },
  "regions": ["iad1"],
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }] }
  ]
}
```

### 7.2 `package.json` Correcto
```json
{
  "name": "fiesta-empleados",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "bcryptjs": "^2.4.3"
  }
}
```

### 7.3 ISR (Incremental Static Regeneration)
**Problema:** `index.html` se rebuild completo en cada deploy.  
**Solución:** Vercel ISR para páginas estáticas.  
**Impacto:** Deploy instantáneo de cambios de contenido.

---

## 8. Features "Wow" para el Cliente

### 8.1 Pantalla de Ganadores en TV
**Problema:** Ganador se muestra solo en la tablet del operador.  
**Solución:** Vista pública `/?evento=xxx#ganadores` para proyectar en TV/monitor grande.  
**Impacto:** Experiencia profesional en el evento.

### 8.2 Certificado de Asistencia PDF
**Solución:** Generar PDF personalizado con `pdf-lib` (CDN) o QuickChart imagen.  
**Impacto:** Valor agregado para empleados.

### 8.3 Modo Offline Total para Catálogos
**Problema:** Solo asistencias funcionan offline.  
**Solución:** Cachear catálogos en IndexedDB al primer login.  
**Impacto:** App funcional sin red para consultas.

---

## 9. Roadmap Priorizado

| Fase | Feature | Esfuerzo | Impacto | Prioridad |
|------|---------|----------|---------|-----------|
| 1 | QR Universal (eventoId\|DUI) | Medio | Muy Alto | P0 |
| 2 | Modo Kiosko | Bajo | Alto | P0 |
| 3 | Histórico de Eventos | Bajo | Alto | P1 |
| 4 | PWA Instalable | Bajo | Medio | P1 |
| 5 | Onboarding Interactivo | Medio | Medio | P2 |
| 6 | Log de Auditoría | Medio | Alto | P2 |
| 7 | Escaneo por Voz | Bajo | Bajo | P3 |
| 8 | Pantalla Ganadores TV | Bajo | Medio | P3 |
| 9 | Certificado PDF | Medio | Medio | P3 |
| 10 | Analytics + Alertas | Alto | Medio | P4 |

---

## 10. Presupuesto de Tecnologías (Todo Gratis)

| Servicio | Plan | Límite | Uso Estimado |
|----------|------|--------|--------------|
| **Vercel** | Free | 12 functions, 100GB bandwidth | Suficiente para 10.000 escaneos/mes |
| **Supabase** | Free | 500MB DB, 50K monthly active users | Suficiente para 5.000 empleados |
| **QuickChart** | Free | 100 charts/day, 1M/month | Suficiente para generación de QR |
| **GitHub** | Free | Repos privados ilimitados | - |

**Total costo de operación:** $0/mes.

---

## 11. Conclusión

Este roadmap transforma el sistema de una herramienta puntual en una **plataforma municipal reutilizable** sin inversión en infraestructura. Las tecnologías actuales permiten escalar horizontalmente (más eventos, más empleados) sin cambiar de plan ni agregar build tools.

La clave es **eliminar los hardcodes** (evento único, distritos fijos, una sola plantilla) y agregar **capas de configuración** que permitan adaptar el sistema a cualquier evento futuro sin desarrollar desde cero.

---

*Documento vivo. Priorizar según necesidades del cliente.*
