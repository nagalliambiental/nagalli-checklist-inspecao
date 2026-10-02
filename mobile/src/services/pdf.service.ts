import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { Image } from 'react-native';
import { Inspection, InspectionItem } from '../types';
import { resolveEmpreendimentoName } from './file-name';

const LOGO = require('../../assets/nagalli-logo.png');

let logoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string | null> {
  if (logoDataUri !== null) return logoDataUri;
  try {
    const src = Image.resolveAssetSource(LOGO);
    const file = new File(src.uri);
    if (!file.exists) {
      logoDataUri = '';
      return null;
    }
    logoDataUri = 'data:image/png;base64,' + (await file.base64());
  } catch {
    logoDataUri = '';
  }
  return logoDataUri || null;
}

export type PdfResult = { uri: string } | undefined;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateBr(value?: string): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function statusLabel(status: string): string {
  if (status === 'C') return 'Conforme';
  if (status === 'NC') return 'Não conforme';
  if (status === 'NA') return 'Não aplicável';
  return 'Pendente';
}

function statusCss(status: string): string {
  if (status === 'C') return 'color:#1F3B12;background:#f0fdf4;border-color:#bbf7d0;';
  if (status === 'NC') return 'color:#b91c1c;background:#fef2f2;border-color:#fecaca;';
  if (status === 'NA') return 'color:#555;background:#f5f5f5;border-color:#ddd;';
  return 'color:#333;background:#fff;border-color:#ccc;';
}

function renderItem(item: InspectionItem): string {
  return `
    <div class="item" style="${statusCss(item.status)}">
      <div class="badge">${statusLabel(item.status)}</div>
      <p class="text">${esc(item.label)}</p>
      ${item.notes ? `<p class="notes"><strong>Obs.:</strong> ${esc(item.notes)}</p>` : ''}
    </div>`;
}

/** Agrupa os itens por área, cada área começando em uma nova página. */
function renderAreaSections(items: InspectionItem[]): string {
  const order: string[] = [];
  const byArea = new Map<string, InspectionItem[]>();
  for (const item of items) {
    const area = (item.areaName ?? '').trim() || 'Geral';
    if (!byArea.has(area)) {
      byArea.set(area, []);
      order.push(area);
    }
    byArea.get(area)!.push(item);
  }

  return order
    .map((area, index) => {
      const block = byArea.get(area)!;
      return `<section class="area-block${index === 0 ? ' first' : ''}">
        <h2 class="area">${esc(area)}</h2>
        ${block.map(renderItem).join('')}
      </section>`;
    })
    .join('');
}

export async function buildInspectionHtml(inspection: Inspection): Promise<string> {
  const logoUri = await getLogoDataUri();
  const companyName = resolveEmpreendimentoName(inspection) || '—';
  const addressLine = inspection.address ?? '';
  const dateBr = formatDateBr(inspection.date);

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      @page {
        size: A4 portrait;
        margin: 150px 12mm 70px 12mm;
        @bottom-center {
          content: "Página " counter(page) " de " counter(pages);
          font-size: 9px;
          color: #777;
        }
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #111; }

      header {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 130px;
        padding: 8px 0 0;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 3px solid #70AD47;
        padding-bottom: 8px;
      }
      .brand img { height: 42px; }
      .brand h1 { color: #538135; font-size: 15px; margin: 0; }
      .brand .sub { color: #538135; font-size: 10.5px; margin-top: 2px; }

      footer {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        height: 46px;
        border-top: 1px solid #ddd;
        padding-top: 5px;
        font-size: 9px;
        color: #777;
      }

      .meta { background: #f6f7f5; border: 1px solid #e3e6e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; }
      .meta span { display: block; margin: 2px 0; }

      .area-block { page-break-before: always; }
      .area-block.first { page-break-before: avoid; }
      h2.area {
        font-size: 15px;
        color: #1F3B12;
        background: #EAF1E3;
        padding: 7px 10px;
        margin: 0 0 10px;
        page-break-after: avoid;
      }
      .item {
        border: 1px solid #ccc;
        border-left-width: 6px;
        border-radius: 6px;
        padding: 9px 11px;
        margin: 0 0 8px;
        page-break-inside: avoid;
      }
      .badge { font-weight: bold; text-transform: uppercase; font-size: 10px; }
      .text { margin: 4px 0 0; line-height: 1.35; }
      .notes { margin: 6px 0 0; color: #444; font-style: italic; line-height: 1.35; }
      .comments { page-break-before: always; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        ${logoUri ? `<img src="${logoUri}" alt="Nagalli Ambiental" />` : ''}
        <div>
          <h1>CHECKLIST DE INSPEÇÃO DE CAMPO</h1>
          <div class="sub">Conformidade Ambiental e de Segurança do Trabalho • Nagalli Ambiental Ltda.</div>
        </div>
      </div>
    </header>
    <footer>
      Relatório de Inspeção Periódica // Cópia controlada // Vedada distribuição sem autorização.
    </footer>
    <main>
      <div class="meta">
        <span><strong>Empreendimento:</strong> ${esc(companyName)}</span>
        <span><strong>Endereço:</strong> ${esc(addressLine || '—')}</span>
        <span><strong>Responsável pela vistoria:</strong> ${esc(inspection.inspectorName)}</span>
        <span><strong>Data da vistoria:</strong> ${dateBr}</span>
      </div>
      ${renderAreaSections(inspection.items ?? [])}
      ${
        inspection.notes
          ? `<section class="comments"><h2 class="area">COMENTÁRIOS GERAIS DA VISTORIA</h2><div class="item"><p class="text">${esc(inspection.notes)}</p></div></section>`
          : ''
      }
    </main>
  </body>
  </html>`;
}

export async function generateInspectionPdf(inspection: Inspection): Promise<PdfResult> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: await buildInspectionHtml(inspection),
    });
    return { uri };
  } catch (error) {
    console.error('Falha ao gerar PDF', error);
    return undefined;
  }
}

export async function sharePdf(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
