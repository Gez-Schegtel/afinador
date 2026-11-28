// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Persistencia local de Biblioteca BYOT, Favoritos, Setlists portables (.zip), Bucles A–B,
 * Historial y Respaldo total (Spec 009). Usa IndexedDB en el navegador y acepta un backend
 * en memoria inyectable para pruebas determinísticas en Vitest.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { formatPitchName, type SpelledNote } from '../core/music/spelling';
import { parseScoreBytes } from '../core/tabs/alphatab-bridge';
import type { BeatSyncMap } from '../core/tabs/beat-sync';
import { parseCatalogPackageZip } from '../core/tabs/catalog-export';
import {
  isValidHttpsUrl,
  validateCatalogManifest,
  type CatalogManifestV1,
  type CatalogSongEntry,
} from '../core/tabs/catalog-manifest';
import { getFactoryExamples } from '../core/tabs/factory-examples';
import {
  createEmptyScoreDocument,
  type DifficultyLevel,
  type ScoreDocument,
  type ScoreOriginKind,
  type TrackFamily,
} from '../core/tabs/model';

export type TabsStoreName = 'indices' | 'payloads' | 'meta';

export interface TabsKVBackend {
  get<T>(store: TabsStoreName, key: string): Promise<T | undefined>;
  put<T>(store: TabsStoreName, key: string, value: T): Promise<void>;
  delete(store: TabsStoreName, key: string): Promise<void>;
  getAll<T>(store: TabsStoreName): Promise<T[]>;
}

const DB_NAME = 'endurend_tabs_db';
const DB_VERSION = 1;
const STORES: readonly TabsStoreName[] = ['indices', 'payloads', 'meta'];

export function createMemoryTabsBackend(): TabsKVBackend {
  const stores: Record<TabsStoreName, Map<string, unknown>> = {
    indices: new Map(),
    payloads: new Map(),
    meta: new Map(),
  };
  return {
    async get<T>(store: TabsStoreName, key: string) {
      const val = stores[store].get(key);
      return val === undefined ? undefined : (structuredClone(val) as T);
    },
    async put<T>(store: TabsStoreName, key: string, value: T) {
      stores[store].set(key, structuredClone(value));
    },
    async delete(store: TabsStoreName, key: string) {
      stores[store].delete(key);
    },
    async getAll<T>(store: TabsStoreName) {
      return [...stores[store].values()].map((v) => structuredClone(v) as T);
    },
  };
}

let cachedIdbPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB no disponible en este entorno'));
  }
  if (cachedIdbPromise) return cachedIdbPromise;

  cachedIdbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      cachedIdbPromise = null;
      reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
    };
  });

  return cachedIdbPromise;
}

export function createIndexedDbTabsBackend(): TabsKVBackend {
  return {
    async get<T>(store: TabsStoreName, key: string) {
      const db = await openIdb();
      return new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
    },
    async put<T>(store: TabsStoreName, key: string, value: T) {
      const db = await openIdb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async delete(store: TabsStoreName, key: string) {
      const db = await openIdb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async getAll<T>(store: TabsStoreName) {
      const db = await openIdb();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result as T[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    },
  };
}

export interface TabTrackSummary {
  readonly name: string;
  readonly family: TrackFamily;
  readonly tuningLabel: string;
}

export interface TabIndexEntry {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly difficulty?: DifficultyLevel;
  readonly tags: readonly string[];
  readonly bpm: number;
  readonly timeSignature: string;
  readonly barCount: number;
  readonly tracks: readonly TabTrackSummary[];
  readonly families: readonly TrackFamily[];
  readonly originKind: ScoreOriginKind;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly sha256?: string;
  readonly hasChords: boolean;
  readonly hasSyncAudio: boolean;
  readonly offlineAvailable: boolean;
  readonly favorite: boolean;
  readonly updatedAt: string;
}

export interface TabPayloadRecord {
  readonly id: string;
  readonly document: ScoreDocument;
  readonly chordProText?: string;
}

export interface SavedLoopPreset {
  readonly id: string;
  readonly name: string;
  readonly startBar: number;
  readonly endBar: number;
}

export interface SetlistItem {
  readonly docId: string;
  readonly note: string;
}

export interface SetlistRecord {
  readonly id: string;
  readonly name: string;
  readonly items: readonly SetlistItem[];
  readonly updatedAt: string;
}

export interface RecentPlaybackEntry {
  readonly docId: string;
  readonly title: string;
  readonly artist: string;
  readonly trackIndex: number;
  readonly speedPct: number;
  readonly barIndex: number;
  readonly playedAt: string;
}

export interface StoredSoundFont {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly updatedAt: string;
}

export interface CatalogSourceRecord {
  readonly id: string;
  readonly manifest: CatalogManifestV1;
  readonly sourceUrl?: string;
  readonly kind: 'remote' | 'zip';
  readonly enabled: boolean;
  readonly cachedSongIds: readonly string[];
  readonly lastSyncedAt: string;
}

export function catalogDocId(sourceId: string, songId: string): string {
  return `cat:${sourceId}:${songId}`;
}

function entryFromCatalogSong(
  source: CatalogSourceRecord,
  song: CatalogSongEntry,
  favorites: Set<string>
): TabIndexEntry {
  const docId = catalogDocId(source.id, song.id);
  const families: TrackFamily[] = [];
  for (const t of song.tracks) {
    if (!families.includes(t.instrumentFamily)) families.push(t.instrumentFamily);
  }
  if (families.length === 0) families.push('other');

  return {
    id: docId,
    title: song.title,
    artist: song.artist,
    album: source.manifest.catalog.name,
    ...(song.difficulty ? { difficulty: song.difficulty } : {}),
    tags: [...song.tags],
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    barCount: 0,
    tracks: song.tracks.map((t) => ({
      name: t.name,
      family: t.instrumentFamily,
      tuningLabel: t.tuningName,
    })),
    families,
    originKind: 'catalog',
    sourceId: source.id,
    sourceName: source.manifest.catalog.name,
    hasChords: Boolean(song.chordsUrl),
    hasSyncAudio: Boolean(song.syncUrl),
    offlineAvailable: source.cachedSongIds.includes(song.id),
    favorite: favorites.has(docId),
    updatedAt: song.updatedAt || source.lastSyncedAt,
  };
}

export interface ImportSingleResult {
  readonly status: 'imported' | 'duplicate' | 'error';
  readonly fileName: string;
  readonly entry?: TabIndexEntry;
  readonly existingId?: string;
  readonly document?: ScoreDocument;
  readonly chordProText?: string;
  readonly error?: string;
}

export interface BatchImportSummary {
  readonly imported: readonly TabIndexEntry[];
  readonly duplicates: readonly { fileName: string; existingId: string }[];
  readonly errors: readonly { fileName: string; message: string }[];
}

export interface SetlistPackageManifest {
  readonly packageVersion: 1;
  readonly setlist: SetlistRecord;
  readonly loopsByDoc: Readonly<Record<string, readonly SavedLoopPreset[]>>;
}

export interface FullBackupManifest {
  readonly backupVersion: 1;
  readonly exportedAt: string;
  readonly favorites: readonly string[];
  readonly setlists: readonly SetlistRecord[];
  readonly history: readonly RecentPlaybackEntry[];
  readonly loopsByDoc: Readonly<Record<string, readonly SavedLoopPreset[]>>;
  readonly indices: readonly TabIndexEntry[];
  readonly hasSoundFont: boolean;
  readonly soundFontName?: string;
}

const SUPPORTED_EXT_RE = /\.(gp3|gp4|gp5|gpx|gp|tg|musicxml|xml|mxl|mid|midi|alphatex|atex|cho|chopro)$/i;

function formatTuningSummary(tuning: readonly SpelledNote[]): string {
  if (tuning.length === 0) return 'Estándar';
  return tuning.map((n) => formatPitchName(n)).join(' ');
}

function normalizeDedupeKey(title: string, artist: string): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  return `${norm(artist)}::${norm(title)}`;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i]!;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= bytes[i]! ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function indexEntryFromDocument(
  doc: ScoreDocument,
  extra: Partial<Pick<TabIndexEntry, 'sha256' | 'favorite' | 'hasChords' | 'hasSyncAudio' | 'offlineAvailable'>> = {}
): TabIndexEntry {
  const mb0 = doc.masterBars[0];
  const bpm = mb0?.tempoChanges[0]?.bpm ?? 100;
  const timeSignature = mb0
    ? `${mb0.timeSignature.numerator}/${mb0.timeSignature.denominator}`
    : '4/4';
  const families = [...new Set(doc.tracks.map((t) => t.family))];
  const docHasChords = doc.tracks.some((tr) =>
    tr.bars.some((b) => b.voices.some((v) => v.beats.some((bt) => Boolean(bt.chordSymbol))))
  );

  return {
    id: doc.id,
    title: doc.title,
    artist: doc.artist,
    album: doc.album,
    ...(doc.difficulty ? { difficulty: doc.difficulty } : {}),
    tags: [...doc.tags],
    bpm,
    timeSignature,
    barCount: doc.masterBars.length,
    tracks: doc.tracks.map((t) => ({
      name: t.name,
      family: t.family,
      tuningLabel: formatTuningSummary(t.tuning),
    })),
    families,
    originKind: doc.origin.kind,
    ...(doc.origin.sourceId ? { sourceId: doc.origin.sourceId } : {}),
    ...(doc.origin.sourceName ? { sourceName: doc.origin.sourceName } : {}),
    ...(extra.sha256 ? { sha256: extra.sha256 } : {}),
    hasChords: extra.hasChords ?? docHasChords,
    hasSyncAudio: extra.hasSyncAudio ?? false,
    offlineAvailable: extra.offlineAvailable ?? true,
    favorite: extra.favorite ?? false,
    updatedAt: new Date().toISOString(),
  };
}

function parseChordProStub(raw: string, fileName: string): {
  document: ScoreDocument;
  chordProText: string;
} {
  const titleMatch = /\{(?:title|t):([^}]+)\}/i.exec(raw);
  const artistMatch = /\{(?:artist|subtitle|st):([^}]+)\}/i.exec(raw);
  const tempoMatch = /\{tempo:\s*(\d+)/i.exec(raw);
  const baseTitle = fileName.replace(/\.[^.]+$/, '');
  const doc = createEmptyScoreDocument({
    id: `cho-${Math.random().toString(36).slice(2, 10)}`,
    title: titleMatch?.[1]?.trim() || baseTitle,
    artist: artistMatch?.[1]?.trim() || '',
    bpm: tempoMatch ? Number.parseInt(tempoMatch[1]!, 10) || 100 : 100,
    origin: { kind: 'byot', importedAt: new Date().toISOString() },
  });
  return { document: doc, chordProText: raw };
}

const META_FAVORITES = 'favorites';
const META_SETLISTS = 'setlists';
const META_HISTORY = 'history';
const META_LOOPS = 'loops';
const META_SOUNDFONT = 'soundfont';
const META_CATALOG_SOURCES = 'catalog_sources';
const META_REVISIONS = 'revisions';
const META_BEAT_SYNC = 'beat_sync';

export interface ScoreRevisionRecord {
  readonly id: string;
  readonly docId: string;
  readonly label: string;
  readonly createdAt: string;
  readonly document: ScoreDocument;
}

export class TabsLibraryService {
  private readonly backend: TabsKVBackend;

  constructor(backend: TabsKVBackend = createIndexedDbTabsBackend()) {
    this.backend = backend;
  }

  private async getFavoriteSet(): Promise<Set<string>> {
    const raw = (await this.backend.get<string[]>('meta', META_FAVORITES)) ?? [];
    return new Set(raw);
  }

  private async saveFavoriteSet(set: Set<string>): Promise<void> {
    await this.backend.put('meta', META_FAVORITES, [...set]);
  }

  /** Lista todos los índices (16 ejemplos curados de fábrica, piezas locales y catálogos activos). */
  public async listLibraryEntries(): Promise<TabIndexEntry[]> {
    const [stored, favorites, catalogSources] = await Promise.all([
      this.backend.getAll<TabIndexEntry>('indices'),
      this.getFavoriteSet(),
      this.listCatalogSources(),
    ]);

    const storedMap = new Map(stored.map((e) => [e.id, e]));
    const factoryEntries = getFactoryExamples()
      .filter((doc) => !storedMap.has(doc.id))
      .map((doc) =>
        indexEntryFromDocument(doc, {
          favorite: favorites.has(doc.id),
          offlineAvailable: true,
        })
      );

    const userEntries = stored.map((e) => ({
      ...e,
      favorite: favorites.has(e.id) || e.favorite,
    }));

    const catalogEntries = catalogSources
      .filter((src) => src.enabled)
      .flatMap((src) =>
        src.manifest.songs.map((song) => entryFromCatalogSong(src, song, favorites))
      );

    return [...userEntries, ...factoryEntries, ...catalogEntries];
  }

  public async getDocument(id: string): Promise<TabPayloadRecord | null> {
    const stored = await this.backend.get<TabPayloadRecord>('payloads', id);
    if (stored) return stored;

    const factory = getFactoryExamples().find((doc) => doc.id === id);
    if (factory) return { id: factory.id, document: factory };

    if (id.startsWith('cat:')) {
      const parts = id.split(':');
      const sourceId = parts[1];
      const songId = parts.slice(2).join(':');
      if (sourceId && songId) {
        return this.downloadCatalogSongOffline(sourceId, songId);
      }
    }
    return null;
  }

  public async saveDocument(
    doc: ScoreDocument,
    extra: { sha256?: string; chordProText?: string; favorite?: boolean } = {}
  ): Promise<TabIndexEntry> {
    const favorites = await this.getFavoriteSet();
    const isFav = extra.favorite ?? favorites.has(doc.id);
    const entry = indexEntryFromDocument(doc, {
      sha256: extra.sha256,
      favorite: isFav,
      hasChords: Boolean(extra.chordProText),
    });
    await Promise.all([
      this.backend.put<TabIndexEntry>('indices', entry.id, entry),
      this.backend.put<TabPayloadRecord>('payloads', entry.id, {
        id: entry.id,
        document: doc,
        ...(extra.chordProText ? { chordProText: extra.chordProText } : {}),
      }),
    ]);
    return entry;
  }

  public async updateEntryMetadata(
    id: string,
    patch: Partial<Pick<TabIndexEntry, 'title' | 'artist' | 'album' | 'difficulty' | 'tags'>>
  ): Promise<TabIndexEntry | null> {
    const existing = await this.backend.get<TabIndexEntry>('indices', id);
    if (!existing) return null;
    const updated: TabIndexEntry = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.backend.put('indices', id, updated);

    const payload = await this.backend.get<TabPayloadRecord>('payloads', id);
    if (payload) {
      await this.backend.put<TabPayloadRecord>('payloads', id, {
        ...payload,
        document: {
          ...payload.document,
          title: updated.title,
          artist: updated.artist,
          album: updated.album,
          ...(updated.difficulty ? { difficulty: updated.difficulty } : {}),
          tags: updated.tags,
        },
      });
    }
    return updated;
  }

  public async deleteEntry(id: string): Promise<void> {
    await Promise.all([
      this.backend.delete('indices', id),
      this.backend.delete('payloads', id),
    ]);
  }

  public async importFileBytes(
    bytes: Uint8Array,
    fileName: string,
    options: { temporary?: boolean } = {}
  ): Promise<ImportSingleResult> {
    try {
      const lower = fileName.toLowerCase();
      let doc: ScoreDocument;
      let chordProText: string | undefined;

      if (lower.endsWith('.cho') || lower.endsWith('.chopro')) {
        const parsed = parseChordProStub(strFromU8(bytes), fileName);
        doc = parsed.document;
        chordProText = parsed.chordProText;
      } else {
        doc = parseScoreBytes(bytes, fileName, {
          kind: 'byot',
          sourceName: 'Importado local',
          importedAt: new Date().toISOString(),
        });
      }

      const sha256 = await computeSha256Hex(bytes);
      const uniqueId = `byot-${sha256.slice(0, 12)}-${Date.now().toString(36)}`;
      const finalDoc: ScoreDocument = { ...doc, id: uniqueId };

      if (options.temporary) {
        const tempEntry = indexEntryFromDocument(finalDoc, {
          sha256,
          hasChords: Boolean(chordProText),
        });
        return {
          status: 'imported',
          fileName,
          entry: tempEntry,
          document: finalDoc,
          chordProText,
        };
      }

      const existing = await this.backend.getAll<TabIndexEntry>('indices');
      const targetKey = normalizeDedupeKey(finalDoc.title, finalDoc.artist);
      const dup = existing.find(
        (e) =>
          (e.sha256 && e.sha256 === sha256) ||
          (finalDoc.artist.trim().length > 0 &&
            normalizeDedupeKey(e.title, e.artist) === targetKey)
      );
      if (dup) {
        return {
          status: 'duplicate',
          fileName,
          existingId: dup.id,
        };
      }

      const saved = await this.saveDocument(finalDoc, { sha256, chordProText });
      return {
        status: 'imported',
        fileName,
        entry: saved,
        document: finalDoc,
        chordProText,
      };
    } catch (err) {
      return {
        status: 'error',
        fileName,
        error: err instanceof Error ? err.message : 'Archivo no reconocido o dañado.',
      };
    }
  }

  public async importBatchOrZip(
    files: readonly { name: string; bytes: Uint8Array }[]
  ): Promise<BatchImportSummary> {
    const imported: TabIndexEntry[] = [];
    const duplicates: { fileName: string; existingId: string }[] = [];
    const errors: { fileName: string; message: string }[] = [];

    const candidates: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const unzipped = unzipSync(file.bytes);
          for (const [entryName, entryBytes] of Object.entries(unzipped)) {
            if (
              entryName.endsWith('/') ||
              entryName.startsWith('__MACOSX/') ||
              entryName.split('/').pop()?.startsWith('.')
            ) {
              continue;
            }
            if (SUPPORTED_EXT_RE.test(entryName)) {
              candidates.push({ name: entryName.split('/').pop() ?? entryName, bytes: entryBytes });
            }
          }
        } catch (err) {
          errors.push({
            fileName: file.name,
            message: err instanceof Error ? err.message : 'ZIP inválido',
          });
        }
      } else {
        candidates.push(file);
      }
    }

    for (const item of candidates) {
      const res = await this.importFileBytes(item.bytes, item.name);
      if (res.status === 'imported' && res.entry) imported.push(res.entry);
      else if (res.status === 'duplicate' && res.existingId) {
        duplicates.push({ fileName: item.name, existingId: res.existingId });
      } else if (res.status === 'error') {
        errors.push({ fileName: item.name, message: res.error ?? 'Error al importar' });
      }
    }

    return { imported, duplicates, errors };
  }

  public async toggleFavorite(docId: string): Promise<boolean> {
    const favorites = await this.getFavoriteSet();
    const next = !favorites.has(docId);
    if (next) favorites.add(docId);
    else favorites.delete(docId);
    await this.saveFavoriteSet(favorites);

    const existing = await this.backend.get<TabIndexEntry>('indices', docId);
    if (existing) {
      await this.backend.put('indices', docId, { ...existing, favorite: next });
    }
    return next;
  }

  public async getLoopsForDoc(docId: string): Promise<SavedLoopPreset[]> {
    const all = (await this.backend.get<Record<string, SavedLoopPreset[]>>('meta', META_LOOPS)) ?? {};
    return all[docId] ?? [];
  }

  public async saveLoopPreset(docId: string, loop: SavedLoopPreset): Promise<SavedLoopPreset[]> {
    const all = (await this.backend.get<Record<string, SavedLoopPreset[]>>('meta', META_LOOPS)) ?? {};
    const list = [...(all[docId] ?? []).filter((l) => l.id !== loop.id), loop];
    all[docId] = list;
    await this.backend.put('meta', META_LOOPS, all);
    return list;
  }

  public async deleteLoopPreset(docId: string, loopId: string): Promise<SavedLoopPreset[]> {
    const all = (await this.backend.get<Record<string, SavedLoopPreset[]>>('meta', META_LOOPS)) ?? {};
    const list = (all[docId] ?? []).filter((l) => l.id !== loopId);
    all[docId] = list;
    await this.backend.put('meta', META_LOOPS, all);
    return list;
  }

  public async recordRecentPlayback(entry: Omit<RecentPlaybackEntry, 'playedAt'>): Promise<RecentPlaybackEntry[]> {
    const current = (await this.backend.get<RecentPlaybackEntry[]>('meta', META_HISTORY)) ?? [];
    const nextEntry: RecentPlaybackEntry = {
      ...entry,
      playedAt: new Date().toISOString(),
    };
    const next = [nextEntry, ...current.filter((h) => h.docId !== entry.docId)].slice(0, 30);
    await this.backend.put('meta', META_HISTORY, next);
    return next;
  }

  public async getHistory(): Promise<RecentPlaybackEntry[]> {
    return (await this.backend.get<RecentPlaybackEntry[]>('meta', META_HISTORY)) ?? [];
  }

  public async listSetlists(): Promise<SetlistRecord[]> {
    return (await this.backend.get<SetlistRecord[]>('meta', META_SETLISTS)) ?? [];
  }

  public async saveSetlist(setlist: SetlistRecord): Promise<SetlistRecord[]> {
    const current = await this.listSetlists();
    const updated: SetlistRecord = { ...setlist, updatedAt: new Date().toISOString() };
    const next = [...current.filter((s) => s.id !== setlist.id), updated];
    await this.backend.put('meta', META_SETLISTS, next);
    return next;
  }

  public async deleteSetlist(id: string): Promise<SetlistRecord[]> {
    const next = (await this.listSetlists()).filter((s) => s.id !== id);
    await this.backend.put('meta', META_SETLISTS, next);
    return next;
  }

  /** Exporta un Paquete Portable de Ensayo `.zip` con setlist, partituras y bucles guardados. */
  public async exportSetlistZip(setlistId: string): Promise<Uint8Array> {
    const setlist = (await this.listSetlists()).find((s) => s.id === setlistId);
    if (!setlist) throw new Error('Setlist no encontrado');

    const files: Record<string, Uint8Array> = {};
    const loopsByDoc: Record<string, SavedLoopPreset[]> = {};

    for (const item of setlist.items) {
      const payload = await this.getDocument(item.docId);
      if (payload) {
        files[`scores/${item.docId}.json`] = strToU8(JSON.stringify(payload));
      }
      const loops = await this.getLoopsForDoc(item.docId);
      if (loops.length > 0) loopsByDoc[item.docId] = loops;
    }

    const manifest: SetlistPackageManifest = {
      packageVersion: 1,
      setlist,
      loopsByDoc,
    };
    files['setlist.json'] = strToU8(JSON.stringify(manifest, null, 2));
    return zipSync(files);
  }

  public async importSetlistZip(zipBytes: Uint8Array): Promise<SetlistRecord> {
    const files = unzipSync(zipBytes);
    const manifestBytes = files['setlist.json'];
    if (!manifestBytes) {
      throw new Error('El paquete de ensayo no contiene setlist.json');
    }
    const manifest = JSON.parse(strFromU8(manifestBytes)) as SetlistPackageManifest;
    if (manifest.packageVersion !== 1 || !manifest.setlist) {
      throw new Error('Versión de paquete de ensayo incompatible');
    }

    for (const item of manifest.setlist.items) {
      const scoreBytes = files[`scores/${item.docId}.json`];
      if (!scoreBytes) continue;
      const payload = JSON.parse(strFromU8(scoreBytes)) as TabPayloadRecord;
      const existing = await this.getDocument(payload.id);
      if (!existing && payload.document.origin.kind !== 'factory') {
        await this.saveDocument(payload.document, { chordProText: payload.chordProText });
      } else if (!existing && payload.document.origin.kind === 'factory') {
        await this.saveDocument(payload.document, { chordProText: payload.chordProText });
      }
    }

    for (const [docId, loops] of Object.entries(manifest.loopsByDoc ?? {})) {
      for (const loop of loops) {
        await this.saveLoopPreset(docId, loop);
      }
    }

    await this.saveSetlist(manifest.setlist);
    return manifest.setlist;
  }

  public async saveUserSoundFont(name: string, bytes: Uint8Array): Promise<void> {
    await this.backend.put<StoredSoundFont>('meta', META_SOUNDFONT, {
      name,
      bytes,
      updatedAt: new Date().toISOString(),
    });
  }

  public async loadUserSoundFont(): Promise<StoredSoundFont | null> {
    return (await this.backend.get<StoredSoundFont>('meta', META_SOUNDFONT)) ?? null;
  }

  public async clearUserSoundFont(): Promise<void> {
    await this.backend.delete('meta', META_SOUNDFONT);
  }

  /** Exporta un Backup Portable completo de toda la biblioteca, favoritos, setlists, historial y bucles. */
  public async exportFullBackupZip(): Promise<Uint8Array> {
    const [indices, favorites, setlists, history, loopsByDoc, soundfont] = await Promise.all([
      this.backend.getAll<TabIndexEntry>('indices'),
      this.getFavoriteSet(),
      this.listSetlists(),
      this.getHistory(),
      this.backend.get<Record<string, SavedLoopPreset[]>>('meta', META_LOOPS),
      this.loadUserSoundFont(),
    ]);

    const files: Record<string, Uint8Array> = {};
    for (const entry of indices) {
      const payload = await this.backend.get<TabPayloadRecord>('payloads', entry.id);
      if (payload) {
        files[`scores/${entry.id}.json`] = strToU8(JSON.stringify(payload));
      }
    }
    if (soundfont) {
      files['soundfont/custom.sf2'] = soundfont.bytes;
    }

    const manifest: FullBackupManifest = {
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      favorites: [...favorites],
      setlists,
      history,
      loopsByDoc: loopsByDoc ?? {},
      indices,
      hasSoundFont: Boolean(soundfont),
      ...(soundfont ? { soundFontName: soundfont.name } : {}),
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    return zipSync(files);
  }

  public async importFullBackupZip(zipBytes: Uint8Array): Promise<{ restoredCount: number }> {
    const files = unzipSync(zipBytes);
    const manifestBytes = files['manifest.json'];
    if (!manifestBytes) throw new Error('Backup inválido: falta manifest.json');
    const manifest = JSON.parse(strFromU8(manifestBytes)) as FullBackupManifest;
    if (manifest.backupVersion !== 1) throw new Error('Versión de backup incompatible');

    let restoredCount = 0;
    for (const entry of manifest.indices) {
      await this.backend.put('indices', entry.id, entry);
      const scoreBytes = files[`scores/${entry.id}.json`];
      if (scoreBytes) {
        const payload = JSON.parse(strFromU8(scoreBytes)) as TabPayloadRecord;
        await this.backend.put('payloads', entry.id, payload);
        restoredCount++;
      }
    }

    await this.saveFavoriteSet(new Set(manifest.favorites ?? []));
    await this.backend.put('meta', META_SETLISTS, manifest.setlists ?? []);
    await this.backend.put('meta', META_HISTORY, manifest.history ?? []);
    await this.backend.put('meta', META_LOOPS, manifest.loopsByDoc ?? {});

    if (manifest.hasSoundFont && files['soundfont/custom.sf2']) {
      await this.saveUserSoundFont(
        manifest.soundFontName || 'custom.sf2',
        files['soundfont/custom.sf2']!
      );
    }

    return { restoredCount };
  }

  // --- Catálogos Externos JSON / Offline .zip (Spec 011) ---

  public async listCatalogSources(): Promise<CatalogSourceRecord[]> {
    return (await this.backend.get<CatalogSourceRecord[]>('meta', META_CATALOG_SOURCES)) ?? [];
  }

  private async saveCatalogSources(list: CatalogSourceRecord[]): Promise<void> {
    await this.backend.put('meta', META_CATALOG_SOURCES, list);
  }

  public async connectRemoteCatalogFromJson(
    sourceUrl: string,
    rawManifest: unknown
  ): Promise<CatalogSourceRecord> {
    if (!isValidHttpsUrl(sourceUrl)) {
      throw new Error('La URL del catálogo debe usar protocolo seguro https://');
    }
    const validation = validateCatalogManifest(rawManifest);
    if (!validation.valid) {
      throw new Error(`Manifiesto CatalogManifestV1 inválido: ${validation.errors.join('; ')}`);
    }

    const sources = await this.listCatalogSources();
    const existing = sources.find((s) => s.id === validation.manifest.catalog.id);
    const nextRecord: CatalogSourceRecord = {
      id: validation.manifest.catalog.id,
      manifest: validation.manifest,
      sourceUrl: sourceUrl.trim(),
      kind: 'remote',
      enabled: existing?.enabled ?? true,
      cachedSongIds: existing?.cachedSongIds ?? [],
      lastSyncedAt: new Date().toISOString(),
    };

    const updated = [nextRecord, ...sources.filter((s) => s.id !== nextRecord.id)];
    await this.saveCatalogSources(updated);
    return nextRecord;
  }

  /** Únicamente se invoca bajo acción explícita del usuario en Catálogos Externos. */
  public async fetchRemoteCatalog(httpsUrl: string): Promise<CatalogSourceRecord> {
    const trimmed = httpsUrl.trim();
    if (!isValidHttpsUrl(trimmed)) {
      throw new Error('URL no segura: solo se admiten orígenes https://');
    }
    let response: Response;
    try {
      response = await fetch(trimmed, { cache: 'no-store' });
    } catch {
      throw new Error('Error de red o bloqueo CORS al consultar el catálogo remoto.');
    }
    if (!response.ok) {
      throw new Error(`El servidor respondió HTTP ${response.status} al leer catalog.json.`);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error('La respuesta remota no es un JSON válido.');
    }
    return this.connectRemoteCatalogFromJson(trimmed, json);
  }

  public async importCatalogZipPackage(zipBytes: Uint8Array): Promise<CatalogSourceRecord> {
    const pkg = parseCatalogPackageZip(zipBytes);
    const sourceId = pkg.manifest.catalog.id;
    const cachedSongIds: string[] = [];

    for (const song of pkg.manifest.songs) {
      const scoreBytes = pkg.scoreBytesBySongId.get(song.id);
      if (!scoreBytes) continue;
      const chordProText = pkg.chordProBySongId.get(song.id);
      const doc = parseScoreBytes(scoreBytes, `${song.id}.${song.scoreFormat}`, {
        kind: 'catalog',
        sourceId,
        sourceName: pkg.manifest.catalog.name,
        importedAt: new Date().toISOString(),
      });
      const withId: ScoreDocument = {
        ...doc,
        id: catalogDocId(sourceId, song.id),
        title: song.title || doc.title,
        artist: song.artist || doc.artist,
        tags: [...song.tags],
      };
      await this.backend.put<TabPayloadRecord>('payloads', withId.id, {
        id: withId.id,
        document: withId,
        ...(chordProText ? { chordProText } : {}),
      });
      cachedSongIds.push(song.id);
    }

    const sources = await this.listCatalogSources();
    const record: CatalogSourceRecord = {
      id: sourceId,
      manifest: pkg.manifest,
      kind: 'zip',
      enabled: true,
      cachedSongIds,
      lastSyncedAt: new Date().toISOString(),
    };
    await this.saveCatalogSources([record, ...sources.filter((s) => s.id !== sourceId)]);
    return record;
  }

  public async toggleCatalogSource(sourceId: string, enabled: boolean): Promise<void> {
    const sources = await this.listCatalogSources();
    await this.saveCatalogSources(
      sources.map((s) => (s.id === sourceId ? { ...s, enabled } : s))
    );
  }

  public async deleteCatalogSource(sourceId: string): Promise<void> {
    const sources = await this.listCatalogSources();
    const target = sources.find((s) => s.id === sourceId);
    if (target) {
      await Promise.all(
        target.cachedSongIds.map((songId) =>
          this.backend.delete('payloads', catalogDocId(sourceId, songId))
        )
      );
    }
    await this.saveCatalogSources(sources.filter((s) => s.id !== sourceId));
  }

  public async downloadCatalogSongOffline(
    sourceId: string,
    songId: string
  ): Promise<TabPayloadRecord | null> {
    const docId = catalogDocId(sourceId, songId);
    const cached = await this.backend.get<TabPayloadRecord>('payloads', docId);
    if (cached) return cached;

    const sources = await this.listCatalogSources();
    const src = sources.find((s) => s.id === sourceId);
    const song = src?.manifest.songs.find((s) => s.id === songId);
    if (!src || !song) return null;
    if (!isValidHttpsUrl(song.scoreUrl)) {
      throw new Error('Este tema de catálogo solo estaba empaquetado localmente y no tiene copia en caché.');
    }

    let res: Response;
    try {
      res = await fetch(song.scoreUrl);
    } catch {
      throw new Error('Sin conexión o CORS bloqueado al descargar la partitura del catálogo.');
    }
    if (!res.ok) {
      throw new Error(`No se pudo descargar "${song.title}" (HTTP ${res.status}).`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const parsed = parseScoreBytes(bytes, `${song.id}.${song.scoreFormat}`, {
      kind: 'catalog',
      sourceId: src.id,
      sourceName: src.manifest.catalog.name,
      importedAt: new Date().toISOString(),
    });
    const doc: ScoreDocument = {
      ...parsed,
      id: docId,
      title: song.title || parsed.title,
      artist: song.artist || parsed.artist,
      tags: [...song.tags],
    };

    let chordProText: string | undefined;
    if (song.chordsUrl && isValidHttpsUrl(song.chordsUrl)) {
      try {
        const cr = await fetch(song.chordsUrl);
        if (cr.ok) chordProText = await cr.text();
      } catch {
        // Ignorar fallo opcional de acordes
      }
    }

    const record: TabPayloadRecord = {
      id: docId,
      document: doc,
      ...(chordProText ? { chordProText } : {}),
    };
    await this.backend.put('payloads', docId, record);

    await this.saveCatalogSources(
      sources.map((s) =>
        s.id === sourceId && !s.cachedSongIds.includes(songId)
          ? { ...s, cachedSongIds: [...s.cachedSongIds, songId] }
          : s
      )
    );
    return record;
  }

  public async downloadEntireCatalogOffline(
    sourceId: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ downloaded: number; failed: number }> {
    const sources = await this.listCatalogSources();
    const src = sources.find((s) => s.id === sourceId);
    if (!src) throw new Error('Catálogo no encontrado');
    let downloaded = 0;
    let failed = 0;
    const total = src.manifest.songs.length;
    for (let i = 0; i < total; i++) {
      const song = src.manifest.songs[i]!;
      try {
        await this.downloadCatalogSongOffline(sourceId, song.id);
        downloaded++;
      } catch {
        failed++;
      }
      onProgress?.(i + 1, total);
    }
    return { downloaded, failed };
  }

  /** Clona una partitura de fábrica o catálogo como copia local independiente en Mi Biblioteca. */
  public async cloneEntryToUserLibrary(sourceDocId: string): Promise<TabIndexEntry> {
    const payload = await this.getDocument(sourceDocId);
    if (!payload) throw new Error('Partitura original no disponible para clonar.');
    const clonedDoc: ScoreDocument = {
      ...payload.document,
      id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      origin: {
        kind: 'byot',
        sourceId: payload.document.id,
        sourceName: payload.document.origin.sourceName,
        importedAt: new Date().toISOString(),
      },
    };
    return this.saveDocument(clonedDoc, { chordProText: payload.chordProText });
  }

  // --- Historial de Revisiones A/B y Beat-Sync Map (Spec 014) ---

  public async listRevisions(docId: string): Promise<ScoreRevisionRecord[]> {
    const all =
      (await this.backend.get<Record<string, ScoreRevisionRecord[]>>('meta', META_REVISIONS)) ??
      {};
    return all[docId] ?? [];
  }

  public async saveRevision(
    docId: string,
    label: string,
    document: ScoreDocument
  ): Promise<ScoreRevisionRecord[]> {
    const all =
      (await this.backend.get<Record<string, ScoreRevisionRecord[]>>('meta', META_REVISIONS)) ??
      {};
    const list = all[docId] ?? [];
    const nextRev: ScoreRevisionRecord = {
      id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      docId,
      label: label.trim() || `Revisión ${list.length + 1}`,
      createdAt: new Date().toISOString(),
      document: structuredClone(document),
    };
    const nextList = [nextRev, ...list].slice(0, 30);
    await this.backend.put('meta', META_REVISIONS, { ...all, [docId]: nextList });
    return nextList;
  }

  public async deleteRevision(docId: string, revId: string): Promise<ScoreRevisionRecord[]> {
    const all =
      (await this.backend.get<Record<string, ScoreRevisionRecord[]>>('meta', META_REVISIONS)) ??
      {};
    const nextList = (all[docId] ?? []).filter((r) => r.id !== revId);
    await this.backend.put('meta', META_REVISIONS, { ...all, [docId]: nextList });
    return nextList;
  }

  public async getBeatSync(docId: string): Promise<BeatSyncMap | null> {
    const all =
      (await this.backend.get<Record<string, BeatSyncMap>>('meta', META_BEAT_SYNC)) ?? {};
    return all[docId] ?? null;
  }

  public async saveBeatSync(map: BeatSyncMap): Promise<void> {
    const all =
      (await this.backend.get<Record<string, BeatSyncMap>>('meta', META_BEAT_SYNC)) ?? {};
    await this.backend.put('meta', META_BEAT_SYNC, { ...all, [map.docId]: map });

    const existing = await this.backend.get<TabIndexEntry>('indices', map.docId);
    if (existing) {
      await this.backend.put('indices', map.docId, { ...existing, hasSyncAudio: true });
    }
  }
}

export const defaultTabsLibrary = new TabsLibraryService();
