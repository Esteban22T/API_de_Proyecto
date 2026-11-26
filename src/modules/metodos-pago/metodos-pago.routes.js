const express = require('express');
const pool = require('../../config/db');
const { isPositiveInt } = require('../../utils/validators');
const { validateMetodoPago } = require('./metodos-pago.validation');

const router = express.Router();

const metodoPagoColumns = `id, nombre`;

function getId(req, res) {
  if (!isPositiveInt(req.params.id)) {
    res.status(400).json({ error: 'El id debe ser un entero positivo.' });
    return null;
  }

  return Number(req.params.id);
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${metodoPagoColumns} FROM metodo_pago ORDER BY id`
  );
  return res.status(200).json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const result = await pool.query(
    `SELECT ${metodoPagoColumns} FROM metodo_pago WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Método de pago no encontrado.' });
  }

  return res.status(200).json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const errors = validateMetodoPago(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  try {
    const result = await pool.query(
      `INSERT INTO metodo_pago (nombre)
       VALUES ($1)
       RETURNING ${metodoPagoColumns}`,
      [req.body.nombre.trim()]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un método de pago con ese nombre.' });
    }
    throw error;
  }
});

module.exports = router;
