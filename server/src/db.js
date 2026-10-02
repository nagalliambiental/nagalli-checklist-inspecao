const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida. Configure a variável de ambiente (Neon).');
}

// Neon exige SSL. `rejectUnauthorized: false` evita problemas com o certificado
// no ambiente do Render.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

module.exports = { pool };
