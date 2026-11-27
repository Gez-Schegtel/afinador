// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Generador de digitaciones (voicings) para instrumentos de cuerda (Spec 003). Núcleo 100% puro.
 *
 * Reglas (todas verificadas por tests):
 * 1. Toda nota que suena pertenece al acorde.
 * 2. Están todas las notas del acorde salvo, en acordes de 4+ notas, la quinta justa.
 * 3. Posición fundamental: la nota más grave es la raíz.
 * 4. Tocabilidad: trastes pisados dentro de una ventana de `span` trastes; cuerdas al aire solo
 *    en la primera ventana (trastes 1–4); ≤ 4 dedos contando una cejilla; ≤ 1 cuerda muda entre
 *    la más grave y la más aguda que suenan; al menos `minStrings` cuerdas sonando.
 */

import {
  canOmitFifth,
  chordPitchClasses,
  perfectFifthPitchClass,
  requiredPitchClasses,
  type ChordQuality,
} from './chords';
import { mod12, pitchClassOf, type PitchName } from './spelling';

export interface Barre {
  readonly fret: number;
  /** Índices de cuerda (0 = la más grave). */
  readonly fromString: number;
  readonly toString: number;
}

export interface Voicing {
  /** Traste por cuerda, de la más grave a la más aguda; null = cuerda muda, 0 = al aire. */
  readonly frets: readonly (number | null)[];
  /** MIDI de cada cuerda que suena (null si está muda). */
  readonly midis: readonly (number | null)[];
  /** 0 = posición abierta (usa cuerdas al aire); si no, el traste pisado más bajo. */
  readonly position: number;
  readonly barre: Barre | null;
  readonly fingers: number;
  readonly omitsFifth: boolean;
  readonly score: number;
}

export interface VoicingOptions {
  readonly maxFret?: number;
  readonly span?: number;
  readonly minStrings?: number;
  readonly perPosition?: number;
  readonly maxResults?: number;
}

const DEFAULTS = {
  maxFret: 15,
  span: 4,
  perPosition: 2,
  maxResults: 12,
} as const;

export const MAX_FINGERS = 4;

/** Dedos necesarios y cejilla (si la hay) para una combinación de trastes. */
export function fingering(frets: readonly (number | null)[]): {
  fingers: number;
  barre: Barre | null;
} {
  const fretted = frets
    .map((f, i) => ({ f, i }))
    .filter((x): x is { f: number; i: number } => x.f !== null && x.f > 0);
  if (fretted.length === 0) return { fingers: 0, barre: null };

  const minFret = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === minFret).map((x) => x.i);
  if (atMin.length >= 2) {
    const from = atMin[0]!;
    const to = atMin[atMin.length - 1]!;
    let valid = true;
    for (let i = from; i <= to; i++) {
      const f = frets[i];
      // Bajo la cejilla no puede haber cuerdas al aire ni mudas.
      if (f === null || f === undefined || f < minFret) {
        valid = false;
        break;
      }
    }
    if (valid) {
      const above = fretted.filter((x) => x.f > minFret).length;
      return {
        fingers: 1 + above,
        barre: { fret: minFret, fromString: from, toString: to },
      };
    }
  }
  return { fingers: fretted.length, barre: null };
}

/** Cifrado tipo tablatura de grave a agudo: 'x32010' o, con trastes ≥ 10, 'x-10-12-12-11-10'. */
export function voicingTab(frets: readonly (number | null)[]): string {
  const tokens = frets.map((f) => (f === null ? 'x' : String(f)));
  return frets.some((f) => f !== null && f >= 10)
    ? tokens.join('-')
    : tokens.join('');
}

function minStringsFor(q: ChordQuality, stringCount: number): number {
  if (q.intervals.length <= 2) return 2;
  return Math.min(4, stringCount);
}

/**
 * Genera digitaciones del acorde en la afinación dada (`tuningMidis` de grave a agudo),
 * ordenadas por posición (abierta primero) y, dentro de cada posición, por comodidad.
 */
export function generateVoicings(
  tuningMidis: readonly number[],
  root: PitchName,
  q: ChordQuality,
  options: VoicingOptions = {}
): Voicing[] {
  const maxFret = options.maxFret ?? DEFAULTS.maxFret;
  const span = options.span ?? DEFAULTS.span;
  const perPosition = options.perPosition ?? DEFAULTS.perPosition;
  const maxResults = options.maxResults ?? DEFAULTS.maxResults;
  const minStrings = options.minStrings ?? minStringsFor(q, tuningMidis.length);

  const chordPcs = new Set(chordPitchClasses(root, q));
  const required = requiredPitchClasses(root, q);
  const rootPc = pitchClassOf(root);
  const fifthPc = canOmitFifth(q) ? perfectFifthPitchClass(root, q) : null;
  const n = tuningMidis.length;

  const found = new Map<string, Voicing>();
  const frets: (number | null)[] = new Array<number | null>(n).fill(null);

  const evaluate = () => {
    let sounding = 0;
    let first = -1;
    let last = -1;
    const pcs = new Set<number>();
    for (let i = 0; i < n; i++) {
      const f = frets[i];
      if (f === null || f === undefined) continue;
      sounding++;
      if (first < 0) first = i;
      last = i;
      pcs.add(mod12(tuningMidis[i]! + f));
    }
    if (sounding < minStrings) return;
    if (mod12(tuningMidis[first]! + frets[first]!) !== rootPc) return;
    for (const pc of required) {
      if (!pcs.has(pc)) return;
    }
    let gaps = 0;
    for (let i = first; i <= last; i++) {
      if (frets[i] === null) gaps++;
    }
    if (gaps > 1) return;

    const { fingers, barre } = fingering(frets);
    if (fingers > MAX_FINGERS) return;

    const key = frets.map((f) => (f === null ? 'x' : f)).join(',');
    if (found.has(key)) return;

    const hasOpen = frets.some((f) => f === 0);
    const frettedValues = frets.filter((f): f is number => f !== null && f > 0);
    const position = hasOpen
      ? 0
      : frettedValues.length > 0
        ? Math.min(...frettedValues)
        : 0;
    const muted = n - sounding;
    const omitsFifth = fifthPc !== null && !pcs.has(fifthPc);
    const fretSum = frettedValues.reduce((a, b) => a + b, 0);
    const score =
      muted * 2 + gaps * 4 + (omitsFifth ? 3 : 0) + fingers * 0.5 + fretSum * 0.01;

    found.set(key, {
      frets: [...frets],
      midis: frets.map((f, i) => (f === null ? null : tuningMidis[i]! + f)),
      position,
      barre,
      fingers,
      omitsFifth,
      score,
    });
  };

  for (let start = 1; start + span - 1 <= maxFret; start++) {
    const allowOpen = start === 1;
    const optionsPerString: (number | null)[][] = tuningMidis.map((open) => {
      const opts: (number | null)[] = [null];
      if (allowOpen && chordPcs.has(mod12(open))) opts.push(0);
      for (let f = start; f < start + span; f++) {
        if (chordPcs.has(mod12(open + f))) opts.push(f);
      }
      return opts;
    });

    const dfs = (stringIndex: number) => {
      if (stringIndex === n) {
        evaluate();
        return;
      }
      for (const option of optionsPerString[stringIndex]!) {
        frets[stringIndex] = option;
        dfs(stringIndex + 1);
      }
      frets[stringIndex] = null;
    };
    dfs(0);
  }

  const byPosition = new Map<number, Voicing[]>();
  for (const v of found.values()) {
    const list = byPosition.get(v.position) ?? [];
    list.push(v);
    byPosition.set(v.position, list);
  }

  const result: Voicing[] = [];
  for (const position of [...byPosition.keys()].sort((a, b) => a - b)) {
    const list = byPosition.get(position)!.sort((a, b) => a.score - b.score);
    result.push(...list.slice(0, perPosition));
  }
  return result.slice(0, maxResults);
}

/** Todas las digitaciones válidas sin recortar (para tests y análisis). */
export function generateAllVoicings(
  tuningMidis: readonly number[],
  root: PitchName,
  q: ChordQuality,
  options: Omit<VoicingOptions, 'perPosition' | 'maxResults'> = {}
): Voicing[] {
  return generateVoicings(tuningMidis, root, q, {
    ...options,
    perPosition: Number.POSITIVE_INFINITY,
    maxResults: Number.POSITIVE_INFINITY,
  });
}
