import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  PageBreak,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

export interface ReportPhoto {
  data: Uint8Array;
  width: number;
  height: number;
  type: 'jpg' | 'png';
}

export type ReportStatus = 'C' | 'NC' | 'NA' | 'pending';

export interface ReportItem {
  label: string;
  status: ReportStatus;
  notes: string;
  group: string;
  photos: ReportPhoto[];
}

export interface ReportArea {
  name: string;
  items: ReportItem[];
}

export interface ReportInput {
  companyName: string;
  addressLine: string;
  dateBr: string;
  timeLabel: string;
  inspectorName: string;
  comments: string;
  areas: ReportArea[];
  logo?: ReportPhoto;
}

const FONT = 'Calibri';
const FONT_META = 'Ebrima';
const DARK_GREEN = '375623';
const TITLE_GREEN = '1F3B12';
const SUB_GREEN = '538135';
const GROUP_GREEN = 'D9E4CE';
const HEADING_GREEN = 'EAF1E3';

const CELL_MARGINS = { top: 60, bottom: 60, left: 80, right: 80 };
const GROUP_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };

/** Larguras das colunas em twips, iguais às do modelo CBB. */
const COLS = { num: 399, item: 5125, c: 496, nc: 498, na: 499, obs: 4177, foto: 3941 };
const TABLE_WIDTH = 15145;

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
};

const LEGEND = 'Legenda: C = Conforme    NC = Não conforme    N/A = Não aplicável';

const DESCRIPTION =
  'Lista de verificação destinada à inspeção visual das instalações, organizada por ambiente e, dentro de cada ' +
  'ambiente, por grupo temático de quesitos. Elaborada com base no histórico de pontos de atenção e não conformidades ' +
  'já constatados em vistorias técnicas anteriores, para apoiar a preparação das instalações aos processos de renovação ' +
  'das licenças ambientais e a melhoria contínua.';

const CONFIDENTIALITY =
  'Documento de uso exclusivamente interno, elaborado para fins de controle e gestão ambiental e de segurança do trabalho. ' +
  'É vedada sua reprodução, divulgação ou distribuição, total ou parcial, a terceiros, sem prévia autorização expressa da ' +
  'empresa, por conter informações sensíveis e não destinadas à publicidade. Este documento é numerado/controlado e seu acesso ' +
  'deve ser restrito aos colaboradores autorizados. O descumprimento sujeita o infrator às sanções cíveis e administrativas ' +
  'cabíveis, nos termos do art. 195, incisos XI e XII, da Lei nº 9.279/1996 (concorrência desleal e violação de sigilo obtido ' +
  'por relação contratual/empregatícia) e do art. 927 do Código Civil (responsabilidade civil por ato ilícito), sem prejuízo ' +
  'de medidas disciplinares e/ou penais eventualmente aplicáveis.';

interface RunOptions {
  font?: string;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  size?: number;
}

function run(text: string, opts: RunOptions = {}): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? FONT,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
    size: opts.size,
  });
}

function metaCell(text: string, width: number, span?: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.BOTH, children: [run(text, { font: FONT_META })] })],
  });
}

function headerCell(text: string, width: number, center: boolean): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: DARK_GREEN, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(text, { bold: true, color: 'FFFFFF', size: 18 })],
      }),
    ],
  });
}

function bodyCell(children: Paragraph[], width: number, align: (typeof AlignmentType)[keyof typeof AlignmentType]): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    children,
  });
}

function photoRun(photo: ReportPhoto, target = 150): ImageRun {
  const scale = photo.width ? target / photo.width : 1;
  return new ImageRun({
    type: photo.type,
    data: photo.data,
    transformation: { width: target, height: Math.round((photo.height || target) * scale) },
  });
}

function areaHeading(index: number, name: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    shading: { fill: HEADING_GREEN, type: ShadingType.CLEAR },
    spacing: { before: 160, after: 70 },
    children: [run(`${index + 1}. ${name}`, { bold: true, color: TITLE_GREEN, size: 22 })],
  });
}

function areaTable(area: ReportArea): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Nº', COLS.num, true),
        headerCell('Item de verificação', COLS.item, false),
        headerCell('C', COLS.c, true),
        headerCell('NC', COLS.nc, true),
        headerCell('N/A', COLS.na, true),
        headerCell('Observações', COLS.obs, false),
        headerCell('Foto (não conformidade)', COLS.foto, true),
      ],
    }),
  ];

  let currentGroup = '';
  let idx = 0;
  for (const item of area.items) {
    if (item.group && item.group !== currentGroup) {
      currentGroup = item.group;
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 7,
              shading: { fill: GROUP_GREEN, type: ShadingType.CLEAR },
              margins: GROUP_MARGINS,
              children: [new Paragraph({ children: [run(item.group, { bold: true, italics: true, color: TITLE_GREEN, size: 17 })] })],
            }),
          ],
        }),
      );
    }

    idx += 1;
    const mark = (status: ReportStatus) => (item.status === status ? 'X' : '');
    const statusCell = (text: string, width: number) =>
      bodyCell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: text ? [run(text, { font: FONT_META })] : [],
          }),
        ],
        width,
        AlignmentType.CENTER,
      );

    const photoParagraphs = item.photos.map(
      (photo) => new Paragraph({ alignment: AlignmentType.CENTER, children: [photoRun(photo)] }),
    );

    rows.push(
      new TableRow({
        height: { value: 680, rule: HeightRule.ATLEAST },
        children: [
          bodyCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [run(String(idx), { font: FONT_META })] })], COLS.num, AlignmentType.CENTER),
          bodyCell([new Paragraph({ alignment: AlignmentType.BOTH, children: [run(item.label, { font: FONT_META })] })], COLS.item, AlignmentType.BOTH),
          statusCell(mark('C'), COLS.c),
          statusCell(mark('NC'), COLS.nc),
          statusCell(mark('NA'), COLS.na),
          bodyCell([new Paragraph({ alignment: AlignmentType.BOTH, children: item.notes ? [run(item.notes, { font: FONT_META })] : [] })], COLS.obs, AlignmentType.BOTH),
          bodyCell(
            photoParagraphs.length > 0 ? photoParagraphs : [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })],
            COLS.foto,
            AlignmentType.CENTER,
          ),
        ],
      }),
    );
  }

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [COLS.num, COLS.item, COLS.c, COLS.nc, COLS.na, COLS.obs, COLS.foto],
    borders: BORDERS,
    margins: { left: 10, right: 10 },
    rows,
  });
}

function metaTable(input: ReportInput): Table {
  return new Table({
    width: { size: 15021, type: WidthType.DXA },
    columnWidths: [8500, 6521],
    borders: BORDERS,
    margins: { left: 10, right: 10 },
    rows: [
      new TableRow({
        children: [
          metaCell(`Data da vistoria: ${input.dateBr}`, 8500),
          metaCell(`Horário: ${input.timeLabel}`, 6521),
        ],
      }),
      new TableRow({
        children: [metaCell(`Responsável pela vistoria: ${input.inspectorName}`, 15021, 2)],
      }),
    ],
  });
}

function commentsBlock(input: ReportInput): (Paragraph | Table)[] {
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 240, after: 70 },
      children: [run('COMENTÁRIOS GERAIS DA VISTORIA', { bold: true, color: TITLE_GREEN, size: 22 })],
    }),
    new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [TABLE_WIDTH],
      borders: BORDERS,
      margins: { left: 10, right: 10 },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: TABLE_WIDTH, type: WidthType.DXA },
              margins: CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.BOTH, children: [run(input.comments, { font: FONT_META })] })],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 320 }, children: [run('_________________________________________________')] }),
    new Paragraph({ children: [run('André Nagalli, Dr.', { bold: true })] }),
    new Paragraph({
      children: [
        run('Eng. Civil – CREA-PR 70.901/D | Advogado – OAB/PR 87.212 | Téc. e Tecnólogo em Mineração CFT 00622916963', {
          size: 17,
        }),
      ],
    }),
    new Paragraph({
      children: [run('Mestre em Eng. de Recursos Hídricos e Ambiental | Doutor em Geologia — Consultor', { size: 17 })],
    }),
  ];
}

function header(input: ReportInput): Header {
  const runs: (TextRun | ImageRun)[] = [];
  if (input.logo) runs.push(photoRun(input.logo, 36));
  runs.push(run('   Nagalli Ambiental Ltda.', { bold: true, color: SUB_GREEN, size: 24 }));
  return new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: '70AD47', space: 6 } },
        spacing: { after: 60 },
        children: runs,
      }),
    ],
  });
}

function footer(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run('Relatório de Inspeção Periódica // Cópia controlada // Vedada distribuição sem autorização.', { size: 16 }),
        ],
      }),
    ],
  });
}

export function buildChecklistDocument(input: ReportInput): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [run('CHECKLIST DE INSPEÇÃO DE CAMPO', { bold: true, color: TITLE_GREEN, size: 30 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [run('Conformidade Ambiental e de Segurança do Trabalho — Verificação por Ambiente', { bold: true, color: SUB_GREEN, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [run(input.companyName, { bold: true, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [run(input.addressLine, { italics: true, size: 18 })] }),
    metaTable(input),
    new Paragraph({ spacing: { before: 120, after: 40 }, children: [run(LEGEND, { size: 18 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [run(DESCRIPTION, { size: 19 })] }),
    new Paragraph({ spacing: { before: 40, after: 20 }, children: [run('AVISO DE CONFIDENCIALIDADE — USO INTERNO', { bold: true, size: 20 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [run(CONFIDENTIALITY, { size: 16 })] }),
    // Página em branco reservada para o sumário, preenchido manualmente.
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  input.areas.forEach((area, index) => {
    if (area.items.length === 0) return;
    children.push(areaHeading(index, area.name));
    children.push(areaTable(area));
  });

  children.push(...commentsBlock(input));

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        headers: { default: header(input) },
        footers: { default: footer() },
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 1418, right: 900, bottom: 1702, left: 900, header: 426, footer: 378 },
          },
        },
        children,
      },
    ],
  });
}
