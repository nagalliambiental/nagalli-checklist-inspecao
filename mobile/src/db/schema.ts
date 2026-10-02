import type { SQLiteDatabase } from 'expo-sqlite';
import { seedLocalChecklist } from './seed';
import { normalizeNameKey } from '../services/empreendimento.service';

export const DB_NAME = 'checklist.db';

export const MIGRATION_VERSION = 10;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'inspector'
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  segment TEXT,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  kind_key TEXT NOT NULL UNIQUE,
  theme TEXT DEFAULT 'Geral'
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  description TEXT,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS template_areas (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_groups (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES template_areas(id),
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES template_groups(id),
  library_item_id TEXT,
  text TEXT NOT NULL,
  kind_key TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  company_name TEXT,
  template_id TEXT NOT NULL REFERENCES templates(id),
  site_id TEXT REFERENCES sites(id),
  address TEXT,
  area_id TEXT REFERENCES template_areas(id),
  area_name TEXT,
  inspector_name TEXT,
  date TEXT,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inspection_areas (
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (inspection_id, area_id)
);

CREATE TABLE IF NOT EXISTS inspection_items (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  template_item_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  photo_path TEXT,
  reassess_date TEXT,
  area_id TEXT,
  area_name TEXT,
  group_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  area_name TEXT NOT NULL DEFAULT '',
  item_label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  action_what TEXT NOT NULL DEFAULT '',
  action_how TEXT NOT NULL DEFAULT '',
  responsible TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Média',
  investment_min REAL,
  investment_max REAL,
  reassess_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'a_iniciar',
  completed_date TEXT NOT NULL DEFAULT '',
  closing_note TEXT NOT NULL DEFAULT '',
  closing_photo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduling (
  key TEXT PRIMARY KEY NOT NULL,
  next_date TEXT
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empreendimentos (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  contratante TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);

  const versionRow = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = ?`,
    ['schema_version'],
  );
  const currentVersion = versionRow ? Number(versionRow.value) : 0;

  if (currentVersion < 2) {
    const cols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(inspection_items)`,
    );
    if (!cols.some((c) => c.name === 'reassess_date')) {
      await db.execAsync(`ALTER TABLE inspection_items ADD COLUMN reassess_date TEXT`);
    }
  }

  if (currentVersion < 4) {
    const cols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(inspection_items)`,
    );
    if (!cols.some((c) => c.name === 'area_id')) {
      await db.execAsync(`ALTER TABLE inspection_items ADD COLUMN area_id TEXT`);
    }
    if (!cols.some((c) => c.name === 'area_name')) {
      await db.execAsync(`ALTER TABLE inspection_items ADD COLUMN area_name TEXT`);
    }
    if (!cols.some((c) => c.name === 'group_name')) {
      await db.execAsync(`ALTER TABLE inspection_items ADD COLUMN group_name TEXT`);
    }
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS inspection_areas (
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        area_id TEXT NOT NULL,
        area_name TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        PRIMARY KEY (inspection_id, area_id)
      );
    `);
    const schedCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(scheduling)`,
    );
    if (schedCols.some((c) => c.name === 'area_id')) {
      await db.execAsync(`DROP TABLE IF EXISTS scheduling`);
      await db.execAsync(`CREATE TABLE scheduling (key TEXT PRIMARY KEY NOT NULL, next_date TEXT)`);
    }
  }

  if (currentVersion < 5) {
    const tplCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(templates)`,
    );
    if (!tplCols.some((c) => c.name === 'local_edited')) {
      await db.execAsync(`ALTER TABLE templates ADD COLUMN local_edited INTEGER NOT NULL DEFAULT 0`);
    }
  }

  if (currentVersion < 6) {
    await db.execAsync(`DROP TABLE IF EXISTS outbox`);
  }

  if (currentVersion < 7) {
    const inspCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(inspections)`,
    );
    if (!inspCols.some((c) => c.name === 'company_name')) {
      await db.execAsync(`ALTER TABLE inspections ADD COLUMN company_name TEXT`);
    }
    if (!inspCols.some((c) => c.name === 'address')) {
      await db.execAsync(`ALTER TABLE inspections ADD COLUMN address TEXT`);
    }
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        area_name TEXT NOT NULL DEFAULT '',
        item_label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        action_what TEXT NOT NULL DEFAULT '',
        action_how TEXT NOT NULL DEFAULT '',
        responsible TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'Média',
        investment_min REAL,
        investment_max REAL,
        reassess_date TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'a_iniciar',
        completed_date TEXT NOT NULL DEFAULT '',
        closing_note TEXT NOT NULL DEFAULT '',
        closing_photo TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Backfill: converte NC/NA já registrados em ações no plano
    const itemCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(inspection_items)`,
    );
    if (itemCols.some((c) => c.name === 'reassess_date')) {
      await db.execAsync(`
        INSERT OR IGNORE INTO action_items
          (id, type, inspection_id, item_id, company_name, area_name, item_label, description, reassess_date, status, created_at, updated_at)
        SELECT
          'act_' || ii.id,
          ii.status,
          ii.inspection_id,
          ii.id,
          COALESCE(i.company_name, ''),
          COALESCE(ii.area_name, i.area_name, ''),
          ii.label,
          COALESCE(ii.notes, ''),
          COALESCE(ii.reassess_date, ''),
          IIF(ii.status = 'NC', 'a_iniciar', 'a_iniciar'),
          ii.created_at,
          ii.updated_at
        FROM inspection_items ii
        JOIN inspections i ON i.id = ii.inspection_id
        WHERE ii.status IN ('NC', 'NA')
      `);
    }
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS empreendimentos (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        contratante TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const inspCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(inspections)`,
    );
    if (!inspCols.some((c) => c.name === 'empreendimento_id')) {
      await db.execAsync(`ALTER TABLE inspections ADD COLUMN empreendimento_id TEXT`);
    }
    if (!inspCols.some((c) => c.name === 'empreendimento_name')) {
      await db.execAsync(`ALTER TABLE inspections ADD COLUMN empreendimento_name TEXT`);
    }

    // Backfill: cada nome de empresa já usado vira um empreendimento, para que
    // o histórico existente não desapareça da visão por empreendimento.
    await db.execAsync(`
      INSERT OR IGNORE INTO empreendimentos (id, name, contratante, address, active, created_at, updated_at)
      SELECT
        'emp_' || lower(replace(trim(COALESCE(company_name, '')), ' ', '_')),
        trim(company_name),
        trim(company_name),
        '',
        1,
        MIN(created_at),
        MAX(updated_at)
      FROM inspections
      WHERE TRIM(COALESCE(company_name, '')) <> ''
      GROUP BY lower(trim(company_name))
    `);

    await db.execAsync(`
      UPDATE inspections
      SET empreendimento_id =
          'emp_' || lower(replace(trim(COALESCE(company_name, '')), ' ', '_')),
          empreendimento_name = trim(company_name)
      WHERE TRIM(COALESCE(company_name, '')) <> ''
    `);

    // O `lower()` do SQLite só trata ASCII, então variantes com acento
    // ("Condomínio X" x "Condominio X") chegariam como empreendimentos
    // distintos. A fusão é feita em TypeScript para não duplicar o cadastro.
    const empRows = await db.getAllAsync<{ id: string; name: string }>(
      `SELECT id, name FROM empreendimentos ORDER BY created_at, name`,
    );
    const keeperByKey = new Map<string, { id: string; name: string }>();
    for (const row of empRows) {
      const key = normalizeNameKey(row.name);
      const keeper = key ? keeperByKey.get(key) : undefined;
      if (!keeper) {
        if (key) keeperByKey.set(key, row);
        continue;
      }
      await db.runAsync(
        `UPDATE inspections
         SET empreendimento_id = ?, empreendimento_name = ?, company_name = ?
         WHERE empreendimento_id = ?`,
        [keeper.id, keeper.name, keeper.name, row.id],
      );
      await db.runAsync(
        `UPDATE action_items
         SET company_name = ?
         WHERE inspection_id IN (SELECT id FROM inspections WHERE empreendimento_id = ?)`,
        [keeper.name, row.id],
      );
      await db.runAsync(`DELETE FROM empreendimentos WHERE id = ?`, [row.id]);
    }
  }

  if (currentVersion < 10) {
    // N/A é "não aplicável" (estado terminal) e não deve aparecer como ação
    // pendente. Remove as ações de N/A criadas por versões anteriores.
    await db.runAsync(`DELETE FROM action_items WHERE type = 'NA'`);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', ?)`,
    [String(MIGRATION_VERSION)],
  );

  await seedLocalChecklist(db);
}