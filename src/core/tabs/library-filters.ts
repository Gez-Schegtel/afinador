// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Motor puro de búsqueda difusa y filtros combinados para la Biblioteca BYOT + Catálogos (Spec 011).
 * Integra el filtro persistente de instrumento y selección automática de pista.
 */

import type { TabIndexEntry } from '../../storage/tabs-db';
import type { DifficultyLevel, ScoreDocument, ScoreOriginKind, TrackFamily } from './model';
import { matchesFuzzyQuery, pickTrackIndexForInstrumentFilter } from './practice-state';

export type LibrarySourceFilter = 'all' | ScoreOriginKind | `source:${string}`;

export interface LibraryFilterCriteria {
  readonly query: string;
  readonly instrumentFilter: TrackFamily | 'all';
  readonly sourceFilter: LibrarySourceFilter;
  readonly tuningQuery: string;
  readonly timeSignature: string;
  readonly minBpm: number | null;
  readonly maxBpm: number | null;
  readonly difficulty: DifficultyLevel | 'all';
  readonly hasChordsOnly: boolean;
  readonly hasSyncAudioOnly: boolean;
  readonly offlineOnly: boolean;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilterCriteria = {
  query: '',
  instrumentFilter: 'all',
  sourceFilter: 'all',
  tuningQuery: '',
  timeSignature: 'all',
  minBpm: null,
  maxBpm: null,
  difficulty: 'all',
  hasChordsOnly: false,
  hasSyncAudioOnly: false,
  offlineOnly: false,
};

export function filterLibraryEntries(
  entries: readonly TabIndexEntry[],
  criteria: LibraryFilterCriteria
): TabIndexEntry[] {
  return entries.filter((entry) => {
    if (
      criteria.instrumentFilter !== 'all' &&
      !entry.families.includes(criteria.instrumentFilter)
    ) {
      return false;
    }

    if (criteria.sourceFilter !== 'all') {
      if (criteria.sourceFilter.startsWith('source:')) {
        const targetSourceId = criteria.sourceFilter.slice('source:'.length);
        if (entry.sourceId !== targetSourceId) return false;
      } else if (entry.originKind !== criteria.sourceFilter) {
        return false;
      }
    }

    if (
      criteria.timeSignature !== 'all' &&
      entry.timeSignature !== criteria.timeSignature
    ) {
      return false;
    }

    if (criteria.minBpm !== null && entry.bpm < criteria.minBpm) {
      return false;
    }
    if (criteria.maxBpm !== null && entry.bpm > criteria.maxBpm) {
      return false;
    }

    if (criteria.difficulty !== 'all' && entry.difficulty !== criteria.difficulty) {
      return false;
    }

    if (criteria.hasChordsOnly && !entry.hasChords) return false;
    if (criteria.hasSyncAudioOnly && !entry.hasSyncAudio) return false;
    if (criteria.offlineOnly && !entry.offlineAvailable) return false;

    if (criteria.tuningQuery.trim().length > 0) {
      const matchingTuning = matchesFuzzyQuery(
        entry.tracks.map((t) => t.tuningLabel),
        criteria.tuningQuery
      );
      if (!matchingTuning) return false;
    }

    if (criteria.query.trim().length > 0) {
      const ok = matchesFuzzyQuery(
        [
          entry.title,
          entry.artist,
          entry.album,
          entry.sourceName ?? '',
          ...entry.tags,
          ...entry.tracks.map((t) => `${t.name} ${t.tuningLabel}`),
        ],
        criteria.query
      );
      if (!ok) return false;
    }

    return true;
  });
}

export function resolveTrackForInstrumentFilter(
  doc: ScoreDocument,
  instrumentFilter: TrackFamily | 'all'
): number {
  return pickTrackIndexForInstrumentFilter(doc.tracks, instrumentFilter);
}
