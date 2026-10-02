import * as ImageManipulator from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { Album, Asset } from 'expo-media-library';
import { formatDateBr, formatTimeBr } from './file-name';
import type { InspectionPhoto } from '../types';

const GALLERY_ALBUM = 'Nagalli Ambiental';

function inspectionPhotosDir(inspectionId: string): Directory {
  return new Directory(new Directory(Paths.document, 'photos'), inspectionId);
}

export async function ensureInspectionPhotoDir(inspectionId: string): Promise<Directory> {
  const dir = inspectionPhotosDir(inspectionId);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export interface NormalizedPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function normalizePhoto(rawUri: string, maxDim = 1280): Promise<NormalizedPhoto> {
  const resized = await ImageManipulator.manipulateAsync(
    rawUri,
    [{ resize: { width: maxDim } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: resized.uri, width: resized.width || 0, height: resized.height || 0 };
}

function fmtCoord(n?: number): string {
  return Number.isFinite(n) && n !== 0 ? `S${Math.abs(n as number).toFixed(5)}` : '';
}

export function buildGeoFilename(lat?: number, lng?: number, takenAt = Date.now()): string {
  const latPart = fmtCoord(lat);
  const lonPart = fmtCoord(lng);
  const geo = latPart && lonPart ? `_${latPart}_${lonPart}` : '';
  return `foto-${takenAt}-${Math.random().toString(36).slice(2, 7)}${geo}.jpg`;
}

export async function persistPhoto(
  sourceUri: string,
  inspectionId: string,
  meta: { lat?: number; lng?: number },
): Promise<InspectionPhoto> {
  const dir = await ensureInspectionPhotoDir(inspectionId);
  const filename = buildGeoFilename(meta.lat, meta.lng);
  const target = new File(dir, filename);
  const source = new File(sourceUri);
  if (source.uri !== target.uri) {
    if (source.exists) {
      await source.move(target);
    } else if (!target.exists) {
      throw new Error('Arquivo de origem da foto não encontrado.');
    }
  }
  if (!target.exists) {
    throw new Error('Não foi possível gravar a foto no aplicativo.');
  }
  return { uri: target.uri, lat: meta.lat, lng: meta.lng, takenAt: new Date().toISOString() };
}

export interface GallerySaveResult {
  saved: boolean;
  error?: string;
  warning?: string;
}

function galleryStagingDirectory(): Directory {
  return new Directory(Paths.cache, 'gallery-export');
}

/**
 * Builds a name a human can read in the gallery, e.g.
 * `Nagalli_Ambiental_01-10-2026_14-32-05.jpg`. The internal file keeps the GPS
 * coordinates, so nothing forensic is lost by renaming the published copy.
 */
function uniqueGalleryFile(dir: Directory, takenAt: Date): File {
  const base = `Nagalli_Ambiental_${formatDateBr(takenAt)}_${formatTimeBr(takenAt)}`;
  for (let i = 1; i < 500; i += 1) {
    const candidate = new File(dir, i === 1 ? `${base}.jpg` : `${base}_${i}.jpg`);
    if (!candidate.exists) return candidate;
  }
  return new File(dir, `${base}_${Date.now()}.jpg`);
}

/**
 * Copies a photo into the device gallery under the "Nagalli Ambiental" album.
 *
 * Saving media owned by the app needs no runtime permission on Android, so no
 * permission prompt is requested here. The album is a nice-to-have: if any
 * album step fails, the photo is still published to the default image
 * collection so it is never lost from the gallery.
 */
export async function savePhotoToGallery(uri: string, takenAtIso?: string): Promise<GallerySaveResult> {
  const source = new File(uri);
  if (!source.exists) {
    return { saved: false, error: 'arquivo de origem não encontrado' };
  }

  let publishUri = uri;
  let staging: File | null = null;
  try {
    const parsed = takenAtIso ? new Date(takenAtIso) : new Date();
    const takenAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const dir = galleryStagingDirectory();
    if (!dir.exists) dir.create({ intermediates: true });
    staging = uniqueGalleryFile(dir, takenAt);
    source.copy(staging);
    publishUri = staging.uri;
  } catch (err) {
    console.warn('Não foi possível preparar o nome da foto para a galeria:', err);
    staging = null;
  }

  const cleanup = () => {
    if (staging?.exists) {
      try {
        staging.delete();
      } catch {
        // arquivo temporário pode ser removido pelo sistema depois
      }
    }
  };

  try {
    const album = await Album.get(GALLERY_ALBUM);
    if (album) {
      await Asset.create(publishUri, album);
    } else {
      await Album.create(GALLERY_ALBUM, [publishUri], false);
    }
    cleanup();
    return { saved: true };
  } catch (albumError) {
    console.warn('Álbum da galeria indisponível, salvando sem álbum:', albumError);
    try {
      await Asset.create(publishUri);
      cleanup();
      return {
        saved: true,
        warning: 'Foto salva na galeria, mas fora do álbum "Nagalli Ambiental".',
      };
    } catch (fallbackError) {
      cleanup();
      const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.warn('Não foi possível salvar a foto na galeria:', fallbackError);
      return { saved: false, error: detail };
    }
  }
}

export async function photoToBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

export async function listInspectionPhotos(inspectionId: string): Promise<string[]> {
  const dir = inspectionPhotosDir(inspectionId);
  if (!dir.exists) return [];
  const files = dir.list()?.filter((f) => f instanceof File) ?? [];
  return files.map((f) => (f as File).uri);
}

export async function deleteInspectionPhotos(inspectionId: string): Promise<void> {
  const dir = inspectionPhotosDir(inspectionId);
  if (!dir.exists) return;
  try {
    dir.delete();
  } catch {
    // pasta de fotos pode estar em uso; ignorar falha de remoção
  }
}