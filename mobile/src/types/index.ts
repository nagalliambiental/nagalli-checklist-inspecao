export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'inspector';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Company {
  id: string;
  name: string;
  cnpj?: string;
  segment?: string;
}

export interface Site {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

export interface TemplateAreaGroup {
  id: string;
  name: string;
  position: number;
  items: TemplateItem[];
}

export interface TemplateItem {
  id: string;
  text: string;
  libraryItemId?: string;
  position: number;
}

export interface TemplateArea {
  id: string;
  name: string;
  position: number;
  itemCount?: number;
  groups: TemplateAreaGroup[];
}

export interface Template {
  id: string;
  companyId: string;
  name: string;
  version: number;
  description?: string;
  areas: TemplateArea[];
}

export type ItemStatus = 'C' | 'NC' | 'NA' | 'pending';

export type ActionType = 'NC' | 'NA';
export type ActionStatus = 'a_iniciar' | 'em_andamento' | 'concluido' | 'cancelado';

export interface ActionItem {
  id: string;
  type: ActionType;
  inspectionId: string;
  itemId: string;
  companyName: string;
  areaName: string;
  itemLabel: string;
  description: string;
  actionWhat: string;
  actionHow: string;
  responsible: string;
  dueDate: string;
  priority: string;
  investmentMin?: number;
  investmentMax?: number;
  reassessDate: string;
  status: ActionStatus;
  completedDate: string;
  closingNote: string;
  closingPhoto: string;
  createdAt: string;
  updatedAt: string;
  inspectionDate?: string;
  inspectionStatus?: 'draft' | 'completed';
}

export interface InspectionPhoto {
  uri: string;
  lat?: number;
  lng?: number;
  takenAt?: string;
  /** Chave do arquivo no storage (R2), preenchida após o upload. */
  remoteKey?: string;
}

export type InspectionPhotoRef = InspectionPhoto | string;

export interface InspectionItem {
  id: string;
  inspectionId: string;
  templateItemId: string;
  label: string;
  status: ItemStatus;
  notes?: string;
  photos?: InspectionPhotoRef[];
  reassessDate?: string;
  areaId?: string;
  areaName?: string;
  groupName?: string;
}

export type InspectionStatus = 'draft' | 'completed';

export interface InspectionArea {
  id: string;
  name: string;
  position?: number;
}

export interface Inspection {
  id: string;
  companyId: string;
  companyName?: string;
  templateId: string;
  siteId?: string;
  address?: string;
  empreendimentoId?: string;
  empreendimentoName?: string;
  areaId: string;
  areaName: string;
  inspectorName: string;
  date?: string;
  status: InspectionStatus;
  notes?: string;
  items: InspectionItem[];
  areas?: InspectionArea[];
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaStats {
  name: string;
  C: number;
  NC: number;
  NA: number;
  total: number;
}

/** Cadastro de empreendimento: o local inspecionado, recorrente entre vistorias. */
export interface Empreendimento {
  id: string;
  name: string;
  contratante: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmpreendimentoStats {
  id: string;
  name: string;
  contratante: string;
  inspections: number;
  lastInspectionDate?: string;
  C: number;
  NC: number;
  NA: number;
  total: number;
  /** Percentual de conformidade da vistoria mais recente. */
  currentPct: number;
  /** Percentual da vistoria imediatamente anterior, quando existe. */
  previousPct?: number;
  /** Variação em pontos percentuais contra a vistoria anterior. */
  deltaPct?: number;
  byArea: AreaStats[];
}

export interface CompanyStats {
  companyId: string;
  byArea: AreaStats[];
  totals: { C: number; NC: number; NA: number; total: number };
}