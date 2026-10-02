const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { runMigrations };

if (require.main === module) {
  require('dotenv').config();
  runMigrations()
    .then(() => {
      console.log('Migração concluída.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Falha na migração:', err);
      process.exit(1);
    });
}
