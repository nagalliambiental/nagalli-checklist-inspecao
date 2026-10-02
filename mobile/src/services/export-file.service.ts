import { EncodingType, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

export interface ExportedFile {
  uri: string;
  size: number;
}

function requireSize(file: File): number {
  const size = file.info().size ?? 0;
  if (size === 0) {
    throw new Error('arquivo gravado com tamanho zero');
  }
  return size;
}

/**
 * Writes a generated export (DOCX/XLSX/ZIP) to the document directory.
 *
 * The next-gen `File.write()` opens the file with READ+WRITE and therefore
 * rejects a brand-new file when the permission service falls back to
 * `canRead()` on a path it does not recognise as internal. Materialising the
 * file first is the documented pattern and keeps the file readable for the
 * subsequent write. If that still fails we retry through the legacy API,
 * which resolves permissions differently.
 */
export async function writeExportFile(
  fileName: string,
  data: string | Uint8Array,
): Promise<ExportedFile> {
  const file = new File(Paths.document, fileName);
  const failures: string[] = [];

  try {
    file.create({ overwrite: true, intermediates: true });
    if (typeof data === 'string') {
      file.write(data, { encoding: EncodingType.Base64 });
    } else {
      file.write(data);
    }
    return { uri: file.uri, size: requireSize(file) };
  } catch (err) {
    failures.push(`next-gen: ${describe(err)}`);
  }

  try {
    const base64 = typeof data === 'string' ? data : bytesToBase64(data);
    await LegacyFileSystem.writeAsStringAsync(file.uri, base64, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
    return { uri: file.uri, size: requireSize(file) };
  } catch (err) {
    failures.push(`legacy: ${describe(err)}`);
  }

  throw new Error(`Não foi possível gravar "${fileName}". ${failures.join(' | ')}`);
}
