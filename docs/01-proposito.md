# Propósito del Proyecto

## 1. Visión General

Sistema web de **gestión de asistencias y tarjetas de invitación** para eventos corporativos de la Alcaldía Municipal de San Salvador Sur.  
Reemplaza procesos manuales de registro de asistencia por escaneo de códigos QR, generación digital de invitaciones y control centralizado de invitados.

## 2. Objetivos de Negocio

| Objetivo | Descripción |
|----------|-------------|
| **Registro ágil de asistencia** | Escanear QR en el punto de acceso y registrar asistencia en <2 segundos. |
| **Generación autónoma de invitaciones** | Cada empleado consulta su QR por DUI sin intervención administrativa. |
| **Control de aforo y trazabilidad** | Saber exactamente quién asistió, cuándo y desde qué dispositivo. |
| **Sorteos y rifas confiables** | Selección aleatoria de ganadores entre asistentes confirmados. |
| **Gestión centralizada** | Catálogos unificados de empleados, departamentos, eventos y premios. |

## 3. Actores del Sistema

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| **Administrador** | Acceso total al sistema. Configura eventos, plantillas, usuarios y permisos. | CRUD completo en todos los módulos |
| **Logística / Operador** | Escanea QR en el evento, consulta asistencias, ejecuta sorteos. | Lectura/escritura en escáner, asistencias, sorteos |
| **Empleado** | Consulta su invitación/QR propio. No requiere login. | Solo portal público `?invitacion=1` |
| **Sistema (offline)** | Guarda asistencias localmente cuando no hay conectividad. | Sincronización automática |

## 4. Alcance Funcional

### Incluido
- Autenticación por usuario/contraseña con sesiones server-side.
- Escaneo de QR (cámara en vivo o foto) con `html5-qrcode`.
- Registro de asistencia con deduplicación por evento + empleado.
- Modo offline con IndexedDB y sincronización diferida.
- Generación de tarjetas de invitación con QR de QuickChart.
- Portal público de consulta de invitaciones (DUI + últimos 4 dígitos).
- Gestión de catálogos: empleados, departamentos, eventos, premios, sorteos.
- Sistema de permisos granulares por rol y módulo.
- Guía de usuario contextual por vista (LordIcon animado).

### Excluido (fuera de alcance actual)
- Envío de invitaciones por correo/WhatsApp.
- Multi-tenant / multi-institución.
- Reportes analíticos avanzados.
- Notificaciones push en tiempo real.
- PWA instalable (service worker básico solo para cache offline).

## 5. Restricciones y Límites

- **Vercel Hobby**: máximo 12 Serverless Functions por deployment.
- **Sin build tools**: el proyecto se sirve como HTML + assets estáticos.
- **Supabase**: base de datos PostgreSQL con Row Level Security (RLS) manejado por service_role en backend.
- **Offline**: solo asistencias; el resto de operaciones requieren conexión.

## 6. Métricas de Éxito

| Métrica | Target |
|---------|--------|
| Tiempo de escaneo | <2 segundos por QR |
| Disponibilidad offline | 100% funcionalidad de escaneo sin red |
| Tasa de error de escaneo | <1% (QR mal generado o duplicado) |
| Límite de funciones serverless | ≤12 (Vercel Hobby) |

---

*Documento vivo. Actualizar con cada cambio de alcance.*
