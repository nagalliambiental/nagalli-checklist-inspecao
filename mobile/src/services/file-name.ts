/**
 * Human-readable file naming for generated documents and photos.
 *
 * Exports must be recognisable when they land in the user's downloads folder,
 * so names avoid internal identifiers, random suffixes and raw epoch values.
 * Accents are preserved because the deliverable names are written in
 * Portuguese; only characters that are unsafe in file paths are replaced.
 */

const UNSAFE_PATH_CHARS = /[\\/:*?"<>|]/g;

/**
 * Fixed suffix used by every deliverable: `<Empreendimento>_Inspeção`.
 * Keeping it in one place stops the exports from drifting apart.
 */
export const INSPECTION_SUFFIX = 'Inspeção';

/**
 * Normalises a value for use as one `_`-separated part of a file name.
 * Keeps letters and digits from any script, collapsing whitespace and unsafe
 * characters into single underscores.
 */
export function sanitizePart(value: string | null | undefined, fallback = ''): string {
  if (!value) return fallback;
  const clean = value
    .replace(UNSAFE_PATH_CHARS, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  return clean || fallback;
}

/** Formats an ISO `YYYY-MM-DD` date (or a Date) as `DD-MM-AAAA`. */
export function formatDateBr(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${value.getFullYear()}`;
  }
  const iso = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

/** Formats a Date as `HH-MM-SS`, used to keep photo names sortable. */
export function formatTimeBr(value: Date): string {
  const hh = String(value.getHours()).padStart(2, '0');
  const mm = String(value.getMinutes()).padStart(2, '0');
  const ss = String(value.getSeconds()).padStart(2, '0');
  return `${hh}-${mm}-${ss}`;
}

/**
 * Name shown on deliverables. The registered enterprise wins over the legacy
 * free-text `companyName` so exports follow the cadastro, while inspections
 * created before the enterprise existed keep their original name.
 */
export function resolveEmpreendimentoName(inspection: {
  empreendimentoName?: string;
  companyName?: string;
}): string {
  return inspection.empreendimentoName?.trim() || inspection.companyName?.trim() || '';
}

/**
 * Joins the non-empty parts with `_`, so a missing value never leaves a
 * trailing separator behind.
 */
export function buildFileName(parts: Array<string | undefined>, extension: string): string {
  const cleaned = parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0);
  const base = cleaned.join('_').replace(/_{2,}/g, '_');
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  return `${base}${safeExt}`;
}
