import { useMemo } from 'react';
import {
  CHORD_GROUP_LABELS,
  CHORD_GROUP_ORDER,
  CHORD_QUALITIES,
  DICTIONARY_ROOTS,
  chordNameEs,
  chordSymbol,
  findQuality,
  formulaLabels,
  moreCommonEnharmonic,
  spellChord,
} from '../../core/music/chords';
import { intervalLabel } from '../../core/music/intervals';
import {
  formatPitchName,
  latinPitchName,
  mod12,
  pitchClassOf,
} from '../../core/music/spelling';
import {
  findTuning,
  standardTuningFor,
  tuningMidis,
  type InstrumentFamily,
  type InstrumentId,
} from '../../core/music/tunings';
import { generateVoicings, voicingTab } from '../../core/music/voicings';
import { TuningPicker } from '../TuningPicker';
import { ChordDiagram } from './ChordDiagram';

export type LabelMode = 'degree' | 'note';

export interface DictionaryState {
  readonly tuningId: string;
  readonly rootIndex: number;
  readonly qualityId: string;
  readonly labelMode: LabelMode;
}

export const DEFAULT_DICTIONARY_STATE: DictionaryState = {
  tuningId: 'guitar6-standard',
  rootIndex: 0,
  qualityId: 'maj',
  labelMode: 'degree',
};

const GUITAR_ONLY: readonly InstrumentFamily[] = ['guitar'];

/** Valida el estado persistido: solo afinaciones de guitarra, raíz y tipo existentes. */
export function resolveDictionaryState(raw: unknown): DictionaryState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const tuning = typeof obj.tuningId === 'string' ? findTuning(obj.tuningId) : undefined;
  const rootIndex =
    typeof obj.rootIndex === 'number' &&
    Number.isInteger(obj.rootIndex) &&
    obj.rootIndex >= 0 &&
    obj.rootIndex < DICTIONARY_ROOTS.length
      ? obj.rootIndex
      : DEFAULT_DICTIONARY_STATE.rootIndex;
  return {
    tuningId:
      tuning && tuning.instrument.startsWith('guitar')
        ? tuning.id
        : DEFAULT_DICTIONARY_STATE.tuningId,
    rootIndex,
    qualityId:
      typeof obj.qualityId === 'string' && findQuality(obj.qualityId)
        ? obj.qualityId
        : DEFAULT_DICTIONARY_STATE.qualityId,
    labelMode: obj.labelMode === 'note' ? 'note' : 'degree',
  };
}

interface ChordDictionaryProps {
  state: DictionaryState;
  onChange: (patch: Partial<DictionaryState>) => void;
}

/** Diccionario de acordes (Spec 003). */
export function ChordDictionary({ state, onChange }: ChordDictionaryProps) {
  const tuning = findTuning(state.tuningId) ?? standardTuningFor('guitar6');
  const root = DICTIONARY_ROOTS[state.rootIndex] ?? DICTIONARY_ROOTS[0]!;
  const quality = findQuality(state.qualityId) ?? CHORD_QUALITIES[0]!;

  const notes = useMemo(() => spellChord(root, quality), [root, quality]);
  const enharmonic = useMemo(() => moreCommonEnharmonic(root, quality), [root, quality]);
  const midis = useMemo(() => tuningMidis(tuning), [tuning]);
  const voicings = useMemo(
    () => generateVoicings(midis, root, quality),
    [midis, root, quality]
  );

  // Grado y nota escrita de cada clase de altura del acorde.
  const labelByPc = useMemo(() => {
    const map = new Map<number, { degree: string; note: string; isRoot: boolean }>();
    quality.intervals.forEach((iv, i) => {
      const pc = mod12(pitchClassOf(root) + iv.semitones);
      if (!map.has(pc)) {
        map.set(pc, {
          degree: intervalLabel(iv),
          note: formatPitchName(notes[i]!),
          isRoot: i === 0,
        });
      }
    });
    return map;
  }, [quality, root, notes]);

  const symbol = chordSymbol(root, quality);

  return (
    <div className="chords-layout">
      <div className="chords-sidebar">
        <section className="target-card" aria-label="Acorde">
          <div className="target-summary-header">
            <span className="calibration-label">ACORDE</span>
          </div>
          <TuningPicker
            instrumentId={tuning.instrument as InstrumentId}
            tuningId={tuning.id}
            families={GUITAR_ONLY}
            onChange={(_instrument, tuningId) => onChange({ tuningId })}
          />
          <div className="note-octave-grid">
            <select
              className="target-select"
              value={state.rootIndex}
              onChange={(e) => onChange({ rootIndex: Number.parseInt(e.target.value, 10) })}
              aria-label="Raíz"
            >
              {DICTIONARY_ROOTS.map((r, index) => (
                <option key={formatPitchName(r)} value={index}>
                  {formatPitchName(r)} · {latinPitchName(r)}
                </option>
              ))}
            </select>
            <select
              className="target-select"
              value={quality.id}
              onChange={(e) => onChange({ qualityId: e.target.value })}
              aria-label="Tipo de acorde"
            >
              {CHORD_GROUP_ORDER.map((group) => (
                <optgroup key={group} label={CHORD_GROUP_LABELS[group]}>
                  {CHORD_QUALITIES.filter((q) => q.group === group).map((q) => (
                    <option key={q.id} value={q.id}>
                      {chordSymbol(root, q)} — {q.nameEs}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </section>

        <section className="chord-info-card" aria-live="polite">
          <span className="chord-symbol">{symbol}</span>
          <span className="chord-name">{chordNameEs(root, quality)}</span>
          {quality.altSymbols.length > 0 && (
            <span className="chord-alt">
              También: {quality.altSymbols.map((s) => `${formatPitchName(root)}${s}`).join(' · ')}
            </span>
          )}
          <dl className="chord-facts">
            <div>
              <dt>Fórmula</dt>
              <dd>{formulaLabels(quality).join(' ')}</dd>
            </div>
            <div>
              <dt>Notas</dt>
              <dd>{notes.map(formatPitchName).join(' ')}</dd>
            </div>
          </dl>
          {enharmonic && (
            <span className="chord-enharmonic">
              Con esta raíz se escribe con más alteraciones que su equivalente enarmónico.
              Con menos alteraciones:{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onChange({
                    rootIndex: DICTIONARY_ROOTS.findIndex(
                      (r) => r.letter === enharmonic.letter && r.accidental === enharmonic.accidental
                    ),
                  })
                }
              >
                {chordSymbol(enharmonic, quality)}
              </button>
            </span>
          )}
        </section>
      </div>

      <section className="chords-main" aria-label={`Digitaciones de ${symbol}`}>
        <div className="target-summary-header">
          <span className="calibration-label">DIGITACIONES ({voicings.length})</span>
          <div className="mode-switch" role="group" aria-label="Rótulos de los puntos">
            <button
              type="button"
              className={`mode-btn ${state.labelMode === 'degree' ? 'is-active' : ''}`}
              aria-pressed={state.labelMode === 'degree'}
              onClick={() => onChange({ labelMode: 'degree' })}
            >
              GRADOS
            </button>
            <button
              type="button"
              className={`mode-btn ${state.labelMode === 'note' ? 'is-active' : ''}`}
              aria-pressed={state.labelMode === 'note'}
              onClick={() => onChange({ labelMode: 'note' })}
            >
              NOTAS
            </button>
          </div>
        </div>

        {voicings.length === 0 ? (
          <p className="idle-hint">
            No hay digitaciones cómodas (≤ 4 trastes y 4 dedos) para este acorde en esta afinación.
          </p>
        ) : (
          <div className="voicing-grid">
            {voicings.map((v) => {
              const tab = voicingTab(v.frets);
              const info = v.midis.map((m) => (m === null ? null : labelByPc.get(mod12(m)) ?? null));
              return (
                <figure key={tab} className="voicing-card">
                  <ChordDiagram
                    frets={v.frets}
                    labels={info.map((x) =>
                      x ? (state.labelMode === 'degree' ? x.degree : x.note) : null
                    )}
                    rootStrings={info.map((x) => x?.isRoot ?? false)}
                    barre={v.barre}
                    ariaLabel={`${symbol}, cifrado ${tab}`}
                  />
                  <figcaption>
                    <span className="voicing-tab">{tab}</span>
                    <span className="voicing-position">
                      {v.position === 0 ? 'Posición abierta' : `Traste ${v.position}`}
                      {v.omitsFifth ? ' · sin 5ª' : ''}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
