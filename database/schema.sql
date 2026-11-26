-- 1. Roles (por ahora Administrador y Empleado)
CREATE TABLE IF NOT EXISTS rol (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
);

-- 2. Permisos y relación rol_permiso
CREATE TABLE IF NOT EXISTS permiso (
  id SERIAL PRIMARY KEY,
  modulo VARCHAR(30) NOT NULL,
  accion VARCHAR(30) NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  UNIQUE (modulo, accion)
);

CREATE TABLE IF NOT EXISTS rol_permiso (
  rol_id INT NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  permiso_id INT NOT NULL REFERENCES permiso(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- 3. Usuarios del sistema (quienes inician sesión)
CREATE TABLE IF NOT EXISTS usuario (
  id SERIAL PRIMARY KEY,
  primer_nombre VARCHAR(40) NOT NULL,
  segundo_nombre VARCHAR(40),
  primer_apellido VARCHAR(40) NOT NULL,
  segundo_apellido VARCHAR(40),
  telefono VARCHAR(20),
  email VARCHAR(100) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  especialidad VARCHAR(60),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuario_rol (
  usuario_id INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  rol_id INT NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, rol_id)
);

-- 4. Clientes (no inician sesión, solo datos básicos)
CREATE TABLE IF NOT EXISTS cliente (
  id SERIAL PRIMARY KEY,
  primer_nombre VARCHAR(40) NOT NULL,
  segundo_nombre VARCHAR(40),
  primer_apellido VARCHAR(40) NOT NULL,
  segundo_apellido VARCHAR(40),
  telefono VARCHAR(20),
  email VARCHAR(100) UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Servicios
CREATE TABLE IF NOT EXISTS servicio (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  duracion_estimada INT NOT NULL CHECK (duracion_estimada > 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP
);

-- 6. Relación empleado - servicio y horarios
CREATE TABLE IF NOT EXISTS empleado_servicio (
  empleado_id INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  servicio_id INT NOT NULL REFERENCES servicio(id) ON DELETE CASCADE,
  PRIMARY KEY (empleado_id, servicio_id)
);

CREATE TABLE IF NOT EXISTS horario_empleado (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  CHECK (hora_fin > hora_inicio)
);

-- 7. Citas y servicios asociados
CREATE TABLE IF NOT EXISTS cita (
  id SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES cliente(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'Programada',
  observaciones TEXT,
  CONSTRAINT chk_cita_estado CHECK (estado IN ('Programada', 'En proceso', 'Completada', 'Cancelada'))
);

CREATE TABLE IF NOT EXISTS cita_servicio (
  id SERIAL PRIMARY KEY,
  cita_id INT NOT NULL REFERENCES cita(id) ON DELETE CASCADE,
  servicio_id INT NOT NULL REFERENCES servicio(id),
  empleado_id INT NOT NULL REFERENCES usuario(id),
  inicio_planificado TIMESTAMPTZ NOT NULL,
  fin_planificado TIMESTAMPTZ NOT NULL,
  duracion_aplicada INT,
  precio_aplicado NUMERIC(12, 2) NOT NULL CHECK (precio_aplicado >= 0),
  CONSTRAINT chk_cita_servicio_rango_horas CHECK (fin_planificado > inicio_planificado),
  CONSTRAINT chk_cita_servicio_duracion CHECK (duracion_aplicada IS NULL OR duracion_aplicada > 0)
);

-- 8. Métodos de pago, pago y detalle de pago (abonos/movimientos)
CREATE TABLE IF NOT EXISTS metodo_pago (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pago (
  id SERIAL PRIMARY KEY,
  cita_id INT NOT NULL UNIQUE REFERENCES cita(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_pago (
  id SERIAL PRIMARY KEY,
  pago_id INT NOT NULL REFERENCES pago(id) ON DELETE CASCADE,
  metodo_pago_id INT NOT NULL REFERENCES metodo_pago(id),
  monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices únicos para garantizar email insensible a mayúsculas/minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_email_lower ON usuario (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_email_lower ON cliente (LOWER(email)) WHERE email IS NOT NULL;

-- Datos base iniciales
INSERT INTO rol (nombre) VALUES ('Administrador'), ('Empleado')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO metodo_pago (nombre) VALUES ('Efectivo'), ('Transferencia'), ('Tarjeta')
ON CONFLICT (nombre) DO NOTHING;