# Tecnologías Utilizadas

## 1. Stack Principal

| Capa | Tecnología | Versión | Uso |
|------|-----------|---------|-----|
| **Frontend** | Vue 3 | 3.x (CDN) | SPA reactiva sin build step |
| **Estilos** | Tailwind CSS | 3.x (CDN) | Utilidades CSS atomic |
| **Iconos** | Font Awesome | 6.5.1 (CDN) | Iconografía |
| **Animaciones** | LordIcon | CDN | Iconos animados en guía de usuario |
| **QR Escáner** | html5-qrcode | 2.3.8 (CDN) | Escaneo de QR en navegador |
| **QR Generator** | QuickChart.io | API pública | Generación de QR en servidor |
| **ZIP batch** | JSZip | 3.10.1 (CDN) | Empaquetado de invitaciones |
| **Backend** | Vercel Serverless Functions | Node.js ESM | API sin servidor |
| **Base de datos** | Supabase | Cloud | PostgreSQL gestionado |
| **Deployment** | Vercel | Hobby Plan | Hosting estático + edge functions |
| **Control de versiones** | Git / GitHub | - | Repositorio privado |

## 2. Detalle de Dependencias Frontend (CDN)

```html
<!-- Orden de carga en index.html -->
<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.lordicon.com/lordicon.js"></script>
```

### Restricción
- **Sin NPM**, **sin bundlers**, **sin node_modules** en frontend.
- Todo se sirve desde CDN para mantener el proyecto como HTML estático.

## 3. Stack Backend

| Componente | Detalle |
|------------|---------|
| Runtime | Node.js 18+ (inferido por Vercel) |
| Módulos | ESM nativo (`import`/`export`) |
| Compilación | Vercel convierte ESM → CommonJS automáticamente |
| Base de datos | Supabase JS Client (`@supabase/supabase-js`) |
| Passwords | `bcryptjs` para hashing |
| Sin ORM | Queries directas con cliente Supabase |

## 4. Servicios Externos

| Servicio | Propósito | Costo |
|----------|-----------|-------|
| **Supabase** | Base de datos PostgreSQL + Auth | Gratuito (plan Free) |
| **Vercel** | Hosting + Serverless Functions | Hobby (gratis, 12 functions) |
| **QuickChart.io** | Generación de códigos QR | Público, rate limit según plan |
| **GitHub** | Repositorio de código | Privado |

## 5. Navegadores Soportados

| Navegador | Versión mínima | Notas |
|-----------|---------------|-------|
| Chrome | 90+ | Recomendado para escáner QR |
| Firefox | 88+ | Compatible |
| Safari | 14+ | iOS requiere HTTPS para cámara |
| Edge | 90+ | Compatible |

### Requisitos para escáner QR
- HTTPS obligatorio en producción (acceso a cámara).
- Permisos de cámara concedidos por el usuario.

## 6. Limitaciones Técnicas Conocidas

1. **Vercel Hobby**: límite de 12 Serverless Functions.
2. **Sin SSR/SSG**: todo se renderiza en cliente.
3. **Tailwind CDN**: tamaño de bundle mayor en first paint.
4. **QuickChart público**: dependencia externa para generación de QR.
5. **Sin analytics nativo**: no hay tracking de uso implementado.

---

*Documento vivo. Actualizar con cada cambio de stack.*
