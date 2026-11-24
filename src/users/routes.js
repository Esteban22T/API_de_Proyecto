const express = require('express');
const { pool } = require('../db');
const { isValidId, validateUser } = require('./validation');

const router = express.Router();
const userColumns = 'id::text AS id, name, email, age';

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${userColumns} FROM users ORDER BY id ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const validationError = validateUser(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const { name, email, age } = req.body;
    const result = await pool.query(
      `INSERT INTO users (name, email, age)
       VALUES ($1, $2, $3)
       RETURNING ${userColumns}`,
      [name.trim(), email.trim(), age],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: 'El id debe ser un entero positivo.' });
  }

  const validationError = validateUser(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const { name, email, age } = req.body;
    const result = await pool.query(
      `UPDATE users
       SET name = $1, email = $2, age = $3
       WHERE id = $4
       RETURNING ${userColumns}`,
      [name.trim(), email.trim(), age, req.params.id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: 'El id debe ser un entero positivo.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.status(200).json({ message: 'Usuario eliminado.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
