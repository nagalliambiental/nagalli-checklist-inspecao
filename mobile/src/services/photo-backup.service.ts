import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { zipSync } from 'fflate';
import { buildFileName, formatDateBr, INSPECTION_SUFFIX, resolveEmpreendimentoName, sanitizePart } from './file-name';
import { writeExportFile } from './export-file.service';
import { listInspectionPhotos } from './photo.service';
import type { Inspection, InspectionPhotoRef } from '../types';

const DEFAULT_AREA = 'Sem_area';

function photoUri(ref: InspectionPhotoRef): string {
  return typeof ref === 'string' ? ref : ref.uri;
}

/**
 * Collects the inspection photos grouped by the area of the item they belong
 * to, so the archive mirrors how the checklist is organised on site.
 * Photos that are no longer referenced by any item are still included, under
 * a fallback folder, so nothing taken in the field gets lost.
 */
async function collectPhotosByArea(
  inspection: Inspection,
): Promise<Map<string, string[]>> {
  const byArea = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const item of inspection.items) {
    const area = sanitizePart(item.areaName, DEFAULT_AREA);
    const bucket = byArea.get(area) ?? [];
    for (const ref of item.photos ?? []) {
      const uri = photoUri(ref);
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      bucket.push(uri);
    }
    if (bucket.length > 0) byArea.set(area, bucket);
  }

  for (const uri of await listInspectionPhotos(inspection.id)) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    const bucket = byArea.get(DEFAULT_AREA) ?? [];
    bucket.push(uri);
    byArea.set(DEFAULT_AREA, bucket);
  }

  return byArea;
}

export async function zipInspectionPhotosAndShare(inspection: Inspection): Promise<boolean> {
  const byArea = await collectPhotosByArea(inspection);
  if (byArea.size === 0) return false;

  const entries: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [area, uris] of byArea) {
    let index = 0;
    for (const uri of uris) {
      const file = new File(uri);
      if (!file.exists) continue;
      index += 1;
      total += 1;
      entries[`${area}/`] = new Uint8Array(0);
      entries[`${area}/${String(index).padStart(3, '0')}.jpg`] = await file.bytes();
    }
  }
  if (total === 0) return false;

  const fileName = buildFileName(
    [
      'Fotos',
      sanitizePart(resolveEmpreendimentoName(inspection), 'Inspecao'),
      INSPECTION_SUFFIX,
      formatDateBr(inspection.date),
    ],
    '.zip',
  );
  const file = await writeExportFile(fileName, zipSync(entries));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      UTI: 'com.pkware.zip-archive',
    });
  }
  return true;
}
