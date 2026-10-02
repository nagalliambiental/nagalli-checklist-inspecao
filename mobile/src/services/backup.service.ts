import type { SQLiteDatabase } from 'expo-sqlite';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { buildInspectionDocxBase64 } from './docx.service';
import { writeExportFile } from './export-file.service';
import { buildFileName, formatDateBr, resolveEmpreendimentoName, sanitizePart } from './file-name';
import { getInspectionService } from './inspection.service';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Gera um ZIP com tudo da vistoria: dados (JSON), todas as fotos e o relatório
 * DOCX. O usuário escolhe onde salvar (PC, Drive, etc.). Assim as fotos não
 * precisam ocupar espaço no banco na nuvem.
 */
export async function backupInspectionAndShare(db: SQLiteDatabase, inspectionId: string): Promise<boolean> {
  const svc = getInspectionService(db);
  const inspection = await svc.getInspection(inspectionId);

  const files: Record<string, Uint8Array> = {
    'dados/vistoria.json': strToU8(JSON.stringify(inspection, null, 2)),
  };

  for (const item of inspection.items ?? []) {
    const area = sanitizePart(item.areaName ?? 'Sem_area', 'Sem_area');
    for (const ref of item.photos ?? []) {
      const uri = typeof ref === 'string' ? ref : ref.uri;
      if (!uri) continue;
      try {
        const file = new File(uri);
        if (!file.exists) continue;
        const name = uri.split('/').pop() ?? `foto_${Object.keys(files).length}.jpg`;
        files[`fotos/${area}/${name}`] = await file.bytes();
      } catch {
        // ignora foto ausente
      }
    }
  }

  try {
    const { base64 } = await buildInspectionDocxBase64(db, inspectionId);
    files['relatorio.docx'] = base64ToBytes(base64);
  } catch {
    // segue sem o relatório se falhar
  }

  const zipped = zipSync(files, { level: 6 });
  const fileName = buildFileName(
    ['Backup', sanitizePart(resolveEmpreendimentoName(inspection), 'Vistoria'), formatDateBr(inspection.date)],
    '.zip',
  );
  const out = await writeExportFile(fileName, zipped);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  }
  return true;
}

/**
 * Backup geral: todas as vistorias, empreendimentos, ações e todas as fotos em
 * um único ZIP. O usuário escolhe onde salvar.
 */
export async function backupAllAndShare(
  db: SQLiteDatabase,
): Promise<{ inspections: number; photos: number }> {
  const svc = getInspectionService(db);
  const inspections = await svc.listInspections();
  const empreendimentos = await db.getAllAsync<any>('SELECT * FROM empreendimentos ORDER BY name');
  const actions = await db.getAllAsync<any>('SELECT * FROM action_items ORDER BY created_at');

  const files: Record<string, Uint8Array> = {
    'dados/empreendimentos.json': strToU8(JSON.stringify(empreendimentos, null, 2)),
    'dados/vistorias.json': strToU8(JSON.stringify(inspections, null, 2)),
    'dados/acoes.json': strToU8(JSON.stringify(actions, null, 2)),
  };

  let photos = 0;
  for (const insp of inspections) {
    const inspFolder = sanitizePart(insp.id, 'vistoria');
    for (const item of insp.items ?? []) {
      const area = sanitizePart(item.areaName ?? 'Sem_area', 'Sem_area');
      for (const ref of item.photos ?? []) {
        const uri = typeof ref === 'string' ? ref : ref.uri;
        if (!uri) continue;
        const name = uri.split('/').pop() ?? `foto_${photos}.jpg`;
        const path = `fotos/${inspFolder}/${area}/${name}`;
        if (files[path]) continue;
        try {
          const file = new File(uri);
          if (!file.exists) continue;
          files[path] = await file.bytes();
          photos += 1;
        } catch {
          // ignora foto ausente
        }
      }
    }
  }

  const zipped = zipSync(files, { level: 6 });
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const fileName = buildFileName(['Backup_Geral', stamp], '.zip');
  const out = await writeExportFile(fileName, zipped);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  }
  return { inspections: inspections.length, photos };
}
