-- Schema da API de sincronização (Neon / Postgres).
-- Executado por `npm run migrate`.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Armazém genérico de documentos sincronizáveis (empreendimentos, vistorias,
-- ações). O conteúdo vai em JSONB para o sync não depender de cada tabela.
CREATE TABLE IF NOT EXISTS sync_docs (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  data JSONB,
  deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, kind, doc_id)
);

CREATE INDEX IF NOT EXISTS sync_docs_user_updated_idx
  ON sync_docs (user_id, updated_at);

-- Fotos guardadas no próprio Postgres (BYTEA). Alternativa sem cartão ao R2.
CREATE TABLE IF NOT EXISTS photos (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  inspection_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data BYTEA NOT NULL,
  size INTEGER NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS photos_user_inspection_idx
  ON photos (user_id, inspection_id);
