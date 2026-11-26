const express = require('express');
const pool = require('../../config/db');
const {
  isPositiveInt,
  normalizeOptionalString,
} = require('../../utils/validators');
const { hashPassword } = require('../../utils/password');
const { validateUsuario } = require('./usuarios.validation');

const router = express.Router();

const usuarioSelectQuery = `
  SELECT
    u.id,
    u.primer_nombre AS "primerNombre",
    u.segundo_nombre AS "segundoNombre",
    u.primer_apellido AS "primerApellido",
    u.segundo_apellido AS "segundoApellido",
    u.telefono,
    u.email,
    u.especialidad,
    u.activo,
    u.fecha_registro AS "fechaRegistro",
    COALESCE(
      ARRAY_AGG(r.nombre ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),
      '{}'
    ) AS roles
  FROM usuario u
  LEFT JOIN usuario_rol ur ON ur.usuario_id = u.id
  LEFT JOIN rol r ON r.id = ur.rol_id
`;

function getId(req, res) {
  if (!isPositiveInt(req.params.id)) {
    res.status(400).json({ error: 'El id debe ser un entero positivo.' });
    return null;
  }

  return Number(req.params.id);
}

function createHttpError(status, body) {
  const error = new Error(body.error);
  error.status = status;
  error.body = body;
  return error;
}

function buildUsuarioParams(body) {
  return {
    primerNombre: body.primerNombre.trim(),
    segundoNombre: normalizeOptionalString(body.segundoNombre),
    primerApellido: body.primerApellido.trim(),
    segundoApellido: normalizeOptionalString(body.segundoApellido),
    telefono: normalizeOptionalString(body.telefono),
    email: body.email.trim().toLowerCase(),
    especialidad: normalizeOptionalString(body.especialidad),
  };
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function resolveRoleIds(client, roles) {
  const normalizedRoles = [
    ...new Set(roles.map((role) => role.trim().toLowerCase())),
  ];

  const result = await client.query(
    `SELECT id, nombre
     FROM rol
     WHERE LOWER(nombre) = ANY($1::text[])
     ORDER BY id`,
    [normalizedRoles]
  );

  if (result.rowCount !== normalizedRoles.length) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: ['Uno o más roles no existen en el sistema.'],
    });
  }

  return result.rows.map((row) => row.id);
}

async function findUsuarioById(db, id) {
  const result = await db.query(
    `${usuarioSelectQuery}
     WHERE u.id = $1
     GROUP BY u.id`,
    [id]
  );

  return result.rowCount === 0 ? null : result.rows[0];
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `${usuarioSelectQuery}
     GROUP BY u.id
     ORDER BY u.id`
  );
  return res.status(200).json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const usuario = await findUsuarioById(pool, id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  return res.status(200).json(usuario);
});

router.post('/', async (req, res) => {
  const errors = validateUsuario(req.body, { isUpdate: false });
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const data = buildUsuarioParams(req.body);
  const activo = req.body.activo === undefined ? true : req.body.activo;
  const passwordHash = hashPassword(req.body.password);

  try {
    const createdUsuario = await withTransaction(async (client) => {
      const roleIds = await resolveRoleIds(client, req.body.roles);

      const insertResult = await client.query(
        `INSERT INTO usuario (
          primer_nombre,
          segundo_nombre,
          primer_apellido,
          segundo_apellido,
          telefono,
          email,
          password,
          especialidad,
          activo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          data.primerNombre,
          data.segundoNombre,
          data.primerApellido,
          data.segundoApellido,
          data.telefono,
          data.email,
          passwordHash,
          data.especialidad,
          activo,
        ]
      );

      const usuarioId = insertResult.rows[0].id;
      await client.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, UNNEST($2::int[])`,
        [usuarioId, roleIds]
      );

      return findUsuarioById(client, usuarioId);
    });

    return res.status(201).json(createdUsuario);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un usuario con ese email.' });
    }
    throw error;
  }
});

router.put('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const errors = validateUsuario(req.body, { isUpdate: true });
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const data = buildUsuarioParams(req.body);
  const passwordHash =
    typeof req.body.password === 'string' ? hashPassword(req.body.password) : null;

  try {
    const updatedUsuario = await withTransaction(async (client) => {
      const roleIds = await resolveRoleIds(client, req.body.roles);

      const updateResult = await client.query(
        `UPDATE usuario
         SET primer_nombre = $1,
             segundo_nombre = $2,
             primer_apellido = $3,
             segundo_apellido = $4,
             telefono = $5,
             email = $6,
             password = COALESCE($7, password),
             especialidad = $8,
             activo = COALESCE($9, activo)
         WHERE id = $10
         RETURNING id`,
        [
          data.primerNombre,
          data.segundoNombre,
          data.primerApellido,
          data.segundoApellido,
          data.telefono,
          data.email,
          passwordHash,
          data.especialidad,
          req.body.activo === undefined ? null : req.body.activo,
          id,
        ]
      );

      if (updateResult.rowCount === 0) {
        throw createHttpError(404, { error: 'Usuario no encontrado.' });
      }

      await client.query(`DELETE FROM usuario_rol WHERE usuario_id = $1`, [id]);
      await client.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, UNNEST($2::int[])`,
        [id, roleIds]
      );

      return findUsuarioById(client, id);
    });

    return res.status(200).json(updatedUsuario);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un usuario con ese email.' });
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  try {
    const deletedUsuario = await withTransaction(async (client) => {
      const existingUsuario = await findUsuarioById(client, id);
      if (!existingUsuario) {
        throw createHttpError(404, { error: 'Usuario no encontrado.' });
      }

      await client.query(`DELETE FROM usuario WHERE id = $1`, [id]);
      return existingUsuario;
    });

    return res.status(200).json(deletedUsuario);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el usuario porque tiene citas asociadas.',
      });
    }
    throw error;
  }
});

module.exports = router;
