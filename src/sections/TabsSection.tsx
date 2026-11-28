// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Sección Tablaturas (Specs 008, 009 y 010): integra Biblioteca Local BYOT (IndexedDB),
 * Modo Práctica estilo Songsterr y Gimnasio Procedimental de Escalas, Modos y Arpegios.
 */

import { useCallback, useEffect, useState } from 'react';
import { CatalogsManager } from '../components/tabs/CatalogsManager';
import { PracticePlayer } from '../components/tabs/PracticePlayer';
import { ScaleGym } from '../components/tabs/ScaleGym';
import { ScoreEditor } from '../components/tabs/ScoreEditor';
import { TabsLibrary } from '../components/tabs/TabsLibrary';
import type { BeatSyncMap } from '../core/tabs/beat-sync';
import { getFactoryExamples } from '../core/tabs/factory-examples';
import type { ScoreDocument, TrackFamily } from '../core/tabs/model';
import { pickTrackIndexForInstrumentFilter } from '../core/tabs/practice-state';
import {
  TABS_SUBROUTE_LABELS,
  TABS_SUBROUTE_ORDER,
  routeToHash,
  type TabsSubRoute,
} from '../navigation/routes';
import { HeaderSubtitle, useAppShell } from '../shell/AppShell';
import {
  defaultTabsLibrary,
  type CatalogSourceRecord,
  type RecentPlaybackEntry,
  type SavedLoopPreset,
  type ScoreRevisionRecord,
  type SetlistRecord,
  type TabIndexEntry,
} from '../storage/tabs-db';

interface TabsSectionProps {
  subRoute: TabsSubRoute;
}

const STORAGE_INSTRUMENT_FILTER = 'endurend_tabs_instrument_filter';

function loadInstrumentFilter(): TrackFamily | 'all' {
  try {
    const raw = localStorage.getItem(STORAGE_INSTRUMENT_FILTER);
    if (
      raw === 'guitar' ||
      raw === 'bass' ||
      raw === 'drums' ||
      raw === 'keyboard' ||
      raw === 'other'
    ) {
      return raw;
    }
    return 'all';
  } catch {
    return 'all';
  }
}

const SUBROUTE_DESCRIPTIONS: Readonly<Record<TabsSubRoute, string>> = {
  library: 'Biblioteca BYOT (IndexedDB) + 16 Ejemplos de Fábrica',
  practice: 'Modo Práctica · Speed Trainer · Mezclador Multipista',
  editor: 'Modo Edición estilo Guitar Pro (Spec 013)',
  scales: 'Gimnasio de Escalas, Modos y Arpegios',
  catalogs: 'Catálogos Externos JSON y Enlaces Seguros (Spec 011)',
};

export function TabsSection({ subRoute }: TabsSectionProps) {
  const { navigate } = useAppShell();

  const [entries, setEntries] = useState<TabIndexEntry[]>([]);
  const [setlists, setSetlists] = useState<SetlistRecord[]>([]);
  const [history, setHistory] = useState<RecentPlaybackEntry[]>([]);
  const [catalogSources, setCatalogSources] = useState<CatalogSourceRecord[]>([]);
  const [instrumentFilter, setInstrumentFilter] = useState<TrackFamily | 'all'>(
    loadInstrumentFilter
  );
  const [searchQuery, setSearchQuery] = useState('');

  const [activeDoc, setActiveDoc] = useState<ScoreDocument>(() => getFactoryExamples()[0]!);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [activeChordProText, setActiveChordProText] = useState<string | undefined>(undefined);
  const [isTemporary, setIsTemporary] = useState(false);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [resumeBarIndex, setResumeBarIndex] = useState<number | undefined>(undefined);
  const [savedLoops, setSavedLoops] = useState<SavedLoopPreset[]>([]);
  const [revisions, setRevisions] = useState<ScoreRevisionRecord[]>([]);
  const [beatSyncMap, setBeatSyncMap] = useState<BeatSyncMap | null>(null);
  const [userSf, setUserSf] = useState<{ name: string; bytes: Uint8Array } | null>(null);

  const refreshLibrary = useCallback(async () => {
    const [nextEntries, nextSetlists, nextHistory, sf, nextCatalogs] = await Promise.all([
      defaultTabsLibrary.listLibraryEntries(),
      defaultTabsLibrary.listSetlists(),
      defaultTabsLibrary.getHistory(),
      defaultTabsLibrary.loadUserSoundFont(),
      defaultTabsLibrary.listCatalogSources(),
    ]);
    setEntries(nextEntries);
    setSetlists(nextSetlists);
    setHistory(nextHistory);
    setUserSf(sf ? { name: sf.name, bytes: sf.bytes } : null);
    setCatalogSources(nextCatalogs);
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_INSTRUMENT_FILTER, instrumentFilter);
    } catch {
      // Ignorar si almacenamiento restringido
    }
  }, [instrumentFilter]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      defaultTabsLibrary.getLoopsForDoc(activeDoc.id),
      defaultTabsLibrary.listRevisions(activeDoc.id),
      defaultTabsLibrary.getBeatSync(activeDoc.id),
    ]).then(([loops, revs, sync]) => {
      if (cancelled) return;
      setSavedLoops(loops);
      setRevisions(revs);
      setBeatSyncMap(sync);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDoc.id]);

  const handleOpenDocument = useCallback(
    (
      doc: ScoreDocument,
      opts?: {
        setlistId?: string;
        temporary?: boolean;
        chordProText?: string;
        resumeHistory?: RecentPlaybackEntry;
      }
    ) => {
      const nextTrack =
        opts?.resumeHistory !== undefined
          ? Math.max(0, Math.min(doc.tracks.length - 1, opts.resumeHistory.trackIndex))
          : pickTrackIndexForInstrumentFilter(doc.tracks, instrumentFilter);
      setActiveDoc(doc);
      setActiveTrackIndex(nextTrack);
      setActiveChordProText(opts?.chordProText);
      setIsTemporary(Boolean(opts?.temporary));
      setActiveSetlistId(opts?.setlistId ?? null);
      setResumeBarIndex(opts?.resumeHistory?.barIndex);
      navigate({ section: 'tabs', subRoute: 'practice' });
    },
    [instrumentFilter, navigate]
  );

  const handleNavigateSetlist = useCallback(
    async (targetDocId: string) => {
      const payload = await defaultTabsLibrary.getDocument(targetDocId);
      if (!payload) return;
      handleOpenDocument(payload.document, { setlistId: activeSetlistId ?? undefined });
    },
    [activeSetlistId, handleOpenDocument]
  );

  const activeEntry = entries.find((e) => e.id === activeDoc.id);
  const activeSetlist = activeSetlistId
    ? setlists.find((s) => s.id === activeSetlistId) ?? null
    : null;

  return (
    <>
      {subRoute !== 'practice' && <HeaderSubtitle>{SUBROUTE_DESCRIPTIONS[subRoute]}</HeaderSubtitle>}

      <nav className="sub-tabs tabs-subtabs" aria-label="Herramientas de tablaturas">
        {TABS_SUBROUTE_ORDER.map((item) => (
          <a
            key={item}
            href={routeToHash({ section: 'tabs', subRoute: item })}
            className={`sub-tab ${subRoute === item ? 'is-active' : ''}`}
            aria-current={subRoute === item ? 'page' : undefined}
          >
            {TABS_SUBROUTE_LABELS[item]}
          </a>
        ))}
      </nav>

      {subRoute === 'library' && (
        <TabsLibrary
          libraryService={defaultTabsLibrary}
          entries={entries}
          setlists={setlists}
          history={history}
          catalogSources={catalogSources}
          instrumentFilter={instrumentFilter}
          onChangeInstrumentFilter={setInstrumentFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          onOpenDocument={handleOpenDocument}
          onRefreshLibrary={refreshLibrary}
        />
      )}

      {subRoute === 'practice' && (
        <PracticePlayer
          doc={activeDoc}
          activeTrackIndex={activeTrackIndex}
          onChangeTrackIndex={setActiveTrackIndex}
          chordProText={activeChordProText}
          isTemporary={isTemporary}
          isFavorite={activeEntry?.favorite ?? false}
          setlists={setlists}
          activeSetlist={activeSetlist}
          resumeBarIndex={resumeBarIndex}
          userSoundFontBytes={userSf?.bytes ?? null}
          userSoundFontName={userSf?.name ?? null}
          savedLoops={savedLoops}
          onBackToLibrary={() => navigate({ section: 'tabs', subRoute: 'library' })}
          onNavigateSetlist={(docId) => void handleNavigateSetlist(docId)}
          onKeepTemporaryDocument={async (docToSave) => {
            await defaultTabsLibrary.saveDocument(docToSave);
            setIsTemporary(false);
            await refreshLibrary();
          }}
          onToggleFavorite={async () => {
            await defaultTabsLibrary.toggleFavorite(activeDoc.id);
            await refreshLibrary();
          }}
          onAddToSetlist={async (setlistId) => {
            const target = setlists.find((s) => s.id === setlistId);
            if (!target) return;
            await defaultTabsLibrary.saveSetlist({
              ...target,
              items: [...target.items, { docId: activeDoc.id, note: '' }],
              updatedAt: new Date().toISOString(),
            });
            await refreshLibrary();
          }}
          onSaveLoop={async (name, startBar, endBar) => {
            const next = await defaultTabsLibrary.saveLoopPreset(activeDoc.id, {
              id: `loop-${Date.now()}`,
              name,
              startBar,
              endBar,
            });
            setSavedLoops(next);
          }}
          onDeleteLoop={async (loopId) => {
            const next = await defaultTabsLibrary.deleteLoopPreset(activeDoc.id, loopId);
            setSavedLoops(next);
          }}
          onLoadUserSoundFont={async (name, bytes) => {
            await defaultTabsLibrary.saveUserSoundFont(name, bytes);
            await refreshLibrary();
          }}
          onClearUserSoundFont={async () => {
            await defaultTabsLibrary.clearUserSoundFont();
            await refreshLibrary();
          }}
          onProgressSave={(trackIdx, barIdx, speedPct) => {
            if (!isTemporary) {
              void defaultTabsLibrary
                .recordRecentPlayback({
                  docId: activeDoc.id,
                  title: activeDoc.title,
                  artist: activeDoc.artist,
                  trackIndex: trackIdx,
                  barIndex: barIdx,
                  speedPct,
                })
                .then(setHistory);
            }
          }}
          onFilterByArtist={(artist) => {
            setSearchQuery(artist);
            navigate({ section: 'tabs', subRoute: 'library' });
          }}
          beatSyncMap={beatSyncMap}
          revisions={revisions}
          onSaveBeatSyncMap={async (map) => {
            await defaultTabsLibrary.saveBeatSync(map);
            setBeatSyncMap(map);
            await refreshLibrary();
          }}
          onSaveRevision={async (label, snap) => {
            const next = await defaultTabsLibrary.saveRevision(activeDoc.id, label, snap);
            setRevisions(next);
          }}
          onDeleteRevision={async (revId) => {
            const next = await defaultTabsLibrary.deleteRevision(activeDoc.id, revId);
            setRevisions(next);
          }}
          onRestoreRevision={(snapshot) => {
            setActiveDoc(snapshot);
            setIsTemporary(false);
            void defaultTabsLibrary
              .saveDocument(snapshot, { chordProText: activeChordProText })
              .then(() => refreshLibrary());
          }}
          onOpenEditor={() => navigate({ section: 'tabs', subRoute: 'editor' })}
          onOpenTuner={() => navigate({ section: 'tuner' })}
        />
      )}

      {subRoute === 'scales' && (
        <ScaleGym
          onPracticeDocument={(doc) => handleOpenDocument(doc, { temporary: true })}
          onSaveDocument={async (doc) => {
            await defaultTabsLibrary.saveDocument(doc);
            await refreshLibrary();
          }}
          onEditDocument={(doc) => {
            setActiveDoc(doc);
            setActiveTrackIndex(0);
            setIsTemporary(false);
            navigate({ section: 'tabs', subRoute: 'editor' });
          }}
        />
      )}

      {subRoute === 'catalogs' && (
        <CatalogsManager
          libraryService={defaultTabsLibrary}
          sources={catalogSources}
          entries={entries}
          onRefresh={refreshLibrary}
        />
      )}

      {subRoute === 'editor' && (
        <ScoreEditor
          doc={activeDoc}
          activeTrackIndex={activeTrackIndex}
          onChangeTrackIndex={setActiveTrackIndex}
          onReplaceDocument={(next) => {
            setActiveDoc(next);
            setIsTemporary(false);
          }}
          onAutosaveDocument={async (docToSave) => {
            await defaultTabsLibrary.saveDocument(docToSave, {
              chordProText: activeChordProText,
            });
            await refreshLibrary();
          }}
          chordProText={activeChordProText}
          onSaveChordProText={async (text) => {
            setActiveChordProText(text);
            await defaultTabsLibrary.saveDocument(activeDoc, { chordProText: text });
            await refreshLibrary();
          }}
          revisions={revisions}
          onSaveRevision={async (label, snap) => {
            const next = await defaultTabsLibrary.saveRevision(activeDoc.id, label, snap);
            setRevisions(next);
          }}
          onDeleteRevision={async (revId) => {
            const next = await defaultTabsLibrary.deleteRevision(activeDoc.id, revId);
            setRevisions(next);
          }}
          beatSyncMap={beatSyncMap}
          onSaveBeatSyncMap={async (map) => {
            await defaultTabsLibrary.saveBeatSync(map);
            setBeatSyncMap(map);
            await refreshLibrary();
          }}
          onBackToPractice={() => navigate({ section: 'tabs', subRoute: 'practice' })}
        />
      )}
    </>
  );
}

export default TabsSection;
