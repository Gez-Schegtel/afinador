import { useCallback, useEffect, useMemo, useState } from 'react';
import { identifyChord, type ChordReading } from '../../core/music/chord-identify';
import {
  defaultSharpPitchName,
  formatPitchName,
  formatSpelledNote,
  mod12,
  spellMidi,
} from '../../core/music/spelling';
import {
  resolveTuningSelection,
  tuningMidis,
  type InstrumentId,
} from '../../core/music/tunings';
import { voicingTab } from '../../core/music/voicings';
import { TuningPicker } from '../TuningPicker';
import { Fretboard } from './Fretboard';

const STORAGE_IDENTIFY_KEY = 'afinador_chords_identify';
const MAX_ALTERNATIVES = 3;

function loadTuningId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_IDENTIFY_KEY);
    const parsed = raw ? (JSON.parse(raw) as { tuningId?: unknown }) : null;
    const id = typeof parsed?.tuningId === 'string' ? parsed.tuningId : null;
    const instrument = id ? id.split('-')[0] : null;
    return resolveTuningSelection(instrument, id).tuning.id;
  } catch {
    return resolveTuningSelection(null, null).tuning.id;
  }
}

interface ChordIdentifierProps {
  onOpenInDictionary: (reading: ChordReading, tuningId: string) => void;
}

/** Identificador de acordes desde el mástil (Spec 005). */
export function ChordIdentifier({ onOpenInDictionary }: ChordIdentifierProps) {
  const [tuningId, setTuningId] = useState(loadTuningId);
  const { instrument, tuning } = resolveTuningSelection(tuningId.split('-')[0], tuningId);
  const midis = useMemo(() => tuningMidis(tuning), [tuning]);
  const [selection, setSelection] = useState<(number | null)[]>(() =>
    midis.map(() => null)
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_IDENTIFY_KEY, JSON.stringify({ tuningId }));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }
  }, [tuningId]);

  // Al cambiar de afinación (y quizá de cantidad de cuerdas) se limpia la selección.
  useEffect(() => {
    setSelection(midis.map(() => null));
  }, [midis]);

  const sounding = useMemo(
    () =>
      selection.flatMap((f, i) => (f === null ? [] : [midis[i]! + f])),
    [selection, midis]
  );
  const result = useMemo(() => identifyChord(sounding), [sounding]);
  const best = result.kind === 'chord' ? result.readings[0]! : null;

  const toggle = useCallback((stringIndex: number, fret: number) => {
    setSelection((prev) => prev.map((f, i) => (i === stringIndex ? (f === fret ? null : fret) : f)));
  }, []);

  const noteName = useCallback(
    (stringIndex: number, fret: number) => {
      const midi = midis[stringIndex]! + fret;
      const pitch = best?.nameByPc.get(mod12(midi)) ?? defaultSharpPitchName(midi);
      return formatSpelledNote(spellMidi(midi, pitch));
    },
    [midis, best]
  );

  return (
    <div className="identify-layout">
      <section className="identify-result" aria-live="polite">
        <div className="target-summary-header">
          <span className="calibration-label">RESULTADO</span>
          <span className="voicing-tab">{voicingTab(selection)}</span>
        </div>

        {result.kind === 'empty' && (
          <p className="idle-hint">
            Tocá en el mástil los trastes de la forma que conocés: una nota por cuerda (la fila ○ es
            la cuerda al aire). Tocá de nuevo para borrarla.
          </p>
        )}

        {result.kind === 'single' && (
          <p className="idle-hint">
            Una sola nota: <strong>{formatPitchName(result.note)}</strong>. Marcá al menos dos.
          </p>
        )}

        {result.kind === 'interval' && (
          <div className="chord-info-card">
            <span className="chord-name">Intervalo</span>
            <span className="chord-symbol">{result.interval.name}</span>
            <span className="chord-alt">
              {formatPitchName(result.interval.lower)} – {formatPitchName(result.interval.upper)}
            </span>
          </div>
        )}

        {result.kind === 'unknown' && (
          <div className="chord-info-card">
            <span className="chord-name">No forma un acorde del catálogo</span>
            <span className="chord-alt">
              Notas: {result.notes.map(formatPitchName).join(' ')} · Intervalos desde el bajo:{' '}
              {result.intervalsFromBass.join(', ')}
            </span>
          </div>
        )}

        {best && result.kind === 'chord' && (
          <>
            <div className="chord-info-card">
              <span className="chord-symbol">{best.symbol}</span>
              <span className="chord-name">{best.nameEs}</span>
              <dl className="chord-facts">
                <div>
                  <dt>Notas</dt>
                  <dd>{[...best.nameByPc.values()].map(formatPitchName).join(' ')}</dd>
                </div>
                <div>
                  <dt>Grados</dt>
                  <dd>{[...best.degreeByPc.values()].join(' ')}</dd>
                </div>
              </dl>
              {best.omitsFifth && <span className="chord-alt">Sin la quinta (omisión habitual).</span>}
              {best.enharmonicRoot && (
                <span className="chord-alt">
                  También se escribe con raíz {formatPitchName(best.enharmonicRoot)}.
                </span>
              )}
              <button
                type="button"
                className="chip-btn identify-open-btn"
                onClick={() => onOpenInDictionary(best, tuning.id)}
              >
                Ver {best.symbol.split('/')[0]} en el diccionario
              </button>
            </div>

            {result.readings.length > 1 && (
              <div className="identify-alternatives">
                <span className="calibration-label">OTRAS LECTURAS VÁLIDAS</span>
                <ul>
                  {result.readings.slice(1, 1 + MAX_ALTERNATIVES).map((r) => (
                    <li key={r.symbol}>
                      <strong>{r.symbol}</strong> — {r.nameEs}
                      {r.omitsFifth ? ' (sin 5ª)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          className="step-btn identify-clear-btn"
          onClick={() => setSelection(midis.map(() => null))}
          disabled={sounding.length === 0}
        >
          Limpiar
        </button>
      </section>

      <section className="identify-board target-card" aria-label="Mástil interactivo">
        <TuningPicker
          instrumentId={instrument as InstrumentId}
          tuningId={tuning.id}
          onChange={(_inst, id) => setTuningId(id)}
        />
        <Fretboard tuning={tuning} selection={selection} onToggle={toggle} noteName={noteName} />
      </section>
    </div>
  );
}
