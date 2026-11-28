// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Cálculo puro de transposición y cejilla matemática (Capo 0–12) para cifrados de acordes (Spec 012).
 * Conecta directamente con `chords.ts` y `spelling.ts` para preservar calidad, bajo invertido y
 * generar posiciones interactivas en `ChordDiagram.tsx`.
 */

import {
  CHORD_QUALITIES,
  type ChordQuality,
} from './chords';
import {
  defaultSharpPitchName,
  formatPitchName,
  mod12,
  parsePitchName,
  pitchClassOf,
  type PitchName,
} from './spelling';

export interface ParsedChordSymbol {
  readonly raw: string;
  readonly root: PitchName;
  readonly qualityRaw: string;
  readonly quality: ChordQuality | null;
  readonly bass: PitchName | null;
}

const FLAT_ROOTS: readonly PitchName[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
].map(parsePitchName);

function spellTransposedRoot(pc: number, preferFlats: boolean): PitchName {
  if (preferFlats) return FLAT_ROOTS[mod12(pc)]!;
  return defaultSharpPitchName(mod12(pc));
}

function normalizeSymbolAlias(q: string): string {
  return q
    .trim()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/Δ/g, 'maj')
    .replace(/°/g, 'dim')
    .replace(/ø/g, 'm7b5');
}

function matchChordQuality(rawSuffix: string): ChordQuality | null {
  const norm = normalizeSymbolAlias(rawSuffix);
  for (const q of CHORD_QUALITIES) {
    if (normalizeSymbolAlias(q.symbol).toLowerCase() === norm.toLowerCase()) {
      return q;
    }
    if (q.altSymbols.some((alt) => normalizeSymbolAlias(alt).toLowerCase() === norm.toLowerCase())) {
      return q;
    }
  }
  return null;
}

export function parseChordSymbol(symbol: string): ParsedChordSymbol | null {
  const trimmed = symbol.trim();
  const m = /^([A-Ga-g](?:[#♯b♭]{1,2})?)(.*?)(?:\/([A-Ga-g](?:[#♯b♭]{1,2})?))?$/.exec(trimmed);
  if (!m) return null;

  let root: PitchName;
  let bass: PitchName | null = null;
  try {
    root = parsePitchName(m[1]!.replace(/♯/g, '#').replace(/♭/g, 'b'));
    if (m[3]) {
      bass = parsePitchName(m[3].replace(/♯/g, '#').replace(/♭/g, 'b'));
    }
  } catch {
    return null;
  }

  const qualityRaw = m[2] ?? '';
  const quality = matchChordQuality(qualityRaw);
  return {
    raw: trimmed,
    root,
    qualityRaw,
    quality,
    bass,
  };
}

export function transposeChordSymbol(
  symbol: string,
  semitones: number,
  preferFlats?: boolean
): string {
  const parsed = parseChordSymbol(symbol);
  if (!parsed || semitones === 0) return symbol;

  const useFlats =
    preferFlats ?? (parsed.root.accidental < 0 || semitones < 0);
  const newRootPc = mod12(pitchClassOf(parsed.root) + semitones);
  const newRoot = spellTransposedRoot(newRootPc, useFlats);
  const rootStr = formatPitchName(newRoot);

  let bassStr = '';
  if (parsed.bass) {
    const newBassPc = mod12(pitchClassOf(parsed.bass) + semitones);
    const newBass = spellTransposedRoot(newBassPc, useFlats);
    bassStr = `/${formatPitchName(newBass)}`;
  }

  return `${rootStr}${parsed.qualityRaw}${bassStr}`;
}

/**
 * Dado un acorde real que suena (`soundingChord`) y la posición de cejilla (`capo` 0–12),
 * calcula el acorde de postura relativa (`sounding - capo` semitonos) que el guitarrista pisa.
 */
export function computeShapeChordForCapo(
  soundingChord: string,
  capo: number,
  preferFlats?: boolean
): string {
  const clamped = Math.max(0, Math.min(12, Math.trunc(capo)));
  if (clamped === 0) return soundingChord;
  return transposeChordSymbol(soundingChord, -clamped, preferFlats);
}

export function describeCapoEffect(soundingKey: string, capo: number): string {
  const clamped = Math.max(0, Math.min(12, Math.trunc(capo)));
  if (clamped === 0) return soundingKey ? `Sin cejilla · Tonalidad ${soundingKey}` : 'Sin cejilla (Capo 0)';
  if (!soundingKey) return `Formas con Capo ${clamped}`;
  const shapeKey = computeShapeChordForCapo(soundingKey, clamped);
  return `Sonando en ${soundingKey} · Formas en ${shapeKey} con Capo ${clamped}`;
}
