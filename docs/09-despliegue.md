# Despliegue y Operación

## 1. Plataforma

| Componente | Servicio | Plan | Notas |
|------------|----------|------|-------|
| Hosting | Vercel | Hobby (gratis) | Límite 12 Serverless Functions |
| Base de datos | Supabase | Free | PostgreSQL gestionado |
| Repositorio | GitHub | Privado | CI/CD automático por Vercel |

## 2. Configuración de Vercel

### 2.1 Variables de Entorno (Environment Variables)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | Service role key (bypasea RLS) |

**Cómo configurar:**
1. Ir a Vercel Dashboard → Proyecto → Settings → Environment Variables.
2. Agregar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para Production, Preview y Development.
3. Redeploy después de agregar variables.

### 2.2 `vercel.json` (Recomendado)

```json
{
  "functions": {
    "api/**/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "regions": ["iad1"],
  "cleanUrls": true,
  "trailingSlash": false
}
```

**Beneficios:**
- Limita memoria a 1GB por función (dentro del plan Hobby).
- Fija región `iad1` (East US) para menor latencia.
- URLs limpias sin `.html`.

### 2.3 `package.json` (Recomendado)

```json
{
  "name": "fiesta-empleados",
  "version": "1.0.0",
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

**Nota:** Las dependencias son solo para backend (`/api`). Frontend usa CDN.

## 3. Flujo de Deployment

```
git push origin main
    │
    ▼
Vercel detecta push
    │
    ▼
Build: compila ESM → CommonJS
    │
    ▼
Deploy: publica en edge network
    │
    ▼
URL producción: https://fiesta-empleados.vercel.app
```

### 3.1 Comandos de Deploy

```bash
# Instalar Vercel CLI (si no está instalado)
npm i -g vercel

# Deploy a preview
vercel

# Deploy a producción
vercel --prod
```

## 4. Monitoreo

### 4.1 Logs en Vercel
- Dashboard → Functions → Seleccionar función → Logs.
- Buscar errores 4xx/5xx.
- Latencia y cold starts visibles.

### 4.2 Métricas Clave

| Métnica | Umbral de Alerta |
|---------|-----------------|
| Error rate | >5% |
| Latencia P95 | >2s |
| Cold start duration | >3s |
| Sincronizaciones fallidas | >10% |

### 4.3 Healthcheck

Endpoint: `GET /api/asistencia?action=diagnostico`

Respuesta esperada:
```json
{
  "ok": true,
  "eventoActivo": "Fiesta de Empleados 2026",
  "empleadosActivos": 150,
  "asistentesRegistrados": 45,
  "alertas": [],
  "latenciaMs": 120
}
```

## 5. Rollback

Vercel mantiene historial de deployments. Para rollback:
1. Dashboard → Deployments.
2. Seleccionar deployment anterior.
3. Click en "..." → "Promote to Production".

## 6. Consideraciones de Seguridad

- **HTTPS obligatorio**: Vercel lo provee por defecto.
- **CORS**: No configurado explícitamente; Vercel maneja CORS para same-origin.
- **Service Role Key**: Nunca exponer en frontend. Solo en `/api` via variables de entorno.
- **Rate limiting**: No implementado; considerar para `/api/invitacion-publica`.

## 7. Tareas Post-Deploy

1. Verificar que `eventoActivo` esté configurado.
2. Verificar que existan roles y permisos iniciales.
3. Probar escaneo de QR de prueba.
4. Verificar modo offline (DevTools → Offline).
5. Verificar portal público `?invitacion=1`.

---

*Documento vivo. Actualizar con cada cambio de infraestructura.*
