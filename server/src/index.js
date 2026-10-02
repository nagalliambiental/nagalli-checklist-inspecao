require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { runMigrations } = require('./migrate');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo';
const TOKEN_TTL = '30d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  try {
    const hash = await bcrypt.hash(String(password), 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES (lower($1), $2, $3)
       RETURNING id, email, name`,
      [String(email).trim(), hash, String(name || '').trim()],
    );
    const user = rows[0];
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    console.error('register', err);
    return res.status(500).json({ error: 'Falha ao cadastrar.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  const { rows } = await pool.query(
    'SELECT id, email, name, password_hash FROM users WHERE email = lower($1)',
    [String(email).trim()],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  return res.json({ token: signToken(user), user: publicUser(user) });
});

// Envia documentos locais para a nuvem (last-write-wins por updated_at).
app.post('/sync/push', requireAuth, async (req, res) => {
  const docs = Array.isArray(req.body?.docs) ? req.body.docs : [];
  let applied = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const doc of docs) {
      if (!doc || !doc.kind || !doc.id) continue;
      const updatedAt = Number(doc.updatedAt) || 0;
      const result = await client.query(
        `INSERT INTO sync_docs (user_id, kind, doc_id, data, deleted, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, kind, doc_id)
         DO UPDATE SET data = EXCLUDED.data, deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at
         WHERE sync_docs.updated_at <= EXCLUDED.updated_at`,
        [req.userId, doc.kind, String(doc.id), doc.data ?? null, !!doc.deleted, updatedAt],
      );
      applied += result.rowCount || 0;
    }
    await client.query('COMMIT');
    return res.json({ serverTime: Date.now(), applied });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('push', err);
    return res.status(500).json({ error: 'Falha ao enviar dados.' });
  } finally {
    client.release();
  }
});

// Baixa documentos alterados desde `since`.
app.get('/sync/pull', requireAuth, async (req, res) => {
  const since = Number(req.query.since) || 0;
  const { rows } = await pool.query(
    `SELECT kind, doc_id, data, deleted, updated_at
     FROM sync_docs
     WHERE user_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC
     LIMIT 2000`,
    [req.userId, since],
  );
  return res.json({
    serverTime: Date.now(),
    docs: rows.map((r) => ({
      kind: r.kind,
      id: r.doc_id,
      data: r.data,
      deleted: r.deleted,
      updatedAt: Number(r.updated_at),
    })),
  });
});

// Cria a conta inicial a partir de SEED_EMAIL/SEED_PASSWORD, se ainda não existir.
async function seedUser() {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE email = lower($1)', [email]);
  if (rows.length > 0) return;
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, name) VALUES (lower($1), $2, $3)',
    [email, hash, process.env.SEED_NAME || 'Inspetor'],
  );
  console.log('Usuário inicial criado:', email);
}

const port = process.env.PORT || 3000;

runMigrations()
  .then(() => seedUser())
  .catch((err) => console.error('Migração/seed inicial:', err))
  .finally(() => {
    app.listen(port, () => {
      console.log(`API ouvindo na porta ${port}`);
    });
  });
