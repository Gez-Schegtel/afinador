import { describe, expect, it } from 'vitest';
import { identifyChord, type IdentifyResult } from './chord-identify';
import { formatPitchName } from './spelling';
import { findTuning, standardTuningFor, tuningMidis } from './tunings';

const GUITAR = tuningMidis(standardTuningFor('guitar6'));
const BASS = tuningMidis(findTuning('bass4-standard')!);

/** Convierte un cifrado tipo 'x32010' en notas MIDI para la afinación dada. */
function shape(tab: string, tuning: readonly number[]): number[] {
  return [...tab].flatMap((c, i) => (c === 'x' ? [] : [tuning[i]! + Number(c)]));
}

function symbols(result: IdentifyResult): string[] {
  return result.kind === 'chord' ? result.readings.map((r) => r.symbol) : [];
}

describe('Identificador de acordes (Spec 005)', () => {
  it('reconoce formas abiertas comunes', () => {
    expect(symbols(identifyChord(shape('x32010', GUITAR)))[0]).toBe('C');
    expect(symbols(identifyChord(shape('022000', GUITAR)))[0]).toBe('Em');
    expect(symbols(identifyChord(shape('xx0232', GUITAR)))[0]).toBe('D');
    expect(symbols(identifyChord(shape('xx0212', GUITAR)))[0]).toBe('D7');
    expect(symbols(identifyChord(shape('x24432', GUITAR)))[0]).toBe('Bm');
    expect(symbols(identifyChord(shape('320003', GUITAR)))[0]).toBe('G');
  });

  it('muestra todas las lecturas válidas en orden (Am7 vs C6/A)', () => {
    const am7 = symbols(identifyChord(shape('x02010', GUITAR)));
    expect(am7[0]).toBe('Am7');
    expect(am7).toContain('C6/A');

    // Tríada exacta invertida antes que una sexta sin quinta.
    const amOverC = identifyChord(shape('x32210', GUITAR));
    expect(symbols(amOverC)[0]).toBe('Am/C');
    expect(symbols(amOverC)).toContain('C6');
    if (amOverC.kind === 'chord') {
      expect(amOverC.readings[0]!.inversion).toBe('1ª inversión');
      expect(amOverC.readings[0]!.nameEs).toBe('La menor, con bajo en Do (1ª inversión)');
      expect(amOverC.readings.find((r) => r.symbol === 'C6')!.omitsFifth).toBe(true);
    }
  });

  it('acorde de quinta y acordes simétricos', () => {
    expect(symbols(identifyChord(shape('x355xx', GUITAR)))).toEqual(['C5']);
    expect(symbols(identifyChord(shape('x3424x', GUITAR)))).toEqual([
      'C°7',
      'D♯°7/C',
      'F♯°7/C',
      'A°7/C',
    ]);
    // C E G♯ con Do en el bajo. En E+ (E G♯ B♯) el bajo es una nota del acorde: se escribe B♯.
    expect(symbols(identifyChord([48, 52, 56]))).toEqual(['C+', 'E+/B♯', 'A♭+/C']);
  });

  it('elige la ortografía con menos alteraciones', () => {
    const dFlat = identifyChord([49, 53, 56]); // C♯/D♭ mayor
    expect(symbols(dFlat)[0]).toBe('D♭');
    const eFlat = identifyChord([51, 55, 58]);
    expect(symbols(eFlat)[0]).toBe('E♭');
    const cSharpMinor = identifyChord([49, 52, 56]);
    expect(symbols(cSharpMinor)[0]).toBe('C♯m');
    // Empate F♯ / G♭: sostenidos primero e indicación del equivalente.
    const fSharp = identifyChord([54, 58, 61]);
    expect(symbols(fSharp)[0]).toBe('F♯');
    if (fSharp.kind === 'chord') {
      expect(formatPitchName(fSharp.readings[0]!.enharmonicRoot!)).toBe('G♭');
    }
  });

  it('nombra intervalos de dos notas y conjuntos sin lectura', () => {
    const third = identifyChord([48, 52]);
    expect(third.kind).toBe('interval');
    if (third.kind === 'interval') {
      expect(third.interval.name).toBe('3ª mayor');
      expect(formatPitchName(third.interval.upper)).toBe('E');
    }
    const tritone = identifyChord([48, 54]);
    if (tritone.kind === 'interval') {
      expect(tritone.interval.name).toContain('tritono');
      expect(formatPitchName(tritone.interval.upper)).toBe('F♯');
    }
    const cluster = identifyChord([48, 49, 50]);
    expect(cluster.kind).toBe('unknown');
    expect(identifyChord([]).kind).toBe('empty');
    expect(identifyChord([40, 52]).kind).toBe('single');
  });

  it('funciona en el bajo de 4 cuerdas', () => {
    expect(symbols(identifyChord(shape('x35x', BASS)))).toEqual(['C5']);
    expect(symbols(identifyChord(shape('875x', BASS)))[0]).toBe('C');
  });
});
