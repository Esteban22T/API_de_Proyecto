const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const serviciosRoutes = require('./modules/servicios/servicios.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const citasRoutes = require('./modules/citas/citas.routes');
const metodosPagoRoutes = require('./modules/metodos-pago/metodos-pago.routes');
const pagosRoutes = require('./modules/pagos/pagos.routes');

const app = express();
const configuredOrigins = process.env.CORS_ORIGIN || '*';
const corsOrigin =
  configuredOrigins === '*'
    ? '*'
    : configuredOrigins.split(',').map((origin) => origin.trim());

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check database query failed:', error);
    return res
      .status(503)
      .json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/servicios', serviciosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/metodos-pago', metodosPagoRoutes);
app.use('/api/pagos', pagosRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El JSON de la solicitud no es válido.' });
  }

  console.error('Unhandled request error:', error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
