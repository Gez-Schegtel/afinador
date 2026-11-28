// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  computeShapeChordForCapo,
  describeCapoEffect,
  parseChordSymbol,
  transposeChordSymbol,
} from './capo';
import { mod12, pitchClassOf } from './spelling';

describe('Cejilla matemática Capo 0–12 y transposición de cifrados (Spec 012)', () => {
  it('transpone acordes y conserva bajos invertidos sin perder la calidad', () => {
    expect(transposeChordSymbol('Am7/G', 2)).toBe('Bm7/A');
    expect(transposeChordSymbol('C/E', -1)).toBe('B/E♭');
    expect(transposeChordSymbol('F♯m7', 1)).toBe('Gm7');
  });

  it('calcula posturas equivalentes para Capo 0..12 conservando la altura real MIDI', () => {
    const sounding = 'B♭';
    for (let capo = 0; capo <= 12; capo++) {
      const shape = computeShapeChordForCapo(sounding, capo);
      const parsedSounding = parseChordSymbol(sounding)!;
      const parsedShape = parseChordSymbol(shape)!;
      expect(mod12(pitchClassOf(parsedShape.root) + capo)).toBe(
        mod12(pitchClassOf(parsedSounding.root))
      );
    }
    expect(computeShapeChordForCapo('B♭m7/D♭', 1)).toBe('Am7/C');
    expect(describeCapoEffect('B♭', 1)).toContain('Capo 1');
  });
});
