// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Compases, patrones de clic y línea de tiempo del metrónomo (Spec 004). Núcleo 100% puro.
 *
 * Teoría:
 * - Simple (2/4, 3/4, 4/4, 5/4): el pulso es la negra (♩) y el BPM se refiere a ella.
 * - Compuesto (6/8, 9/8, 12/8): el pulso es la negra con puntillo (♩.), dividida en 3 corcheas;
 *   el BPM se refiere a la negra con puntillo.
 * - Irregular / de amalgama (5/8, 7/8): grupos desiguales de 2 y 3 corcheas; no hay pulso
 *   constante, así que el BPM se refiere a la corchea (♪) y la agrupación define los pulsos.
 */

export type MeterKind = 'simple' | 'compound' | 'irregular';
export type BeatUnit = 'quarter' | 'dotted-quarter' | 'eighth';
export type ClickKind = 'accent' | 'beat' | 'subdivision';

export type MeterId =
  | '2/4'
  | '3/4'
  | '4/4'
  | '5/4'
  | '6/8'
  | '9/8'
  | '12/8'
  | '5/8'
  | '7/8';

export interface MeterDefinition {
  readonly id: MeterId;
  readonly kind: MeterKind;
  readonly beatUnit: BeatUnit;
  readonly description: string;
  /**
   * Agrupaciones posibles. Simple: cada pulso vale 1 unidad (negra). Compuesto e irregular:
   * cada número es la cantidad de corcheas del pulso.
   */
  readonly groupings: readonly (readonly number[])[];
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;

export const METERS: readonly MeterDefinition[] = [
  { id: '2/4', kind: 'simple', beatUnit: 'quarter', description: 'Simple binario', groupings: [[1, 1]] },
  { id: '3/4', kind: 'simple', beatUnit: 'quarter', description: 'Simple ternario', groupings: [[1, 1, 1]] },
  { id: '4/4', kind: 'simple', beatUnit: 'quarter', description: 'Simple cuaternario', groupings: [[1, 1, 1, 1]] },
  { id: '5/4', kind: 'simple', beatUnit: 'quarter', description: 'Simple de 5 tiempos', groupings: [[1, 1, 1, 1, 1]] },
  { id: '6/8', kind: 'compound', beatUnit: 'dotted-quarter', description: 'Compuesto binario', groupings: [[3, 3]] },
  { id: '9/8', kind: 'compound', beatUnit: 'dotted-quarter', description: 'Compuesto ternario', groupings: [[3, 3, 3]] },
  { id: '12/8', kind: 'compound', beatUnit: 'dotted-quarter', description: 'Compuesto cuaternario', groupings: [[3, 3, 3, 3]] },
  { id: '5/8', kind: 'irregular', beatUnit: 'eighth', description: 'Irregular (amalgama)', groupings: [[2, 3], [3, 2]] },
  { id: '7/8', kind: 'irregular', beatUnit: 'eighth', description: 'Irregular (amalgama)', groupings: [[2, 2, 3], [2, 3, 2], [3, 2, 2]] },
];

export const BEAT_UNIT_SYMBOLS: Readonly<Record<BeatUnit, string>> = {
  quarter: '♩',
  'dotted-quarter': '♩.',
  eighth: '♪',
};

export const BEAT_UNIT_NAMES: Readonly<Record<BeatUnit, string>> = {
  quarter: 'negra',
  'dotted-quarter': 'negra con puntillo',
  eighth: 'corchea',
};

/** Plural correcto para «N … por minuto» (la alteración del plural va en el sustantivo). */
export const BEAT_UNIT_PLURALS: Readonly<Record<BeatUnit, string>> = {
  quarter: 'negras',
  'dotted-quarter': 'negras con puntillo',
  eighth: 'corcheas',
};

export function getMeter(id: MeterId): MeterDefinition {
  return METERS.find((m) => m.id === id)!;
}

export function isMeterId(value: unknown): value is MeterId {
  return METERS.some((m) => m.id === value);
}

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 100;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** «Subdivisión» solo tiene sentido en compuestos e irregulares. */
export function supportsSubdivision(meter: MeterDefinition): boolean {
  return meter.kind !== 'simple';
}

export function formatGrouping(grouping: readonly number[]): string {
  return grouping.join('+');
}

export interface MetronomeSettings {
  readonly bpm: number;
  readonly meterId: MeterId;
  readonly groupingIndex: number;
  readonly accentFirst: boolean;
  readonly subdivision: boolean;
}

export const DEFAULT_METRONOME_SETTINGS: MetronomeSettings = {
  bpm: 100,
  meterId: '4/4',
  groupingIndex: 0,
  accentFirst: true,
  subdivision: true,
};

/** Valida preferencias persistidas y cae a valores por defecto si son inválidas. */
export function resolveMetronomeSettings(raw: unknown): MetronomeSettings {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const meterId = isMeterId(obj.meterId)
    ? obj.meterId
    : DEFAULT_METRONOME_SETTINGS.meterId;
  const meter = getMeter(meterId);
  const groupingIndex =
    typeof obj.groupingIndex === 'number' &&
    Number.isInteger(obj.groupingIndex) &&
    obj.groupingIndex >= 0 &&
    obj.groupingIndex < meter.groupings.length
      ? obj.groupingIndex
      : 0;
  return {
    bpm:
      typeof obj.bpm === 'number'
        ? clampBpm(obj.bpm)
        : DEFAULT_METRONOME_SETTINGS.bpm,
    meterId,
    groupingIndex,
    accentFirst:
      typeof obj.accentFirst === 'boolean'
        ? obj.accentFirst
        : DEFAULT_METRONOME_SETTINGS.accentFirst,
    subdivision:
      typeof obj.subdivision === 'boolean'
        ? obj.subdivision
        : DEFAULT_METRONOME_SETTINGS.subdivision,
  };
}

/**
 * Duración en segundos de la UNIDAD de la línea de tiempo: la negra en compases simples y la
 * corchea en compuestos (pulso / 3) e irregulares (el BPM ya es de corcheas).
 */
export function unitSeconds(meter: MeterDefinition, bpm: number): number {
  const b = clampBpm(bpm);
  return meter.kind === 'compound' ? 60 / (3 * b) : 60 / b;
}

/** Duración del pulso en segundos (en irregulares, la del pulso de 2 o de 3 corcheas). */
export function pulseSeconds(
  meter: MeterDefinition,
  bpm: number,
  pulseLengthUnits: number
): number {
  return unitSeconds(meter, bpm) * pulseLengthUnits;
}

export interface BarSlot {
  /** Posición dentro del compás, en unidades. */
  readonly unit: number;
  /** Índice del pulso al que pertenece. */
  readonly pulseIndex: number;
  /** null = no suena (subdivisión desactivada). */
  readonly kind: ClickKind | null;
}

export interface BarPattern {
  readonly unitsPerBar: number;
  readonly pulseLengths: readonly number[];
  readonly slots: readonly BarSlot[];
}

export function buildBarPattern(settings: MetronomeSettings): BarPattern {
  const meter = getMeter(settings.meterId);
  const grouping = meter.groupings[settings.groupingIndex] ?? meter.groupings[0]!;
  const subdivide = supportsSubdivision(meter) && settings.subdivision;
  const slots: BarSlot[] = [];
  let unit = 0;
  grouping.forEach((length, pulseIndex) => {
    for (let i = 0; i < length; i++) {
      let kind: ClickKind | null;
      if (i === 0) {
        kind = unit === 0 && settings.accentFirst ? 'accent' : 'beat';
      } else {
        kind = subdivide ? 'subdivision' : null;
      }
      slots.push({ unit, pulseIndex, kind });
      unit++;
    }
  });
  return { unitsPerBar: unit, pulseLengths: grouping, slots };
}

export interface ScheduledClick {
  readonly time: number;
  readonly kind: ClickKind;
  readonly barIndex: number;
  readonly unitInBar: number;
  readonly pulseIndex: number;
}

/**
 * Línea de tiempo sin deriva: el instante de la unidad `u` es
 * `segmentStart + (u − segmentUnit) · unitSeconds` (multiplicación, no sumas acumuladas).
 * Un cambio de BPM abre un segmento nuevo desde la próxima unidad sin programar; un cambio de
 * compás, agrupación, subdivisión o acento reinicia el compás desde el tiempo 1.
 */
export class MetronomeTimeline {
  private settings: MetronomeSettings;
  private pattern: BarPattern;
  private unitDuration: number;
  private segmentStart: number;
  private segmentUnit = 0;
  private barStartUnit = 0;
  private nextUnit = 0;

  constructor(settings: MetronomeSettings, startTime: number) {
    this.settings = settings;
    this.pattern = buildBarPattern(settings);
    this.unitDuration = unitSeconds(getMeter(settings.meterId), settings.bpm);
    this.segmentStart = startTime;
  }

  public getPattern(): BarPattern {
    return this.pattern;
  }

  public timeOfUnit(unit: number): number {
    return this.segmentStart + (unit - this.segmentUnit) * this.unitDuration;
  }

  /** Devuelve (y consume) los clics cuyo instante es menor que `horizon`. */
  public collectUntil(horizon: number): ScheduledClick[] {
    const out: ScheduledClick[] = [];
    while (this.timeOfUnit(this.nextUnit) < horizon) {
      const offset = this.nextUnit - this.barStartUnit;
      const unitInBar = offset % this.pattern.unitsPerBar;
      const slot = this.pattern.slots[unitInBar]!;
      if (slot.kind !== null) {
        out.push({
          time: this.timeOfUnit(this.nextUnit),
          kind: slot.kind,
          barIndex: Math.floor(offset / this.pattern.unitsPerBar),
          unitInBar,
          pulseIndex: slot.pulseIndex,
        });
      }
      this.nextUnit++;
    }
    return out;
  }

  /**
   * Aplica preferencias nuevas. `earliest` es el primer instante en que puede sonar un compás
   * reiniciado (p. ej. `currentTime + 0.05`).
   */
  public update(settings: MetronomeSettings, earliest: number): void {
    const previous = this.settings;
    const nextTime = this.timeOfUnit(this.nextUnit);
    this.settings = settings;

    const onlyTempoChanged =
      previous.meterId === settings.meterId &&
      previous.groupingIndex === settings.groupingIndex &&
      previous.subdivision === settings.subdivision &&
      previous.accentFirst === settings.accentFirst;

    this.pattern = buildBarPattern(settings);
    this.unitDuration = unitSeconds(getMeter(settings.meterId), settings.bpm);
    this.segmentUnit = this.nextUnit;
    if (onlyTempoChanged) {
      this.segmentStart = nextTime;
    } else {
      this.segmentStart = Math.max(nextTime, earliest);
      this.barStartUnit = this.nextUnit;
    }
  }
}
