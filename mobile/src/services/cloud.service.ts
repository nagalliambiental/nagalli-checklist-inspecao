import type { SQLiteDatabase } from 'expo-sqlite';
import { API_URL } from '../constants/api';
import { getInspectionService } from './inspection.service';

const TOKEN_KEY = 'cloud_token';
const USER_KEY = 'cloud_user';
const LAST_PULL_KEY = 'cloud_last_pull';
const LAST_PUSH_KEY = 'cloud_last_push';

export interface CloudUser {
  id: string;
  email: string;
  name: string;
}

interface SyncDoc {
  kind: 'empreendimento' | 'inspection' | 'action';
  id: string;
  data: unknown;
  deleted: boolean;
  updatedAt: number;
}

async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
}

async function delMeta(db: SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync('DELETE FROM sync_meta WHERE key = ?', [key]);
}

async function getToken(db: SQLiteDatabase): Promise<string | null> {
  return getMeta(db, TOKEN_KEY);
}

export async function getCloudUser(db: SQLiteDatabase): Promise<CloudUser | null> {
  const raw = await getMeta(db, USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloudUser;
  } catch {
    return null;
  }
}

async function api(path: string, init: RequestInit, token?: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  } catch {
    throw new Error('Sem conexão com a nuvem. Verifique a internet.');
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body?.error ?? `Erro ${response.status}`);
  return body;
}

async function storeSession(db: SQLiteDatabase, token: string, user: CloudUser): Promise<void> {
  await setMeta(db, TOKEN_KEY, token);
  await setMeta(db, USER_KEY, JSON.stringify(user));
}

export async function register(db: SQLiteDatabase, email: string, password: string, name: string): Promise<CloudUser> {
  const body = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  await storeSession(db, body.token, body.user);
  return body.user as CloudUser;
}

export async function login(db: SQLiteDatabase, email: string, password: string): Promise<CloudUser> {
  const body = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await storeSession(db, body.token, body.user);
  return body.user as CloudUser;
}

export async function logout(db: SQLiteDatabase): Promise<void> {
  await delMeta(db, TOKEN_KEY);
  await delMeta(db, USER_KEY);
}

// ── Coleta local ─────────────────────────────────────────────────────────

async function collectLocalDocs(db: SQLiteDatabase, since: number): Promise<SyncDoc[]> {
  const docs: SyncDoc[] = [];

  const emps = await db.getAllAsync<any>('SELECT * FROM empreendimentos WHERE updated_at > ?', [since]);
  for (const e of emps) {
    docs.push({
      kind: 'empreendimento',
      id: e.id,
      data: {
        id: e.id,
        name: e.name,
        contratante: e.contratante ?? '',
        address: e.address ?? '',
        notes: e.notes ?? '',
        active: Number(e.active) === 1,
        createdAt: String(e.created_at),
        updatedAt: String(e.updated_at),
      },
      deleted: Number(e.active) !== 1,
      updatedAt: Number(e.updated_at),
    });
  }

  const svc = getInspectionService(db);
  const inspections = await db.getAllAsync<{ id: string; updated_at: number }>(
    'SELECT id, updated_at FROM inspections WHERE updated_at > ?',
    [since],
  );
  for (const row of inspections) {
    const insp = await svc.getInspection(row.id);
    docs.push({ kind: 'inspection', id: insp.id, data: insp, deleted: false, updatedAt: Number(row.updated_at) });
  }

  const actions = await db.getAllAsync<any>('SELECT * FROM action_items WHERE updated_at > ?', [since]);
  for (const a of actions) {
    docs.push({
      kind: 'action',
      id: a.id,
      data: {
        id: a.id,
        type: a.type,
        inspectionId: a.inspection_id,
        itemId: a.item_id,
        companyName: a.company_name ?? '',
        areaName: a.area_name ?? '',
        itemLabel: a.item_label,
        description: a.description ?? '',
        actionWhat: a.action_what ?? '',
        actionHow: a.action_how ?? '',
        responsible: a.responsible ?? '',
        dueDate: a.due_date ?? '',
        priority: a.priority ?? 'Média',
        investmentMin: a.investment_min,
        investmentMax: a.investment_max,
        reassessDate: a.reassess_date ?? '',
        status: a.status ?? 'a_iniciar',
        completedDate: a.completed_date ?? '',
        closingNote: a.closing_note ?? '',
        closingPhoto: a.closing_photo ?? '',
        createdAt: String(a.created_at),
        updatedAt: String(a.updated_at),
      },
      deleted: false,
      updatedAt: Number(a.updated_at),
    });
  }

  return docs;
}

// ── Aplicação remota ─────────────────────────────────────────────────────

async function localUpdatedAt(db: SQLiteDatabase, table: string, id: string): Promise<number> {
  const row = await db.getFirstAsync<{ updated_at: number }>(
    `SELECT updated_at FROM ${table} WHERE id = ?`,
    [id],
  );
  return row ? Number(row.updated_at) : 0;
}

async function applyEmpreendimento(db: SQLiteDatabase, doc: SyncDoc): Promise<void> {
  const local = await localUpdatedAt(db, 'empreendimentos', doc.id);
  if (local > doc.updatedAt) return;
  const d: any = doc.data;
  await db.runAsync(
    `INSERT OR REPLACE INTO empreendimentos (id, name, contratante, address, notes, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.id,
      d.name ?? '',
      d.contratante ?? '',
      d.address ?? '',
      d.notes ?? '',
      d.active === false ? 0 : 1,
      Number(d.createdAt) || doc.updatedAt,
      doc.updatedAt,
    ],
  );
}

async function applyAction(db: SQLiteDatabase, doc: SyncDoc): Promise<void> {
  const local = await localUpdatedAt(db, 'action_items', doc.id);
  if (local > doc.updatedAt) return;
  const a: any = doc.data;
  // N/A é "não aplicável": não gera ação. Ignora docs antigos de N/A da nuvem.
  if (a?.type === 'NA') return;
  await db.runAsync(
    `INSERT OR REPLACE INTO action_items
       (id, type, inspection_id, item_id, company_name, area_name, item_label, description,
        action_what, action_how, responsible, due_date, priority, investment_min, investment_max,
        reassess_date, status, completed_date, closing_note, closing_photo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      a.type,
      a.inspectionId,
      a.itemId,
      a.companyName ?? '',
      a.areaName ?? '',
      a.itemLabel ?? '',
      a.description ?? '',
      a.actionWhat ?? '',
      a.actionHow ?? '',
      a.responsible ?? '',
      a.dueDate ?? '',
      a.priority ?? 'Média',
      a.investmentMin ?? null,
      a.investmentMax ?? null,
      a.reassessDate ?? '',
      a.status ?? 'a_iniciar',
      a.completedDate ?? '',
      a.closingNote ?? '',
      a.closingPhoto ?? '',
      Number(a.createdAt) || doc.updatedAt,
      doc.updatedAt,
    ],
  );
}

async function applyInspection(db: SQLiteDatabase, doc: SyncDoc): Promise<void> {
  const local = await localUpdatedAt(db, 'inspections', doc.id);
  if (local > doc.updatedAt) return;
  const i: any = doc.data;

  await db.runAsync(
    `INSERT OR REPLACE INTO inspections
       (id, user_id, company_id, company_name, template_id, site_id, address, area_id, area_name,
        inspector_name, date, status, notes, empreendimento_id, empreendimento_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      i.id,
      i.userId ?? null,
      i.companyId,
      i.companyName ?? null,
      i.templateId,
      i.siteId ?? null,
      i.address ?? null,
      i.areaId,
      i.areaName,
      i.inspectorName,
      i.date,
      i.status ?? 'draft',
      i.notes ?? null,
      i.empreendimentoId ?? null,
      i.empreendimentoName ?? null,
      Number(i.createdAt) || doc.updatedAt,
      doc.updatedAt,
    ],
  );

  await db.runAsync('DELETE FROM inspection_items WHERE inspection_id = ?', [i.id]);
  for (const item of i.items ?? []) {
    await db.runAsync(
      `INSERT INTO inspection_items
         (id, inspection_id, template_item_id, label, status, notes, photo_path, reassess_date,
          area_id, area_name, group_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        i.id,
        item.templateItemId,
        item.label,
        item.status ?? 'pending',
        item.notes ?? null,
        item.photos && item.photos.length > 0 ? JSON.stringify(item.photos) : null,
        item.reassessDate ?? null,
        item.areaId ?? null,
        item.areaName ?? null,
        item.groupName ?? null,
        Number(item.createdAt) || doc.updatedAt,
        doc.updatedAt,
      ],
    );
  }

  await db.runAsync('DELETE FROM inspection_areas WHERE inspection_id = ?', [i.id]);
  let position = 0;
  for (const area of i.areas ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO inspection_areas (inspection_id, area_id, area_name, position)
       VALUES (?, ?, ?, ?)`,
      [i.id, area.id, area.name, position],
    );
    position += 1;
  }
}

async function applyRemoteDocs(db: SQLiteDatabase, docs: SyncDoc[]): Promise<void> {
  for (const doc of docs) {
    if (doc.deleted) continue;
    if (doc.kind === 'empreendimento') await applyEmpreendimento(db, doc);
    else if (doc.kind === 'action') await applyAction(db, doc);
    else if (doc.kind === 'inspection') await applyInspection(db, doc);
  }
}

export async function syncNow(db: SQLiteDatabase): Promise<{ pushed: number; pulled: number }> {
  const token = await getToken(db);
  if (!token) throw new Error('Faça login para sincronizar.');

  const lastPull = Number(await getMeta(db, LAST_PULL_KEY)) || 0;
  const lastPush = Number(await getMeta(db, LAST_PUSH_KEY)) || 0;

  // Coleta o local antes de aplicar o remoto, para não perder edições locais.
  const docs = await collectLocalDocs(db, lastPush);

  const pulled = await api(`/sync/pull?since=${lastPull}`, { method: 'GET' }, token);
  await applyRemoteDocs(db, pulled.docs ?? []);
  await setMeta(db, LAST_PULL_KEY, String(pulled.serverTime ?? Date.now()));

  if (docs.length > 0) {
    await api('/sync/push', { method: 'POST', body: JSON.stringify({ docs }) }, token);
  }
  await setMeta(db, LAST_PUSH_KEY, String(Date.now()));

  return { pushed: docs.length, pulled: (pulled.docs ?? []).length };
}
