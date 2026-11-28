// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Historial de revisiones locales y Comparador A/B (`DiffViewer`, Spec 014).
 * Señala cambios globales y `(trackId, barIndex)` modificados y permite restaurar
 * cualquier revisión mediante el Command Bus reversible.
 */

import { useMemo, useState } from 'react';
import type { ScoreDocument } from '../../core/tabs/model';
import { diffScoreDocuments } from '../../core/tabs/score-diff';
import type { ScoreRevisionRecord } from '../../storage/tabs-db';

interface DiffViewerProps {
  currentDoc: ScoreDocument;
  revisions: readonly ScoreRevisionRecord[];
  onSaveSnapshot: (label: string) => Promise<void>;
  onDeleteRevision: (revId: string) => Promise<void>;
  onRestoreRevision: (snapshot: ScoreDocument, label: string) => void;
  onAuditionBar?: (barIndex: number) => void;
}

export function DiffViewer({
  currentDoc,
  revisions,
  onSaveSnapshot,
  onDeleteRevision,
  onRestoreRevision,
  onAuditionBar,
}: DiffViewerProps) {
  const [label, setLabel] = useState('');
  const [leftId, setLeftId] = useState<string>('current');
  const [rightId, setRightId] = useState<string>(() => revisions[0]?.id ?? 'current');

  const resolveDoc = (id: string): ScoreDocument => {
    if (id === 'current') return currentDoc;
    return revisions.find((r) => r.id === id)?.document ?? currentDoc;
  };

  const docA = resolveDoc(leftId);
  const docB = resolveDoc(rightId);
  const diff = useMemo(() => diffScoreDocuments(docA, docB), [docA, docB]);

  return (
    <section className="panel-card diff-viewer-panel" aria-label="Revisiones y Comparador A/B">
      <div className="tabs-toolbar">
        <strong>Historial de Revisiones Local y Diff A/B</strong>
        <div className="library-filter-row">
          <input
            type="text"
            className="target-select"
            placeholder="Nota del snapshot (ej. Corregido solo 45–52)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="button"
            className="chip-btn is-active"
            onClick={() => {
              void onSaveSnapshot(label).then(() => setLabel(''));
            }}
          >
            Guardar Snapshot
          </button>
        </div>
      </div>

      {revisions.length === 0 ? (
        <p className="tuning-changes">
          Todavía no guardaste snapshots para esta partitura. Guardá una revisión antes de probar cambios grandes.
        </p>
      ) : (
        <>
          <div className="gym-row-2">
            <label className="gym-field">
              <span>Versión A</span>
              <select
                className="target-select"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
              >
                <option value="current">Estado Actual ({currentDoc.title})</option>
                {revisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.createdAt.slice(0, 16).replace('T', ' ')})
                  </option>
                ))}
              </select>
            </label>

            <label className="gym-field">
              <span>Versión B</span>
              <select
                className="target-select"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
              >
                <option value="current">Estado Actual ({currentDoc.title})</option>
                {revisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.createdAt.slice(0, 16).replace('T', ' ')})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="chord-info-card">
            <strong>
              {diff.identical
                ? 'Las versiones A y B son idénticas ✓'
                : `${diff.globalChanges.length} cambio(s) globales · ${diff.modifiedBars.length} compás(es) distintos (de ${diff.totalComparedBars})`}
            </strong>
            {diff.globalChanges.length > 0 && (
              <ul className="batch-error-list">
                {diff.globalChanges.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            )}
            {diff.modifiedBars.length > 0 && (
              <div className="preset-chips">
                {diff.modifiedBars.map((b) => (
                  <button
                    key={`${b.trackId}-${b.barIndex}`}
                    type="button"
                    className="chip-btn"
                    onClick={() => onAuditionBar?.(b.barIndex)}
                    title={`Audicionar compás ${b.barIndex + 1}`}
                  >
                    {b.trackName} · Compás {b.barIndex + 1} ({b.summary})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="library-list">
            {revisions.map((r) => (
              <div key={r.id} className="library-item">
                <div>
                  <strong>{r.label}</strong>
                  <div className="tuning-changes">{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <div className="tabs-toolbar-actions">
                  <button
                    type="button"
                    className="chip-btn is-active"
                    onClick={() => onRestoreRevision(r.document, r.label)}
                  >
                    Restaurar (Reversible)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => void onDeleteRevision(r.id)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
