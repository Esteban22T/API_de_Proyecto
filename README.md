# EKO+ API

API REST desarrollada con **Node.js**, **Express 5** y **PostgreSQL** para gestionar un negocio de servicios por citas: catálogo de servicios, clientes, usuarios/empleados con roles, agenda de citas (con control de cruces de horario) y registro de pagos con abonos parciales.

---

## Tabla de contenidos

1. [¿Qué hace este proyecto?](#qué-hace-este-proyecto)
2. [Tecnologías utilizadas](#tecnologías-utilizadas)
3. [Estructura del proyecto](#estructura-del-proyecto)
4. [Requisitos e instalación paso a paso](#requisitos-e-instalación-paso-a-paso)
5. [Variables de entorno](#variables-de-entorno)
6. [Cómo funciona la base de datos](#cómo-funciona-la-base-de-datos)
7. [Endpoints disponibles](#endpoints-disponibles)
8. [Reglas importantes del negocio](#reglas-importantes-del-negocio)
9. [Estado actual y aspectos pendientes](#estado-actual-y-aspectos-pendientes)

---

## ¿Qué hace este proyecto?

En pocas palabras, esta API permite administrar todo el flujo operativo de reservas y cobros:

1. **Catálogo de servicios:** crear y administrar servicios con su precio y duración estimada en minutos.
2. **Clientes:** registrar los datos básicos de las personas que asisten a las citas.
3. **Usuarios y roles:** gestionar administradores y empleados (con contraseña cifrada y roles asignados).
4. **Citas:** agendar citas con uno o varios servicios, asignando un empleado a cada servicio, calculando horarios y evitando que un empleado tenga dos servicios al mismo tiempo.
5. **Pagos y abonos:** crear la cuenta de cobro de una cita y registrar uno o varios abonos con distintos métodos de pago (`Efectivo`, `Transferencia`, `Tarjeta`, etc.), calculando automáticamente el saldo pendiente.

---

## Tecnologías utilizadas

- **Node.js** (`>= 20.0.0`, usando CommonJS)
- **Express** `^5.3.0` (servidor HTTP y enrutamiento)
- **PostgreSQL** mediante `pg` `^8.23.1` (conexión por pool y consultas SQL directas)
- **CORS** `^2.8.6` (control de orígenes permitidos)
- **dotenv** `^18.0.10` (carga de variables desde `.env`)
- **nodemon** `^3.1.14` (recarga automática en desarrollo)

---

## Estructura del proyecto

```text
API_de_Proyecto/
├── database/
│   └── schema.sql                  # Tablas, restricciones, índices y datos iniciales
├── src/
│   ├── config/
│   │   └── db.js                   # Pool de conexión a PostgreSQL
│   ├── modules/                    # Módulos agrupados por entidad (rutas + validaciones)
│   │   ├── citas/
│   │   │   ├── citas.routes.js
│   │   │   └── citas.validation.js
│   │   ├── clientes/
│   │   │   ├── clientes.routes.js
│   │   │   └── clientes.validation.js
│   │   ├── metodos-pago/
│   │   │   ├── metodos-pago.routes.js
│   │   │   └── metodos-pago.validation.js
│   │   ├── pagos/
│   │   │   ├── pagos.routes.js
│   │   │   └── pagos.validation.js
│   │   ├── servicios/
│   │   │   ├── servicios.routes.js
│   │   │   └── servicios.validation.js
│   │   └── usuarios/
│   │       ├── usuarios.routes.js
│   │       └── usuarios.validation.js
│   ├── utils/
│   │   ├── password.js             # Hash y verificación de contraseñas con scrypt
│   │   └── validators.js           # Funciones reutilizables de validación
│   ├── app.js                      # Configuración de Express, rutas y manejo global de errores
│   └── server.js                   # Arranque del servidor y cierre limpio (SIGINT/SIGTERM)
├── .env.example                    # Plantilla de variables de entorno
├── .gitignore
└── package.json
```

---

## Requisitos e instalación paso a paso

### 1. Requisitos previos
- **Node.js 20 o superior**
- Una base de datos **PostgreSQL** (local o en la nube, como Neon)

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env` en la raíz del proyecto tomando como base `.env.example`:

```bash
cp .env.example .env
```
*(En PowerShell puedes usar `Copy-Item .env.example .env`)*

Edita `.env` con tus datos reales (especialmente `DATABASE_URL`).

### 4. Crear las tablas en PostgreSQL
Ejecuta el contenido de `database/schema.sql` en tu base de datos PostgreSQL.  
Este script crea todas las tablas, índices y carga automáticamente:
- **Roles iniciales:** `Administrador`, `Empleado`
- **Métodos de pago iniciales:** `Efectivo`, `Transferencia`, `Tarjeta`

Ejemplo usando `psql`:
```bash
psql "$DATABASE_URL" -f database/schema.sql
```

### 5. Iniciar el servidor

- **Modo desarrollo** (reinicia automáticamente al guardar cambios):
  ```bash
  npm run dev
  ```
- **Modo normal / producción**:
  ```bash
  npm start
  ```

Si todo está bien, verás en consola:
```text
EKO+ API listening on port 3000.
```

Para comprobar que la API y la base de datos responden, visita:
```text
GET http://localhost:3000/health
```

---

## Variables de entorno

| Variable | Obligatoria | Valor por defecto | Descripción |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Sí | — | URL de conexión a PostgreSQL. Si falta, el servidor no arranca. |
| `PORT` | No | `3000` | Puerto donde escucha el servidor HTTP. |
| `CORS_ORIGIN` | No | `*` | Orígenes permitidos por CORS (`*` para todos, o separados por comas). |
| `APP_TIMEZONE` | No | `America/Bogota` | Zona horaria usada al filtrar citas por fecha (`GET /api/citas?fecha=...`). |

---

## Cómo funciona la base de datos

El esquema en `database/schema.sql` organiza la información así:

- **Usuarios y accesos:** `usuario`, `rol` y `usuario_rol` (relación muchos a muchos).
- **Clientes:** `cliente` (personas que reservan citas; no inician sesión).
- **Servicios:** `servicio` (catálogo con precio y duración estimada en minutos).
- **Agenda:** `cita` (encabezado de la cita con cliente, fecha/hora de inicio y estado) y `cita_servicio` (cada servicio incluido en la cita, su empleado asignado, horario planificado, duración y precio aplicado).
- **Cobros:** `metodo_pago`, `pago` (uno por cita) y `detalle_pago` (los abonos o movimientos individuales de ese pago).
- **Emails únicos:** tanto en `usuario` como en `cliente`, los índices únicos ignoran mayúsculas y minúsculas.

> **Nota:** `schema.sql` también incluye las tablas `permiso`, `rol_permiso`, `horario_empleado` y `empleado_servicio` pensadas para ampliar el sistema. De estas, la API actualmente consulta `empleado_servicio` durante la creación/edición de citas si existen asignaciones registradas.

---

## Endpoints disponibles

Todas las respuestas se devuelven en formato **JSON**.

### Salud del sistema

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/health` | Verifica que la API y la base de datos estén operativas (`200` o `503`). |

---

### Servicios (`/api/servicios`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/servicios` | Lista todos los servicios ordenados por `id`. |
| `GET` | `/api/servicios/:id` | Obtiene un servicio por su `id`. |
| `POST` | `/api/servicios` | Crea un servicio nuevo. |
| `PUT` | `/api/servicios/:id` | Actualiza un servicio existente. |
| `DELETE` | `/api/servicios/:id` | Elimina un servicio (`409` si ya tiene citas asociadas). |

<details>
<summary>Ejemplo de JSON para crear o actualizar un servicio</summary>

```json
{
  "nombre": "Corte de cabello",
  "precio": 35000,
  "duracionEstimada": 45,
  "activo": true
}
```
- `duracionEstimada`: entero mayor a `0` (minutos).
- `precio`: número mayor o igual a `0`.
- `activo`: opcional (por defecto `true` al crear).

</details>

---

### Clientes (`/api/clientes`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/clientes` | Lista todos los clientes. |
| `GET` | `/api/clientes/:id` | Obtiene un cliente por su `id`. |
| `POST` | `/api/clientes` | Registra un cliente nuevo. |
| `PUT` | `/api/clientes/:id` | Actualiza los datos de un cliente. |
| `DELETE` | `/api/clientes/:id` | Elimina un cliente (`409` si tiene citas asociadas). |

<details>
<summary>Ejemplo de JSON para crear o actualizar un cliente</summary>

```json
{
  "primerNombre": "Laura",
  "segundoNombre": "Sofía",
  "primerApellido": "Gómez",
  "segundoApellido": null,
  "telefono": "3001234567",
  "email": "laura.gomez@example.com",
  "activo": true
}
```
- Obligatorios: `primerNombre`, `primerApellido`.
- Opcionales: `segundoNombre`, `segundoApellido`, `telefono`, `email` (debe ser único si se envía), `activo`.

</details>

---

### Usuarios (`/api/usuarios`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/usuarios` | Lista todos los usuarios junto con sus `roles`. |
| `GET` | `/api/usuarios/:id` | Obtiene un usuario por su `id` junto con sus `roles`. |
| `POST` | `/api/usuarios` | Crea un usuario con contraseña cifrada (`scrypt`) y roles. |
| `PUT` | `/api/usuarios/:id` | Actualiza un usuario y reemplaza sus roles. |
| `DELETE` | `/api/usuarios/:id` | Elimina un usuario (`409` si tiene citas asociadas). |

<details>
<summary>Ejemplo de JSON para crear o actualizar un usuario</summary>

```json
{
  "primerNombre": "Carlos",
  "segundoNombre": null,
  "primerApellido": "Pérez",
  "segundoApellido": "Ruiz",
  "telefono": "3109876543",
  "email": "carlos.perez@eko.com",
  "password": "MiPasswordSeguro123",
  "especialidad": "Estilista",
  "roles": ["Empleado"],
  "activo": true
}
```
- `password`: obligatoria al crear (entre 8 y 100 caracteres). En `PUT`, es opcional (si se omite o es `null`, se conserva la actual). **Nunca se devuelve en las respuestas**.
- `roles`: arreglo no vacío con nombres existentes en la tabla `rol` (`"Administrador"`, `"Empleado"`).

</details>

---

### Citas (`/api/citas`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/citas` | Lista citas con sus servicios y total estimado. Acepta filtros. |
| `GET` | `/api/citas/:id` | Obtiene el detalle completo de una cita. |
| `POST` | `/api/citas` | Agenda una nueva cita con uno o más servicios. |
| `PUT` | `/api/citas/:id` | Reemplaza los datos y servicios de una cita existente. |
| `PATCH` | `/api/citas/:id/estado` | Cambia únicamente el estado de la cita. |
| `DELETE` | `/api/citas/:id` | Elimina una cita (`409` si ya tiene un pago registrado). |

**Filtros disponibles en `GET /api/citas`:**
- `?fecha=YYYY-MM-DD` (evaluada según `APP_TIMEZONE`)
- `?estado=Programada|En proceso|Completada|Cancelada`
- `?clienteId=1`
- `?empleadoId=2`

<details>
<summary>Ejemplo de JSON para crear una cita y cambiar su estado</summary>

**Crear cita (`POST /api/citas`):**
```json
{
  "clienteId": 1,
  "fechaHoraInicio": "2026-11-26T14:00:00-05:00",
  "estado": "Programada",
  "observaciones": "Cliente prefiere atención rápida",
  "servicios": [
    {
      "servicioId": 1,
      "empleadoId": 2
    },
    {
      "servicioId": 2,
      "empleadoId": 2,
      "duracionAplicada": 30,
      "precioAplicado": 25000
    }
  ]
}
```
- `fechaHoraInicio` debe incluir zona horaria (`Z` o `±HH:MM`).
- En cada ítem de `servicios`, `duracionAplicada`, `precioAplicado`, `inicioPlanificado` y `finPlanificado` son opcionales. Si no se envían, la API toma la duración y el precio del catálogo y encadena los horarios automáticamente uno tras otro.

**Cambiar estado (`PATCH /api/citas/:id/estado`):**
```json
{
  "estado": "Completada"
}
```
Estados válidos: `Programada`, `En proceso`, `Completada`, `Cancelada`.

</details>

---

### Métodos de pago (`/api/metodos-pago`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/metodos-pago` | Lista los métodos de pago disponibles. |
| `GET` | `/api/metodos-pago/:id` | Obtiene un método de pago por `id`. |
| `POST` | `/api/metodos-pago` | Crea un nuevo método de pago (`nombre` único, máx. 40 caracteres). |

---

### Pagos y Abonos (`/api/pagos`)

Un **pago** corresponde a una cita (relación 1 a 1) y contiene cero o más **abonos** (`detalle_pago`). La API calcula automáticamente `totalCita`, `totalAbonado`, `saldoPendiente` y `estadoPago` (`Pendiente`, `Parcial`, `Pagado` o `Excedido`).

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/pagos` | Lista pagos. Filtros opcionales: `?citaId=1` y `?estadoPago=Pendiente\|Parcial\|Pagado\|Excedido`. |
| `GET` | `/api/pagos/:id` | Obtiene un pago por su `id`. |
| `GET` | `/api/pagos/cita/:citaId` | Obtiene el pago asociado a una cita. |
| `POST` | `/api/pagos` | Registra el pago de una cita (con abonos iniciales opcionales). |
| `POST` | `/api/pagos/:id/abonos` | Agrega un abono a un pago existente (por `pagoId`). |
| `POST` | `/api/pagos/cita/:citaId/abonos` | Agrega un abono a un pago existente (por `citaId`). |
| `DELETE` | `/api/pagos/abonos/:abonoId` | Elimina un abono por su `abonoId`. |
| `DELETE` | `/api/pagos/:id/abonos/:abonoId` | Elimina un abono validando que pertenezca al pago `:id`. |

<details>
<summary>Ejemplo de JSON para crear un pago y agregar un abono</summary>

**Crear pago con abono inicial (`POST /api/pagos`):**
```json
{
  "citaId": 1,
  "abonos": [
    {
      "metodoPagoId": 1,
      "monto": 20000
    }
  ]
}
```

**Agregar abono posterior (`POST /api/pagos/1/abonos` o `POST /api/pagos/cita/1/abonos`):**
```json
{
  "metodoPagoId": 2,
  "monto": 15000
}
```
- `monto` debe ser mayor a `0` y tener máximo 2 decimales.

</details>

---

## Reglas importantes del negocio

- **Sin traslapes de horario:** Al crear o editar una cita activa (no cancelada), la API bloquea las filas de los empleados involucrados (`FOR UPDATE`) dentro de una transacción para impedir que un mismo empleado tenga dos servicios solapados (ni dentro de la misma cita ni con otras citas no canceladas). Si una cita estaba `Cancelada` y se reactiva con `PATCH /api/citas/:id/estado`, vuelve a verificar disponibilidad.
- **Asignación empleado–servicio:** Si la tabla `empleado_servicio` está vacía, cualquier empleado activo puede realizar cualquier servicio. En cuanto exista al menos un registro en `empleado_servicio`, la API exigirá que el empleado asignado tenga habilitado ese servicio.
- **Protección de registros históricos:** No se pueden eliminar clientes, servicios ni usuarios que tengan citas asociadas, ni citas que ya tengan un pago (`409 Conflict`).
- **Control en pagos:** No se puede registrar un pago para una cita `Cancelada`, no se puede crear más de un pago por cita, y la suma de los abonos no puede superar el `saldoPendiente` de la cita.

---

## Estado actual y aspectos pendientes

Al analizar el código fuente actual se observan algunos puntos listos para futuras mejoras:

- **Sin autenticación/autorización en rutas:** Aunque existe `src/utils/password.js` (para hashear y verificar contraseñas) y tablas `rol`/`permiso`, todavía no hay endpoints de inicio de sesión (`/login`) ni middlewares JWT o de permisos protegiendo las rutas.
- **Horarios de empleados sin endpoint:** La tabla `horario_empleado` y `empleado_servicio` existen en `schema.sql`, pero aún no tienen rutas CRUD ni validación de jornada laboral en la API.
- **Pruebas automatizadas:** `npm test` aún no tiene suite de tests configurada.
