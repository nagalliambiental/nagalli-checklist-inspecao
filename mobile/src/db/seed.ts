import type { SQLiteDatabase } from 'expo-sqlite';
import seedData from './seed.json';

const COMPANY_ID = 'seed-company';
const TEMPLATE_ID = 'seed-template';

interface SeedItem {
  libraryId: string;
  text: string;
}

interface SeedGroup {
  name: string;
  items: SeedItem[];
}

interface SeedArea {
  name: string;
  groups: SeedGroup[];
}

export async function seedLocalChecklist(db: SQLiteDatabase): Promise<boolean> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM templates WHERE id = ?',
    [TEMPLATE_ID],
  );
  if (existing) return false;

  const ts = Math.floor(Date.now() / 1000);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO companies (id, name, cnpj, segment, synced_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [COMPANY_ID, seedData.meta.company, '12.345.678/0001-90', 'Asfaltos'],
    );

    for (const lib of seedData.library) {
      await db.runAsync(
        `INSERT OR IGNORE INTO library_items (id, text, kind_key, theme)
         VALUES (?, ?, ?, 'Geral')`,
        [lib.id, lib.text, lib.id],
      );
    }

    await db.runAsync(
      `INSERT INTO templates (id, company_id, name, version, description, synced_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
      [TEMPLATE_ID, COMPANY_ID, 'Checklist de Inspeção CBB', seedData.meta.source],
    );

    const areas = seedData.areas as SeedArea[];
    for (let a = 0; a < areas.length; a += 1) {
      const areaId = `seed-area-${a}`;
      await db.runAsync(
        `INSERT INTO template_areas (id, template_id, name, position)
         VALUES (?, ?, ?, ?)`,
        [areaId, TEMPLATE_ID, areas[a].name, a],
      );
      for (let g = 0; g < areas[a].groups.length; g += 1) {
        const groupId = `seed-group-${a}-${g}`;
        await db.runAsync(
          `INSERT INTO template_groups (id, area_id, name, position)
           VALUES (?, ?, ?, ?)`,
          [groupId, areaId, areas[a].groups[g].name, g],
        );
        for (let i = 0; i < areas[a].groups[g].items.length; i += 1) {
          const item = areas[a].groups[g].items[i];
          await db.runAsync(
            `INSERT INTO template_items (id, group_id, library_item_id, text, kind_key, position)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [`seed-item-${a}-${g}-${i}`, groupId, item.libraryId, item.text, item.libraryId, i],
          );
        }
      }
    }
  });

  return true;
}