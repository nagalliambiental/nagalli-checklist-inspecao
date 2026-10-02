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
