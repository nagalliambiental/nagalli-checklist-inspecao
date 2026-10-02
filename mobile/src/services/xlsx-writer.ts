import { strToU8, zipSync } from 'fflate';

export type CellValue =
  | { t: 's'; v: string }
  | { t: 'n'; v: number }
  | { t: 'f'; f: string; v?: number };

export interface Cell {
  ref: string;
  s: number;
  value: CellValue;
}

export interface Row {
  r: number;
  h?: number;
  cells: Cell[];
}

export interface Col {
  min: number;
  max: number;
  width: number;
}

export interface SheetSpec {
  name: string;
  cols: Col[];
  rows: Row[];
  merges?: string[];
  freeze?: { ySplit: number; topLeft: string };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(cell: Cell): string {
  const v = cell.value;
  if (v.t === 's') {
    return `<c r="${cell.ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(v.v)}</t></is></c>`;
  }
  if (v.t === 'n') {
    return `<c r="${cell.ref}" s="${cell.s}"><v>${v.v}</v></c>`;
  }
  const cached = v.v !== undefined ? `<v>${v.v}</v>` : '';
  return `<c r="${cell.ref}" s="${cell.s}"><f>${esc(v.f)}</f>${cached}</c>`;
}

function sheetXml(sheet: SheetSpec, tabSelected: boolean): string {
  const cols = sheet.cols.length
    ? `<cols>${sheet.cols
        .map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const rows = sheet.rows
    .map((row) => {
      const attrs = row.h ? ` ht="${row.h}" customHeight="1"` : '';
      return `<row r="${row.r}"${attrs}>${row.cells.map(cellXml).join('')}</row>`;
    })
    .join('');

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map((m) => `<mergeCell ref="${m}"/>`)
        .join('')}</mergeCells>`
    : '';

  const pane = sheet.freeze
    ? `<pane xSplit="0" ySplit="${sheet.freeze.ySplit}" topLeftCell="${sheet.freeze.topLeft}" activePane="bottomLeft" state="frozen"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView showGridLines="0"${tabSelected ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>
${cols}
<sheetData>${rows}</sheetData>
${merges}
<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.511811" footer="0.511811"/>
<pageSetup paperSize="9" scale="100" fitToWidth="1" fitToHeight="1" pageOrder="downThenOver" orientation="portrait" horizontalDpi="300" verticalDpi="300"/>
</worksheet>`;
}

const BORDER_THIN = `<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>`;
const BORDER_TOP = `<border><left/><right/><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>`;
const BORDER_NONE = `<border><left/><right/><top/><bottom/><diagonal/></border>`;

const FONT = (opts: { b?: boolean; i?: boolean; sz: number; color?: string }) =>
  `<font>${opts.b ? '<b/>' : ''}${opts.i ? '<i/>' : ''}<sz val="${opts.sz}"/>${
    opts.color ? `<color rgb="${opts.color}"/>` : ''
  }<name val="Arial"/></font>`;

const FILL = (rgb: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor rgb="FF${rgb.slice(2)}"/></patternFill></fill>`;

const XF = (opts: {
  font: number;
  fill?: number;
  border?: number;
  numFmt?: number;
  h?: string;
  v?: string;
  wrap?: boolean;
}) =>
  `<xf numFmtId="${opts.numFmt ?? 0}" fontId="${opts.font}" fillId="${opts.fill ?? 0}" borderId="${opts.border ?? 0}" xfId="0"${
    opts.numFmt ? ' applyNumberFormat="1"' : ''
  } applyFont="1"${opts.fill ? ' applyFill="1"' : ''}${opts.border ? ' applyBorder="1"' : ''}${
    opts.h || opts.v || opts.wrap ? ' applyAlignment="1"' : ''
  }>${
    opts.h || opts.v || opts.wrap
      ? `<alignment${opts.h ? ` horizontal="${opts.h}"` : ''}${opts.v ? ` vertical="${opts.v}"` : ''}${
          opts.wrap ? ' wrapText="1"' : ''
        }/>`
      : ''
  }</xf>`;

/**
 * Índices de estilo usados pelas planilhas. A ordem precisa bater com a lista
 * de `cellXfs` em `stylesXml()`.
 */
export const STYLE = {
  title: 1,
  subtitle: 2,
  description: 3,
  sectionTitle: 4,
  header: 5,
  totalLabel: 6,
  totalNumber: 7,
  legendLabel: 8,
  legendHigh: 9,
  legendMedium: 10,
  legendLow: 11,
  num: 12,
  numAlt: 13,
  text: 14,
  textAlt: 15,
  center: 16,
  centerAlt: 17,
  money: 18,
  moneyAlt: 19,
  priorityHigh: 20,
  priorityMedium: 21,
  priorityLow: 22,
} as const;

function stylesXml(): string {
  const fonts = [
    FONT({ sz: 10 }),
    FONT({ b: true, sz: 14, color: 'FF1F3B12' }),
    FONT({ i: true, sz: 10, color: 'FF555555' }),
    FONT({ i: true, sz: 9, color: 'FF777777' }),
    FONT({ b: true, sz: 10, color: 'FFFFFFFF' }),
    FONT({ sz: 10, color: 'FF0000FF' }),
    FONT({ b: true, sz: 10 }),
    FONT({ b: true, sz: 9 }),
    FONT({ b: true, sz: 12, color: 'FF1F3B12' }),
  ];

  const fills = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    FILL('FF375623'),
    FILL('FFF7FAF5'),
    FILL('FFF8CBAD'),
    FILL('FFFFF2CC'),
    FILL('FFE2EFDA'),
  ];

  const borders = [BORDER_NONE, BORDER_THIN, BORDER_TOP];

  const cellXfs = [
    XF({ font: 0 }),
    XF({ font: 1, h: 'left', v: 'center' }),
    XF({ font: 2, v: 'bottom' }),
    XF({ font: 3, v: 'top', wrap: true }),
    XF({ font: 8, v: 'bottom' }),
    XF({ font: 4, fill: 2, border: 1, h: 'center', v: 'center', wrap: true }),
    XF({ font: 6, h: 'right', v: 'bottom' }),
    XF({ font: 6, border: 2, numFmt: 165, h: 'right', v: 'bottom' }),
    XF({ font: 7, v: 'bottom' }),
    XF({ font: 0, fill: 4, h: 'center', v: 'bottom' }),
    XF({ font: 0, fill: 5, h: 'center', v: 'bottom' }),
    XF({ font: 0, fill: 6, h: 'center', v: 'bottom' }),
    XF({ font: 0, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 0, fill: 3, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 0, border: 1, h: 'left', v: 'top', wrap: true }),
    XF({ font: 0, fill: 3, border: 1, h: 'left', v: 'top', wrap: true }),
    XF({ font: 0, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 0, fill: 3, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 5, border: 1, numFmt: 165, h: 'right', v: 'top' }),
    XF({ font: 5, fill: 3, border: 1, numFmt: 165, h: 'right', v: 'top' }),
    XF({ font: 0, fill: 4, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 0, fill: 5, border: 1, h: 'center', v: 'top', wrap: true }),
    XF({ font: 0, fill: 6, border: 1, h: 'center', v: 'top', wrap: true }),
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="165" formatCode="&quot;R$ &quot;#,##0"/></numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const sheetOverrides = sheets
    .map(
      (_s, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>Checklist CBB</dc:creator>
<cp:lastModifiedBy>Checklist CBB</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Checklist CBB</Application>
</Properties>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(stylesXml()),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
  };

  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet, i === 0));
  });

  return zipSync(files);
}
