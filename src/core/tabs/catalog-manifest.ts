// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Validador puro de manifiestos `CatalogManifestV1` (Spec 011).
 * Aplica saneamiento estricto contra HTML/scripts en metadatos y lista blanca de URLs:
 * únicamente `https://` o rutas relativas seguras sin traversal (`..`), `http://`,
 * `javascript:`, `data:` ni esquemas peligrosos.
 */

import type { DifficultyLevel, TrackFamily } from './model';

export const CATALOG_SCHEMA_VERSION = '1.0' as const;

export type CatalogScoreFormat =
  | 'gp'
  | 'gp3'
  | 'gp4'
  | 'gp5'
  | 'gpx'
  | 'tg'
  | 'musicxml'
  | 'xml'
  | 'mxl'
  | 'mid'
  | 'midi'
  | 'alphatex'
  | 'cho';

const ALLOWED_SCORE_FORMATS = new Set<string>([
  'gp',
  'gp3',
  'gp4',
  'gp5',
  'gpx',
  'tg',
  'musicxml',
  'xml',
  'mxl',
  'mid',
  'midi',
  'alphatex',
  'cho',
]);

const ALLOWED_FAMILIES = new Set<string>(['guitar', 'bass', 'drums', 'keyboard', 'other']);
const ALLOWED_DIFFICULTIES = new Set<string>(['beginner', 'intermediate', 'advanced']);

export interface CatalogMeta {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maintainer: string;
  readonly homepage: string;
  readonly license: string;
  readonly updatedAt: string;
  readonly baseUrl: string;
}

export interface CatalogSongTrack {
  readonly index: number;
  readonly name: string;
  readonly instrumentFamily: TrackFamily;
  readonly tuningName: string;
  readonly tuningNotes: readonly string[];
  readonly capo: number;
}

export interface CatalogSongEntry {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly bpm: number;
  readonly timeSignature: string;
  readonly difficulty?: DifficultyLevel;
  readonly tags: readonly string[];
  readonly license: string;
  readonly scoreUrl: string;
  readonly scoreFormat: CatalogScoreFormat;
  readonly chordsUrl?: string;
  readonly syncUrl?: string;
  readonly updatedAt: string;
  readonly tracks: readonly CatalogSongTrack[];
}

export interface CatalogManifestV1 {
  readonly schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  readonly catalog: CatalogMeta;
  readonly songs: readonly CatalogSongEntry[];
}

export type CatalogValidationResult =
  | { readonly valid: true; readonly manifest: CatalogManifestV1 }
  | { readonly valid: false; readonly errors: readonly string[] };

const UNSAFE_TEXT_RE = /<[^>]*>|<\s*\/?\s*script|javascript:|data:text\/html|on\w+\s*=/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSafeString(
  raw: unknown,
  field: string,
  errors: string[],
  required: boolean
): string {
  if (typeof raw !== 'string') {
    if (required) errors.push(`${field}: se esperaba una cadena de texto`);
    return '';
  }
  const trimmed = raw.trim();
  if (required && trimmed.length === 0) {
    errors.push(`${field}: campo obligatorio vacío`);
  }
  if (UNSAFE_TEXT_RE.test(trimmed)) {
    errors.push(`${field}: contiene marcado HTML o esquema inseguro no permitido`);
  }
  return trimmed;
}

function hasPathTraversal(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized) && !/^https:/i.test(normalized)) {
    return true;
  }
  const segments = normalized.split('/');
  return segments.some((seg) => seg === '..' || decodeSegmentSafe(seg) === '..');
}

function decodeSegmentSafe(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return '..';
  }
}

/**
 * Valida y resuelve una URL segura (`https://` o ruta relativa sin traversal dentro de `baseUrl`).
 * En paquetes `.zip` locales (`allowRelativeZip = true`), las rutas relativas quedan normalizadas
 * dentro del archivo comprimido.
 */
export function resolveSafeCatalogUrl(
  rawUrl: string,
  baseUrl: string,
  allowRelativeZip = false
): { ok: true; resolved: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'URL vacía' };
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return { ok: false, error: 'Caracteres de control no permitidos en URL' };
  }
  if (hasPathTraversal(trimmed)) {
    return { ok: false, error: `Ruta o esquema inseguro rechazado: ${trimmed}` };
  }

  // URL absoluta explícita
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') {
        return { ok: false, error: `Solo se permite protocolo https:// (recibido ${parsed.protocol})` };
      }
      return { ok: true, resolved: parsed.href };
    } catch {
      return { ok: false, error: `URL inválida: ${trimmed}` };
    }
  }

  // Ruta relativa dentro de catálogo ZIP local sin base HTTPS remota
  if (allowRelativeZip && !baseUrl) {
    const clean = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
    if (!clean || hasPathTraversal(clean)) {
      return { ok: false, error: `Ruta relativa inválida en paquete: ${trimmed}` };
    }
    return { ok: true, resolved: clean };
  }

  // Ruta relativa contra `baseUrl` HTTPS
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:') {
      return { ok: false, error: 'baseUrl debe usar protocolo https://' };
    }
    const baseNormalized = base.href.endsWith('/') ? base.href : `${base.href}/`;
    const resolved = new URL(trimmed.replace(/^\//, ''), baseNormalized);
    if (resolved.protocol !== 'https:' || resolved.origin !== new URL(baseNormalized).origin) {
      return { ok: false, error: `Ruta escapa del origen de baseUrl: ${trimmed}` };
    }
    return { ok: true, resolved: resolved.href };
  } catch {
    return { ok: false, error: `No se pudo resolver ruta relativa contra baseUrl: ${trimmed}` };
  }
}

export function isValidHttpsUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface ValidateManifestOptions {
  /** Permite URLs relativas puras cuando proviene de un archivo `.zip` local sin origen HTTP. */
  readonly allowRelativeZip?: boolean;
}

export function validateCatalogManifest(
  raw: unknown,
  options: ValidateManifestOptions = {}
): CatalogValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, errors: ['El manifiesto debe ser un objeto JSON'] };
  }

  if (raw.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    return {
      valid: false,
      errors: [`schemaVersion no soportado: ${String(raw.schemaVersion ?? 'desconocido')} (se esperaba "1.0")`],
    };
  }

  if (!isRecord(raw.catalog)) {
    errors.push('Falta objeto catalog');
    return { valid: false, errors };
  }

  const catRaw = raw.catalog;
  const allowZip = Boolean(options.allowRelativeZip);

  const catId = readSafeString(catRaw.id, 'catalog.id', errors, true);
  const name = readSafeString(catRaw.name, 'catalog.name', errors, true);
  const description = readSafeString(catRaw.description, 'catalog.description', errors, false);
  const maintainer = readSafeString(catRaw.maintainer, 'catalog.maintainer', errors, true);
  const license = readSafeString(catRaw.license, 'catalog.license', errors, true);
  const updatedAt = readSafeString(catRaw.updatedAt, 'catalog.updatedAt', errors, false);
  const homepage = readSafeString(catRaw.homepage, 'catalog.homepage', errors, false);
  if (homepage && !isValidHttpsUrl(homepage)) {
    errors.push('catalog.homepage: debe usar protocolo https://');
  }

  const baseUrlRaw = readSafeString(catRaw.baseUrl, 'catalog.baseUrl', errors, !allowZip);
  if (baseUrlRaw && !isValidHttpsUrl(baseUrlRaw)) {
    errors.push('catalog.baseUrl: debe usar protocolo https://');
  }

  if (!Array.isArray(raw.songs)) {
    errors.push('songs: debe ser un arreglo de canciones');
    return { valid: false, errors };
  }

  const songs: CatalogSongEntry[] = [];
  const seenSongIds = new Set<string>();

  raw.songs.forEach((item, idx) => {
    const prefix = `songs[${idx}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix}: cada entrada debe ser un objeto`);
      return;
    }

    const id = readSafeString(item.id, `${prefix}.id`, errors, true);
    if (id && seenSongIds.has(id)) {
      errors.push(`${prefix}.id: identificador duplicado "${id}"`);
    }
    seenSongIds.add(id);

    const title = readSafeString(item.title, `${prefix}.title`, errors, true);
    const artist = readSafeString(item.artist, `${prefix}.artist`, errors, false);
    const songLicense = readSafeString(item.license, `${prefix}.license`, errors, false) || license;
    const timeSignature =
      readSafeString(item.timeSignature, `${prefix}.timeSignature`, errors, false) || '4/4';
    const songUpdatedAt =
      readSafeString(item.updatedAt, `${prefix}.updatedAt`, errors, false) || updatedAt;

    const bpm = typeof item.bpm === 'number' && Number.isFinite(item.bpm) && item.bpm > 0 && item.bpm <= 400
      ? Math.round(item.bpm)
      : 100;

    let difficulty: DifficultyLevel | undefined;
    if (item.difficulty !== undefined) {
      const diffStr = readSafeString(item.difficulty, `${prefix}.difficulty`, errors, false);
      if (diffStr && ALLOWED_DIFFICULTIES.has(diffStr)) {
        difficulty = diffStr as DifficultyLevel;
      } else if (diffStr) {
        errors.push(`${prefix}.difficulty: valor inválido "${diffStr}"`);
      }
    }

    const tags: string[] = [];
    if (Array.isArray(item.tags)) {
      item.tags.forEach((tag, ti) => {
        const clean = readSafeString(tag, `${prefix}.tags[${ti}]`, errors, false);
        if (clean) tags.push(clean);
      });
    }

    const scoreFormatRaw = readSafeString(item.scoreFormat, `${prefix}.scoreFormat`, errors, true).toLowerCase();
    if (scoreFormatRaw && !ALLOWED_SCORE_FORMATS.has(scoreFormatRaw)) {
      errors.push(`${prefix}.scoreFormat: formato no soportado "${scoreFormatRaw}"`);
    }

    const rawScoreUrl = readSafeString(item.scoreUrl, `${prefix}.scoreUrl`, errors, true);
    const scoreUrlRes = rawScoreUrl
      ? resolveSafeCatalogUrl(rawScoreUrl, baseUrlRaw, allowZip)
      : { ok: false as const, error: 'URL vacía' };
    if (!scoreUrlRes.ok) {
      errors.push(`${prefix}.scoreUrl: ${scoreUrlRes.error}`);
    }

    let chordsUrl: string | undefined;
    if (typeof item.chordsUrl === 'string' && item.chordsUrl.trim()) {
      const rawChords = readSafeString(item.chordsUrl, `${prefix}.chordsUrl`, errors, false);
      const r = resolveSafeCatalogUrl(rawChords, baseUrlRaw, allowZip);
      if (!r.ok) errors.push(`${prefix}.chordsUrl: ${r.error}`);
      else chordsUrl = r.resolved;
    }

    let syncUrl: string | undefined;
    if (typeof item.syncUrl === 'string' && item.syncUrl.trim()) {
      const rawSync = readSafeString(item.syncUrl, `${prefix}.syncUrl`, errors, false);
      const r = resolveSafeCatalogUrl(rawSync, baseUrlRaw, allowZip);
      if (!r.ok) errors.push(`${prefix}.syncUrl: ${r.error}`);
      else syncUrl = r.resolved;
    }

    const tracks: CatalogSongTrack[] = [];
    if (Array.isArray(item.tracks)) {
      item.tracks.forEach((t, ti) => {
        if (!isRecord(t)) {
          errors.push(`${prefix}.tracks[${ti}]: objeto inválido`);
          return;
        }
        const tName = readSafeString(t.name, `${prefix}.tracks[${ti}].name`, errors, true);
        const famRaw = readSafeString(
          t.instrumentFamily,
          `${prefix}.tracks[${ti}].instrumentFamily`,
          errors,
          true
        );
        const instrumentFamily: TrackFamily = ALLOWED_FAMILIES.has(famRaw)
          ? (famRaw as TrackFamily)
          : 'other';
        const tuningName = readSafeString(
          t.tuningName,
          `${prefix}.tracks[${ti}].tuningName`,
          errors,
          false
        );
        const tuningNotes: string[] = [];
        if (Array.isArray(t.tuningNotes)) {
          t.tuningNotes.forEach((n, ni) => {
            const s = readSafeString(n, `${prefix}.tracks[${ti}].tuningNotes[${ni}]`, errors, false);
            if (s) tuningNotes.push(s);
          });
        }
        const capo =
          typeof t.capo === 'number' && Number.isFinite(t.capo)
            ? Math.max(0, Math.min(12, Math.trunc(t.capo)))
            : 0;
        tracks.push({
          index: typeof t.index === 'number' && t.index >= 0 ? Math.trunc(t.index) : ti,
          name: tName || `Pista ${ti + 1}`,
          instrumentFamily,
          tuningName: tuningName || 'Estándar',
          tuningNotes,
          capo,
        });
      });
    }

    songs.push({
      id,
      title,
      artist,
      bpm,
      timeSignature,
      ...(difficulty ? { difficulty } : {}),
      tags,
      license: songLicense,
      scoreUrl: scoreUrlRes.ok ? scoreUrlRes.resolved : rawScoreUrl,
      scoreFormat: (scoreFormatRaw as CatalogScoreFormat) || 'gp',
      ...(chordsUrl ? { chordsUrl } : {}),
      ...(syncUrl ? { syncUrl } : {}),
      updatedAt: songUpdatedAt,
      tracks,
    });
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    manifest: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      catalog: {
        id: catId,
        name,
        description,
        maintainer,
        homepage,
        license,
        updatedAt,
        baseUrl: baseUrlRaw,
      },
      songs,
    },
  };
}
