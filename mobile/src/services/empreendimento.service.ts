import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Empreendimento } from '../types';

function now(): number {
  return Date.now();
}

function toEmpreendimento(row: any): Empreendimento {
  return {
    id: row.id,
    name: row.name,
    contratante: row.contratante ?? '',
    address: row.address ?? '',
    notes: row.notes ?? '',
    active: Number(row.active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Chave estável usada pelo backfill do schema para casar nomes de empresa já
 * gravados com o empreendimento correspondente.
 */
export function slugKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Chave de comparação de nomes, insensível a acentos, caixa e pontuação, para
 * que "Condominio X", "Condomínio X" e "condomínio  x" virem o mesmo
 * empreendimento. Feita em TypeScript porque o `lower()` do SQLite só trata
 * ASCII e não removeria os acentos.
 */
export function normalizeNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class EmpreendimentoService {
  constructor(private db: SQLiteDatabase) {}

  async list(options?: { includeArchived?: boolean }): Promise<Empreendimento[]> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM empreendimentos
       ${options?.includeArchived ? '' : 'WHERE active = 1'}
       ORDER BY name COLLATE NOCASE`,
    );
    return rows.map(toEmpreendimento);
  }

  async get(id: string): Promise<Empreendimento | null> {
    const row = await this.db.getFirstAsync<any>(
      `SELECT * FROM empreendimentos WHERE id = ?`,
      [id],
    );
    return row ? toEmpreendimento(row) : null;
  }

  async getByName(name: string): Promise<Empreendimento | null> {
    const row = await this.db.getFirstAsync<any>(
      `SELECT * FROM empreendimentos WHERE name = ? COLLATE NOCASE`,
      [name.trim()],
    );
    return row ? toEmpreendimento(row) : null;
  }

  /** Reaproveita um cadastro existente mesmo que o nome só difira em acentos ou caixa. */
  async findEquivalent(name: string): Promise<Empreendimento | null> {
    const key = normalizeNameKey(name);
    if (!key) return null;
    const all = await this.list({ includeArchived: true });
    return all.find((e) => normalizeNameKey(e.name) === key) ?? null;
  }

  async create(input: {
    name: string;
    contratante?: string;
    address?: string;
    notes?: string;
  }): Promise<Empreendimento> {
    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome do empreendimento.');

    const existing = (await this.findEquivalent(name)) ?? null;
    if (existing) {
      if (!existing.active) await this.setArchived(existing.id, false);
      return existing;
    }

    const id = `emp_${slugKey(name)}`;
    const ts = now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO empreendimentos
         (id, name, contratante, address, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        name,
        (input.contratante ?? '').trim(),
        (input.address ?? '').trim(),
        (input.notes ?? '').trim(),
        ts,
        ts,
      ],
    );
    return (await this.get(id)) as Empreendimento;
  }

  async update(
    id: string,
    input: { name?: string; contratante?: string; address?: string; notes?: string },
  ): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('Empreendimento não encontrado.');

    const name = (input.name ?? current.name).trim();
    if (!name) throw new Error('Informe o nome do empreendimento.');

    // Propaga o novo nome para as vistorias e NC já registradas, mantendo o
    // relatório histórico e a lista de ações coerentes com o cadastro atual.
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE empreendimentos
         SET name = ?, contratante = ?, address = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          name,
          (input.contratante ?? current.contratante).trim(),
          (input.address ?? current.address).trim(),
          (input.notes ?? current.notes).trim(),
          now(),
          id,
        ],
      );
      await this.db.runAsync(
        `UPDATE inspections
         SET empreendimento_name = ?, company_name = ?
         WHERE empreendimento_id = ?`,
        [name, name, id],
      );
      await this.db.runAsync(
        `UPDATE action_items
         SET company_name = ?
         WHERE inspection_id IN (SELECT id FROM inspections WHERE empreendimento_id = ?)`,
        [name, id],
      );
    });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await this.db.runAsync(
      `UPDATE empreendimentos SET active = ?, updated_at = ? WHERE id = ?`,
      [archived ? 0 : 1, now(), id],
    );
  }

  async countInspections(id: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM inspections WHERE empreendimento_id = ?`,
      [id],
    );
    return row ? Number(row.n) : 0;
  }
}

let instance: EmpreendimentoService | null = null;

export function getEmpreendimentoService(db: SQLiteDatabase): EmpreendimentoService {
  if (!instance) instance = new EmpreendimentoService(db);
  return instance;
}
