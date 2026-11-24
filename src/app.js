const cors = require('cors');
const express = require('express');
const { pool } = require('./db');
const usersRouter = require('./users/routes');

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
  }),
);
app.use(express.json({ limit: '10kb' }));

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/users', usersRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo JSON no es válido.' });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
