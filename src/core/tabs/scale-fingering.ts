// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Algoritmos determinísticos de digitación sobre el diapasón para escalas, modos y arpegios
 * (Spec 010). Cero tablas rígidas: funciona sobre cualquier afinación de 4 a 8 cuerdas.
 */

import { mod12, pitchClassOf, spelledToMidi, type PitchName, type SpelledNote } from '../music/spelling';
import { spellScale, type ScaleDefinition } from '../music/scales';

export type FingeringSystem =
  | '3nps'
  | 'caged'
  | 'two-octaves'
  | 'single-string'
  | 'sweep';

export const FINGERING_SYSTEM_LABELS: Readonly<Record<FingeringSystem, string>> = {
  caged: 'Caja / Posición fija (CAGED)',
  '3nps': '3 Notas por Cuerda (3NPS)',
  'two-octaves': '2 Octavas desde tónica',
  'single-string': 'Horizontal en 1 cuerda',
  sweep: 'Sweep Picking (Arpegio)',
};

export type FretboardNoteRole = 'root' | 'chord' | 'characteristic' | 'scale';

export interface FrettedScaleNote {
  readonly stringIndex: number;
  readonly fret: number;
  readonly midi: number;
  readonly pitch: PitchName;
  readonly degreeLabel: string;
  readonly role: FretboardNoteRole;
}

export interface FingeringRequest {
  readonly tuning: readonly SpelledNote[];
  readonly root: PitchName;
  readonly scale: ScaleDefinition;
  readonly system: FingeringSystem;
  /** Posición elegida (1..7 según sistema). */
  readonly position?: number;
  /** Índice de cuerda (0 = más grave) para `single-string`. */
  readonly stringIndex?: number;
  /** Cantidad de cuerdas agudas a barrer en `sweep` (3, 4 o 5). */
  readonly sweepStrings?: 3 | 4 | 5;
  readonly maxFret?: number;
}

interface ScaleDegreeInfo {
  readonly degreeIndex: number;
  readonly pitch: PitchName;
  readonly degreeLabel: string;
  readonly role: FretboardNoteRole;
}

function buildPcLookup(root: PitchName, scale: ScaleDefinition): Map<number, ScaleDegreeInfo> {
  const spelled = spellScale(root, scale);
  const rootPc = pitchClassOf(root);
  const chordIndices = new Set(scale.chordDegreeIndices);
  const charSet = new Set(scale.characteristicDegrees);
  const map = new Map<number, ScaleDegreeInfo>();

  scale.intervals.forEach((semi, idx) => {
    const pc = mod12(rootPc + semi);
    if (map.has(pc)) return;
    const label = scale.degreeLabels[idx]!;
    let role: FretboardNoteRole = 'scale';
    if (idx === 0) role = 'root';
    else if (charSet.has(label)) role = 'characteristic';
    else if (chordIndices.has(idx)) role = 'chord';
    map.set(pc, {
      degreeIndex: idx,
      pitch: spelled[idx]!,
      degreeLabel: label,
      role,
    });
  });

  return map;
}

function makeNote(
  stringIndex: number,
  fret: number,
  midi: number,
  info: ScaleDegreeInfo
): FrettedScaleNote {
  return {
    stringIndex,
    fret,
    midi,
    pitch: info.pitch,
    degreeLabel: info.degreeLabel,
    role: info.role,
  };
}

/** Mapa completo de notas válidas de la escala en todo el diapasón (para diagrama de vista previa). */
export function buildFretboardScaleMap(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  maxFret: number = 15
): FrettedScaleNote[] {
  const lookup = buildPcLookup(root, scale);
  const out: FrettedScaleNote[] = [];
  tuning.forEach((openNote, stringIndex) => {
    const openMidi = spelledToMidi(openNote);
    for (let fret = 0; fret <= maxFret; fret++) {
      const midi = openMidi + fret;
      const info = lookup.get(mod12(midi));
      if (info) out.push(makeNote(stringIndex, fret, midi, info));
    }
  });
  return out;
}

function findWindowFretsForString(
  openMidi: number,
  lookup: Map<number, ScaleDegreeInfo>,
  minFret: number,
  maxFret: number,
  preferOpenInFirstPos: boolean
): Array<{ fret: number; midi: number; info: ScaleDegreeInfo }> {
  const hits: Array<{ fret: number; midi: number; info: ScaleDegreeInfo }> = [];
  if (preferOpenInFirstPos && minFret <= 1) {
    const openInfo = lookup.get(mod12(openMidi));
    if (openInfo) hits.push({ fret: 0, midi: openMidi, info: openInfo });
  }
  for (let fret = Math.max(preferOpenInFirstPos && minFret <= 1 ? 1 : 0, minFret); fret <= maxFret; fret++) {
    const midi = openMidi + fret;
    const info = lookup.get(mod12(midi));
    if (info) hits.push({ fret, midi, info });
  }
  return hits;
}

function generateBoxFingering(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  position: number,
  maxFret: number
): FrettedScaleNote[] {
  const lookup = buildPcLookup(root, scale);
  const rootPc = pitchClassOf(root);
  const lowOpen = spelledToMidi(tuning[0]!);

  // Encontrar trastes de partida naturales basados en la tónica sobre la cuerda más grave.
  const firstRootFret = mod12(rootPc - mod12(lowOpen));
  const clampedPos = Math.max(1, Math.min(5, position));
  const anchors = [
    Math.max(0, firstRootFret - 1),
    firstRootFret + 2,
    firstRootFret + 4,
    firstRootFret + 7,
    firstRootFret + 9,
  ];
  let windowStart = anchors[clampedPos - 1] ?? firstRootFret;
  if (windowStart > maxFret - 4) windowStart = Math.max(0, windowStart - 12);

  const windowEnd = Math.min(maxFret, windowStart + 4);
  const preferOpen = windowStart === 0;
  const result: FrettedScaleNote[] = [];
  let minAllowedMidi = -1;

  tuning.forEach((openNote, stringIndex) => {
    const openMidi = spelledToMidi(openNote);
    let hits = findWindowFretsForString(openMidi, lookup, windowStart, windowEnd, preferOpen)
      .filter((h) => h.midi > minAllowedMidi);

    // Tolerancia de extensión de 1 traste si una cuerda queda vacía
    if (hits.length === 0 && windowEnd + 1 <= maxFret) {
      hits = findWindowFretsForString(openMidi, lookup, windowStart, windowEnd + 1, preferOpen)
        .filter((h) => h.midi > minAllowedMidi);
    }
    if (hits.length === 0 && windowStart > 0) {
      hits = findWindowFretsForString(openMidi, lookup, windowStart - 1, windowEnd, preferOpen)
        .filter((h) => h.midi > minAllowedMidi);
    }

    for (const h of hits) {
      result.push(makeNote(stringIndex, h.fret, h.midi, h.info));
      minAllowedMidi = h.midi;
    }
  });

  return result;
}

function generate3NpsFingering(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  position: number,
  maxFret: number
): FrettedScaleNote[] {
  if (scale.intervals.length < 7) {
    return generateBoxFingering(tuning, root, scale, position, maxFret);
  }
  const lookup = buildPcLookup(root, scale);
  const rootPc = pitchClassOf(root);
  const n = scale.intervals.length;
  const startDegIdx = (((position - 1) % n) + n) % n;
  const startInterval = scale.intervals[startDegIdx]!;
  const targetStartPc = mod12(rootPc + startInterval);

  const open0 = spelledToMidi(tuning[0]!);
  let startFret = mod12(targetStartPc - mod12(open0));
  if (startFret === 0 && startInterval > 0) startFret = 12;

  const attempt = (initialMidi: number): { notes: FrettedScaleNote[]; maxSpan: number } => {
    const notes: FrettedScaleNote[] = [];
    let degIdx = startDegIdx;
    let prevMidi = initialMidi - 1;
    let maxSpan = 0;

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
      const openMidi = spelledToMidi(tuning[stringIndex]!);
      const stringNotes: FrettedScaleNote[] = [];
      for (let count = 0; count < 3; count++) {
        const pc = mod12(rootPc + scale.intervals[degIdx % n]!);
        const info = lookup.get(pc)!;
        let midi = prevMidi + 1;
        while (mod12(midi) !== pc) midi++;
        const fret = midi - openMidi;
        if (fret < 0 || fret > maxFret) {
          return { notes: [], maxSpan: 99 };
        }
        stringNotes.push(makeNote(stringIndex, fret, midi, info));
        prevMidi = midi;
        degIdx++;
      }
      const span = stringNotes[2]!.fret - stringNotes[0]!.fret;
      if (span > maxSpan) maxSpan = span;
      notes.push(...stringNotes);
    }
    return { notes, maxSpan };
  };

  let best = attempt(open0 + startFret);
  if (best.notes.length === 0 || best.maxSpan > 5) {
    const octaveUp = attempt(open0 + startFret + 12);
    if (octaveUp.notes.length > 0 && (best.notes.length === 0 || octaveUp.maxSpan < best.maxSpan)) {
      best = octaveUp;
    }
  }
  if (best.notes.length > 0 && best.maxSpan <= 6) {
    return best.notes;
  }
  return generateBoxFingering(tuning, root, scale, position, maxFret);
}

function generateTwoOctavesFingering(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  position: number,
  maxFret: number
): FrettedScaleNote[] {
  const lookup = buildPcLookup(root, scale);
  const rootPc = pitchClassOf(root);

  // Buscar tónica inicial en las 2 cuerdas más graves según posición
  const candidateStrings = tuning.length >= 2 ? [0, 1] : [0];
  let bestStart: { stringIndex: number; fret: number; midi: number } | null = null;
  const preferredCenterFret = Math.min(12, Math.max(1, (position - 1) * 3 + 2));

  for (const sIdx of candidateStrings) {
    const openMidi = spelledToMidi(tuning[sIdx]!);
    for (const shift of [0, 12]) {
      const f = mod12(rootPc - mod12(openMidi)) + shift;
      if (f <= maxFret - 2) {
        const dist = Math.abs(f - preferredCenterFret);
        if (!bestStart || dist < Math.abs(bestStart.fret - preferredCenterFret)) {
          bestStart = { stringIndex: sIdx, fret: f, midi: openMidi + f };
        }
      }
    }
  }

  if (!bestStart) {
    return generateBoxFingering(tuning, root, scale, position, maxFret);
  }

  // Secuencia MIDI de 2 octavas completas + tónica final
  const targetMidis: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const st of scale.intervals) {
      targetMidis.push(bestStart.midi + oct * 12 + st);
    }
  }
  targetMidis.push(bestStart.midi + 24);

  const notes: FrettedScaleNote[] = [];
  let minString = bestStart.stringIndex;
  let handCenter = Math.max(2, bestStart.fret);

  for (const targetMidi of targetMidis) {
    let chosen: { stringIndex: number; fret: number; cost: number } | null = null;
    for (let sIdx = minString; sIdx < tuning.length; sIdx++) {
      const openMidi = spelledToMidi(tuning[sIdx]!);
      const fret = targetMidi - openMidi;
      if (fret < 0 || fret > maxFret) continue;
      const stretch = fret === 0 ? 0.5 : Math.abs(fret - handCenter);
      const stringChangePenalty = (sIdx - minString) * 0.4;
      const cost = stretch + stringChangePenalty;
      if (!chosen || cost < chosen.cost) {
        chosen = { stringIndex: sIdx, fret, cost };
      }
    }
    if (!chosen) break;
    const info = lookup.get(mod12(targetMidi))!;
    notes.push(makeNote(chosen.stringIndex, chosen.fret, targetMidi, info));
    minString = chosen.stringIndex;
    if (chosen.fret > 0) {
      handCenter = 0.7 * handCenter + 0.3 * chosen.fret;
    }
  }

  return notes;
}

function generateSingleStringFingering(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  stringIndex: number,
  maxFret: number
): FrettedScaleNote[] {
  const safeIdx = Math.max(0, Math.min(tuning.length - 1, stringIndex));
  const openMidi = spelledToMidi(tuning[safeIdx]!);
  const lookup = buildPcLookup(root, scale);
  const limit = Math.max(15, maxFret);
  const out: FrettedScaleNote[] = [];
  let started = false;

  for (let fret = 0; fret <= limit; fret++) {
    const midi = openMidi + fret;
    const info = lookup.get(mod12(midi));
    if (!info) continue;
    if (!started && info.role === 'root') started = true;
    if (started) {
      out.push(makeNote(safeIdx, fret, midi, info));
    }
  }
  if (out.length < 4) {
    // Fallback si la tónica recién aparece muy arriba del diapasón
    return buildFretboardScaleMap([tuning[safeIdx]!], root, scale, limit).map((n) => ({
      ...n,
      stringIndex: safeIdx,
    }));
  }
  return out;
}

function generateSweepFingering(
  tuning: readonly SpelledNote[],
  root: PitchName,
  scale: ScaleDefinition,
  position: number,
  sweepStrings: 3 | 4 | 5,
  maxFret: number
): FrettedScaleNote[] {
  const lookup = buildPcLookup(root, scale);
  const rootPc = pitchClassOf(root);
  const count = Math.min(sweepStrings, tuning.length);
  const startString = tuning.length - count;
  const startOpen = spelledToMidi(tuning[startString]!);

  const clampedPos = Math.max(1, Math.min(4, position));
  let bestForm: FrettedScaleNote[] = [];
  let bestAnchorDist = Infinity;
  const desiredAnchor = (clampedPos - 1) * 3 + 2;

  for (const shift of [0, 12]) {
    const rootFret = mod12(rootPc - mod12(startOpen)) + shift;
    if (rootFret < 0 || rootFret > maxFret) continue;
    const rootMidi = startOpen + rootFret;
    const form: FrettedScaleNote[] = [];
    let prevMidi = rootMidi - 1;
    let minFretUsed = Infinity;
    let maxFretUsed = -Infinity;
    let valid = true;

    for (let sIdx = startString; sIdx < tuning.length; sIdx++) {
      const openMidi = spelledToMidi(tuning[sIdx]!);
      const isTopString = sIdx === tuning.length - 1;
      const needed = isTopString ? 2 : 1;
      const startFrom = Math.max(prevMidi + 1, openMidi);
      let foundOnString = 0;

      for (let fret = Math.max(0, startFrom - openMidi); fret <= maxFret && foundOnString < needed; fret++) {
        const midi = openMidi + fret;
        if (midi <= prevMidi) continue;
        const info = lookup.get(mod12(midi));
        if (!info) continue;
        const candidateMin = fret > 0 ? Math.min(minFretUsed, fret) : minFretUsed;
        const candidateMax = fret > 0 ? Math.max(maxFretUsed, fret) : maxFretUsed;
        if (
          Number.isFinite(candidateMin) &&
          Number.isFinite(candidateMax) &&
          candidateMax - candidateMin > 5
        ) {
          continue;
        }
        form.push(makeNote(sIdx, fret, midi, info));
        prevMidi = midi;
        if (fret > 0) {
          minFretUsed = candidateMin;
          maxFretUsed = candidateMax;
        }
        foundOnString++;
      }

      if (foundOnString < 1) {
        valid = false;
        break;
      }
    }

    if (valid && form.length >= count) {
      const dist = Math.abs(rootFret - desiredAnchor);
      if (dist < bestAnchorDist) {
        bestAnchorDist = dist;
        bestForm = form;
      }
    }
  }

  return bestForm.length > 0
    ? bestForm
    : generateBoxFingering(tuning, root, scale, position, maxFret);
}

/** Calcula la secuencia ascendente determinística de notas digitadas sobre el mástil. */
export function computeScaleFingering(req: FingeringRequest): FrettedScaleNote[] {
  const maxFret = req.maxFret ?? (req.system === 'single-string' ? 22 : 15);
  const position = req.position ?? 1;

  if (req.tuning.length === 0) return [];

  switch (req.system) {
    case '3nps':
      return generate3NpsFingering(req.tuning, req.root, req.scale, position, maxFret);
    case 'two-octaves':
      return generateTwoOctavesFingering(req.tuning, req.root, req.scale, position, maxFret);
    case 'single-string':
      return generateSingleStringFingering(
        req.tuning,
        req.root,
        req.scale,
        req.stringIndex ?? 0,
        maxFret
      );
    case 'sweep':
      return generateSweepFingering(
        req.tuning,
        req.root,
        req.scale,
        position,
        req.sweepStrings ?? (req.tuning.length >= 5 ? 5 : 3),
        maxFret
      );
    case 'caged':
    default:
      return generateBoxFingering(req.tuning, req.root, req.scale, position, maxFret);
  }
}
