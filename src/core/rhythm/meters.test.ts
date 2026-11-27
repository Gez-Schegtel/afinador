import { describe, expect, it } from 'vitest';
import {
  BEAT_UNIT_PLURALS,
  DEFAULT_METRONOME_SETTINGS,
  MAX_BPM,
  MIN_BPM,
  METERS,
  MetronomeTimeline,
  buildBarPattern,
  clampBpm,
  getMeter,
  resolveMetronomeSettings,
  unitSeconds,
  type MetronomeSettings,
} from './meters';

const settings = (over: Partial<MetronomeSettings>): MetronomeSettings => ({
  ...DEFAULT_METRONOME_SETTINGS,
  ...over,
});

describe('Compases y patrones de clic (Spec 004)', () => {
  it('4/4: cuatro clics de negra con acento solo en el primero', () => {
    const p = buildBarPattern(settings({ meterId: '4/4' }));
    expect(p.unitsPerBar).toBe(4);
    expect(p.slots.map((s) => s.kind)).toEqual(['accent', 'beat', 'beat', 'beat']);

    const noAccent = buildBarPattern(settings({ meterId: '4/4', accentFirst: false }));
    expect(noAccent.slots.map((s) => s.kind)).toEqual(['beat', 'beat', 'beat', 'beat']);
    expect(unitSeconds(getMeter('4/4'), 120)).toBe(0.5);
  });

  it('6/8 a ♩. = 60: dos pulsos de negra con puntillo, corcheas de 1/3 s', () => {
    const meter = getMeter('6/8');
    expect(meter.kind).toBe('compound');
    expect(meter.beatUnit).toBe('dotted-quarter');
    const p = buildBarPattern(settings({ meterId: '6/8' }));
    expect(p.unitsPerBar).toBe(6);
    expect(p.slots.map((s) => s.kind)).toEqual([
      'accent', 'subdivision', 'subdivision', 'beat', 'subdivision', 'subdivision',
    ]);
    // Inicios de pulso en las corcheas 1 y 4.
    expect(p.slots.filter((s) => s.kind === 'accent' || s.kind === 'beat').map((s) => s.unit + 1)).toEqual([1, 4]);
    expect(unitSeconds(meter, 60)).toBeCloseTo(1 / 3, 12);
    expect(unitSeconds(meter, 60) * 3).toBeCloseTo(1, 12);

    // Sin subdivisión, 6/8 suena en sus 2 pulsos.
    const plain = buildBarPattern(settings({ meterId: '6/8', subdivision: false }));
    expect(plain.slots.filter((s) => s.kind !== null)).toHaveLength(2);
  });

  it('9/8 y 12/8 tienen 3 y 4 pulsos de 3 corcheas', () => {
    expect(buildBarPattern(settings({ meterId: '9/8' })).pulseLengths).toEqual([3, 3, 3]);
    expect(buildBarPattern(settings({ meterId: '12/8' })).pulseLengths).toEqual([3, 3, 3, 3]);
  });

  it('7/8 2+2+3 a ♪ = 210: pulsos en las corcheas 1, 3 y 5', () => {
    const meter = getMeter('7/8');
    expect(meter.beatUnit).toBe('eighth');
    const starts = (groupingIndex: number) =>
      buildBarPattern(settings({ meterId: '7/8', groupingIndex }))
        .slots.filter((s) => s.kind === 'accent' || s.kind === 'beat')
        .map((s) => s.unit + 1);
    expect(starts(0)).toEqual([1, 3, 5]); // 2+2+3
    expect(starts(1)).toEqual([1, 3, 6]); // 2+3+2
    expect(starts(2)).toEqual([1, 4, 6]); // 3+2+2
    expect(unitSeconds(meter, 210)).toBeCloseTo(60 / 210, 12);
    // 5/8: 2+3 y 3+2
    expect(buildBarPattern(settings({ meterId: '5/8', groupingIndex: 1 })).pulseLengths).toEqual([3, 2]);
  });

  it('la suma de cada agrupación coincide con el numerador del compás', () => {
    for (const meter of METERS) {
      const numerator = Number(meter.id.split('/')[0]);
      for (const grouping of meter.groupings) {
        const total = grouping.reduce((a, b) => a + b, 0);
        expect(total, meter.id).toBe(numerator);
      }
    }
  });

  it('usa el plural correcto de cada figura', () => {
    expect(BEAT_UNIT_PLURALS['dotted-quarter']).toBe('negras con puntillo');
    expect(BEAT_UNIT_PLURALS.quarter).toBe('negras');
    expect(BEAT_UNIT_PLURALS.eighth).toBe('corcheas');
  });

  it('acota el BPM y valida preferencias persistidas', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(999)).toBe(MAX_BPM);
    expect(clampBpm(120.4)).toBe(120);
    expect(resolveMetronomeSettings(null)).toEqual(DEFAULT_METRONOME_SETTINGS);
    expect(
      resolveMetronomeSettings({ meterId: '7/8', groupingIndex: 5, bpm: 'x', accentFirst: false })
    ).toEqual({ ...DEFAULT_METRONOME_SETTINGS, meterId: '7/8', groupingIndex: 0, accentFirst: false });
    expect(resolveMetronomeSettings({ meterId: '13/8' }).meterId).toBe('4/4');
  });
});

describe('Línea de tiempo sin deriva', () => {
  it('120 BPM en 4/4 durante 1000 clics: instantes exactos k · 0.5 s', () => {
    const timeline = new MetronomeTimeline(settings({ meterId: '4/4', bpm: 120 }), 0);
    const clicks = timeline.collectUntil(500 - 1e-9);
    expect(clicks).toHaveLength(1000);
    clicks.forEach((c, k) => {
      expect(c.time).toBe(k * 0.5);
      expect(c.kind).toBe(k % 4 === 0 ? 'accent' : 'beat');
      expect(c.barIndex).toBe(Math.floor(k / 4));
    });
  });

  it('un cambio de BPM se aplica desde el próximo clic sin saltos', () => {
    const timeline = new MetronomeTimeline(settings({ bpm: 60 }), 10);
    expect(timeline.collectUntil(12.5).map((c) => c.time)).toEqual([10, 11, 12]);
    timeline.update(settings({ bpm: 120 }), 12.6);
    // El próximo clic sigue en t = 13 (no se adelanta) y luego cada 0.5 s.
    const next = timeline.collectUntil(14.6);
    expect(next.map((c) => c.time)).toEqual([13, 13.5, 14, 14.5]);
    // El compás continúa: t = 13 es el tiempo 4 y t = 13.5 abre el compás siguiente.
    expect(next.map((c) => c.kind)).toEqual(['beat', 'accent', 'beat', 'beat']);
  });

  it('un cambio de compás reinicia desde el tiempo 1', () => {
    const timeline = new MetronomeTimeline(settings({ meterId: '4/4', bpm: 60 }), 0);
    timeline.collectUntil(1.5); // tiempos 1 y 2
    timeline.update(settings({ meterId: '3/4', bpm: 60 }), 1.2);
    const next = timeline.collectUntil(5.5);
    expect(next.map((c) => c.kind)).toEqual(['accent', 'beat', 'beat', 'accent']);
    expect(next[0]!.time).toBe(2);
  });
});
