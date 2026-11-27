import { useMemo } from 'react';
import {
  TARGET_NOTE_MAX_MIDI,
  TARGET_NOTE_MIN_MIDI,
  buildTargetNoteGroups,
  clampTargetMidi,
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
  const groups = useMemo(() => buildTargetNoteGroups(a4Hz), [a4Hz]);

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
              ? 'Manual · Filtro DSP acotado a ±5 semitonos'
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
          <label className="target-select-label" htmlFor="target-note-select">
            Nota objetivo
          </label>

          <div className="target-select-controls">
            <button
              type="button"
              className="step-btn"
              onClick={() => onSelectTargetMidi(clampTargetMidi(targetMidi - 1))}
              disabled={targetMidi <= TARGET_NOTE_MIN_MIDI}
              aria-label="Bajar un semitono"
              title="Bajar un semitono"
            >
              −
            </button>

            <select
              id="target-note-select"
              className="target-select"
              value={targetMidi}
              onChange={(e) =>
                onSelectTargetMidi(
                  clampTargetMidi(Number.parseInt(e.target.value, 10))
                )
              }
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.midi} value={opt.midi}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <button
              type="button"
              className="step-btn"
              onClick={() => onSelectTargetMidi(clampTargetMidi(targetMidi + 1))}
              disabled={targetMidi >= TARGET_NOTE_MAX_MIDI}
              aria-label="Subir un semitono"
              title="Subir un semitono"
            >
              +
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
