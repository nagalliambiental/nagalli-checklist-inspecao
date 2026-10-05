import { buildXlsx, STYLE, type Cell, type Row, type SheetSpec } from './xlsx-writer';

export interface PlanRow {
  area: string;
  nc: string;
  what: string;
  why: string;
  how: string;
  who: string;
  when: string;
  priority: string;
  min?: number;
  max?: number;
  status: string;
}

export interface ReassessRow {
  area: string;
  item: string;
  reason: string;
  reassess: string;
}

export interface PlanWorkbookInput {
  planTitle: string;
  companyLine: string;
  planDescription: string;
  planRows: PlanRow[];
  reassessTitle: string;
  reassessDescription: string;
  reassessRows: ReassessRow[];
}

const PRIORITY_STYLE: Record<string, number> = {
  Alta: STYLE.priorityHigh,
  Média: STYLE.priorityMedium,
  Baixa: STYLE.priorityLow,
};

function colLetter(n: number): string {
  let s = '';
  let value = n;
  while (value > 0) {
    const m = (value - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    value = Math.floor((value - 1) / 26);
  }
  return s;
}

function str(col: number, row: number, style: number, value: string): Cell {
  return { ref: `${colLetter(col)}${row}`, s: style, value: { t: 's', v: value } };
}

function num(col: number, row: number, style: number, value: number): Cell {
  return { ref: `${colLetter(col)}${row}`, s: style, value: { t: 'n', v: value } };
}

function formula(col: number, row: number, style: number, f: string, v: number): Cell {
  return { ref: `${colLetter(col)}${row}`, s: style, value: { t: 'f', f, v } };
}

function buildPlanSheet(input: PlanWorkbookInput): SheetSpec {
  const header = [
    'Nº',
    'Onde\n(Ambiente)',
    'Não conformidade identificada\n(referência do checklist)',
    'O quê\n(ação corretiva)',
    'Por quê\n(justificativa / risco)',
    'Como\n(método de execução)',
    'Quem\n(responsável)',
    'Quando\n(prazo sugerido)',
    'Prioridade',
    'Investimento\nmínimo (R$)',
    'Investimento\nmáximo (R$)',
    'Status',
  ];

  const sheetRows: Row[] = [
    { r: 1, h: 17.35, cells: [str(1, 1, STYLE.title, input.planTitle)] },
    { r: 2, h: 15, cells: [str(1, 2, STYLE.subtitle, input.companyLine)] },
    { r: 3, h: 27.75, cells: [str(1, 3, STYLE.description, input.planDescription)] },
    { r: 5, h: 42, cells: header.map((text, i) => str(i + 1, 5, STYLE.header, text)) },
  ];

  let totalMin = 0;
  let totalMax = 0;
  input.planRows.forEach((data, index) => {
    const r = 6 + index;
    const alt = index % 2 === 1;
    totalMin += data.min ?? 0;
    totalMax += data.max ?? 0;

    sheetRows.push({
      r,
      cells: [
        num(1, r, alt ? STYLE.numAlt : STYLE.num, index + 1),
        str(2, r, alt ? STYLE.textAlt : STYLE.text, data.area),
        str(3, r, alt ? STYLE.textAlt : STYLE.text, data.nc),
        str(4, r, alt ? STYLE.textAlt : STYLE.text, data.what),
        str(5, r, alt ? STYLE.textAlt : STYLE.text, data.why),
        str(6, r, alt ? STYLE.textAlt : STYLE.text, data.how),
        str(7, r, alt ? STYLE.textAlt : STYLE.text, data.who),
        str(8, r, alt ? STYLE.centerAlt : STYLE.center, data.when),
        str(9, r, PRIORITY_STYLE[data.priority] ?? STYLE.priorityMedium, data.priority),
        data.min !== undefined ? num(10, r, alt ? STYLE.moneyAlt : STYLE.money, data.min) : str(10, r, alt ? STYLE.moneyAlt : STYLE.money, ''),
        data.max !== undefined ? num(11, r, alt ? STYLE.moneyAlt : STYLE.money, data.max) : str(11, r, alt ? STYLE.moneyAlt : STYLE.money, ''),
        str(12, r, alt ? STYLE.centerAlt : STYLE.center, data.status),
      ],
    });
  });

  const lastData = 5 + input.planRows.length;
  const totalRow = lastData + 2;
  const legendRow = lastData + 4;

  sheetRows.push({
    r: totalRow,
    cells: [
      str(8, totalRow, STYLE.totalLabel, 'TOTAL ESTIMADO'),
      formula(10, totalRow, STYLE.totalNumber, `SUM(J6:J${lastData})`, totalMin),
      formula(11, totalRow, STYLE.totalNumber, `SUM(K6:K${lastData})`, totalMax),
    ],
  });

  sheetRows.push({
    r: legendRow,
    cells: [
      str(1, legendRow, STYLE.legendLabel, 'Legenda de prioridade:'),
      str(2, legendRow, STYLE.legendHigh, 'Alta'),
      str(3, legendRow, STYLE.legendMedium, 'Média'),
      str(4, legendRow, STYLE.legendLow, 'Baixa'),
    ],
  });

  return {
    name: 'Plano de Ação 5W2H',
    cols: [
      { min: 1, max: 1, width: 5 },
      { min: 2, max: 2, width: 20 },
      { min: 3, max: 3, width: 34 },
      { min: 4, max: 6, width: 30 },
      { min: 7, max: 7, width: 20 },
      { min: 8, max: 8, width: 16 },
      { min: 9, max: 9, width: 10 },
      { min: 10, max: 12, width: 14 },
    ],
    merges: ['A1:M1', 'A2:M2', 'A3:M3'],
    freeze: { ySplit: 5, topLeft: 'A6' },
    rows: sheetRows,
  };
}

function buildReassessSheet(input: PlanWorkbookInput): SheetSpec {
  const header = ['Nº', 'Ambiente', 'Item pendente', 'Motivo registrado na vistoria', 'Reavaliar até'];
  const sheetRows: Row[] = [
    { r: 1, h: 15, cells: [str(1, 1, STYLE.sectionTitle, input.reassessTitle)] },
    { r: 2, h: 30, cells: [str(1, 2, STYLE.description, input.reassessDescription)] },
    { r: 4, h: 24, cells: header.map((text, i) => str(i + 1, 4, STYLE.header, text)) },
  ];

  input.reassessRows.forEach((data, index) => {
    const r = 5 + index;
    const alt = index % 2 === 1;
    sheetRows.push({
      r,
      cells: [
        num(1, r, alt ? STYLE.numAlt : STYLE.num, index + 1),
        str(2, r, alt ? STYLE.textAlt : STYLE.text, data.area),
        str(3, r, alt ? STYLE.textAlt : STYLE.text, data.item),
        str(4, r, alt ? STYLE.textAlt : STYLE.text, data.reason),
        str(5, r, alt ? STYLE.centerAlt : STYLE.center, data.reassess),
      ],
    });
  });

  return {
    name: 'Pendências de Reavaliação',
    cols: [
      { min: 1, max: 1, width: 5 },
      { min: 2, max: 2, width: 32 },
      { min: 3, max: 4, width: 34 },
      { min: 5, max: 5, width: 16 },
    ],
    merges: ['A1:E1', 'A2:E2'],
    freeze: { ySplit: 4, topLeft: 'A5' },
    rows: sheetRows,
  };
}

export function buildPlanWorkbook(input: PlanWorkbookInput): Uint8Array {
  const sheets = [buildPlanSheet(input)];
  // A aba de reavaliação só existe se houver itens para reavaliar (N/A não gera
  // pendência, então normalmente não há).
  if (input.reassessRows.length > 0) sheets.push(buildReassessSheet(input));
  return buildXlsx(sheets);
}
