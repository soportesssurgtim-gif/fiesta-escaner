# Documentación Técnica - Sistema de Asistencia y Tarjetas de Invitación

> **Alcaldía Municipal de San Salvador Sur**  
> Gerencia de Tecnología - 2026  
> Documento generado para mantenimiento, evolución y auditoría del sistema.

---

## Índice de Documentación

| # | Documento | Descripción |
|---|-----------|-------------|
| 01 | [Propósito del Proyecto](./01-proposito.md) | Objetivos de negocio, alcance y actores involucrados |
| 02 | [Arquitectura del Sistema](./02-arquitectura.md) | Flujo de datos, capas, endpoints y componentes |
| 03 | [Tecnologías Utilizadas](./03-tecnologias.md) | Stack completo, librerías, servicios externos |
| 04 | [Base de Datos](./04-base-datos.md) | Schema completo, relaciones, migraciones y constraints |
| 05 | [Módulos del Sistema](./05-modulos.md) | Catálogo de vistas, permisos y responsabilidades |
| 06 | [Estado Actual](./06-estado-actual.md) | Funcionalidades implementadas y operativas |
| 07 | [Errores Corregidos](./07-errores-corregidos.md) | Historial de bugs, causas raíz y soluciones aplicadas |
| 08 | [Mejoras Propuestas](./08-mejoras-propuestas.md) | Roadmap técnico y mejoras recomendadas a nivel senior |
| 09 | [Despliegue y Operación](./09-despliegue.md) | Configuración Vercel, variables de entorno y monitoreo |
| 10 | [Convenciones y Estándares](./10-convenciones.md) | Guía de estilo, commits, nomenclatura y seguridad |
| 11 | [Roadmap Monumental](./11-roadmap-monumental.md) | Visión reutilizable multi-evento, features wow y roadmap priorizado |
| 12 | [Migración a la v2](./12-migracion-v2.md) | **Empieza por aquí.** Router único, rediseño TailAdmin, errores corregidos y pasos previos al despliegue |

---

## Navegación Rápida

- **Para retomar el proyecto hoy**: Leer `12-migracion-v2.md` primero
- **Para nuevos desarrolladores**: Leer `01-proposito.md` → `12-migracion-v2.md` → `02-arquitectura.md`
- **Para operadores/soporte**: Leer `06-estado-actual.md` → `09-despliegue.md`
- **Para mantenimiento**: Leer `07-errores-corregidos.md` → `08-mejoras-propuestas.md`
- **Para DBA**: Leer `04-base-datos.md` → `05-modulos.md`
- **Para visión futura**: Leer `11-roadmap-monumental.md`
- **Para contribuir**: Leer `10-convenciones.md`

---

## Resumen Ejecutivo

El sistema es una plataforma web de **gestión de asistencias y tarjetas de invitación** para eventos corporativos municipales. Permite:
- Escanear códigos QR de invitaciones para registrar asistencia.
- Gestionar catálogos de empleados, departamentos, eventos, premios y sorteos.
- Generar tarjetas de invitación personalizadas con QR QuickChart.
- Controlar accesos por roles y permisos granulares por módulo.
- Operar en modo offline con sincronización posterior.

### Restricciones de Arquitectura
- **Vercel Hobby Plan**: límite de **12 Serverless Functions**.
  Desde la v2 el backend usa **una sola** (`api/index.js` como router), así que
  el límite dejó de ser una preocupación. Todo el código compartido vive en
  `api/_lib/`, que Vercel no contabiliza por empezar con guion bajo.
- El proyecto **no usa build tools** (sin webpack, vite, bundlers).
- **ESM nativo** en backend y **módulos ES** en el navegador.
- Interfaz basada en **TailAdmin Free** (licencia MIT).

---

*Documento vivo. Actualizar con cada cambio estructural del sistema.*
