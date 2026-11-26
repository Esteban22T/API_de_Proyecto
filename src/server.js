require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const app = require('./app');
const pool = require('./config/db');
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`EKO+ API listening on port ${port}.`);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received. Closing HTTP server and database pool.`);

  server.close(async (error) => {
    if (error) {
      console.error('Error closing HTTP server:', error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      console.error('Error closing PostgreSQL pool:', poolError);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
