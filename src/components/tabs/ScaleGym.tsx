// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import {
  DICTIONARY_ROOTS,
  chordPitchClasses,
  findQuality,
} from '../../core/music/chords';
import {
  SCALES_CATALOG,
  SCALE_CATEGORY_LABELS,
  SCALE_CATEGORY_ORDER,
  findScale,
  spellScale,
  type ScaleCategory,
} from '../../core/music/scales';
import {
  defaultSharpPitchName,
  formatPitchName,
  mod12,
  pitchClassOf,
  spelledToMidi,
} from '../../core/music/spelling';
import {
  findTuning,
  resolveTuningSelection,
  stringLabel,
  type InstrumentId,
} from '../../core/music/tunings';
import { type ScoreDocument } from '../../core/tabs/model';
import {
  buildFretboardScaleMap,
  computeScaleFingering,
  FINGERING_SYSTEM_LABELS,
  type FingeringSystem,
} from '../../core/tabs/scale-fingering';
import {
  DRUM_BACKING_LABELS,
  generateScaleExercise,
  MELODIC_PATTERN_LABELS,
  SCALE_ARTICULATION_LABELS,
  SCALE_RHYTHM_LABELS,
  type DrumBackingStyle,
  type MelodicPatternId,
  type ScaleArticulation,
  type ScaleRhythmFigure,
} from '../../core/tabs/scale-generator';
import { TuningPicker } from '../TuningPicker';

const STORAGE_SCALE_GYM_KEY = 'endurend_scale_gym';

interface ScaleGymState {
  category: ScaleCategory;
  scaleId: string;
  rootPc: number;
  instrument: InstrumentId;
  tuningId: string;
  system: FingeringSystem;
  position: number;
  stringIndex: number;
  sweepStrings: 3 | 4 | 5;
  pattern: MelodicPatternId;
  rhythm: ScaleRhythmFigure;
  articulation: ScaleArticulation;
  drumStyle: DrumBackingStyle;
  modalDrone: boolean;
  bpm: number;
}

const DEFAULT_GYM_STATE: ScaleGymState = {
  category: 'pentatonic-exotic',
  scaleId: 'pentatonic-minor',
  rootPc: 9, // A
  instrument: 'guitar6',
  tuningId: 'guitar6-standard',
  system: 'caged',
  position: 1,
  stringIndex: 0,
  sweepStrings: 5,
  pattern: 'asc-desc',
  rhythm: 'eighth',
  articulation: 'alternate',
  drumStyle: 'rock',
  modalDrone: true,
  bpm: 100,
};

function loadInitialGymState(): ScaleGymState {
  try {
    const raw = localStorage.getItem(STORAGE_SCALE_GYM_KEY);
    if (!raw) return DEFAULT_GYM_STATE;
    const parsed = JSON.parse(raw) as Partial<ScaleGymState>;
    const resolved = resolveTuningSelection(parsed.instrument, parsed.tuningId);
    const scale = findScale(parsed.scaleId) ?? findScale(DEFAULT_GYM_STATE.scaleId)!;
    return {
      ...DEFAULT_GYM_STATE,
      ...parsed,
      scaleId: scale.id,
      category: scale.category,
      instrument: resolved.instrument,
      tuningId: resolved.tuning.id,
      rootPc: typeof parsed.rootPc === 'number' ? mod12(parsed.rootPc) : DEFAULT_GYM_STATE.rootPc,
      bpm:
        typeof parsed.bpm === 'number' && Number.isFinite(parsed.bpm)
          ? Math.max(40, Math.min(240, Math.round(parsed.bpm)))
          : DEFAULT_GYM_STATE.bpm,
    };
  } catch {
    return DEFAULT_GYM_STATE;
  }
}

interface ScaleGymProps {
  onPracticeDocument: (doc: ScoreDocument) => void;
  onSaveDocument: (doc: ScoreDocument) => Promise<void>;
  onEditDocument?: (doc: ScoreDocument) => void;
}

const ROOTS_BY_PC = Array.from({ length: 12 }, (_, pc) => {
  const candidates = DICTIONARY_ROOTS.filter((r) => pitchClassOf(r) === pc);
  return {
    pc,
    label: candidates.map(formatPitchName).join(' / '),
    preferred: candidates[0] ?? defaultSharpPitchName(pc),
  };
});

export function ScaleGym({ onPracticeDocument, onSaveDocument, onEditDocument }: ScaleGymProps) {
  const [state, setState] = useState<ScaleGymState>(loadInitialGymState);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SCALE_GYM_KEY, JSON.stringify(state));
    } catch {
      // Ignorar si almacenamiento restringido
    }
  }, [state]);

  const tuningDef = findTuning(state.tuningId) ?? resolveTuningSelection(state.instrument, state.tuningId).tuning;
  const scaleDef = findScale(state.scaleId) ?? SCALES_CATALOG[0]!;
  const rootPitch = ROOTS_BY_PC[state.rootPc]!.preferred;
  const spelledNotes = useMemo(() => spellScale(rootPitch, scaleDef), [rootPitch, scaleDef]);

  const activeSequence = useMemo(
    () =>
      computeScaleFingering({
        tuning: tuningDef.notes,
        root: rootPitch,
        scale: scaleDef,
        system: state.system,
        position: state.position,
        stringIndex: state.stringIndex,
        sweepStrings: state.sweepStrings,
      }),
    [tuningDef, rootPitch, scaleDef, state.system, state.position, state.stringIndex, state.sweepStrings]
  );

  const fullMap = useMemo(
    () => buildFretboardScaleMap(tuningDef.notes, rootPitch, scaleDef, 15),
    [tuningDef, rootPitch, scaleDef]
  );

  const activeKeySet = useMemo(() => {
    const s = new Set<string>();
    activeSequence.forEach((n) => s.add(`${n.stringIndex}:${n.fret}`));
    return s;
  }, [activeSequence]);

  const chordPcs = useMemo(() => {
    const q = findQuality(scaleDef.droneQualityId);
    return q ? new Set(chordPitchClasses(rootPitch, q)) : new Set<number>();
  }, [scaleDef, rootPitch]);

  const buildCurrentDoc = () =>
    generateScaleExercise({
      id: `gym-${scaleDef.id}-${formatPitchName(rootPitch)}-${state.system}-${Date.now().toString(36)}`,
      title: `${scaleDef.name} en ${formatPitchName(rootPitch)}`,
      subtitle: `${FINGERING_SYSTEM_LABELS[state.system]} · Pos. ${state.position} · ${tuningDef.name}`,
      bpm: state.bpm,
      tuning: tuningDef.notes,
      instrumentFamily: tuningDef.instrument.startsWith('bass') ? 'bass' : 'guitar',
      root: rootPitch,
      scale: scaleDef,
      system: state.system,
      position: state.position,
      stringIndex: state.stringIndex,
      sweepStrings: state.sweepStrings,
      pattern: state.pattern,
      rhythm: state.rhythm,
      articulation: state.articulation,
      drumStyle: state.drumStyle,
      modalDrone: state.modalDrone,
      origin: { kind: 'studio', sourceName: 'Gimnasio de Escalas' },
    });

  const handleSave = async () => {
    const doc = buildCurrentDoc();
    await onSaveDocument(doc);
    setStatusMsg(`«${doc.title}» guardado en Mi Biblioteca.`);
  };

  // Geometría SVG horizontal compacta del diapasón (cuerdas 0..N-1 abajo -> arriba, trastes 0..15 izq -> der)
  const strCount = tuningDef.notes.length;
  const maxFret = 15;
  const fretW = 34;
  const strH = 22;
  const padL = 36;
  const padT = 18;
  const width = padL + (maxFret + 1) * fretW + 12;
  const height = padT + (strCount - 1) * strH + 34;
  const markers = new Set([3, 5, 7, 9, 12, 15]);

  return (
    <div className="gym-layout">
      <div className="panel-card gym-controls">
        <div className="target-header">
          <span className="calibration-label">GIMNASIO DE ESCALAS Y ARPEGIOS</span>
          <span className="tuning-changes">Generador determinístico (PPQ = 960)</span>
        </div>

        <label className="gym-field">
          <span>Categoría</span>
          <select
            className="target-select"
            value={state.category}
            onChange={(e) => {
              const category = e.target.value as ScaleCategory;
              const first = SCALES_CATALOG.find((s) => s.category === category);
              setState((prev) => ({
                ...prev,
                category,
                scaleId: first ? first.id : prev.scaleId,
              }));
            }}
          >
            {SCALE_CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {SCALE_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>

        <div className="gym-row-2">
          <label className="gym-field">
            <span>Escala / Arpegio</span>
            <select
              className="target-select"
              value={state.scaleId}
              onChange={(e) => setState((prev) => ({ ...prev, scaleId: e.target.value }))}
            >
              {SCALES_CATALOG.filter((s) => s.category === state.category).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="gym-field">
            <span>Tonalidad</span>
            <select
              className="target-select"
              value={state.rootPc}
              onChange={(e) => setState((prev) => ({ ...prev, rootPc: Number(e.target.value) }))}
            >
              {ROOTS_BY_PC.map((r) => (
                <option key={r.pc} value={r.pc}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <TuningPicker
          instrumentId={state.instrument}
          tuningId={state.tuningId}
          onChange={(instrument, tuningId) =>
            setState((prev) => ({ ...prev, instrument, tuningId, stringIndex: 0 }))
          }
        />

        <div className="gym-row-2">
          <label className="gym-field">
            <span>Digitación</span>
            <select
              className="target-select"
              value={state.system}
              onChange={(e) =>
                setState((prev) => ({ ...prev, system: e.target.value as FingeringSystem }))
              }
            >
              {(Object.keys(FINGERING_SYSTEM_LABELS) as FingeringSystem[]).map((sys) => (
                <option key={sys} value={sys}>
                  {FINGERING_SYSTEM_LABELS[sys]}
                </option>
              ))}
            </select>
          </label>

          {state.system === 'single-string' ? (
            <label className="gym-field">
              <span>Cuerda</span>
              <select
                className="target-select"
                value={state.stringIndex}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, stringIndex: Number(e.target.value) }))
                }
              >
                {tuningDef.notes.map((_, idx) => (
                  <option key={idx} value={idx}>
                    {stringLabel(tuningDef, idx)} cuerda
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="gym-field">
              <span>Posición</span>
              <select
                className="target-select"
                value={state.position}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, position: Number(e.target.value) }))
                }
              >
                {Array.from({ length: state.system === '3nps' ? 7 : 5 }, (_, i) => i + 1).map(
                  (pos) => (
                    <option key={pos} value={pos}>
                      Posición {pos}
                    </option>
                  )
                )}
              </select>
            </label>
          )}
        </div>

        <div className="gym-row-2">
          <label className="gym-field">
            <span>Patrón melódico</span>
            <select
              className="target-select"
              value={state.pattern}
              onChange={(e) =>
                setState((prev) => ({ ...prev, pattern: e.target.value as MelodicPatternId }))
              }
            >
              {(Object.keys(MELODIC_PATTERN_LABELS) as MelodicPatternId[]).map((pat) => (
                <option key={pat} value={pat}>
                  {MELODIC_PATTERN_LABELS[pat]}
                </option>
              ))}
            </select>
          </label>

          <label className="gym-field">
            <span>Figura rítmica</span>
            <select
              className="target-select"
              value={state.rhythm}
              onChange={(e) =>
                setState((prev) => ({ ...prev, rhythm: e.target.value as ScaleRhythmFigure }))
              }
            >
              {(Object.keys(SCALE_RHYTHM_LABELS) as ScaleRhythmFigure[]).map((fig) => (
                <option key={fig} value={fig}>
                  {SCALE_RHYTHM_LABELS[fig]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="gym-row-2">
          <label className="gym-field">
            <span>Articulación</span>
            <select
              className="target-select"
              value={state.articulation}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  articulation: e.target.value as ScaleArticulation,
                }))
              }
            >
              {(Object.keys(SCALE_ARTICULATION_LABELS) as ScaleArticulation[]).map((art) => (
                <option key={art} value={art}>
                  {SCALE_ARTICULATION_LABELS[art]}
                </option>
              ))}
            </select>
          </label>

          <label className="gym-field">
            <span>Tempo ({state.bpm} BPM)</span>
            <input
              type="range"
              min={40}
              max={240}
              step={5}
              value={state.bpm}
              onChange={(e) => setState((prev) => ({ ...prev, bpm: Number(e.target.value) }))}
            />
          </label>
        </div>

        <div className="gym-row-2">
          <label className="gym-field">
            <span>Batería</span>
            <select
              className="target-select"
              value={state.drumStyle}
              onChange={(e) =>
                setState((prev) => ({ ...prev, drumStyle: e.target.value as DrumBackingStyle }))
              }
            >
              {(Object.keys(DRUM_BACKING_LABELS) as DrumBackingStyle[]).map((ds) => (
                <option key={ds} value={ds}>
                  {DRUM_BACKING_LABELS[ds]}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={state.modalDrone}
              onChange={(e) => setState((prev) => ({ ...prev, modalDrone: e.target.checked }))}
            />
            <span>Acorde pedal / bajo modal</span>
          </label>
        </div>

        <div className="gym-actions">
          <button
            type="button"
            className="chip-btn is-active"
            onClick={() => onPracticeDocument(buildCurrentDoc())}
          >
            Practicar ahora
          </button>
          <button type="button" className="chip-btn" onClick={() => void handleSave()}>
            Guardar en Mi Biblioteca
          </button>
          {onEditDocument && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => onEditDocument(buildCurrentDoc())}
            >
              Abrir en Editor
            </button>
          )}
        </div>

        {statusMsg && (
          <p className="info-banner tabs-subroute-note" role="status">
            {statusMsg}
          </p>
        )}
      </div>

      <div className="panel-card gym-preview">
        <div className="chord-info-card">
          <div className="gym-theory-head">
            <strong className="chord-name">
              {scaleDef.name} en {formatPitchName(rootPitch)}
            </strong>
            <span className="chord-alt">{scaleDef.description}</span>
          </div>
          <dl className="chord-facts">
            <div>
              <dt>Fórmula de grados</dt>
              <dd>{scaleDef.degreeLabels.join('  ')}</dd>
            </div>
            <div>
              <dt>Notas escritas</dt>
              <dd>{spelledNotes.map(formatPitchName).join('  ')}</dd>
            </div>
          </dl>
          {scaleDef.characteristicDegrees.length > 0 && (
            <p className="chord-alt">
              Nota(s) característica(s): <strong>{scaleDef.characteristicDegrees.join(', ')}</strong>
            </p>
          )}
        </div>

        <div className="gym-legend">
          <span className="legend-pill is-root">1 Tónica</span>
          <span className="legend-pill is-chord">Acorde base</span>
          <span className="legend-pill is-char">Característica modal</span>
          <span className="legend-pill is-scale">Posición elegida (opaco = mástil)</span>
        </div>

        <div className="score-viewport">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="scale-fretboard-svg"
            role="img"
            aria-label={`Mapa de ${scaleDef.name} en ${formatPitchName(rootPitch)}`}
          >
            {/* Cejuela y trastes */}
            <line
              x1={padL + fretW}
              y1={padT}
              x2={padL + fretW}
              y2={padT + (strCount - 1) * strH}
              stroke="var(--text-primary)"
              strokeWidth="3.5"
            />
            {Array.from({ length: maxFret + 1 }, (_, fret) => {
              const x = padL + (fret + 1) * fretW;
              return (
                <g key={fret}>
                  {fret > 0 && (
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + (strCount - 1) * strH}
                      stroke="var(--border-chassis)"
                      strokeWidth="1"
                    />
                  )}
                  {markers.has(fret) && (
                    <text
                      x={padL + fret * fretW + fretW * 0.5}
                      y={height - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="800"
                      fill="var(--text-muted)"
                    >
                      {fret}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Cuerdas (de aguda arriba a grave abajo) */}
            {tuningDef.notes.map((note, stringIndex) => {
              const visualRow = strCount - 1 - stringIndex;
              const y = padT + visualRow * strH;
              return (
                <g key={stringIndex}>
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontWeight="800"
                    fill="var(--text-secondary)"
                  >
                    {formatPitchName(note)}
                  </text>
                  <line
                    x1={padL + fretW}
                    y1={y}
                    x2={width - 12}
                    y2={y}
                    stroke="var(--text-muted)"
                    strokeWidth={1 + (strCount - visualRow) * 0.14}
                  />
                </g>
              );
            })}

            {/* Puntos coloreados por rol y resaltados para la digitación elegida */}
            {fullMap.map((n) => {
              const inPos = activeKeySet.has(`${n.stringIndex}:${n.fret}`);
              const visualRow = strCount - 1 - n.stringIndex;
              const cy = padT + visualRow * strH;
              const cx = padL + n.fret * fretW + fretW * 0.5;
              const isChordTone = chordPcs.has(mod12(n.midi));
              const fill =
                n.role === 'root'
                  ? 'var(--led-amber)'
                  : n.role === 'characteristic'
                    ? 'var(--led-green)'
                    : isChordTone || n.role === 'chord'
                      ? 'var(--select)'
                      : 'var(--bg-elevated)';
              return (
                <g key={`${n.stringIndex}-${n.fret}`} opacity={inPos ? 1 : 0.28}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={inPos ? 8.5 : 6.5}
                    fill={fill}
                    stroke={inPos ? 'var(--bg-screen)' : 'var(--border-chassis)'}
                    strokeWidth="1.2"
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize={inPos ? '8.5' : '7.5'}
                    fontWeight="900"
                    fill={n.role === 'scale' && !isChordTone ? 'var(--text-primary)' : 'var(--bg-outer)'}
                  >
                    {n.degreeLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <p className="tuning-changes">
          Notas digitadas en la secuencia: {activeSequence.length} · Afinación:{' '}
          {tuningDef.notes.map((n) => `${n.letter}${n.accidental === -1 ? '♭' : n.accidental === 1 ? '♯' : ''}${n.octave}`).join(' ')} ({spelledToMidi(tuningDef.notes[0]!)})
        </p>
      </div>
    </div>
  );
}
