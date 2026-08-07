# Mejoras Propuestas

## 1. Mejoras Críticas (Prioridad Alta)

### 1.1 Agregar `"type": "module"` a `package.json`
**Problema:** Vercel muestra warnings de compilación ESM→CJS.  
**Solución:** Crear `package.json` mínimo con `"type": "module"` para declarar explícitamente ESM.  
**Impacto:** Elimina warnings, mejora legibilidad del build.

### 1.2 Implementar `vercel.json` para configuración explícita
**Problema:** Vercel infiere configuración.  
**Solución:** Agregar `vercel.json` con:
```json
{
  "functions": {
    "api/**/*.js": { "memory": 1024, "maxDuration": 10 }
  },
  "regions": ["iad1"]
}
```
**Impacto:** Control de recursos, reducción de cold starts.

### 1.3 Migrar plantillas de vistas a componentes `.vue` con build
**Problema:** Carga secuencial de 20+ templates HTML con `fetch()` aumenta time-to-interactive.  
**Solución:** Usar Vite + Vue SFC para compilar vistas en un solo bundle.  
**Impacto:** Reducción de requests iniciales, mejor caching, menor latencia.

### 1.4 Implementar Service Worker para cache offline completo
**Problema:** Solo `sw.js` básico; sin cache, la app no funciona offline en primera visita.  
**Solución:** Workbox precache de `index.html`, assets estáticos y CDNs críticos.  
**Impacto:** PWA funcional offline desde primera carga.

## 2. Mejoras de Arquitectura (Prioridad Media)

### 2.1 Consolidar API en un solo router (`api/index.js`)
**Problema:** 11 archivos serverless con lógica repetida de auth/session.  
**Solución:** Un solo `api/index.js` con enrutamiento interno por `req.path` y `req.method`.  
**Impacto:** Reduce a 1 función serverless, elimina duplicación de código, simplifica mantenimiento.

### 2.2 Introducir capa de servicios en backend
**Problema:** Lógica de negocio mezclada con handlers HTTP.  
**Solución:** Separar en `services/` (ej: `AsistenciaService`, `EmpleadoService`) puros sin dependencia de `req/res`.  
**Impacto:** Código testeable, reutilizable, mantenible.

### 2.3 Implementar rate limiting en endpoints públicos
**Problema:** `/api/invitacion-publica` es público sin límite de requests.  
**Solución:** Middleware de rate limiting por IP (ej: `@vercel/edge-rate-limit` o custom).  
**Impacto:** Prevención de abuse y scraping.

### 2.4 Agregar validación de esquema en backend
**Problema:** Validaciones manuales dispersas en cada endpoint.  
**Solución:** Usar `zod` o `joi` para definir esquemas de request/response.  
**Impacto:** Código más robusto, errores consistentes.

## 3. Mejoras de UX/UI (Prioridad Media)

### 3.1 Implementar skeletons de carga por vista
**Problema:** Spinner genérico durante carga de datos.  
**Solución:** Skeletons específicos por módulo (tablas, cards, formularios).  
**Impacto:** Mejor percepción de performance.

### 3.2 Agregar confirmaciones visuales en acciones críticas
**Problema:** Alertas nativas o ausencia de confirmación.  
**Solución:** Modales de confirmación con animaciones (ej: eliminar empleado, sortear).  
**Impacto:** Reducción de errores de usuario.

### 3.3 Implementar búsqueda global
**Problema:** Búsqueda limitada a módulos individuales.  
**Solución:** Búsqueda unificada en navbar (empleados, asistencias, departamentos).  
**Impacto:** Mejor discoverabilidad.

## 4. Mejoras de Datos y Confiabilidad (Prioridad Media)

### 4.1 Agregar índices en Supabase para consultas frecuentes
**Problema:** Filtros por `dui`, `activo`, `evento` pueden ser lentos en tablas grandes.  
**Solución:** 
```sql
CREATE INDEX idx_empleados_dui ON empleados(dui);
CREATE INDEX idx_asistencias_evento_empleado ON asistencias(evento, empleado);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);
```
**Impacto:** Mejora de latencia en consultas de escaneo y listados.

### 4.2 Implementar deduplicación por dispositivo en offline
**Problema:** Un mismo dispositivo puede enviar múltiples veces el mismo QR offline.  
**Solución:** Usar `id_cliente` (fingerprint del dispositivo) + DUI como clave de deduplicación.  
**Impacto:** Reduce falsos duplicados en sincronización.

### 4.3 Agregar campo `origen` o `fuente_detalle` en asistencias
**Problema:** Solo se registra `fuente: 'qr'` pero no si fue cámara o foto.  
**Solución:** Agregar `fuente_detalle TEXT` con valores `camara` | `foto` | `manual`.  
**Impacto:** Mejor trazabilidad para auditoría.

## 5. Mejoras de Monitoreo y Operación (Prioridad Baja)

### 5.1 Implementar logging estructurado
**Problema:** `console.error` disperso sin formato.  
**Solución:** Usar `pino` o similar con niveles y traces.  
**Impacto:** Mejor debugging en producción.

### 5.2 Agregar healthcheck mejorado
**Problema:** `/api/asistencia?action=diagnostico` es básico.  
**Solución:** Incluir latencia de DB, versiones, estado de funciones serverless.  
**Impacto:** Mejor observabilidad.

### 5.3 Implementar feature flags
**Problema:** Despliegues riesgosos sin posibilidad de rollback granular.  
**Solución:** Usar tabla `configuracion` con claves de feature flags.  
**Impacto:** Despliegues más seguros.

---

## 6. Roadmap Sugerido

| Fase | Mejora | Esfuerzo | Impacto |
|------|--------|----------|---------|
| 1 | `vercel.json` + `package.json` | Bajo | Alto |
| 2 | Consolidar API en 1 función | Medio | Alto |
| 3 | Service Worker completo | Medio | Alto |
| 4 | Vite + Vue SFC | Alto | Muy Alto |
| 5 | Rate limiting + validación zod | Medio | Alto |
| 6 | Índices DB + dedup offline | Bajo | Medio |

---

*Documento vivo. Actualizar con cada revisión técnica.*
