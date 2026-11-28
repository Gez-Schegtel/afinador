// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Gestor de Catálogos Externos Enchufables (`CatalogManifestV1`), importación 100% offline
 * vía `.zip` y Exportador de Catálogo Propio (Spec 011).
 * Invariante: cero peticiones de red automáticas; toda descarga ocurre solo ante acción explícita.
 */

import { useRef, useState } from 'react';
import { buildCatalogPackageZip } from '../../core/tabs/catalog-export';
import { isValidHttpsUrl } from '../../core/tabs/catalog-manifest';
import type {
  CatalogSourceRecord,
  TabIndexEntry,
  TabsLibraryService,
} from '../../storage/tabs-db';

interface CatalogsManagerProps {
  libraryService: TabsLibraryService;
  sources: readonly CatalogSourceRecord[];
  entries: readonly TabIndexEntry[];
  onRefresh: () => Promise<void>;
}

function downloadZip(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CatalogsManager({
  libraryService,
  sources,
  entries,
  onRefresh,
}: CatalogsManagerProps) {
  const [urlInput, setUrlInput] = useState('');
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [exportTitle, setExportTitle] = useState('Mi Repertorio Endurend');
  const [exportMaintainer, setExportMaintainer] = useState('Músico Endurend');
  const [exportBaseUrl, setExportBaseUrl] = useState('');
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(() => new Set());

  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const exportableEntries = entries.filter((e) => e.originKind !== 'catalog');

  const handleConnectHttps = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const trimmed = urlInput.trim();
    if (!isValidHttpsUrl(trimmed)) {
      setErrorMsg('Solo se permiten direcciones seguras con protocolo https://');
      return;
    }
    setBusyMsg('Consultando manifiesto catalog.json…');
    try {
      const record = await libraryService.fetchRemoteCatalog(trimmed);
      setUrlInput('');
      await onRefresh();
      setStatusMsg(
        `Catálogo conectado: «${record.manifest.catalog.name}» (${record.manifest.songs.length} temas).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo conectar el catálogo.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleImportZip = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyMsg(`Importando paquete offline ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = await libraryService.importCatalogZipPackage(bytes);
      await onRefresh();
      setStatusMsg(
        `Catálogo offline «${record.manifest.catalog.name}» importado (${record.manifest.songs.length} temas cacheados).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo leer el paquete .zip.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleDownloadOfflineAll = async (src: CatalogSourceRecord) => {
    setErrorMsg(null);
    setStatusMsg(null);
    const total = src.manifest.songs.length;
    setBusyMsg(`Descargando copia offline (0/${total})…`);
    try {
      const { downloaded, failed } = await libraryService.downloadEntireCatalogOffline(
        src.id,
        (done, t) => setBusyMsg(`Descargando copia offline (${done}/${t})…`)
      );
      await onRefresh();
      setStatusMsg(`Cacheado offline de «${src.manifest.catalog.name}»: ${downloaded} listos, ${failed} con error.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error descargando copia offline.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleExportOwnCatalog = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const chosen = exportableEntries.filter((e) => selectedExportIds.has(e.id));
    if (chosen.length === 0) {
      setErrorMsg('Marcá al menos una pieza de tu biblioteca para exportar.');
      return;
    }
    const baseTrimmed = exportBaseUrl.trim();
    if (baseTrimmed && !isValidHttpsUrl(baseTrimmed)) {
      setErrorMsg('Si indicás Base URL pública, debe comenzar con https://');
      return;
    }

    setBusyMsg('Empaquetando catálogo CatalogManifestV1 (.zip)…');
    try {
      const payloads = await Promise.all(chosen.map((e) => libraryService.getDocument(e.id)));
      const items = payloads
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          document: p.document,
          chordProText: p.chordProText,
        }));
      const { zipBytes } = buildCatalogPackageZip({
        catalog: {
          id:
            exportTitle
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'mi-catalogo',
          name: exportTitle.trim() || 'Catálogo Endurend',
          description: 'Catálogo generado con Endurend Musical Gadgets',
          maintainer: exportMaintainer.trim() || 'Autor local',
          homepage: baseTrimmed || '',
          license: 'GPL-3.0-or-later',
          baseUrl: baseTrimmed,
        },
        items,
      });
      downloadZip(zipBytes, `${exportTitle.trim().replace(/[^\w-]+/g, '_') || 'catalogo'}.zip`);
      setStatusMsg(`Catálogo exportado (${items.length} temas con catalog.json v1.0).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al exportar el catálogo.');
    } finally {
      setBusyMsg(null);
    }
  };

  return (
    <div className="tabs-shell">
      <section className="panel-card catalogs-connect-card">
        <div className="target-header">
          <span className="calibration-label">CATÁLOGOS EXTERNOS (CatalogManifestV1)</span>
          <span className="tuning-changes">Sin conexiones automáticas · Solo HTTPS manual o .zip local</span>
        </div>

        <div className="library-filter-row">
          <input
            type="url"
            className="target-select library-search"
            placeholder="https://usuario.github.io/mi-catalogo/catalog.json"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            aria-label="URL HTTPS de catalog.json"
          />
          <button
            type="button"
            className="chip-btn is-active"
            disabled={!urlInput.trim() || Boolean(busyMsg)}
            onClick={() => void handleConnectHttps()}
          >
            Conectar HTTPS
          </button>

          <input
            ref={zipInputRef}
            type="file"
            hidden
            accept=".zip"
            onChange={(e) => {
              void handleImportZip(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="chip-btn"
            disabled={Boolean(busyMsg)}
            onClick={() => zipInputRef.current?.click()}
          >
            Importar paquete .zip offline
          </button>
        </div>

        {busyMsg && <p className="info-banner tabs-subroute-note">{busyMsg}</p>}
        {errorMsg && (
          <div className="error-banner" role="alert">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <p className="info-banner tabs-subroute-note" role="status">
            {statusMsg}
          </p>
        )}
      </section>

      <section className="panel-card library-list">
        <strong>Fuentes conectadas ({sources.length})</strong>
        {sources.length === 0 ? (
          <p className="tuning-changes">
            La app incluye cero catálogos remotos por defecto para preservar tu privacidad y uso 100% offline.
            Conectá una URL HTTPS propia o importá un paquete .zip cuando lo necesites.
          </p>
        ) : (
          <div className="catalogs-grid">
            {sources.map((src) => (
              <article key={src.id} className="chord-info-card catalog-source-card">
                <div className="tabs-toolbar">
                  <div>
                    <strong>{src.manifest.catalog.name}</strong>{' '}
                    <span className="origin-badge">{src.kind === 'zip' ? 'ZIP Offline' : 'HTTPS'}</span>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={src.enabled}
                      onChange={(e) =>
                        void libraryService.toggleCatalogSource(src.id, e.target.checked).then(onRefresh)
                      }
                    />
                    <span>Activo</span>
                  </label>
                </div>
                <p className="tuning-changes">
                  {src.manifest.catalog.description || 'Sin descripción'} · Mantenedor:{' '}
                  {src.manifest.catalog.maintainer} · Licencia: {src.manifest.catalog.license}
                </p>
                <p className="tuning-changes">
                  {src.manifest.songs.length} temas · {src.cachedSongIds.length} cacheados offline
                </p>
                <div className="tabs-toolbar-actions">
                  {src.sourceUrl && (
                    <>
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={Boolean(busyMsg)}
                        onClick={() =>
                          void libraryService
                            .fetchRemoteCatalog(src.sourceUrl!)
                            .then(onRefresh)
                            .catch((e) => setErrorMsg(e instanceof Error ? e.message : 'Error'))
                        }
                      >
                        Actualizar índice
                      </button>
                      <button
                        type="button"
                        className="chip-btn is-active"
                        disabled={Boolean(busyMsg)}
                        onClick={() => void handleDownloadOfflineAll(src)}
                      >
                        Descargar todo offline
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() =>
                      void libraryService.deleteCatalogSource(src.id).then(onRefresh)
                    }
                  >
                    Eliminar fuente
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card library-list">
        <div className="target-header">
          <strong>Generar / Exportar Catálogo Propio (.zip)</strong>
          <span className="tuning-changes">Listo para GitHub Pages o compartir offline</span>
        </div>
        <div className="gym-row-2">
          <label className="gym-field">
            <span>Nombre del catálogo</span>
            <input
              type="text"
              className="target-select"
              value={exportTitle}
              onChange={(e) => setExportTitle(e.target.value)}
            />
          </label>
          <label className="gym-field">
            <span>Autor / Mantenedor</span>
            <input
              type="text"
              className="target-select"
              value={exportMaintainer}
              onChange={(e) => setExportMaintainer(e.target.value)}
            />
          </label>
        </div>
        <label className="gym-field">
          <span>Base URL HTTPS opcional (vacío para uso local / relativo)</span>
          <input
            type="url"
            className="target-select"
            placeholder="https://usuario.github.io/repertorio/"
            value={exportBaseUrl}
            onChange={(e) => setExportBaseUrl(e.target.value)}
          />
        </label>

        <div className="preset-chips">
          {exportableEntries.slice(0, 24).map((e) => {
            const picked = selectedExportIds.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                className={`chip-btn ${picked ? 'is-active' : ''}`}
                onClick={() =>
                  setSelectedExportIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.id)) next.delete(e.id);
                    else next.add(e.id);
                    return next;
                  })
                }
              >
                {picked ? '✓ ' : ''}
                {e.title}
              </button>
            );
          })}
        </div>

        <div className="tabs-toolbar-actions">
          <button
            type="button"
            className="chip-btn is-active"
            disabled={Boolean(busyMsg)}
            onClick={() => void handleExportOwnCatalog()}
          >
            Exportar paquete .zip ({selectedExportIds.size} seleccionados)
          </button>
        </div>
      </section>
    </div>
  );
}
