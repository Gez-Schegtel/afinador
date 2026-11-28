// SPDX-License-Identifier: GPL-3.0-or-later
import { useRef, useState, type DragEvent } from 'react';
import {
  DEFAULT_LIBRARY_FILTERS,
  filterLibraryEntries,
  type LibraryFilterCriteria,
  type LibrarySourceFilter,
} from '../../core/tabs/library-filters';
import type { DifficultyLevel, ScoreDocument, TrackFamily } from '../../core/tabs/model';
import {
  TabsLibraryService,
  type BatchImportSummary,
  type CatalogSourceRecord,
  type ImportSingleResult,
  type RecentPlaybackEntry,
  type SetlistRecord,
  type TabIndexEntry,
} from '../../storage/tabs-db';

export type LibraryTabView =
  | 'all'
  | 'factory'
  | 'user'
  | 'favorites'
  | 'setlists'
  | 'history';

const INSTRUMENT_FILTERS: ReadonlyArray<{ value: TrackFamily | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'guitar', label: 'Guitarra' },
  { value: 'bass', label: 'Bajo' },
  { value: 'drums', label: 'Batería' },
  { value: 'keyboard', label: 'Teclado' },
  { value: 'other', label: 'Otros' },
];

interface TabsLibraryProps {
  libraryService: TabsLibraryService;
  entries: readonly TabIndexEntry[];
  setlists: readonly SetlistRecord[];
  history: readonly RecentPlaybackEntry[];
  catalogSources: readonly CatalogSourceRecord[];
  instrumentFilter: TrackFamily | 'all';
  onChangeInstrumentFilter: (filter: TrackFamily | 'all') => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  onOpenDocument: (
    doc: ScoreDocument,
    opts?: {
      setlistId?: string;
      temporary?: boolean;
      chordProText?: string;
      resumeHistory?: RecentPlaybackEntry;
    }
  ) => void;
  onRefreshLibrary: () => Promise<void>;
}

function downloadUint8(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TabsLibrary({
  libraryService,
  entries,
  setlists,
  history,
  catalogSources,
  instrumentFilter,
  onChangeInstrumentFilter,
  searchQuery,
  onChangeSearchQuery,
  onOpenDocument,
  onRefreshLibrary,
}: TabsLibraryProps) {
  const [view, setView] = useState<LibraryTabView>('all');
  const query = searchQuery;
  const setQuery = onChangeSearchQuery;
  const [showFilters, setShowFilters] = useState(false);
  const [extraFilters, setExtraFilters] = useState<Omit<LibraryFilterCriteria, 'query' | 'instrumentFilter'>>({
    sourceFilter: DEFAULT_LIBRARY_FILTERS.sourceFilter,
    tuningQuery: '',
    timeSignature: 'all',
    minBpm: null,
    maxBpm: null,
    difficulty: 'all',
    hasChordsOnly: false,
    hasSyncAudioOnly: false,
    offlineOnly: false,
  });
  const [dragging, setDragging] = useState(false);
  const [pendingSingle, setPendingSingle] = useState<{
    fileName: string;
    bytes: Uint8Array;
    preview: ImportSingleResult;
  } | null>(null);
  const [batchReport, setBatchReport] = useState<BatchImportSummary | null>(null);
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState({ title: '', artist: '', tags: '' });
  const [newSetlistName, setNewSetlistName] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const setlistImportRef = useRef<HTMLInputElement | null>(null);
  const backupImportRef = useRef<HTMLInputElement | null>(null);

  const handleIncomingFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBatchReport(null);
    setPendingSingle(null);
    setStatusMsg(null);

    if (files.length === 1 && !files[0]!.name.toLowerCase().endsWith('.zip')) {
      const f = files[0]!;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const preview = await libraryService.importFileBytes(bytes, f.name, { temporary: true });
      if (preview.status === 'error') {
        setStatusMsg(preview.error ?? 'No se pudo leer el archivo.');
        return;
      }
      setPendingSingle({ fileName: f.name, bytes, preview });
      return;
    }

    const loaded = await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
    );
    const summary = await libraryService.importBatchOrZip(loaded);
    setBatchReport(summary);
    await onRefreshLibrary();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) {
      void handleIncomingFiles(e.dataTransfer.files);
    }
  };

  const confirmImportSingle = async () => {
    if (!pendingSingle) return;
    const res = await libraryService.importFileBytes(pendingSingle.bytes, pendingSingle.fileName);
    setPendingSingle(null);
    if (res.status === 'duplicate' && res.existingId) {
      setStatusMsg('Ese tema ya está en tu biblioteca.');
      const existing = await libraryService.getDocument(res.existingId);
      if (existing) onOpenDocument(existing.document, { chordProText: existing.chordProText });
      return;
    }
    if (res.status === 'error') {
      setStatusMsg(res.error ?? 'Error al importar.');
      return;
    }
    await onRefreshLibrary();
    setStatusMsg(`«${res.entry?.title ?? pendingSingle.fileName}» guardado en Mi Biblioteca.`);
  };

  const openEntry = async (entry: TabIndexEntry, extraOpts?: { setlistId?: string; resumeHistory?: RecentPlaybackEntry }) => {
    const payload = await libraryService.getDocument(entry.id);
    if (!payload) return;
    onOpenDocument(payload.document, {
      chordProText: payload.chordProText,
      ...extraOpts,
    });
  };

  const filteredByCriteria = filterLibraryEntries(entries, {
    ...extraFilters,
    query,
    instrumentFilter,
  });

  const filteredEntries = filteredByCriteria.filter((entry) => {
    if (view === 'factory' && entry.originKind !== 'factory') return false;
    if (view === 'user' && (entry.originKind === 'factory' || entry.originKind === 'catalog')) {
      return false;
    }
    if (view === 'favorites' && !entry.favorite) return false;
    return true;
  });

  const handleSaveMetadata = async (id: string) => {
    await libraryService.updateEntryMetadata(id, {
      title: metaDraft.title.trim() || 'Sin título',
      artist: metaDraft.artist.trim(),
      tags: metaDraft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setEditingMetaId(null);
    await onRefreshLibrary();
  };

  const handleCreateSetlist = async () => {
    const name = newSetlistName.trim();
    if (!name) return;
    await libraryService.saveSetlist({
      id: `set-${Date.now().toString(36)}`,
      name,
      items: [],
      updatedAt: new Date().toISOString(),
    });
    setNewSetlistName('');
    await onRefreshLibrary();
  };

  const addEntryToSetlist = async (entryId: string, setlistId: string) => {
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;
    if (setlist.items.some((i) => i.docId === entryId)) return;
    await libraryService.saveSetlist({
      ...setlist,
      items: [...setlist.items, { docId: entryId, note: '' }],
    });
    await onRefreshLibrary();
    setStatusMsg(`Agregado al setlist «${setlist.name}».`);
  };

  const moveSetlistItem = async (setlist: SetlistRecord, idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= setlist.items.length) return;
    const copy = [...setlist.items];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed!);
    await libraryService.saveSetlist({ ...setlist, items: copy });
    await onRefreshLibrary();
  };

  const updateSetlistItemNote = async (setlist: SetlistRecord, idx: number, note: string) => {
    const copy = setlist.items.map((item, i) => (i === idx ? { ...item, note } : item));
    await libraryService.saveSetlist({ ...setlist, items: copy });
    await onRefreshLibrary();
  };

  const removeSetlistItem = async (setlist: SetlistRecord, idx: number) => {
    const copy = setlist.items.filter((_, i) => i !== idx);
    await libraryService.saveSetlist({ ...setlist, items: copy });
    await onRefreshLibrary();
  };

  const handleExportSetlist = async (setlist: SetlistRecord) => {
    const zipBytes = await libraryService.exportSetlistZip(setlist.id);
    downloadUint8(zipBytes, `${setlist.name.replace(/[^\w-]+/g, '_') || 'setlist'}.zip`);
  };

  const handleImportSetlist = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const imported = await libraryService.importSetlistZip(bytes);
      await onRefreshLibrary();
      setStatusMsg(`Setlist «${imported.name}» importado (${imported.items.length} temas).`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'No se pudo importar el setlist.');
    }
  };

  const handleExportBackup = async () => {
    const zipBytes = await libraryService.exportFullBackupZip();
    downloadUint8(zipBytes, `endurend-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  };

  const handleImportBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { restoredCount } = await libraryService.importFullBackupZip(bytes);
      await onRefreshLibrary();
      setStatusMsg(`Backup restaurado (${restoredCount} partituras).`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Backup inválido.');
    }
  };

  const entryMap = new Map(entries.map((e) => [e.id, e]));

  return (
    <div
      className="tabs-shell"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Zona Instant Drop */}
      <div className={`panel-card dropzone-card ${dragging ? 'is-dragging' : ''}`}>
        <div className="dropzone-row">
          <div>
            <strong>Biblioteca Local (BYOT)</strong>
            <p className="tuning-changes">
              Arrastrá acá archivos <code>.gp3/.gp4/.gp5/.gpx/.gp</code>, <code>.musicxml/.mxl</code>,{' '}
              <code>.mid</code>, <code>.alphatex</code>, <code>.cho</code> o colecciones <code>.zip</code>.
            </p>
          </div>
          <div className="tabs-toolbar-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept=".gp3,.gp4,.gp5,.gpx,.gp,.tg,.musicxml,.xml,.mxl,.mid,.midi,.alphatex,.atex,.cho,.chopro,.zip"
              onChange={(e) => {
                if (e.target.files) void handleIncomingFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="chip-btn is-active"
              onClick={() => fileInputRef.current?.click()}
            >
              + Abrir o Importar archivo
            </button>
            <button type="button" className="chip-btn" onClick={() => void handleExportBackup()}>
              Exportar Backup
            </button>
            <input
              ref={backupImportRef}
              type="file"
              hidden
              accept=".zip"
              onChange={(e) => {
                void handleImportBackup(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="chip-btn"
              onClick={() => backupImportRef.current?.click()}
            >
              Restaurar Backup
            </button>
          </div>
        </div>

        {pendingSingle?.preview.entry && (
          <div className="info-banner instant-drop-preview">
            <div>
              <strong>{pendingSingle.preview.entry.title}</strong>
              {pendingSingle.preview.entry.artist && ` · ${pendingSingle.preview.entry.artist}`} (
              {pendingSingle.preview.entry.tracks.length} pista(s),{' '}
              {pendingSingle.preview.entry.bpm} BPM, {pendingSingle.preview.entry.timeSignature})
            </div>
            <div className="tabs-toolbar-actions">
              <button
                type="button"
                className="chip-btn is-active"
                onClick={() => {
                  const doc = pendingSingle.preview.document;
                  const chordProText = pendingSingle.preview.chordProText;
                  setPendingSingle(null);
                  if (doc) onOpenDocument(doc, { temporary: true, chordProText });
                }}
              >
                Abrir y tocar ahora
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => void confirmImportSingle()}
              >
                Importar a Mi Biblioteca
              </button>
              <button type="button" className="chip-btn" onClick={() => setPendingSingle(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {batchReport && (
          <div className="info-banner">
            Lote procesado: <strong>{batchReport.imported.length}</strong> importados ·{' '}
            <strong>{batchReport.duplicates.length}</strong> duplicados omitidos ·{' '}
            <strong>{batchReport.errors.length}</strong> con error
            {batchReport.errors.length > 0 && (
              <ul className="batch-error-list">
                {batchReport.errors.map((err, i) => (
                  <li key={i}>
                    <code>{err.fileName}</code>: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {statusMsg && (
          <p className="info-banner tabs-subroute-note" role="status">
            {statusMsg}
          </p>
        )}
      </div>

      {/* Sub-vistas y Filtros */}
      <div className="panel-card library-controls-bar">
        <div className="preset-chips" role="tablist" aria-label="Vista de biblioteca">
          {(
            [
              ['all', `Todos (${entries.length})`],
              ['factory', 'Fábrica (16)'],
              ['user', 'Mis Tabs'],
              ['favorites', 'Favoritos'],
              ['setlists', `Setlists (${setlists.length})`],
              ['history', `Historial (${history.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`chip-btn ${view === id ? 'is-active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {view !== 'setlists' && view !== 'history' && (
          <div className="library-filter-row">
            <input
              type="search"
              className="target-select library-search"
              placeholder="Buscar título, artista, afinación, etiqueta…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar en biblioteca"
            />
            <div className="preset-chips" role="group" aria-label="Filtro por instrumento">
              {INSTRUMENT_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`chip-btn ${instrumentFilter === f.value ? 'is-active' : ''}`}
                  onClick={() => onChangeInstrumentFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                className={`chip-btn ${showFilters ? 'is-active' : ''}`}
                onClick={() => setShowFilters((s) => !s)}
              >
                Filtros
              </button>
            </div>
          </div>
        )}

        {showFilters && view !== 'setlists' && view !== 'history' && (
          <div className="secondary-filters-panel">
            <div className="secondary-filters-grid">
              <label className="gym-field">
                <span>Origen</span>
                <select
                  className="target-select"
                  value={extraFilters.sourceFilter}
                  onChange={(e) =>
                    setExtraFilters((p) => ({
                      ...p,
                      sourceFilter: e.target.value as LibrarySourceFilter,
                    }))
                  }
                >
                  <option value="all">Todos los orígenes</option>
                  <option value="factory">Fábrica (16)</option>
                  <option value="byot">Mi Biblioteca BYOT</option>
                  <option value="studio">Creaciones Estudio</option>
                  {catalogSources.map((src) => (
                    <option key={src.id} value={`source:${src.id}`}>
                      Catálogo: {src.manifest.catalog.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="gym-field">
                <span>Afinación</span>
                <input
                  type="text"
                  className="target-select"
                  placeholder="Ej. Drop D, DADGAD…"
                  value={extraFilters.tuningQuery}
                  onChange={(e) =>
                    setExtraFilters((p) => ({ ...p, tuningQuery: e.target.value }))
                  }
                />
              </label>

              <label className="gym-field">
                <span>Compás</span>
                <select
                  className="target-select"
                  value={extraFilters.timeSignature}
                  onChange={(e) =>
                    setExtraFilters((p) => ({ ...p, timeSignature: e.target.value }))
                  }
                >
                  <option value="all">Cualquier compás</option>
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="5/4">5/4</option>
                  <option value="7/8">7/8</option>
                </select>
              </label>

              <label className="gym-field">
                <span>Dificultad</span>
                <select
                  className="target-select"
                  value={extraFilters.difficulty}
                  onChange={(e) =>
                    setExtraFilters((p) => ({
                      ...p,
                      difficulty: e.target.value as DifficultyLevel | 'all',
                    }))
                  }
                >
                  <option value="all">Todas</option>
                  <option value="beginner">Inicial</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzado</option>
                </select>
              </label>

              <label className="gym-field">
                <span>BPM mín / máx</span>
                <div className="gym-row-2">
                  <input
                    type="number"
                    className="target-select"
                    placeholder="Min"
                    value={extraFilters.minBpm ?? ''}
                    onChange={(e) =>
                      setExtraFilters((p) => ({
                        ...p,
                        minBpm: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                  <input
                    type="number"
                    className="target-select"
                    placeholder="Max"
                    value={extraFilters.maxBpm ?? ''}
                    onChange={(e) =>
                      setExtraFilters((p) => ({
                        ...p,
                        maxBpm: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
              </label>
            </div>

            <div className="tabs-toolbar-actions">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={extraFilters.hasChordsOnly}
                  onChange={(e) =>
                    setExtraFilters((p) => ({ ...p, hasChordsOnly: e.target.checked }))
                  }
                />
                <span>Con Acordes / ChordPro</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={extraFilters.hasSyncAudioOnly}
                  onChange={(e) =>
                    setExtraFilters((p) => ({ ...p, hasSyncAudioOnly: e.target.checked }))
                  }
                />
                <span>Con Audio Sincronizado</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={extraFilters.offlineOnly}
                  onChange={(e) =>
                    setExtraFilters((p) => ({ ...p, offlineOnly: e.target.checked }))
                  }
                />
                <span>Disponible offline</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Listado principal */}
      {view === 'setlists' ? (
        <div className="panel-card setlists-panel">
          <div className="library-filter-row">
            <input
              type="text"
              className="target-select"
              placeholder="Nombre del nuevo Setlist / lista de ensayo…"
              value={newSetlistName}
              onChange={(e) => setNewSetlistName(e.target.value)}
            />
            <button type="button" className="chip-btn is-active" onClick={() => void handleCreateSetlist()}>
              Crear Setlist
            </button>
            <input
              ref={setlistImportRef}
              type="file"
              hidden
              accept=".zip"
              onChange={(e) => {
                void handleImportSetlist(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button type="button" className="chip-btn" onClick={() => setlistImportRef.current?.click()}>
              Importar Paquete (.zip)
            </button>
          </div>

          {setlists.length === 0 ? (
            <p className="tuning-changes">
              Todavía no tenés setlists. Creá uno y agregá temas desde la lista principal.
            </p>
          ) : (
            setlists.map((setlist) => (
              <div key={setlist.id} className="chord-info-card setlist-card">
                <div className="tabs-toolbar">
                  <strong>
                    {setlist.name} ({setlist.items.length} temas)
                  </strong>
                  <div className="tabs-toolbar-actions">
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => void handleExportSetlist(setlist)}
                    >
                      Exportar .zip
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => {
                        void libraryService.deleteSetlist(setlist.id).then(onRefreshLibrary);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                {setlist.items.map((item, idx) => {
                  const e = entryMap.get(item.docId);
                  return (
                    <div key={`${item.docId}-${idx}`} className="setlist-item-row">
                      <span>
                        {idx + 1}. <strong>{e?.title ?? item.docId}</strong>
                      </span>
                      <input
                        type="text"
                        className="target-select setlist-note-input"
                        placeholder="Nota de ensayo (p. ej. Capo 2)…"
                        defaultValue={item.note}
                        onBlur={(ev) => void updateSetlistItemNote(setlist, idx, ev.target.value)}
                      />
                      <div className="tabs-toolbar-actions">
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => void moveSetlistItem(setlist, idx, -1)}
                          disabled={idx === 0}
                          aria-label="Subir"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => void moveSetlistItem(setlist, idx, 1)}
                          disabled={idx === setlist.items.length - 1}
                          aria-label="Bajar"
                        >
                          ↓
                        </button>
                        {e && (
                          <button
                            type="button"
                            className="chip-btn is-active"
                            onClick={() => void openEntry(e, { setlistId: setlist.id })}
                          >
                            Tocar
                          </button>
                        )}
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => void removeSetlistItem(setlist, idx)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : view === 'history' ? (
        <div className="panel-card library-list">
          {history.length === 0 ? (
            <p className="tuning-changes">Todavía no practicaste ningún tema en esta sesión.</p>
          ) : (
            history.map((h) => {
              const entry = entryMap.get(h.docId);
              return (
                <div key={h.docId} className="library-item">
                  <div>
                    <strong>{h.title}</strong>
                    {h.artist && <span className="tuning-changes"> · {h.artist}</span>}
                    <div className="tuning-changes">
                      Última práctica: Pista {h.trackIndex + 1} · {h.speedPct}% velocidad · Compás{' '}
                      {h.barIndex + 1}
                    </div>
                  </div>
                  {entry && (
                    <button
                      type="button"
                      className="chip-btn is-active"
                      onClick={() => void openEntry(entry, { resumeHistory: h })}
                    >
                      Retomar
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="panel-card library-list">
          {filteredEntries.length === 0 ? (
            <p className="tuning-changes">No hay tablaturas que coincidan con los filtros actuales.</p>
          ) : (
            filteredEntries.map((entry) => {
              const isEditing = editingMetaId === entry.id;
              return (
                <div key={entry.id} className="library-item">
                  <div className="library-item-main">
                    {isEditing ? (
                      <div className="library-meta-edit">
                        <input
                          type="text"
                          className="target-select"
                          value={metaDraft.title}
                          onChange={(e) => setMetaDraft((p) => ({ ...p, title: e.target.value }))}
                          aria-label="Editar título"
                        />
                        <input
                          type="text"
                          className="target-select"
                          placeholder="Artista"
                          value={metaDraft.artist}
                          onChange={(e) => setMetaDraft((p) => ({ ...p, artist: e.target.value }))}
                          aria-label="Editar artista"
                        />
                        <input
                          type="text"
                          className="target-select"
                          placeholder="Etiquetas separadas por coma"
                          value={metaDraft.tags}
                          onChange={(e) => setMetaDraft((p) => ({ ...p, tags: e.target.value }))}
                          aria-label="Editar etiquetas"
                        />
                        <div className="tabs-toolbar-actions">
                          <button
                            type="button"
                            className="chip-btn is-active"
                            onClick={() => void handleSaveMetadata(entry.id)}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="chip-btn"
                            onClick={() => setEditingMetaId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="library-item-title">
                          <strong>{entry.title}</strong>
                          <span className="origin-badge">
                            {entry.originKind === 'factory'
                              ? 'Fábrica'
                              : entry.originKind === 'studio'
                                ? 'Estudio'
                                : entry.originKind === 'catalog'
                                  ? entry.sourceName ?? 'Catálogo'
                                  : 'Mi Tab'}
                          </span>
                        </div>
                        <div className="tuning-changes">
                          {entry.artist || 'Anónimo'} · {entry.bpm} BPM · {entry.timeSignature} ·{' '}
                          {entry.barCount} compases · {entry.tracks.map((t) => `${t.name} (${t.tuningLabel})`).join(' · ')}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="tabs-toolbar-actions">
                    <button
                      type="button"
                      className={`chip-btn ${entry.favorite ? 'is-active' : ''}`}
                      onClick={() => void libraryService.toggleFavorite(entry.id).then(onRefreshLibrary)}
                      aria-label={entry.favorite ? 'Quitar favorito' : 'Marcar favorito'}
                      title={entry.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    >
                      {entry.favorite ? '★' : '☆'}
                    </button>

                    {setlists.length > 0 && (
                      <select
                        className="target-select tabs-theme-select"
                        defaultValue=""
                        aria-label="Agregar a setlist"
                        onChange={(e) => {
                          if (e.target.value) void addEntryToSetlist(entry.id, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="">+ Setlist…</option>
                        {setlists.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {entry.originKind === 'catalog' && (
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          void libraryService
                            .cloneEntryToUserLibrary(entry.id)
                            .then(() => {
                              setStatusMsg(`«${entry.title}» clonado a Mis Tabs.`);
                              return onRefreshLibrary();
                            })
                        }
                      >
                        Clonar a Mis Tabs
                      </button>
                    )}

                    {entry.originKind !== 'factory' && entry.originKind !== 'catalog' && !isEditing && (
                      <>
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => {
                            setEditingMetaId(entry.id);
                            setMetaDraft({
                              title: entry.title,
                              artist: entry.artist,
                              tags: entry.tags.join(', '),
                            });
                          }}
                        >
                          Metadatos
                        </button>
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => void libraryService.deleteEntry(entry.id).then(onRefreshLibrary)}
                        >
                          Borrar
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="chip-btn is-active"
                      onClick={() => void openEntry(entry)}
                    >
                      Practicar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
