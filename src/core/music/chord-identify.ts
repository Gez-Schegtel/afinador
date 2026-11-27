/**
 * Identificación de acordes a partir de notas marcadas en el mástil (Spec 005). Núcleo puro.
 *
 * Devuelve TODAS las lecturas válidas ordenadas: un mismo conjunto de notas puede tener más de
 * un nombre correcto (C E G A = C6 con Do en el bajo, Am7 con La en el bajo).
 */

import {
  CHORD_QUALITIES,
  canOmitFifth,
  chordNameEs,
  chordSymbol,
  simplestSpellings,
  spellChord,
  type ChordQuality,
} from './chords';
import { interval, intervalLabel, transpose } from './intervals';
import {
  defaultSharpPitchName,
  formatPitchName,
  latinPitchName,
  mod12,
  type PitchName,
} from './spelling';

export interface ChordReading {
  readonly root: PitchName;
  readonly quality: ChordQuality;
  /** Notas del acorde escritas (orden de la fórmula). */
  readonly notes: readonly PitchName[];
  readonly bass: PitchName;
  /** '1ª inversión', '2ª inversión', '3ª inversión', 'con bajo en X' o null (raíz en el bajo). */
  readonly inversion: string | null;
  readonly symbol: string;
  readonly nameEs: string;
  readonly omitsFifth: boolean;
  /** Raíz enarmónica con la misma cantidad de alteraciones (F♯ / G♭), si la hay. */
  readonly enharmonicRoot: PitchName | null;
  /** Grado (etiqueta) de cada clase de altura presente. */
  readonly degreeByPc: ReadonlyMap<number, string>;
  /** Nombre escrito de cada clase de altura presente. */
  readonly nameByPc: ReadonlyMap<number, PitchName>;
}

export interface IntervalReading {
  readonly semitones: number;
  readonly name: string;
  readonly lower: PitchName;
  readonly upper: PitchName;
}

export type IdentifyResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'single'; readonly note: PitchName }
  | { readonly kind: 'chord'; readonly readings: readonly ChordReading[] }
  | { readonly kind: 'interval'; readonly interval: IntervalReading }
  | {
      readonly kind: 'unknown';
      readonly notes: readonly PitchName[];
      readonly intervalsFromBass: readonly string[];
    };

const INTERVAL_NAMES: readonly { name: string; label: string }[] = [
  { name: 'unísono u octava', label: '1' },
  { name: '2ª menor', label: 'b2' },
  { name: '2ª mayor', label: '2' },
  { name: '3ª menor', label: 'b3' },
  { name: '3ª mayor', label: '3' },
  { name: '4ª justa', label: '4' },
  { name: 'tritono (4ª aumentada / 5ª disminuida)', label: '#4' },
  { name: '5ª justa', label: '5' },
  { name: '6ª menor', label: 'b6' },
  { name: '6ª mayor', label: '6' },
  { name: '7ª menor', label: 'b7' },
  { name: '7ª mayor', label: '7' },
];

export function intervalName(semitones: number): string {
  return INTERVAL_NAMES[mod12(semitones)]!.name;
}

function inversionLabel(degree: number, bass: PitchName): string {
  switch (degree) {
    case 3:
      return '1ª inversión';
    case 5:
      return '2ª inversión';
    case 7:
      return '3ª inversión';
    default:
      return `con bajo en ${latinPitchName(bass)}`;
  }
}

/** Identifica el acorde formado por las notas MIDI dadas (en cualquier orden). */
export function identifyChord(midis: readonly number[]): IdentifyResult {
  if (midis.length === 0) return { kind: 'empty' };
  const sorted = [...midis].sort((a, b) => a - b);
  const bassPc = mod12(sorted[0]!);
  const pcs = [...new Set(sorted.map(mod12))];
  const pcSet = new Set(pcs);

  if (pcs.length === 1) {
    return { kind: 'single', note: defaultSharpPitchName(bassPc) };
  }

  const readings: (ChordReading & { order: number })[] = [];
  for (const rootPc of pcs) {
    CHORD_QUALITIES.forEach((q, catalogIndex) => {
      const qualityPcs = q.intervals.map((iv) => mod12(rootPc + iv.semitones));
      const qualitySet = new Set(qualityPcs);
      for (const pc of pcSet) {
        if (!qualitySet.has(pc)) return;
      }
      const omittable = canOmitFifth(q);
      let omitsFifth = false;
      for (let i = 0; i < q.intervals.length; i++) {
        const iv = q.intervals[i]!;
        if (pcSet.has(qualityPcs[i]!)) continue;
        if (omittable && iv.degree === 5 && iv.semitones === 7) {
          omitsFifth = true;
          continue;
        }
        return;
      }

      const [root, enharmonicRoot = null] = simplestSpellings(rootPc, q);
      const notes = spellChord(root!, q);
      const degreeByPc = new Map<number, string>();
      const nameByPc = new Map<number, PitchName>();
      q.intervals.forEach((iv, i) => {
        const pc = qualityPcs[i]!;
        if (pcSet.has(pc) && !degreeByPc.has(pc)) {
          degreeByPc.set(pc, intervalLabel(iv));
          nameByPc.set(pc, notes[i]!);
        }
      });
      const bassIndex = qualityPcs.indexOf(bassPc);
      const bass = notes[bassIndex]!;
      const rootInBass = bassPc === rootPc;
      const inversion = rootInBass
        ? null
        : inversionLabel(q.intervals[bassIndex]!.degree, bass);
      const symbol = rootInBass
        ? chordSymbol(root!, q)
        : `${chordSymbol(root!, q)}/${formatPitchName(bass)}`;
      const nameEs = rootInBass
        ? chordNameEs(root!, q)
        : inversion!.startsWith('con bajo')
          ? `${chordNameEs(root!, q)}, ${inversion}`
          : `${chordNameEs(root!, q)}, con bajo en ${latinPitchName(bass)} (${inversion})`;

      readings.push({
        root: root!,
        quality: q,
        notes,
        bass,
        inversion,
        symbol,
        nameEs,
        omitsFifth,
        enharmonicRoot,
        degreeByPc,
        nameByPc,
        order:
          (omitsFifth ? 1_000_000 : 0) +
          (rootInBass ? 0 : 100_000) +
          q.intervals.length * 1_000 +
          catalogIndex * 12 +
          mod12(rootPc - bassPc),
      });
    });
  }

  if (readings.length > 0) {
    readings.sort((a, b) => a.order - b.order);
    return { kind: 'chord', readings: readings.map(({ order: _order, ...r }) => r) };
  }

  const bassName = defaultSharpPitchName(bassPc);
  if (pcs.length === 2) {
    const upperPc = pcs.find((pc) => pc !== bassPc)!;
    const up = mod12(upperPc - bassPc);
    return {
      kind: 'interval',
      interval: {
        semitones: up,
        name: intervalName(up),
        lower: bassName,
        upper: transpose(bassName, interval(INTERVAL_NAMES[up]!.label)),
      },
    };
  }

  return {
    kind: 'unknown',
    notes: pcs.map(defaultSharpPitchName),
    intervalsFromBass: pcs
      .filter((pc) => pc !== bassPc)
      .map((pc) => intervalName(pc - bassPc)),
  };
}
