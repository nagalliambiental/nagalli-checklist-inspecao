import type { SQLiteDatabase } from 'expo-sqlite';
import { Packer } from 'docx';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Image } from 'react-native';
import type { InspectionItem } from '../types';
import { buildChecklistDocument, type ReportArea, type ReportPhoto, type ReportStatus } from './docx-report';
import { writeExportFile } from './export-file.service';
import { buildFileName, formatDateBr, INSPECTION_SUFFIX, resolveEmpreendimentoName, sanitizePart } from './file-name';
import { getInspectionService } from './inspection.service';

async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function imageType(uri: string): 'jpg' | 'png' {
  return uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
}

async function loadPhoto(uri: string): Promise<ReportPhoto | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    const [data, size] = await Promise.all([file.bytes(), imageSize(uri)]);
    if (!size.width || !size.height) return null;
    return { data, width: size.width, height: size.height, type: imageType(uri) };
  } catch (err) {
    console.warn('Foto ignorada no relatório DOCX:', uri, err);
    return null;
  }
}

let logoCache: Promise<ReportPhoto | null> | null = null;

async function loadLogo(): Promise<ReportPhoto | null> {
  if (!logoCache) {
    logoCache = (async () => {
      try {
        const src = Image.resolveAssetSource(require('../../assets/nagalli-logo.png'));
        const file = new File(src.uri);
        if (!file.exists) return null;
        const [data, size] = await Promise.all([file.bytes(), imageSize(src.uri)]);
        return { data, width: size.width || 40, height: size.height || 40, type: 'png' as const };
      } catch {
        return null;
      }
    })();
  }
  return logoCache;
}

function dateBr(value?: string): string {
  const parts = (value ?? '').split('-');
  return parts.length === 3 ? `${parts[2]} / ${parts[1]} / ${parts[0]}` : value ?? '';
}

async function resolveAreas(
  inspectionItems: InspectionItem[],
  declaredAreas: string[],
  groups: Record<string, { area: string; group: string }>,
): Promise<ReportArea[]> {
  const byArea = new Map<string, InspectionItem[]>();
  for (const item of inspectionItems) {
    const area = groups[item.templateItemId]?.area ?? item.areaName ?? '';
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(item);
  }

  const orderedNames = [
    ...declaredAreas.filter((name) => byArea.has(name)),
    ...[...byArea.keys()].filter((name) => !declaredAreas.includes(name)),
  ];

  const areas: ReportArea[] = [];
  for (const name of orderedNames) {
    const reportItems = [];
    for (const item of byArea.get(name) ?? []) {
      const photos: ReportPhoto[] = [];
      if (item.status === 'NC') {
        for (const ref of item.photos ?? []) {
          const photo = await loadPhoto(typeof ref === 'string' ? ref : ref.uri);
          if (photo) photos.push(photo);
        }
      }
      reportItems.push({
        label: item.label,
        status: item.status as ReportStatus,
        notes: item.notes?.trim() ?? '',
        group: groups[item.templateItemId]?.group ?? item.groupName ?? '',
        photos,
      });
    }
    areas.push({ name, items: reportItems });
  }

  return areas;
}

export async function generateInspectionDocxAndShare(db: SQLiteDatabase, inspectionId: string): Promise<boolean> {
  const svc = getInspectionService(db);
  const inspection = await svc.getInspection(inspectionId);
  const company = await svc.getCompany(inspection.companyId);
  const site = inspection.siteId ? await svc.getSite(inspection.siteId) : null;

  const addressParts: string[] = [];
  if (site?.address) addressParts.push(site.address);
  if (site?.city) addressParts.push(site.city + (site.state ? '/' + site.state : ''));
  else if (site?.state) addressParts.push(site.state);

  const groups = await svc.getInspectionItemGroups(inspectionId);
  const declaredAreas = (inspection.areas ?? []).map((a) => a.name);
  const areas = await resolveAreas(inspection.items ?? [], declaredAreas, groups);
  const logo = await loadLogo();

  const doc = buildChecklistDocument({
    companyName: resolveEmpreendimentoName(inspection) || company?.name || '',
    addressLine: inspection.address ?? addressParts.join(' — '),
    dateBr: dateBr(inspection.date),
    timeLabel: '—',
    inspectorName: inspection.inspectorName,
    comments: inspection.notes?.trim() ?? '',
    areas,
    logo: logo ?? undefined,
  });

  let b64: string;
  try {
    b64 = await Packer.toBase64String(doc);
  } catch (err) {
    console.warn('Falha ao empacotar o DOCX:', err);
    throw new Error(`Falha ao gerar o arquivo DOCX: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fileName = buildFileName(
    [sanitizePart(resolveEmpreendimentoName(inspection), 'Inspecao'), INSPECTION_SUFFIX, formatDateBr(inspection.date)],
    '.docx',
  );
  const file = await writeExportFile(fileName, b64);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      UTI: 'org.openxmlformats.wordprocessingml.document',
    });
  } else {
    console.warn('Compartilhamento indisponível; DOCX salvo em', file.uri);
  }
  return true;
}
