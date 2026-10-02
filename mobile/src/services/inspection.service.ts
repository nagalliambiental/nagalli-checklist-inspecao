import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { Inspection, InspectionItem, InspectionPhotoRef, InspectionArea, ItemStatus, Template, TemplateArea } from '../types';
import { getActionService } from './action.service';
import { deleteInspectionPhotos } from './photo.service';

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function generateId(): Promise<string> {
  return Crypto.randomUUID();
}

function toPhotoArray(raw: unknown): InspectionPhotoRef[] {
  if (!raw) return [];
  let parsed: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [raw];
    }
  } else {
    parsed = [raw];
  }
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed.filter((p): p is InspectionPhotoRef => typeof p === 'string' || (p !== null && typeof p === 'object' && typeof (p as any).uri === 'string'));
}

function toItem(row: any): InspectionItem {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    templateItemId: row.template_item_id,
    label: row.label,
    status: row.status,
    notes: row.notes,
    photos: toPhotoArray(row.photo_path),
    reassessDate: row.reassess_date,
    areaId: row.area_id ?? undefined,
    areaName: row.area_name ?? undefined,
    groupName: row.group_name ?? undefined,
  };
}

function toItemRows(rows: any[]): InspectionItem[] {
  return rows.map(toItem);
}

function toInspection(row: any): Inspection {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name ?? undefined,
    templateId: row.template_id,
    siteId: row.site_id ?? undefined,
    address: row.address ?? undefined,
    empreendimentoId: row.empreendimento_id ?? undefined,
    empreendimentoName: row.empreendimento_name ?? undefined,
    areaId: row.area_id,
    areaName: row.area_name,
    inspectorName: row.inspector_name,
    date: row.date ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    syncedAt: row.synced_at != null ? String(row.synced_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items: [],
    areas: [],
  };
}

export class InspectionService {
  constructor(private db: SQLiteDatabase) {}

  async upsertTemplate(template: Template, companyId: string): Promise<void> {
    const localRow = await this.db.getFirstAsync<{ local_edited: number }>(
      'SELECT local_edited FROM templates WHERE id = ?',
      [template.id],
    );
    if (localRow?.local_edited) return;
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO templates (id, company_id, name, version, description, synced_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [template.id, companyId, template.name, template.version, template.description ?? null, now()],
      );
      for (const area of template.areas ?? []) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO template_areas (id, template_id, name, position)
           VALUES (?, ?, ?, ?)`,
          [area.id, template.id, area.name, area.position],
        );
        for (const group of area.groups ?? []) {
          await this.db.runAsync(
            `INSERT OR REPLACE INTO template_groups (id, area_id, name, position)
             VALUES (?, ?, ?, ?)`,
            [group.id, area.id, group.name, group.position],
          );
          for (const item of group.items ?? []) {
            await this.db.runAsync(
              `INSERT OR REPLACE INTO template_items
                 (id, group_id, library_item_id, text, kind_key, position)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [item.id, group.id, item.libraryItemId ?? null, item.text, item.text.toLowerCase(), item.position],
            );
          }
        }
      }
    });
  }

  async getTemplates(): Promise<Template[]> {
    const templates = await this.db.getAllAsync<any>(
      'SELECT * FROM templates ORDER BY name',
    );
    return templates.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      version: r.version,
      description: r.description,
      areas: [],
    }));
  }

  async getAreas(templateId: string): Promise<TemplateArea[]> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT ta.*,
        (SELECT COUNT(*)
           FROM template_items ti
           JOIN template_groups tg ON tg.id = ti.group_id
          WHERE tg.area_id = ta.id) AS item_count
       FROM template_areas ta
       WHERE ta.template_id = ?
       ORDER BY ta.position`,
      [templateId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      itemCount: r.item_count,
      groups: [],
    }));
  }

  async getArea(templateId: string, areaId: string): Promise<any> {
    const area = await this.db.getFirstAsync<any>(
      'SELECT * FROM template_areas WHERE id = ? AND template_id = ?',
      [areaId, templateId],
    );
    if (!area) return null;
    const groups = await this.db.getAllAsync<any>(
      'SELECT * FROM template_groups WHERE area_id = ? ORDER BY position',
      [areaId],
    );
    for (const group of groups) {
      group.items = await this.db.getAllAsync<any>(
        'SELECT * FROM template_items WHERE group_id = ? ORDER BY position',
        [group.id],
      );
    }
    area.groups = groups;
    return area;
  }

  async getAreasWithItems(templateId: string): Promise<TemplateArea[]> {
    const rows = await this.db.getAllAsync<any>(
      'SELECT * FROM template_areas WHERE template_id = ? ORDER BY position',
      [templateId],
    );
    const result: TemplateArea[] = [];
    for (const area of rows) {
      const groups = await this.db.getAllAsync<any>(
        'SELECT * FROM template_groups WHERE area_id = ? ORDER BY position',
        [area.id],
      );
      const outGroups: any[] = [];
      let count = 0;
      for (const group of groups) {
        const items = await this.db.getAllAsync<any>(
          'SELECT * FROM template_items WHERE group_id = ? ORDER BY position',
          [group.id],
        );
        count += items.length;
        outGroups.push({ ...group, items });
      }
      result.push({
        id: area.id,
        name: area.name,
        position: area.position,
        itemCount: count,
        groups: outGroups,
      });
    }
    return result;
  }

  async createInspection(input: {
    companyId: string;
    templateId: string;
    companyName?: string;
    siteId?: string;
    address?: string;
    empreendimentoId?: string;
    empreendimentoName?: string;
    areas: { id: string; name: string; itemIds?: string[] }[];
    inspectorName: string;
    date?: string;
  }): Promise<Inspection> {
    const id = await generateId();
    const ts = now();
    const areaList = input.areas.filter((a) => a.id && a.name);
    if (areaList.length === 0) throw new Error('Selecione pelo menos uma área');

    const insertItems: { area: { id: string; name: string }; item: any }[] = [];
    for (const area of areaList) {
      const items = await this.collectTemplateItems(input.templateId, area.id);
      const wantedIds = new Set(area.itemIds ?? []);
      for (const item of items) {
        if (area.itemIds && area.itemIds.length > 0 && !wantedIds.has(item.id)) continue;
        insertItems.push({ area, item });
      }
    }
    if (insertItems.length === 0) throw new Error('Nenhum item de verificação selecionado');

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO inspections
           (id, company_id, company_name, template_id, site_id, address, area_id, area_name, inspector_name, date, status, notes, empreendimento_id, empreendimento_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?)`,
        [
          id,
          input.companyId,
          input.companyName ?? null,
          input.templateId,
          input.siteId ?? null,
          input.address ?? null,
          areaList[0].id,
          areaList[0].name,
          input.inspectorName,
          input.date ?? new Date().toISOString().slice(0, 10),
          input.empreendimentoId ?? null,
          input.empreendimentoName ?? input.companyName ?? null,
          ts,
          ts,
        ],
      );

      for (let i = 0; i < areaList.length; i += 1) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO inspection_areas (inspection_id, area_id, area_name, position)
           VALUES (?, ?, ?, ?)`,
          [id, areaList[i].id, areaList[i].name, i],
        );
      }

      for (const { area, item } of insertItems) {
        const itemId = await generateId();
        await this.db.runAsync(
          `INSERT INTO inspection_items
             (id, inspection_id, template_item_id, label, status, area_id, area_name, group_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
          [itemId, id, item.id, item.text, area.id, area.name, item.group_name ?? null, ts, ts],
        );
      }

      await this.db.runAsync(
        "DELETE FROM scheduling WHERE key = 'site'",
      );
    });

    return this.getInspection(id);
  }

  private async collectTemplateItems(templateId: string, areaId: string): Promise<any[]> {
    return this.db.getAllAsync<any>(
      `SELECT ti.id, ti.text, tg.name AS group_name
       FROM template_items ti
       JOIN template_groups tg ON tg.id = ti.group_id
       JOIN template_areas ta ON ta.id = tg.area_id
       WHERE ta.template_id = ? AND ta.id = ?
       ORDER BY tg.position, ti.position`,
      [templateId, areaId],
    );
  }

  async getInspection(id: string): Promise<Inspection> {
    const row = await this.db.getFirstAsync<any>(
      'SELECT * FROM inspections WHERE id = ?',
      [id],
    );
    if (!row) throw new Error('Inspeção não encontrada');
    const inspection = toInspection(row);
    inspection.items = toItemRows(
      await this.db.getAllAsync<any>(
        'SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY rowid',
        [id],
      ),
    );
    inspection.areas = await this.db.getAllAsync<InspectionArea>(
      `SELECT area_id AS id, area_name AS name, position FROM inspection_areas
       WHERE inspection_id = ? ORDER BY position`,
      [id],
    );
    return inspection;
  }

  async listInspections(): Promise<Inspection[]> {
    const rows = await this.db.getAllAsync<any>(
      'SELECT * FROM inspections ORDER BY created_at DESC',
    );
    const result: Inspection[] = [];
    for (const row of rows) {
      const inspection = toInspection(row);
      inspection.items = toItemRows(
        await this.db.getAllAsync<any>(
          'SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY rowid',
          [row.id],
        ),
      );
      inspection.areas = await this.db.getAllAsync<any>(
        `SELECT area_id AS id, area_name AS name, position FROM inspection_areas
         WHERE inspection_id = ? ORDER BY position`,
        [row.id],
      );
      result.push(inspection);
    }
    return result;
  }

  async listInspectionsByDate(date: string): Promise<Inspection[]> {
    const rows = await this.db.getAllAsync<any>(
      'SELECT * FROM inspections WHERE date = ? ORDER BY created_at',
      [date],
    );
    const result: Inspection[] = [];
    for (const row of rows) {
      const inspection = toInspection(row);
      inspection.items = toItemRows(
        await this.db.getAllAsync<any>(
          'SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY rowid',
          [row.id],
        ),
      );
      result.push(inspection);
    }
    return result;
  }

  async getCompany(id: string): Promise<{ name: string; cnpj?: string; segment?: string } | null> {
    return this.db.getFirstAsync<any>('SELECT name, cnpj, segment FROM companies WHERE id = ?', [id]);
  }

  async getInspectionItemGroups(inspectionId: string): Promise<Record<string, { area: string; group: string }>> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT template_item_id, area_name, group_name
       FROM inspection_items
       WHERE inspection_id = ?
       ORDER BY rowid`,
      [inspectionId],
    );
    const map: Record<string, { area: string; group: string }> = {};
    for (const row of rows) {
      if (row.template_item_id && !map[row.template_item_id]) {
        map[row.template_item_id] = { area: row.area_name ?? '', group: row.group_name ?? '' };
      }
    }
    return map;
  }

  async getSite(id: string): Promise<{ name: string; address?: string; city?: string; state?: string } | null> {
    return this.db.getFirstAsync<any>(
      'SELECT name, address, city, state FROM sites WHERE id = ?',
      [id],
    );
  }

  async updateAreaName(areaId: string, name: string): Promise<void> {
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [areaId],
    );
    await this.db.runAsync('UPDATE template_areas SET name = ? WHERE id = ?', [name, areaId]);
    if (area) await this.markTemplateDirty(area.template_id);
  }

  async getNextSiteInspectionDate(): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ next_date: string | null }>(
      "SELECT next_date FROM scheduling WHERE key = 'site'",
    );
    return row?.next_date ?? null;
  }

  async setNextSiteInspectionDate(nextDate: string | null): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO scheduling (key, next_date) VALUES ('site', ?)
       ON CONFLICT(key) DO UPDATE SET next_date = excluded.next_date`,
      [nextDate],
    );
  }

  async addArea(templateId: string, name: string): Promise<string> {
    const id = await generateId();
    const pos = await this.nextPosition('template_areas', 'template_id', templateId);
    await this.db.runAsync(
      'INSERT INTO template_areas (id, template_id, name, position) VALUES (?, ?, ?, ?)',
      [id, templateId, name, pos],
    );
    await this.markTemplateDirty(templateId);
    return id;
  }

  async deleteArea(areaId: string): Promise<void> {
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [areaId],
    );
    await this.db.withTransactionAsync(async () => {
      const groups = await this.db.getAllAsync<any>('SELECT id FROM template_groups WHERE area_id = ?', [areaId]);
      for (const g of groups) {
        await this.db.runAsync('DELETE FROM template_items WHERE group_id = ?', [g.id]);
      }
      await this.db.runAsync('DELETE FROM template_groups WHERE area_id = ?', [areaId]);
      await this.db.runAsync('DELETE FROM template_areas WHERE id = ?', [areaId]);
    });
    if (area) await this.markTemplateDirty(area.template_id);
  }

  async addGroup(areaId: string, name: string): Promise<string> {
    const id = await generateId();
    const pos = await this.nextPosition('template_groups', 'area_id', areaId);
    await this.db.runAsync(
      'INSERT INTO template_groups (id, area_id, name, position) VALUES (?, ?, ?, ?)',
      [id, areaId, name, pos],
    );
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [areaId],
    );
    if (area) await this.markTemplateDirty(area.template_id);
    return id;
  }

  async renameGroup(groupId: string, name: string): Promise<void> {
    await this.db.runAsync('UPDATE template_groups SET name = ? WHERE id = ?', [name, groupId]);
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [groupId],
    );
    if (group) {
      const area = await this.db.getFirstAsync<{ template_id: string }>(
        'SELECT template_id FROM template_areas WHERE id = ?',
        [group.area_id],
      );
      if (area) await this.markTemplateDirty(area.template_id);
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [groupId],
    );
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM template_items WHERE group_id = ?', [groupId]);
      await this.db.runAsync('DELETE FROM template_groups WHERE id = ?', [groupId]);
    });
    if (group) {
      const area = await this.db.getFirstAsync<{ template_id: string }>(
        'SELECT template_id FROM template_areas WHERE id = ?',
        [group.area_id],
      );
      if (area) await this.markTemplateDirty(area.template_id);
    }
  }

  async addItem(groupId: string, text: string): Promise<string> {
    const id = await generateId();
    const pos = await this.nextPosition('template_items', 'group_id', groupId);
    await this.db.runAsync(
      'INSERT INTO template_items (id, group_id, library_item_id, text, kind_key, position) VALUES (?, ?, NULL, ?, ?, ?)',
      [id, groupId, text, text.toLowerCase(), pos],
    );
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [groupId],
    );
    if (group) {
      const area = await this.db.getFirstAsync<{ template_id: string }>(
        'SELECT template_id FROM template_areas WHERE id = ?',
        [group.area_id],
      );
      if (area) await this.markTemplateDirty(area.template_id);
    }
    return id;
  }

  async renameItem(itemId: string, text: string): Promise<void> {
    const item = await this.db.getFirstAsync<{ group_id: string }>(
      'SELECT group_id FROM template_items WHERE id = ?',
      [itemId],
    );
    await this.db.runAsync('UPDATE template_items SET text = ?, kind_key = ? WHERE id = ?', [text, text.toLowerCase(), itemId]);
    if (!item) return;
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [item.group_id],
    );
    if (!group) return;
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [group.area_id],
    );
    if (area) await this.markTemplateDirty(area.template_id);
  }

  async deleteItem(itemId: string): Promise<void> {
    const item = await this.db.getFirstAsync<{ group_id: string }>(
      'SELECT group_id FROM template_items WHERE id = ?',
      [itemId],
    );
    await this.db.runAsync('DELETE FROM template_items WHERE id = ?', [itemId]);
    if (!item) return;
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [item.group_id],
    );
    if (!group) return;
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [group.area_id],
    );
    if (area) await this.markTemplateDirty(area.template_id);
  }

  async moveArea(templateId: string, areaId: string, dir: 'up' | 'down'): Promise<boolean> {
    const ok = await this.moveRow('template_areas', 'template_id', templateId, areaId, dir);
    if (ok) await this.markTemplateDirty(templateId);
    return ok;
  }

  async moveGroup(areaId: string, groupId: string, dir: 'up' | 'down'): Promise<boolean> {
    const area = await this.db.getFirstAsync<{ template_id: string }>(
      'SELECT template_id FROM template_areas WHERE id = ?',
      [areaId],
    );
    const ok = await this.moveRow('template_groups', 'area_id', areaId, groupId, dir);
    if (ok && area) await this.markTemplateDirty(area.template_id);
    return ok;
  }

  async moveItem(groupId: string, itemId: string, dir: 'up' | 'down'): Promise<boolean> {
    const group = await this.db.getFirstAsync<{ area_id: string }>(
      'SELECT area_id FROM template_groups WHERE id = ?',
      [groupId],
    );
    const area = group
      ? await this.db.getFirstAsync<{ template_id: string }>(
          'SELECT template_id FROM template_areas WHERE id = ?',
          [group.area_id],
        )
      : null;
    const ok = await this.moveRow('template_items', 'group_id', groupId, itemId, dir);
    if (ok && area) await this.markTemplateDirty(area.template_id);
    return ok;
  }

  private async markTemplateDirty(templateId: string): Promise<void> {
    await this.db.runAsync('UPDATE templates SET local_edited = 1 WHERE id = ?', [templateId]);
  }

  async isTemplateEdited(templateId: string): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ local_edited: number }>(
      'SELECT local_edited FROM templates WHERE id = ?',
      [templateId],
    );
    return row?.local_edited === 1;
  }

  async resetTemplateDirty(templateId: string): Promise<void> {
    await this.db.runAsync('UPDATE templates SET local_edited = 0 WHERE id = ?', [templateId]);
  }

  private async moveRow(
    table: string,
    refColumn: string,
    refId: string,
    rowId: string,
    dir: 'up' | 'down',
  ): Promise<boolean> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT id, position FROM ${table} WHERE ${refColumn} = ? ORDER BY position, rowid`,
      [refId],
    );
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx === -1) return false;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return false;
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`UPDATE ${table} SET position = ? WHERE id = ?`, [rows[swapIdx].position, rows[idx].id]);
      await this.db.runAsync(`UPDATE ${table} SET position = ? WHERE id = ?`, [rows[idx].position, rows[swapIdx].id]);
    });
    return true;
  }

  private async nextPosition(table: string, refColumn: string, refId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ m: number | null }>(
      `SELECT MAX(position) AS m FROM ${table} WHERE ${refColumn} = ?`,
      [refId],
    );
    return (row?.m ?? -1) + 1;
  }

  async updateItem(inspectionId: string, itemId: string, patch: {
    status?: ItemStatus;
    notes?: string;
    photoPath?: string;
    photoPaths?: InspectionPhotoRef[];
    reassessDate?: string;
    clearPhotos?: boolean;
  }): Promise<InspectionItem> {
    const sets: string[] = [];
    const values: any[] = [];
    if (patch.status) { sets.push('status = ?'); values.push(patch.status); }
    if (patch.notes !== undefined) { sets.push('notes = ?'); values.push(patch.notes); }
    if (patch.reassessDate !== undefined) { sets.push('reassess_date = ?'); values.push(patch.reassessDate); }
    if (patch.clearPhotos) { sets.push('photo_path = NULL'); }
    else if (patch.photoPaths !== undefined) { sets.push('photo_path = ?'); values.push(JSON.stringify(patch.photoPaths)); }
    else if (patch.photoPath !== undefined) { sets.push('photo_path = ?'); values.push(JSON.stringify([patch.photoPath])); }
    sets.push('updated_at = ?');
    values.push(now());
    values.push(itemId);

    await this.db.runAsync(
      `UPDATE inspection_items SET ${sets.join(', ')} WHERE id = ?`,
      values,
    );
    if (patch.status !== undefined || patch.reassessDate !== undefined) {
      await getActionService(this.db).syncFromItem(inspectionId, itemId);
    }
    return this.db.getFirstAsync<any>(
      'SELECT * FROM inspection_items WHERE id = ?',
      [itemId],
    );
  }

  async completeInspection(id: string, notes?: string): Promise<Inspection> {
    const ts = now();
    await this.db.runAsync(
      "UPDATE inspections SET status = 'completed', notes = ?, updated_at = ? WHERE id = ?",
      [notes ?? null, ts, id],
    );
    return this.getInspection(id);
  }

  async deleteInspection(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await getActionService(this.db).deleteByInspectionId(id);
      await this.db.runAsync('DELETE FROM inspection_items WHERE inspection_id = ?', [id]);
      await this.db.runAsync('DELETE FROM inspection_areas WHERE inspection_id = ?', [id]);
      await this.db.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
    });
    await deleteInspectionPhotos(id);
  }
}

let instance: InspectionService | null = null;

export function getInspectionService(db: SQLiteDatabase): InspectionService {
  if (!instance) instance = new InspectionService(db);
  return instance;
}