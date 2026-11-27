import type { CSSProperties } from 'react';
import { formatSpelledNote } from '../../core/music/spelling';
import { stringLabel, type TuningDefinition } from '../../core/music/tunings';

export const FRETBOARD_FRETS = 15;
const SINGLE_MARKERS = new Set([3, 5, 7, 9, 15]);

interface FretboardProps {
  tuning: TuningDefinition;
  /** Traste marcado por cuerda (null = muda). */
  selection: readonly (number | null)[];
  onToggle: (stringIndex: number, fret: number) => void;
  /** Nombre de la nota en esa cuerda y traste (con la ortografía de la mejor lectura). */
  noteName: (stringIndex: number, fret: number) => string;
}

/**
 * Mástil vertical interactivo (Spec 005): cuerdas en columnas de grave a aguda, trastes en filas
 * desde la cejuela (fila 0 = al aire) hasta el 15. Cada casilla es un botón accesible.
 */
export function Fretboard({ tuning, selection, onToggle, noteName }: FretboardProps) {
  const n = tuning.notes.length;
  const style = { '--strings': n } as CSSProperties;

  return (
    <div className="fretboard" style={style} role="group" aria-label="Mástil">
      <span className="fb-corner" aria-hidden="true" />
      {tuning.notes.map((note, i) => (
        <span key={`h${i}`} className="fb-head" aria-hidden="true">
          <span className="fb-head-num">{stringLabel(tuning, i)}</span>
          <span className={`fb-head-state ${selection[i] === null ? 'is-muted' : ''}`}>
            {selection[i] === null ? '×' : formatSpelledNote(note)}
          </span>
        </span>
      ))}

      {Array.from({ length: FRETBOARD_FRETS + 1 }, (_, fret) => (
        <FretRow
          key={fret}
          fret={fret}
          tuning={tuning}
          selection={selection}
          onToggle={onToggle}
          noteName={noteName}
          stringCount={n}
        />
      ))}
    </div>
  );
}

function FretRow({
  fret,
  tuning,
  selection,
  onToggle,
  noteName,
  stringCount,
}: {
  fret: number;
  tuning: TuningDefinition;
  selection: readonly (number | null)[];
  onToggle: (stringIndex: number, fret: number) => void;
  noteName: (stringIndex: number, fret: number) => string;
  stringCount: number;
}) {
  const marker = fret === 12 ? '••' : SINGLE_MARKERS.has(fret) ? '•' : '';
  return (
    <>
      <span className={`fb-fret-num ${fret === 0 ? 'is-open' : ''}`} aria-hidden="true">
        {fret === 0 ? '○' : fret}
        {marker && <span className="fb-marker">{marker}</span>}
      </span>
      {Array.from({ length: stringCount }, (_, stringIndex) => {
        const selected = selection[stringIndex] === fret;
        const name = noteName(stringIndex, fret);
        return (
          <button
            key={stringIndex}
            type="button"
            className={`fb-cell ${fret === 0 ? 'is-open-row' : ''} ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`Cuerda ${stringLabel(tuning, stringIndex)}, ${fret === 0 ? 'al aire' : `traste ${fret}`}: ${name}`}
            onClick={() => onToggle(stringIndex, fret)}
          >
            {selected && <span className="fb-dot">{name.replace(/-?\d+$/, '')}</span>}
          </button>
        );
      })}
    </>
  );
}
