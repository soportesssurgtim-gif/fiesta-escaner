# Base de Datos

## 1. Diagrama Entidad-Relación (Texto)

```
roles (1) ───< (N) usuarios
empleados (1) ───< (N) usuarios
empleados (N) ───< (N) dpto  (via empleados.dpto → dpto.id)

eventos (1) ───< (N) asistencias
empleados (1) ───< (N) asistencias

eventos (1) ───< (N) sorteos
premios (1) ───< (N) sorteos

sorteos (1) ───< (N) ganadores
empleados (1) ───< (N) ganadores
asistencias (1) ───< (N) ganadores

roles (1) ───< (N) permisos
```

## 2. Tablas

### 2.1 roles
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
nombre_rol TEXT NOT NULL
activo TEXT DEFAULT 'TRUE'
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

**Roles predefinidos:**
| ID (referencia) | Nombre |
|-----------------|--------|
| `b4ca7611-...` | Administrador |
| `6df16bcd-...` | Logística |
| `c8ce503c-...` | Empleado (sin acceso) |
| `3dcdef10-...` | Invitado (sin acceso) |

### 2.2 dpto (departamentos)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
cod_dpto TEXT
nombre_dpto TEXT NOT NULL
activo TEXT DEFAULT 'TRUE'
```

### 2.3 empleados
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
distrito TEXT
dpto UUID REFERENCES dpto(id)
cargo TEXT
nombres TEXT NOT NULL
apellidos TEXT NOT NULL
fecha_nacimiento TEXT
telefono TEXT
correo TEXT
dui TEXT UNIQUE NOT NULL
codigo TEXT  -- Código asignado por TI
activo TEXT DEFAULT 'TRUE'
```

**Notas:**
- `dui` debe ser único en toda la organización.
- `codigo` es opcional y lo asigna manualmente el área de TI.

### 2.4 usuarios
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
empleado UUID REFERENCES empleados(id)
telefono TEXT
correo TEXT
usuario TEXT UNIQUE NOT NULL
temp_pass TEXT
password TEXT NOT NULL  -- bcrypt
rol UUID REFERENCES roles(id)
configurado TEXT DEFAULT 'FALSE'
activo TEXT DEFAULT 'TRUE'
```

**Notas:**
- `password` almacenado con bcrypt (10 rounds).
- `temp_pass` para reseteo inicial.
- Un usuario puede estar vinculado a un empleado.

### 2.5 eventos
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
nombre TEXT NOT NULL
fecha_evento TEXT
ubicacion TEXT
activo TEXT DEFAULT 'FALSE'
creado_por UUID
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

**Restricción de negocio:** Solo un evento puede estar activo a la vez.

### 2.6 premios
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
nombre TEXT NOT NULL
descripcion TEXT
cantidad INTEGER DEFAULT 1
activo TEXT DEFAULT 'TRUE'
```

### 2.7 sorteos
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
evento UUID REFERENCES eventos(id)
nombre TEXT NOT NULL
premio UUID REFERENCES premios(id)
fecha_hora_sorteo TIMESTAMP WITH TIME ZONE DEFAULT NOW()
realizado TEXT DEFAULT 'FALSE'
```

### 2.8 asistencias
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
evento UUID REFERENCES eventos(id)
fecha_hora_asistencia TIMESTAMP WITH TIME ZONE DEFAULT NOW()
empleado UUID REFERENCES empleados(id)
escaneado_por UUID
dispositivo TEXT
fuente TEXT DEFAULT 'qr'
UNIQUE(evento, empleado)  -- Constraint de unicidad
```

**Notas:**
- La unicidad garantiza que un empleado no registre asistencia dos veces por evento.
- `id_cliente` no está en el schema inicial, se maneja en lógica de sincronización offline.

### 2.9 ganadores
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
sorteo UUID REFERENCES sorteos(id)
premio UUID REFERENCES premios(id)
empleado UUID REFERENCES empleados(id)
asistencia UUID REFERENCES asistencias(id)
fecha_hora_sorteo TIMESTAMP WITH TIME ZONE DEFAULT NOW()
entregado_por UUID
entregado TEXT DEFAULT 'FALSE'
```

### 2.10 permisos
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
rol UUID REFERENCES roles(id)
modulo TEXT NOT NULL
puede_ver TEXT DEFAULT 'FALSE'
puede_agregar TEXT DEFAULT 'FALSE'
puede_editar TEXT DEFAULT 'FALSE'
puede_eliminar TEXT DEFAULT 'FALSE'
```

**Módulos existentes:**
- `tarjetas`
- `departamentos`
- `empleados`
- `eventos`
- `sorteos`
- `premios`
- `configuracion`
- `usuarios`
- `permisos`

### 2.11 configuracion
```sql
clave TEXT PRIMARY KEY
valor TEXT
descripcion TEXT
```

### 2.12 sesiones
```sql
token TEXT PRIMARY KEY
datos JSONB
expira_en TIMESTAMP WITH TIME ZONE
```

## 3. Migraciones

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/001_init_schema.sql` | Schema completo inicial |
| `supabase/migrations/002_tarjetas_permisos.sql` | Permisos iniciales para módulo tarjetas |

## 4. Datos Iniciales (Seed)

- **Roles**: 4 roles predefinidos con IDs UUID fijos.
- **Permisos**: Insertados vía `002_tarjetas_permisos.sql` y seed adicional en `auth.js` (`obtenerBundleInicial`).

## 5. Consideraciones

- **UUIDs**: todos los IDs son UUID v4 generados por la base de datos.
- **Fechas**: almacenadas como `TIMESTAMP WITH TIME ZONE` en formato ISO.
- **Activos**: soft delete mediante columna `activo` (`TRUE`/`FALSE`).
- **Código de empleado**: no es auto-incremental; lo asigna TI manualmente.

---

*Documento vivo. Actualizar con cada cambio de schema.*
