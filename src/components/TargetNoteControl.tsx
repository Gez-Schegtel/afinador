import { useMemo, type CSSProperties } from 'react';
import {
  CHROMATIC_NOTE_OPTIONS,
  OCTAVE_OPTIONS,
  describeMidiNote,
  midiFromNoteAndOctave,
} from '../core/music/notes';
import {
  LETTERS,
  defaultSharpPitchName,
  formatPitchName,
  formatSpelledNote,
  latinPitchName,
  letterIndex,
  spelledToMidi,
  type PitchName,
} from '../core/music/spelling';
import {
  changesFromStandard,
  formatTuningNotes,
  raisesTension,
  stringLabel,
  uniformShiftFromStandard,
  type InstrumentId,
  type TuningDefinition,
} from '../core/music/tunings';
import { TuningPicker } from './TuningPicker';

interface TargetNoteControlProps {
  isManual: boolean;
  targetMidi: number;
  a4Hz: number;
  instrumentId: InstrumentId;
  tuning: TuningDefinition;
  /** Ortografía de la nota objetivo cuando pertenece a la afinación elegida. */
  targetSpelling: PitchName | null;
  onToggleMode: (manual: boolean) => void;
  onSelectTargetMidi: (midi: number) => void;
  onSelectTuning: (instrumentId: InstrumentId, tuningId: string) => void;
}

/** Teclas negras con ambos nombres enarmónicos (C♯ / D♭); teclas blancas con su nombre latino. */
function enharmonicOptionLabel(noteIndex: number): string {
  const sharp = defaultSharpPitchName(noteIndex);
  if (sharp.accidental === 0) {
    return `${formatPitchName(sharp)} · ${latinPitchName(sharp)}`;
  }
  const flatLetter = LETTERS[(letterIndex(sharp.letter) + 1) % 7]!;
  return `${formatPitchName(sharp)} / ${formatPitchName({ letter: flatLetter, accidental: -1 })}`;
}

function formatSemitones(semitones: number): string {
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`;
}

export function TargetNoteControl({
  isManual,
  targetMidi,
  a4Hz,
  instrumentId,
  tuning,
  targetSpelling,
  onToggleMode,
  onSelectTargetMidi,
  onSelectTuning,
}: TargetNoteControlProps) {
  const currentNote = useMemo(
    () => describeMidiNote(targetMidi, a4Hz, targetSpelling),
    [targetMidi, a4Hz, targetSpelling]
  );

  const changes = useMemo(() => changesFromStandard(tuning), [tuning]);
  const uniformShift = useMemo(() => uniformShiftFromStandard(tuning), [tuning]);
  const tensionWarning = useMemo(() => raisesTension(tuning), [tuning]);

  const currentNoteIndex = ((targetMidi % 12) + 12) % 12;
  const currentOctave = Math.floor(targetMidi / 12) - 1;
  const stringCount = tuning.notes.length;
  const stringGridStyle = {
    '--string-cols': stringCount,
    '--string-cols-mobile': stringCount > 6 ? 4 : stringCount,
  } as CSSProperties;

  return (
    <section
      className="target-card"
      aria-label="Selector de modo automático o manual"
    >
      <div className="target-header">
        <div className="calibration-title-group">
          <span className="calibration-label">MODO DE AFINACIÓN</span>
          <span className="calibration-range">
            {isManual
              ? 'Manual · Detecta hasta −11.5 / +5 st'
              : 'Automático · Detección libre (25–2000 Hz)'}
          </span>
        </div>

        <div
          className="mode-switch"
          role="group"
          aria-label="Modo de detección"
        >
          <button
            type="button"
            className={`mode-btn ${!isManual ? 'is-active' : ''}`}
            onClick={() => onToggleMode(false)}
            aria-pressed={!isManual}
          >
            AUTOMÁTICO
          </button>
          <button
            type="button"
            className={`mode-btn ${isManual ? 'is-active' : ''}`}
            onClick={() => onToggleMode(true)}
            aria-pressed={isManual}
          >
            MANUAL
          </button>
        </div>
      </div>

      {isManual && (
        <div className="target-select-row">
          <div className="target-summary-header">
            <span className="target-select-label">Afinación</span>
            {tensionWarning && (
              <span className="tuning-warning">↑ Sube la tensión</span>
            )}
            {tuning.requiresDedicatedStrings && (
              <span className="tuning-warning is-info">
                Requiere juego de cuerdas específico
              </span>
            )}
          </div>

          <TuningPicker
            instrumentId={instrumentId}
            tuningId={tuning.id}
            onChange={onSelectTuning}
          />

          <div className="tuning-summary">
            <span className="tuning-notes">{formatTuningNotes(tuning)}</span>
            {tuning.description && (
              <span className="tuning-description">{tuning.description}</span>
            )}
            {changes.length > 0 && (
              <span className="tuning-changes">
                {uniformShift !== null
                  ? `Todas las cuerdas ${formatSemitones(uniformShift)} st respecto de la estándar`
                  : changes
                      .map(
                        (c) =>
                          `${c.stringNumber}ª: ${formatSpelledNote(c.from)} → ${formatSpelledNote(c.to)} (${formatSemitones(c.semitones)} st)`
                      )
                      .join(' · ')}
              </span>
            )}
          </div>

          <div
            className="string-btns"
            role="group"
            aria-label="Cuerdas de la afinación"
            style={stringGridStyle}
          >
            {tuning.notes.map((note, index) => {
              const midi = spelledToMidi(note);
              const active = midi === targetMidi;
              return (
                <button
                  key={`${tuning.id}-${index}`}
                  type="button"
                  className={`string-btn ${active ? 'is-active' : ''}`}
                  onClick={() => onSelectTargetMidi(midi)}
                  aria-pressed={active}
                  aria-label={`Cuerda ${stringLabel(tuning, index)}: ${formatSpelledNote(note)}`}
                >
                  <span className="string-btn-num">
                    {stringLabel(tuning, index)}
                  </span>
                  <span className="string-btn-note">
                    {formatSpelledNote(note)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="target-summary-header">
            <span className="target-select-label">Nota objetivo</span>
            <span className="target-hz-badge">
              {currentNote.fullName} · {currentNote.latinName} —{' '}
              {currentNote.frequency.toFixed(1)} Hz
            </span>
          </div>

          <div className="note-octave-grid">
            <select
              className="target-select"
              value={currentNoteIndex}
              onChange={(e) =>
                onSelectTargetMidi(
                  midiFromNoteAndOctave(
                    Number.parseInt(e.target.value, 10),
                    currentOctave
                  )
                )
              }
              aria-label="Nota objetivo (nombre)"
            >
              {CHROMATIC_NOTE_OPTIONS.map((opt) => (
                <option
                  key={opt.noteIndex}
                  value={opt.noteIndex}
                  disabled={currentOctave === 0 && opt.noteIndex < 9}
                >
                  {enharmonicOptionLabel(opt.noteIndex)}
                </option>
              ))}
            </select>

            <select
              className="target-select"
              value={currentOctave}
              onChange={(e) =>
                onSelectTargetMidi(
                  midiFromNoteAndOctave(
                    currentNoteIndex,
                    Number.parseInt(e.target.value, 10)
                  )
                )
              }
              aria-label="Octava objetivo"
            >
              {OCTAVE_OPTIONS.map((opt) => (
                <option key={opt.octave} value={opt.octave}>
                  Octava {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
