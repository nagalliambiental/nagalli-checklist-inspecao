import type { SQLiteDatabase } from 'expo-sqlite';

const INSPECTOR_KEY = 'inspector_name';
export const DEFAULT_INSPECTOR_NAME = 'Inspetor';

/** Nome do inspetor salvo no aparelho (tabela sync_meta). */
export async function getInspectorName(db: SQLiteDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [INSPECTOR_KEY],
  );
  return row?.value?.trim() || DEFAULT_INSPECTOR_NAME;
}

export async function setInspectorName(db: SQLiteDatabase, name: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [
    INSPECTOR_KEY,
    name.trim(),
  ]);
}
