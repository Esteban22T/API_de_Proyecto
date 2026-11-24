require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL. Configúrala en node-api-postgres/.env.',
  );
}

const app = require('./app');
const { initializeDatabase, pool } = require('./db');

const port = Number(process.env.PORT) || 3000;

async function startServer() {
  await initializeDatabase();
  app.listen(port, '0.0.0.0', () => {
    console.log(`API lista en http://localhost:${port}`);
  });
}

startServer().catch(async (error) => {
  console.error('No se pudo iniciar la API:', error);
  await pool.end();
  process.exitCode = 1;
});

async function shutDown() {
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
