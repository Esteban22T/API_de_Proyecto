const express = require('express');
const pool = require('../../config/db');
const { isPositiveInt } = require('../../utils/validators');
const { validateServicio } = require('./servicios.validation');

const router = express.Router();

const servicioColumns = `
  id,
  nombre,
  precio,
  duracion_estimada AS "duracionEstimada",
  activo,
  fecha_creacion AS "fechaCreacion",
  fecha_actualizacion AS "fechaActualizacion"
`;

function getId(req, res) {
  if (!isPositiveInt(req.params.id)) {
    res.status(400).json({ error: 'El id debe ser un entero positivo.' });
    return null;
  }

  return Number(req.params.id);
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${servicioColumns} FROM servicio ORDER BY id`
  );
  res.status(200).json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const result = await pool.query(
    `SELECT ${servicioColumns} FROM servicio WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Servicio no encontrado.' });
  }

  return res.status(200).json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const errors = validateServicio(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const { nombre, precio, duracionEstimada } = req.body;
  const activo = req.body.activo === undefined ? true : req.body.activo;
  const result = await pool.query(
    `INSERT INTO servicio (nombre, precio, duracion_estimada, activo)
     VALUES ($1, $2, $3, $4)
     RETURNING ${servicioColumns}`,
    [nombre.trim(), precio, duracionEstimada, activo]
  );

  return res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const errors = validateServicio(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const { nombre, precio, duracionEstimada } = req.body;
  const result = await pool.query(
    `UPDATE servicio
     SET nombre = $1,
         precio = $2,
         duracion_estimada = $3,
         activo = COALESCE($4, activo),
         fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING ${servicioColumns}`,
    [
      nombre.trim(),
      precio,
      duracionEstimada,
      req.body.activo === undefined ? null : req.body.activo,
      id,
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Servicio no encontrado.' });
  }

  return res.status(200).json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  try {
    const result = await pool.query(
      `DELETE FROM servicio
       WHERE id = $1
       RETURNING ${servicioColumns}`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado.' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el servicio porque tiene citas asociadas.',
      });
    }
    throw error;
  }
});

module.exports = router;
