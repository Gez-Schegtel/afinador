// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Inspector multipista e instrumento del Modo Edición (Spec 013).
 * Permite agregar, duplicar, reordenar y eliminar pistas, configurar programa General MIDI,
 * modo percusión, 4–8 cuerdas con catálogo Spec 002 / afinación cuerda por cuerda y Capo.
 */

import {
  formatPitchName,
  parseSpelledNote,
  spelledToMidi,
  defaultSharpPitchName,
  spellMidi,
  type SpelledNote,
} from '../../core/music/spelling';
import {
  findTuning,
  resolveTuningSelection,
  type InstrumentId,
  type TuningDefinition,
} from '../../core/music/tunings';
import type { ScoreTrack, TrackFamily } from '../../core/tabs/model';
import { TuningPicker } from '../TuningPicker';

export const GM_PROGRAM_PRESETS: ReadonlyArray<{ program: number; label: string }> = [
  { program: 24, label: '24 · Guitarra Acústica Nylon' },
  { program: 25, label: '25 · Guitarra Acústica Acero' },
  { program: 26, label: '26 · Guitarra Jazz Limpia' },
  { program: 27, label: '27 · Guitarra Eléctrica Clean' },
  { program: 28, label: '28 · Guitarra Mute' },
  { program: 29, label: '29 · Guitarra Overdrive' },
  { program: 30, label: '30 · Guitarra Distorsión / Fuzz' },
  { program: 33, label: '33 · Bajo Eléctrico Dedos' },
  { program: 34, label: '34 · Bajo Eléctrico Púa' },
  { program: 35, label: '35 · Bajo Fretless' },
  { program: 0, label: '0 · Piano Acústico' },
  { program: 18, label: '18 · Órgano Rock' },
  { program: 89, label: '89 · Pad Ambiental' },
];

interface TrackInspectorProps {
  tracks: readonly ScoreTrack[];
  activeTrackIndex: number;
  onSelectTrack: (idx: number) => void;
  onAddTrack: (opts: { name: string; family: TrackFamily }) => void;
  onDuplicateTrack: (idx: number) => void;
  onRemoveTrack: (idx: number) => void;
  onReorderTrack: (fromIdx: number, toIdx: number) => void;
  onUpdateTrack: (
    idx: number,
    patch: Partial<
      Pick<ScoreTrack, 'name' | 'family' | 'midiProgram' | 'isPercussion' | 'tuning' | 'capo'>
    >
  ) => void;
}

function guessCatalogSelection(tuning: readonly SpelledNote[]): {
  instrument: InstrumentId;
  tuning: TuningDefinition;
} {
  const defaultInst: InstrumentId =
    tuning.length === 4
      ? 'bass4'
      : tuning.length === 5
        ? 'bass5'
        : tuning.length === 7
          ? 'guitar7'
          : tuning.length === 8
            ? 'guitar8'
            : 'guitar6';
  return resolveTuningSelection(defaultInst, null);
}

export function TrackInspector({
  tracks,
  activeTrackIndex,
  onSelectTrack,
  onAddTrack,
  onDuplicateTrack,
  onRemoveTrack,
  onReorderTrack,
  onUpdateTrack,
}: TrackInspectorProps) {
  const active = tracks[activeTrackIndex] ?? tracks[0];
  if (!active) return null;

  const catalogGuess = guessCatalogSelection(active.tuning);

  const handleStringCountChange = (count: number) => {
    const nextCount = Math.max(4, Math.min(8, count));
    const cur = [...active.tuning];
    while (cur.length < nextCount) {
      cur.unshift(parseSpelledNote('B1'));
    }
    if (cur.length > nextCount) {
      cur.splice(0, cur.length - nextCount);
    }
    onUpdateTrack(activeTrackIndex, { tuning: cur });
  };

  const handleShiftStringNote = (strIdx: number, delta: number) => {
    const target = active.tuning[strIdx];
    if (!target) return;
    const nextMidi = Math.max(21, Math.min(84, spelledToMidi(target) + delta));
    const updatedNote = spellMidi(nextMidi, defaultSharpPitchName(nextMidi));
    const nextTuning = active.tuning.map((n, i) => (i === strIdx ? updatedNote : n));
    onUpdateTrack(activeTrackIndex, { tuning: nextTuning });
  };

  return (
    <section className="panel-card editor-inspector" aria-label="Gestor e Inspector de Pistas">
      <div className="tabs-toolbar">
        <strong>Pistas e Inspector Multipista ({tracks.length})</strong>
        <div className="tabs-toolbar-actions">
          <button
            type="button"
            className="chip-btn"
            onClick={() => onAddTrack({ name: `Guitarra ${tracks.length + 1}`, family: 'guitar' })}
          >
            + Guitarra
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => onAddTrack({ name: `Bajo`, family: 'bass' })}
          >
            + Bajo
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => onAddTrack({ name: 'Batería', family: 'drums' })}
          >
            + Batería
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => onAddTrack({ name: 'Teclado', family: 'keyboard' })}
          >
            + Teclado
          </button>
        </div>
      </div>

      {/* Lista de pistas con selección, duplicar, reordenar y quitar */}
      <div className="inspector-tracks-list">
        {tracks.map((track, idx) => (
          <div
            key={track.id}
            className={`inspector-track-chip ${idx === activeTrackIndex ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className={`chip-btn ${idx === activeTrackIndex ? 'is-active' : ''}`}
              onClick={() => onSelectTrack(idx)}
            >
              {idx + 1}. {track.name} ({track.isPercussion ? 'Percusión' : track.family})
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={idx === 0}
              onClick={() => onReorderTrack(idx, idx - 1)}
              aria-label={`Subir ${track.name}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={idx === tracks.length - 1}
              onClick={() => onReorderTrack(idx, idx + 1)}
              aria-label={`Bajar ${track.name}`}
            >
              ↓
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => onDuplicateTrack(idx)}
              title="Duplicar pista"
            >
              Dupl.
            </button>
            {tracks.length > 1 && (
              <button
                type="button"
                className="chip-btn"
                onClick={() => onRemoveTrack(idx)}
                title="Eliminar pista"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Detalle de la pista activa */}
      <div className="practice-drawer-grid">
        <label className="gym-field">
          <span>Nombre de pista</span>
          <input
            type="text"
            className="target-select"
            value={active.name}
            onChange={(e) => onUpdateTrack(activeTrackIndex, { name: e.target.value })}
          />
        </label>

        <label className="gym-field">
          <span>Instrumento / Programa MIDI</span>
          <select
            className="target-select"
            value={active.isPercussion ? -1 : active.midiProgram}
            onChange={(e) => {
              const prog = Number(e.target.value);
              if (prog === -1) {
                onUpdateTrack(activeTrackIndex, {
                  isPercussion: true,
                  family: 'drums',
                  midiProgram: 0,
                });
              } else {
                const family: TrackFamily =
                  prog >= 32 && prog <= 39
                    ? 'bass'
                    : prog <= 23 || prog >= 80
                      ? 'keyboard'
                      : 'guitar';
                onUpdateTrack(activeTrackIndex, {
                  isPercussion: false,
                  family,
                  midiProgram: prog,
                });
              }
            }}
          >
            <option value={-1}>Kit de Batería / Percusión GM</option>
            {GM_PROGRAM_PRESETS.map((p) => (
              <option key={p.program} value={p.program}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!active.isPercussion && active.family !== 'keyboard' && (
        <div className="inspector-tuning-box">
          <div className="library-filter-row">
            <label className="tabs-theme-label">
              <span>Cuerdas</span>
              <select
                className="target-select tabs-theme-select"
                value={active.tuning.length}
                onChange={(e) => handleStringCountChange(Number(e.target.value))}
              >
                {[4, 5, 6, 7, 8].map((c) => (
                  <option key={c} value={c}>
                    {c} cuerdas
                  </option>
                ))}
              </select>
            </label>

            <label className="tabs-theme-label">
              <span>Capo</span>
              <select
                className="target-select tabs-theme-select"
                value={active.capo}
                onChange={(e) =>
                  onUpdateTrack(activeTrackIndex, { capo: Number(e.target.value) })
                }
              >
                {Array.from({ length: 13 }, (_, c) => (
                  <option key={c} value={c}>
                    {c === 0 ? 'Sin capo (0)' : `Traste ${c}`}
                  </option>
                ))}
              </select>
            </label>

            <TuningPicker
              instrumentId={catalogGuess.instrument}
              tuningId={catalogGuess.tuning.id}
              onChange={(inst, tid) => {
                const def = findTuning(tid);
                if (!def) return;
                onUpdateTrack(activeTrackIndex, {
                  family: inst.startsWith('bass') ? 'bass' : 'guitar',
                  tuning: [...def.notes],
                });
              }}
            />
          </div>

          <div className="guided-strings-row">
            {active.tuning.map((note, si) => (
              <div key={si} className="saved-loop-pill">
                <span className="origin-badge">
                  {active.tuning.length - si}ª: {formatPitchName(note)}
                  {note.octave}
                </span>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => handleShiftStringNote(si, -1)}
                  aria-label={`Bajar cuerda ${active.tuning.length - si}`}
                >
                  −
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => handleShiftStringNote(si, 1)}
                  aria-label={`Subir cuerda ${active.tuning.length - si}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
