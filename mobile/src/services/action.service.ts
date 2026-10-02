import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { ActionItem, ActionStatus, ItemStatus } from '../types';
import { now } from './inspection.service';

function toAction(row: any): ActionItem {
  return {
    id: row.id,
    type: row.type,
    inspectionId: row.inspection_id,
    itemId: row.item_id,
    companyName: row.company_name ?? '',
    areaName: row.area_name ?? '',
    itemLabel: row.item_label,
    description: row.description ?? '',
    actionWhat: row.action_what ?? '',
    actionHow: row.action_how ?? '',
    responsible: row.responsible ?? '',
    dueDate: row.due_date ?? '',
    priority: row.priority ?? 'Média',
    investmentMin: row.investment_min != null ? Number(row.investment_min) : undefined,
    investmentMax: row.investment_max != null ? Number(row.investment_max) : undefined,
    reassessDate: row.reassess_date ?? '',
    status: row.status as ActionStatus,
    completedDate: row.completed_date ?? '',
    closingNote: row.closing_note ?? '',
    closingPhoto: row.closing_photo ?? '',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    inspectionDate: row.inspection_date ?? undefined,
    inspectionStatus: row.inspection_status ?? undefined,
  };
}

function toActions(rows: any[]): ActionItem[] {
  return rows.map(toAction);
}

export async function randomId(): Promise<string> {
  return Crypto.randomUUID();
}

const STATUS_TS = (s: ActionStatus) => now();

export class ActionService {
  constructor(private db: SQLiteDatabase) {}

  /** Mantém a fila de ações sincronizada com o status do item da vistoria. */
  async syncFromItem(inspectionId: string, itemId: string): Promise<void> {
    const row = await this.db.getFirstAsync<any>(
      `SELECT ii.*, i.company_name
       FROM inspection_items ii
       JOIN inspections i ON i.id = ii.inspection_id
       WHERE ii.id = ?`,
      [itemId],
    );
    if (!row) return;
    const status = row.status as ItemStatus;
    const existing = await this.db.getFirstAsync<any>(
      'SELECT id FROM action_items WHERE item_id = ?',
      [itemId],
    );
    // N/A é "não aplicável": estado terminal, não gera ação corretiva. Só NC
    // entra na fila de ações (o N/A fica apenas registrado na vistoria).
    const isAction = status === 'NC';
    if (!isAction) {
      if (existing) {
        await this.db.runAsync('DELETE FROM action_items WHERE id = ?', [existing.id]);
      }
      return;
    }
    const ts = now();
    if (existing) {
      await this.db.runAsync(
        `UPDATE action_items
         SET type = ?, company_name = ?, area_name = ?, item_label = ?, description = ?,
             reassess_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          status,
          row.company_name ?? '',
          row.area_name ?? '',
          row.label ?? '',
          row.notes ?? '',
          row.reassess_date ?? '',
          ts,
          existing.id,
        ],
      );
    } else {
      const id = await randomId();
      await this.db.runAsync(
        `INSERT INTO action_items
           (id, type, inspection_id, item_id, company_name, area_name, item_label, description,
            reassess_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'a_iniciar', ?, ?)`,
        [
          id,
          status,
          inspectionId,
          itemId,
          row.company_name ?? '',
          row.area_name ?? '',
          row.label ?? '',
          row.notes ?? '',
          row.reassess_date ?? '',
          ts,
          ts,
        ],
      );
    }
  }

  async getActions(filter?: { type?: 'NC' | 'NA' }): Promise<ActionItem[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter?.type) {
      where.push('a.type = ?');
      params.push(filter.type);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.getAllAsync<any>(
      `SELECT a.*, i.date AS inspection_date, i.status AS inspection_status
       FROM action_items a
       JOIN inspections i ON i.id = a.inspection_id
       ${whereSql}
       ORDER BY a.created_at DESC`,
      params,
    );
    return toActions(rows);
  }

  async getActionsByInspectionIds(ids: string[]): Promise<ActionItem[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.db.getAllAsync<any>(
      `SELECT a.*, i.date AS inspection_date, i.status AS inspection_status
       FROM action_items a
       JOIN inspections i ON i.id = a.inspection_id
       WHERE a.inspection_id IN (${placeholders})
       ORDER BY a.created_at`,
      ids,
    );
    return toActions(rows);
  }

  async getAction(id: string): Promise<ActionItem | null> {
    const row = await this.db.getFirstAsync<any>(
      `SELECT a.*, i.date AS inspection_date, i.status AS inspection_status
       FROM action_items a
       JOIN inspections i ON i.id = a.inspection_id
       WHERE a.id = ?`,
      [id],
    );
    return row ? toAction(row) : null;
  }

  async updateAction(
    id: string,
    patch: Partial<Pick<ActionItem, 'actionWhat' | 'actionHow' | 'responsible' | 'dueDate' | 'priority' | 'investmentMin' | 'investmentMax' | 'status' | 'reassessDate' | 'closingNote'>>,
  ): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    if (patch.actionWhat !== undefined) { sets.push('action_what = ?'); values.push(patch.actionWhat); }
    if (patch.actionHow !== undefined) { sets.push('action_how = ?'); values.push(patch.actionHow); }
    if (patch.responsible !== undefined) { sets.push('responsible = ?'); values.push(patch.responsible); }
    if (patch.dueDate !== undefined) { sets.push('due_date = ?'); values.push(patch.dueDate); }
    if (patch.priority !== undefined) { sets.push('priority = ?'); values.push(patch.priority); }
    if (patch.investmentMin !== undefined) { sets.push('investment_min = ?'); values.push(patch.investmentMin); }
    if (patch.investmentMax !== undefined) { sets.push('investment_max = ?'); values.push(patch.investmentMax); }
    if (patch.reassessDate !== undefined) { sets.push('reassess_date = ?'); values.push(patch.reassessDate); }
    if (patch.closingNote !== undefined) { sets.push('closing_note = ?'); values.push(patch.closingNote); }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      values.push(patch.status);
      sets.push('completed_date = ?');
      values.push(patch.status === 'concluido' ? new Date().toISOString().slice(0, 10) : '');
    }
    sets.push('updated_at = ?');
    values.push(STATUS_TS(patch.status ?? 'a_iniciar'));
    values.push(id);
    if (sets.length === 1) return;
    await this.db.runAsync(`UPDATE action_items SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  async deleteByInspectionId(inspectionId: string): Promise<void> {
    await this.db.runAsync('DELETE FROM action_items WHERE inspection_id = ?', [inspectionId]);
  }

  async countOpen(): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM action_items WHERE type = 'NC' AND status IN ('a_iniciar', 'em_andamento')`,
    );
    return row?.n ?? 0;
  }
}

let instance: ActionService | null = null;

export function getActionService(db: SQLiteDatabase): ActionService {
  if (!instance) instance = new ActionService(db);
  return instance;
}