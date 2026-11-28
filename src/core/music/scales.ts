// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Catálogo teórico de escalas, modos griegos, menor armónica/melódica, pentatónicas,
 * simétricas y arpegios (Spec 010). Núcleo 100% puro (cero React, DOM o IA).
 */

import { interval, intervalLabel, transpose } from './intervals';
import {
  defaultSharpPitchName,
  mod12,
  pitchClassOf,
  samePitchName,
  totalAccidentals,
  type PitchName,
} from './spelling';
import { DICTIONARY_ROOTS } from './chords';

export type ScaleCategory =
  | 'diatonic'
  | 'harmonic-minor'
  | 'melodic-minor'
  | 'pentatonic-exotic'
  | 'arpeggio-triad'
  | 'arpeggio-tetrad';

export const SCALE_CATEGORY_ORDER: readonly ScaleCategory[] = [
  'diatonic',
  'harmonic-minor',
  'melodic-minor',
  'pentatonic-exotic',
  'arpeggio-triad',
  'arpeggio-tetrad',
];

export const SCALE_CATEGORY_LABELS: Readonly<Record<ScaleCategory, string>> = {
  diatonic: 'Modos Griegos (Diatónica)',
  'harmonic-minor': 'Menor Armónica y Modos',
  'melodic-minor': 'Menor Melódica y Modos',
  'pentatonic-exotic': 'Pentatónicas, Blues, Exóticas y Simétricas',
  'arpeggio-triad': 'Arpegios de Tríada',
  'arpeggio-tetrad': 'Arpegios de Cuatríada y 9ª',
};

export interface ScaleDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: ScaleCategory;
  readonly intervals: readonly number[];
  readonly degreeLabels: readonly string[];
  readonly characteristicDegrees: readonly string[];
  readonly chordDegreeIndices: readonly number[];
  /** Calidad del acorde del catálogo `chords.ts` para el acompañamiento/drone modal. */
  readonly droneQualityId: string;
  readonly isArpeggio: boolean;
  readonly description: string;
}

function scaleDef(
  id: string,
  name: string,
  category: ScaleCategory,
  intervals: readonly number[],
  formula: string,
  characteristic: readonly string[],
  chordDegreeIndices: readonly number[],
  droneQualityId: string,
  description: string
): ScaleDefinition {
  const degreeLabels = formula.split(' ').map((tok) => intervalLabel(interval(tok)));
  return {
    id,
    name,
    category,
    intervals,
    degreeLabels,
    characteristicDegrees: characteristic.map((tok) => intervalLabel(interval(tok))),
    chordDegreeIndices,
    droneQualityId,
    isArpeggio: category === 'arpeggio-triad' || category === 'arpeggio-tetrad',
    description,
  };
}

export const SCALES_CATALOG: readonly ScaleDefinition[] = [
  // --- 2.1 Modos Griegos ---
  scaleDef(
    'ionian',
    'Jónico (Mayor)',
    'diatonic',
    [0, 2, 4, 5, 7, 9, 11],
    '1 2 3 4 5 6 7',
    ['4', '7'],
    [0, 2, 4, 6],
    'maj7',
    'Escala mayor natural'
  ),
  scaleDef(
    'dorian',
    'Dórico',
    'diatonic',
    [0, 2, 3, 5, 7, 9, 10],
    '1 2 b3 4 5 6 b7',
    ['6'],
    [0, 2, 4, 6],
    'm7',
    'Menor con 6ª mayor característica'
  ),
  scaleDef(
    'phrygian',
    'Frigio',
    'diatonic',
    [0, 1, 3, 5, 7, 8, 10],
    '1 b2 b3 4 5 b6 b7',
    ['b2'],
    [0, 2, 4, 6],
    'm7',
    'Tensión oscura por 2ª menor'
  ),
  scaleDef(
    'lydian',
    'Lidio',
    'diatonic',
    [0, 2, 4, 6, 7, 9, 11],
    '1 2 3 #4 5 6 7',
    ['#4'],
    [0, 2, 4, 6],
    'maj7',
    'Mayor brillante con 4ª aumentada'
  ),
  scaleDef(
    'mixolydian',
    'Mixolidio',
    'diatonic',
    [0, 2, 4, 5, 7, 9, 10],
    '1 2 3 4 5 6 b7',
    ['b7'],
    [0, 2, 4, 6],
    '7',
    'Modo dominante (rock / stoner / blues)'
  ),
  scaleDef(
    'aeolian',
    'Eólico (Menor Natural)',
    'diatonic',
    [0, 2, 3, 5, 7, 8, 10],
    '1 2 b3 4 5 b6 b7',
    ['b6'],
    [0, 2, 4, 6],
    'm7',
    'Escala menor natural'
  ),
  scaleDef(
    'locrian',
    'Locrio',
    'diatonic',
    [0, 1, 3, 5, 6, 8, 10],
    '1 b2 b3 4 b5 b6 b7',
    ['b2', 'b5'],
    [0, 2, 4, 6],
    'm7b5',
    'Semidisminuido con 5ª disminuida'
  ),

  // --- 2.2 Menor Armónica y Modos Clave ---
  scaleDef(
    'harmonic-minor',
    'Menor Armónica',
    'harmonic-minor',
    [0, 2, 3, 5, 7, 8, 11],
    '1 2 b3 4 5 b6 7',
    ['7'],
    [0, 2, 4, 6],
    'mMaj7',
    'Neoclásico, menor dramático con 7ª mayor'
  ),
  scaleDef(
    'phrygian-dominant',
    'Frigio Dominante (5º modo)',
    'harmonic-minor',
    [0, 1, 4, 5, 7, 8, 10],
    '1 b2 3 4 5 b6 b7',
    ['b2', '3'],
    [0, 2, 4, 6],
    '7',
    'Flamenco, metal, dominante V7♭9'
  ),
  scaleDef(
    'lydian-sharp2',
    'Lidio ♯2 (6º modo)',
    'harmonic-minor',
    [0, 3, 4, 6, 7, 9, 11],
    '1 #2 3 #4 5 6 7',
    ['#2', '#4'],
    [0, 2, 4, 6],
    'maj7',
    'Color sobre acordes maj7'
  ),
  scaleDef(
    'ultralocrian-bb7',
    'Superlocrio 𝄫7 (7º modo)',
    'harmonic-minor',
    [0, 1, 3, 4, 6, 8, 9],
    '1 b2 b3 b4 b5 b6 bb7',
    ['b4', 'bb7'],
    [0, 2, 4, 6],
    'dim7',
    'Modo alterado armónico sobre acordes °7'
  ),

  // --- 2.3 Menor Melódica y Modos Clave ---
  scaleDef(
    'melodic-minor',
    'Menor Melódica',
    'melodic-minor',
    [0, 2, 3, 5, 7, 9, 11],
    '1 2 b3 4 5 6 7',
    ['6', '7'],
    [0, 2, 4, 6],
    'mMaj7',
    'Jazz, fusión y acorde m(maj7)'
  ),
  scaleDef(
    'dorian-b2',
    'Dórico ♭2 (2º modo)',
    'melodic-minor',
    [0, 1, 3, 5, 7, 9, 10],
    '1 b2 b3 4 5 6 b7',
    ['b2', '6'],
    [0, 2, 4, 6],
    'm7',
    'Sonoridad sus♭9'
  ),
  scaleDef(
    'lydian-augmented',
    'Lidio Aumentado (3º modo)',
    'melodic-minor',
    [0, 2, 4, 6, 8, 9, 11],
    '1 2 3 #4 #5 6 7',
    ['#4', '#5'],
    [0, 2, 4, 6],
    'maj7',
    'Color sobre maj7♯5'
  ),
  scaleDef(
    'lydian-dominant',
    'Lidio Dominante (4º modo)',
    'melodic-minor',
    [0, 2, 4, 6, 7, 9, 10],
    '1 2 3 #4 5 6 b7',
    ['#4', 'b7'],
    [0, 2, 4, 6],
    '7',
    'Sonoridad 7♯11, jazz/fusión'
  ),
  scaleDef(
    'mixolydian-b6',
    'Mixolidio ♭6 (5º modo)',
    'melodic-minor',
    [0, 2, 4, 5, 7, 8, 10],
    '1 2 3 4 5 b6 b7',
    ['3', 'b6'],
    [0, 2, 4, 6],
    '7',
    'Dominante con ♭13'
  ),
  scaleDef(
    'locrian-nat2',
    'Locrio ♮2 (6º modo)',
    'melodic-minor',
    [0, 2, 3, 5, 6, 8, 10],
    '1 2 b3 4 b5 b6 b7',
    ['2', 'b5'],
    [0, 2, 4, 6],
    'm7b5',
    'Escala semidisminuida m7♭5'
  ),
  scaleDef(
    'altered',
    'Superlocrio / Escala Alterada (7º modo)',
    'melodic-minor',
    [0, 1, 3, 4, 6, 8, 10],
    '1 b2 #2 3 b5 #5 b7',
    ['b2', 'b5', '#5'],
    [0, 3, 4, 6],
    '7',
    'Dominante alterado 7alt'
  ),

  // --- 2.4 Pentatónicas, Blues, Exóticas y Simétricas ---
  scaleDef(
    'pentatonic-major',
    'Pentatónica Mayor',
    'pentatonic-exotic',
    [0, 2, 4, 7, 9],
    '1 2 3 5 6',
    ['3', '6'],
    [0, 2, 3],
    'maj',
    '5 notas mayores brillantes'
  ),
  scaleDef(
    'pentatonic-minor',
    'Pentatónica Menor',
    'pentatonic-exotic',
    [0, 3, 5, 7, 10],
    '1 b3 4 5 b7',
    ['b3', 'b7'],
    [0, 1, 3, 4],
    'm7',
    'Base esencial de rock, metal y blues'
  ),
  scaleDef(
    'blues-minor',
    'Escala de Blues Menor',
    'pentatonic-exotic',
    [0, 3, 5, 6, 7, 10],
    '1 b3 4 b5 5 b7',
    ['b5'],
    [0, 1, 4, 5],
    'm7',
    'Pentatónica menor con nota blue (♭5)'
  ),
  scaleDef(
    'blues-major',
    'Escala de Blues Mayor',
    'pentatonic-exotic',
    [0, 2, 3, 4, 7, 9],
    '1 2 b3 3 5 6',
    ['b3', '3'],
    [0, 3, 4],
    '6',
    'Pentatónica mayor con paso cromático ♭3→3'
  ),
  scaleDef(
    'whole-tone',
    'Tonos Enteros',
    'pentatonic-exotic',
    [0, 2, 4, 6, 8, 10],
    '1 2 3 #4 #5 b7',
    ['#4', '#5'],
    [0, 2, 4],
    'aug',
    'Simétrica hexatónica por tonos completos'
  ),
  scaleDef(
    'diminished-wh',
    'Disminuida (Tono–Semitono)',
    'pentatonic-exotic',
    [0, 2, 3, 5, 6, 8, 9, 11],
    '1 2 b3 4 b5 b6 6 7',
    ['b5', '6'],
    [0, 2, 4, 6],
    'dim7',
    'Octatónica simétrica para acordes °7'
  ),
  scaleDef(
    'diminished-hw',
    'Disminuida (Semitono–Tono)',
    'pentatonic-exotic',
    [0, 1, 3, 4, 6, 7, 9, 10],
    '1 b2 #2 3 #4 5 6 b7',
    ['b2', '#4'],
    [0, 3, 5, 7],
    '7',
    'Octatónica simétrica para dominantes 7♭9/13'
  ),
  scaleDef(
    'hirajoshi',
    'Hirajoshi / Japonesa',
    'pentatonic-exotic',
    [0, 2, 3, 7, 8],
    '1 2 b3 5 b6',
    ['b3', 'b6'],
    [0, 2, 3],
    'min',
    'Pentatónica tradicional japonesa menor'
  ),
  scaleDef(
    'double-harmonic',
    'Doble Armónica Mayor (Bizantina)',
    'pentatonic-exotic',
    [0, 1, 4, 5, 7, 8, 11],
    '1 b2 3 4 5 b6 7',
    ['b2', '7'],
    [0, 2, 4, 6],
    'maj7',
    'Exótica árabe / bizantina / doom oriental'
  ),
  scaleDef(
    'chromatic',
    'Cromática (Calentamiento)',
    'pentatonic-exotic',
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    '1 b2 2 b3 3 4 #4 5 b6 6 b7 7',
    [],
    [0, 4, 7],
    '5',
    'Los 12 semitonos consecutivos'
  ),

  // --- 2.5 Arpegios de Tríada y Cuatríada ---
  scaleDef('arp-maj', 'Arpegio Mayor', 'arpeggio-triad', [0, 4, 7], '1 3 5', ['3'], [0, 1, 2], 'maj', 'Tríada mayor'),
  scaleDef('arp-min', 'Arpegio Menor', 'arpeggio-triad', [0, 3, 7], '1 b3 5', ['b3'], [0, 1, 2], 'min', 'Tríada menor'),
  scaleDef('arp-aug', 'Arpegio Aumentado', 'arpeggio-triad', [0, 4, 8], '1 3 #5', ['#5'], [0, 1, 2], 'aug', 'Tríada aumentada'),
  scaleDef('arp-dim', 'Arpegio Disminuido', 'arpeggio-triad', [0, 3, 6], '1 b3 b5', ['b5'], [0, 1, 2], 'dim', 'Tríada disminuida'),
  scaleDef('arp-sus2', 'Arpegio Sus2', 'arpeggio-triad', [0, 2, 7], '1 2 5', ['2'], [0, 1, 2], 'sus2', 'Tríada suspendida 2ª'),
  scaleDef('arp-sus4', 'Arpegio Sus4', 'arpeggio-triad', [0, 5, 7], '1 4 5', ['4'], [0, 1, 2], 'sus4', 'Tríada suspendida 4ª'),

  scaleDef('arp-maj7', 'Arpegio Maj7', 'arpeggio-tetrad', [0, 4, 7, 11], '1 3 5 7', ['7'], [0, 1, 2, 3], 'maj7', 'Cuatríada mayor 7ª'),
  scaleDef('arp-m7', 'Arpegio Menor 7 (m7)', 'arpeggio-tetrad', [0, 3, 7, 10], '1 b3 5 b7', ['b3', 'b7'], [0, 1, 2, 3], 'm7', 'Cuatríada menor 7ª'),
  scaleDef('arp-7', 'Arpegio Dominante 7', 'arpeggio-tetrad', [0, 4, 7, 10], '1 3 5 b7', ['3', 'b7'], [0, 1, 2, 3], '7', 'Cuatríada dominante'),
  scaleDef('arp-m7b5', 'Arpegio Semidisminuido (m7♭5)', 'arpeggio-tetrad', [0, 3, 6, 10], '1 b3 b5 b7', ['b5', 'b7'], [0, 1, 2, 3], 'm7b5', 'Cuatríada semidisminuida'),
  scaleDef('arp-dim7', 'Arpegio Disminuido 7 (°7)', 'arpeggio-tetrad', [0, 3, 6, 9], '1 b3 b5 bb7', ['b5', 'bb7'], [0, 1, 2, 3], 'dim7', 'Cuatríada disminuida simétrica'),
  scaleDef('arp-mmaj7', 'Arpegio m(Maj7)', 'arpeggio-tetrad', [0, 3, 7, 11], '1 b3 5 7', ['b3', '7'], [0, 1, 2, 3], 'mMaj7', 'Menor con séptima mayor'),
  scaleDef('arp-maj7sharp5', 'Arpegio Maj7♯5', 'arpeggio-tetrad', [0, 4, 8, 11], '1 3 #5 7', ['#5', '7'], [0, 1, 2, 3], 'maj7', 'Aumentado con séptima mayor'),
  scaleDef('arp-9', 'Arpegio Dominante 9', 'arpeggio-tetrad', [0, 2, 4, 7, 10], '1 2 3 5 b7', ['2', 'b7'], [0, 2, 3, 4], '9', 'Arpegio dominante con 9ª'),
];

export function findScale(id: string | null | undefined): ScaleDefinition | undefined {
  return SCALES_CATALOG.find((s) => s.id === id);
}

export function scalesForCategory(category: ScaleCategory): readonly ScaleDefinition[] {
  return SCALES_CATALOG.filter((s) => s.category === category);
}

function trySpellAll(root: PitchName, degreeLabels: readonly string[]): PitchName[] | null {
  const spelled: PitchName[] = [];
  for (const label of degreeLabels) {
    try {
      spelled.push(transpose(root, interval(label)));
    } catch {
      return null;
    }
  }
  return spelled;
}

/**
 * Escribe las notas de la escala/arpegio sobre `root` usando intervalos teóricos estrictos.
 * Si la raíz enarmónica elegida provocaría triples alteraciones (p. ej. D♯ en 𝄫7), recurre a
 * la raíz enarmónica con menos alteraciones (p. ej. E♭) manteniendo exactamente las mismas alturas.
 */
export function spellScale(root: PitchName, scale: ScaleDefinition): PitchName[] {
  const direct = trySpellAll(root, scale.degreeLabels);
  if (direct) return direct;

  const rootPc = pitchClassOf(root);
  const candidates = DICTIONARY_ROOTS.filter(
    (r) => pitchClassOf(r) === rootPc && !samePitchName(r, root)
  );

  let bestNotes: PitchName[] | null = null;
  let bestCost = Infinity;
  for (const alt of candidates) {
    const attempt = trySpellAll(alt, scale.degreeLabels);
    if (!attempt) continue;
    const cost = totalAccidentals(attempt);
    if (cost < bestCost) {
      bestCost = cost;
      bestNotes = attempt;
    }
  }
  if (bestNotes) return bestNotes;

  return scale.intervals.map((st) => defaultSharpPitchName(mod12(rootPc + st)));
}
