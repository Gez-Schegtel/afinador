// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Constructor y lector de paquetes de catálogos portables `.zip` (Spec 011).
 * Genera `catalog.json` (`CatalogManifestV1`) + partituras exportadas con rutas relativas
 * limpias listas para publicar en hosting estático o importar 100% offline.
 */

import * as alphaTab from '@coderline/alphatab/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { formatPitchName } from '../music/spelling';
import { documentToAlphaTabScore } from './alphatab-bridge';
import {
  CATALOG_SCHEMA_VERSION,
  validateCatalogManifest,
  type CatalogManifestV1,
  type CatalogMeta,
  type CatalogSongEntry,
} from './catalog-manifest';
import type { DifficultyLevel, ScoreDocument } from './model';

export interface CatalogExportItem {
  readonly document: ScoreDocument;
  readonly difficulty?: DifficultyLevel;
  readonly chordProText?: string;
}

export interface BuildCatalogPackageOptions {
  readonly catalog: Omit<CatalogMeta, 'updatedAt'> & { readonly updatedAt?: string };
  readonly items: readonly CatalogExportItem[];
  readonly preferFormat?: 'gp' | 'alphatex';
}

export interface ParsedCatalogPackage {
  readonly manifest: CatalogManifestV1;
  readonly scoreBytesBySongId: ReadonlyMap<string, Uint8Array>;
  readonly chordProBySongId: ReadonlyMap<string, string>;
}

function safeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'song';
}

export function buildCatalogPackageZip(options: BuildCatalogPackageOptions): {
  zipBytes: Uint8Array;
  manifest: CatalogManifestV1;
} {
  const nowIso = options.catalog.updatedAt ?? new Date().toISOString();
  const archive: Record<string, Uint8Array> = {};
  const songs: CatalogSongEntry[] = [];
  const usedIds = new Set<string>();
  const preferAlphaTex = options.preferFormat === 'alphatex';

  const settings = new alphaTab.Settings();

  options.items.forEach(({ document: doc, difficulty, chordProText }, idx) => {
    let songId = safeSlug(doc.id || doc.title || `song-${idx + 1}`);
    if (usedIds.has(songId)) songId = `${songId}-${idx + 1}`;
    usedIds.add(songId);

    const ext = preferAlphaTex ? 'alphatex' : 'gp';
    const relScorePath = `scores/${songId}.${ext}`;
    const abScore = documentToAlphaTabScore(doc);
    const bytes = preferAlphaTex
      ? new alphaTab.exporter.AlphaTexExporter().export(abScore, settings)
      : new alphaTab.exporter.Gp7Exporter().export(abScore, settings);
    archive[relScorePath] = bytes;

    let chordsUrl: string | undefined;
    if (chordProText !== undefined && chordProText.trim().length > 0) {
      const relChordsPath = `chords/${songId}.cho`;
      archive[relChordsPath] = strToU8(chordProText);
      chordsUrl = relChordsPath;
    }

    const firstMb = doc.masterBars[0];
    const bpm = firstMb?.tempoChanges[0]?.bpm ?? 100;
    const timeSig = firstMb
      ? `${firstMb.timeSignature.numerator}/${firstMb.timeSignature.denominator}`
      : '4/4';

    songs.push({
      id: songId,
      title: doc.title || `Pieza ${idx + 1}`,
      artist: doc.artist || 'Anónimo',
      bpm,
      timeSignature: timeSig,
      ...(difficulty ? { difficulty } : {}),
      tags: [...doc.tags],
      license: doc.license || options.catalog.license,
      scoreUrl: relScorePath,
      scoreFormat: ext,
      ...(chordsUrl ? { chordsUrl } : {}),
      updatedAt: nowIso,
      tracks: doc.tracks.map((t, ti) => ({
        index: ti,
        name: t.name,
        instrumentFamily: t.family,
        tuningName:
          t.isPercussion
            ? 'Batería'
            : t.tuning.length > 0
              ? t.tuning.map(formatPitchName).join('')
              : 'Estándar',
        tuningNotes: t.tuning.map((n) => `${formatPitchName(n)}${n.octave}`),
        capo: t.capo,
      })),
    });
  });

  const manifest: CatalogManifestV1 = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    catalog: {
      ...options.catalog,
      updatedAt: nowIso,
    },
    songs,
  };

  archive['catalog.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return { zipBytes: zipSync(archive), manifest };
}

function findZipEntryNormalized(
  files: Record<string, Uint8Array>,
  relOrResolved: string
): Uint8Array | undefined {
  const cleanTarget = relOrResolved.replace(/^\.\//, '').replace(/^\/+/, '');
  if (files[cleanTarget]) return files[cleanTarget];
  // Si el manifest tenía baseUrl HTTPS, extraer el sufijo de ruta relativa
  try {
    if (relOrResolved.startsWith('https://')) {
      const pathOnly = new URL(relOrResolved).pathname.replace(/^\/+/, '');
      for (const [k, bytes] of Object.entries(files)) {
        const cleanK = k.replace(/^\.\//, '').replace(/^\/+/, '');
        if (cleanK === pathOnly || pathOnly.endsWith(`/${cleanK}`) || pathOnly === cleanK) {
          return bytes;
        }
      }
    }
  } catch {
    // Ignorar error de URL y seguir por nombre de archivo
  }
  const suffix = cleanTarget.split('/').slice(-2).join('/');
  for (const [k, bytes] of Object.entries(files)) {
    if (k === suffix || k.endsWith(`/${cleanTarget}`) || k.endsWith(cleanTarget)) {
      return bytes;
    }
  }
  return undefined;
}

export function parseCatalogPackageZip(zipBytes: Uint8Array): ParsedCatalogPackage {
  const files = unzipSync(zipBytes);
  const catalogEntryKey = Object.keys(files).find(
    (k) => k === 'catalog.json' || k.endsWith('/catalog.json')
  );
  if (!catalogEntryKey || !files[catalogEntryKey]) {
    throw new Error('El paquete .zip no contiene catalog.json en su raíz');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(strFromU8(files[catalogEntryKey]!));
  } catch {
    throw new Error('catalog.json no es un JSON válido');
  }

  const validation = validateCatalogManifest(parsedJson, { allowRelativeZip: true });
  if (!validation.valid) {
    throw new Error(`Manifiesto inválido: ${validation.errors.join('; ')}`);
  }

  const scoreBytesBySongId = new Map<string, Uint8Array>();
  const chordProBySongId = new Map<string, string>();

  for (const song of validation.manifest.songs) {
    const scoreBytes = findZipEntryNormalized(files, song.scoreUrl);
    if (!scoreBytes) {
      throw new Error(`Falta archivo de partitura en el paquete .zip para "${song.title}": ${song.scoreUrl}`);
    }
    scoreBytesBySongId.set(song.id, scoreBytes);

    if (song.chordsUrl) {
      const chordsBytes = findZipEntryNormalized(files, song.chordsUrl);
      if (chordsBytes) {
        chordProBySongId.set(song.id, strFromU8(chordsBytes));
      }
    }
  }

  return {
    manifest: validation.manifest,
    scoreBytesBySongId,
    chordProBySongId,
  };
}
