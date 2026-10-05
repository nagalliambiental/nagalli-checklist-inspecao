import type { SQLiteDatabase } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { getActionService } from './action.service';
import { writeExportFile } from './export-file.service';
import { buildFileName, formatDateBr, resolveEmpreendimentoName } from './file-name';
import type { ActionItem } from '../types';
import { getInspectionService } from './inspection.service';
import { buildPlanWorkbook, type PlanRow, type ReassessRow } from './xlsx-plan';

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'para', 'com', 'por',
]);

/** "RECEPÇÃO" -> "Recepção"; "CENTRAL DE RESÍDUOS E CAÇAMBAS" -> "Central de Resíduos e Caçambas". */
function areaLabel(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+)/)
    .map((word) => (word.trim() && !STOPWORDS.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join('');
}

function addressLine(site: { address?: string; city?: string; state?: string } | null): string {
  const parts: string[] = [];
  if (site?.address) parts.push(site.address);
  if (site?.city || site?.state) parts.push(`${site.city ?? ''}${site.city && site.state ? '/' : ''}${site.state ?? ''}`);
  return parts.join(', ');
}

const STATUS_LABEL: Record<string, string> = {
  a_iniciar: 'A iniciar',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function ncFromAction(a: ActionItem): PlanRow {
  return {
    area: areaLabel(a.areaName ?? ''),
    nc: a.itemLabel,
    what: a.actionWhat,
    why: a.description ?? '',
    how: a.actionHow,
    who: a.responsible,
    when: a.dueDate ? a.dueDate.split('-').reverse().join('/') : '',
    priority: a.priority,
    min: a.investmentMin,
    max: a.investmentMax,
    status: STATUS_LABEL[a.status] ?? 'A iniciar',
  };
}

export async function generate5w2hAndShare(db: SQLiteDatabase, date: string): Promise<boolean> {
  const svc = getInspectionService(db);
  const actionSvc = getActionService(db);

  const inspections = await svc.listInspectionsByDate(date);
  if (inspections.length === 0) return false;

  const first = inspections[0];
  const company = first.companyId ? await svc.getCompany(first.companyId) : null;
  const companyName = resolveEmpreendimentoName(first) || company?.name || '';
  const address = first.address ?? addressLine(first.siteId ? await svc.getSite(first.siteId) : null);
  const companyLine = [companyName, address].filter(Boolean).join(' – ');
  const shortName = companyName.trim().split(/\s+/)[0] ?? companyName;
  const titleDate = date.split('-').reverse().join('/');

  const actions = await actionSvc.getActionsByInspectionIds(inspections.map((i) => i.id));
  const ncActions = actions.filter((a) => a.type === 'NC');
  const planRows: PlanRow[] = ncActions.map(ncFromAction);
  // Reavaliações: somente NC marcadas (com data) para rever depois. N/A não entra.
  const reassessRows: ReassessRow[] = ncActions
    .filter((a) => (a.reassessDate ?? '').trim() !== '')
    .map((a) => ({
      area: areaLabel(a.areaName ?? ''),
      item: a.itemLabel,
      reason: a.description?.trim() || a.actionWhat?.trim() || 'Reavaliação solicitada.',
      reassess: a.reassessDate.split('-').reverse().join('/'),
    }));

  for (const insp of inspections) {
    for (const item of insp.items ?? []) {
      const area = areaLabel(item.areaName ?? insp.areaName ?? '');
      if (item.status === 'NC' && ncActions.length === 0) {
        planRows.push({
          area,
          nc: item.label,
          what: '',
          why: item.notes?.trim() ?? '',
          how: '',
          who: '',
          when: '',
          priority: 'Média',
          status: 'A iniciar',
        });
      }
    }
  }

  const bytes = buildPlanWorkbook({
    planTitle: `PLANO DE AÇÃO 5W2H – CHECKLIST DE INSPEÇÃO DE CAMPO ${shortName} (${titleDate})`,
    companyLine,
    planDescription:
      `Elaborado a partir das não conformidades (NC) registradas no checklist de inspeção de campo de ${titleDate}. ` +
      'Os valores de investimento são estimativas preliminares de engenharia (faixa mín.–máx.), sujeitas a cotação formal ' +
      'antes da execução. Responsáveis indicados por função/área; a empresa deve nomear o colaborador titular.',
    planRows,
    reassessTitle: 'ITENS PARA REAVALIAÇÃO – REVER NA PRÓXIMA INSPEÇÃO',
    reassessDescription:
      'Itens marcados para reavaliação. São não conformidades que a equipe optou por rever posteriormente. ' +
      'A data indicada é o prazo sugerido para a nova verificação.',
    reassessRows,
  });

  const fileName = buildFileName(['Plano_5W2H', formatDateBr(date)], '.xlsx');
  const file = await writeExportFile(fileName, bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }

  return true;
}
