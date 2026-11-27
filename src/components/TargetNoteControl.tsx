import { useMemo } from 'react';
import {
  CHROMATIC_NOTE_OPTIONS,
  OCTAVE_OPTIONS,
  QUICK_BASS_STRINGS,
  QUICK_GUITAR_STRINGS,
  describeMidiNote,
  midiFromNoteAndOctave,
} from '../core/music/notes';

interface TargetNoteControlProps {
  isManual: boolean;
  targetMidi: number;
  a4Hz: number;
  onToggleMode: (manual: boolean) => void;
  onSelectTargetMidi: (midi: number) => void;
}

export function TargetNoteControl({
  isManual,
  targetMidi,
  a4Hz,
  onToggleMode,
  onSelectTargetMidi,
}: TargetNoteControlProps) {
  const currentNote = useMemo(
    () => describeMidiNote(targetMidi, a4Hz),
    [targetMidi, a4Hz]
  );

  const currentNoteIndex = ((targetMidi % 12) + 12) % 12;
  const currentOctave = currentNote.octave;

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
              : 'Automático · Detección libre (27.5–2000 Hz)'}
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
                  {opt.displayName} · {opt.latinName}
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

          <div className="quick-strings-group">
            <div className="quick-strings-row">
              <span className="quick-group-tag">Guitarra</span>
              <div className="quick-string-btns">
                {QUICK_GUITAR_STRINGS.map((item) => (
                  <button
                    key={item.midi}
                    type="button"
                    className={`quick-string-btn ${targetMidi === item.midi ? 'is-active' : ''}`}
                    onClick={() => onSelectTargetMidi(item.midi)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="quick-strings-row">
              <span className="quick-group-tag">Bajo</span>
              <div className="quick-string-btns">
                {QUICK_BASS_STRINGS.map((item) => (
                  <button
                    key={item.midi}
                    type="button"
                    className={`quick-string-btn ${targetMidi === item.midi ? 'is-active' : ''}`}
                    onClick={() => onSelectTargetMidi(item.midi)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
