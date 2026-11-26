const express = require('express');
const pool = require('../../config/db');
const {
  isPositiveInt,
  normalizeOptionalString,
} = require('../../utils/validators');
const { validateCliente } = require('./clientes.validation');

const router = express.Router();

const clienteColumns = `
  id,
  primer_nombre AS "primerNombre",
  segundo_nombre AS "segundoNombre",
  primer_apellido AS "primerApellido",
  segundo_apellido AS "segundoApellido",
  telefono,
  email,
  activo,
  fecha_registro AS "fechaRegistro"
`;

function getId(req, res) {
  if (!isPositiveInt(req.params.id)) {
    res.status(400).json({ error: 'El id debe ser un entero positivo.' });
    return null;
  }

  return Number(req.params.id);
}

function buildClienteParams(body) {
  const email = normalizeOptionalString(body.email);

  return {
    primerNombre: body.primerNombre.trim(),
    segundoNombre: normalizeOptionalString(body.segundoNombre),
    primerApellido: body.primerApellido.trim(),
    segundoApellido: normalizeOptionalString(body.segundoApellido),
    telefono: normalizeOptionalString(body.telefono),
    email: email ? email.toLowerCase() : null,
  };
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${clienteColumns} FROM cliente ORDER BY id`
  );
  return res.status(200).json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const result = await pool.query(
    `SELECT ${clienteColumns} FROM cliente WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }

  return res.status(200).json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const errors = validateCliente(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const data = buildClienteParams(req.body);
  const activo = req.body.activo === undefined ? true : req.body.activo;

  try {
    const result = await pool.query(
      `INSERT INTO cliente (
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        telefono,
        email,
        activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${clienteColumns}`,
      [
        data.primerNombre,
        data.segundoNombre,
        data.primerApellido,
        data.segundoApellido,
        data.telefono,
        data.email,
        activo,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un cliente con ese email.' });
    }
    throw error;
  }
});

router.put('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const errors = validateCliente(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const data = buildClienteParams(req.body);

  try {
    const result = await pool.query(
      `UPDATE cliente
       SET primer_nombre = $1,
           segundo_nombre = $2,
           primer_apellido = $3,
           segundo_apellido = $4,
           telefono = $5,
           email = $6,
           activo = COALESCE($7, activo)
       WHERE id = $8
       RETURNING ${clienteColumns}`,
      [
        data.primerNombre,
        data.segundoNombre,
        data.primerApellido,
        data.segundoApellido,
        data.telefono,
        data.email,
        req.body.activo === undefined ? null : req.body.activo,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un cliente con ese email.' });
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  try {
    const result = await pool.query(
      `DELETE FROM cliente
       WHERE id = $1
       RETURNING ${clienteColumns}`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el cliente porque tiene citas asociadas.',
      });
    }
    throw error;
  }
});

module.exports = router;
