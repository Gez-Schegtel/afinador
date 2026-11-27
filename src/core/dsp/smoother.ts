// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Estabilizador de tono estilo pedal de escenario (Boss TU-3 / Korg Pitchblack):
 *
 * 1. Supresión de ataque de púa (Attack Blanking): ignora los primeros ~45 ms cuando la
 *    energía RMS salta bruscamente al golpear la cuerda (donde la tensión transitoria
 *    sube artificialmente el tono y la onda es caótica).
 * 2. Histéresis de claridad (modo Automático): exige claridad >= 0.75 para enganchar una nota
 *    nueva desde silencio y la sostiene mientras el detector la entregue (>= 0.72, su umbral
 *    mínimo). En modo Manual ambos umbrales valen 0.58, igual que el detector.
 * 3. Media Recortada Intercuartil (12 cuadros ≈ 255 ms): ordena las últimas lecturas,
 *    descarta el 25% inferior y superior de picos/batidos acústicos y promedia el centro.
 * 4. Filtro EMA de doble velocidad: firme y sedoso dentro de la misma nota (< 18 cents)
 *    para clavar la aguja sin oscilación, y ágil al girar la clavija o cambiar de cuerda.
 */

export interface SmoothedPitch {
  frequency: number | null;
  clarity: number;
  rms: number;
  isHolding: boolean;
}

export interface PitchSmootherOptions {
  /** Factor EMA calmo cuando la nota está cerca del reposo (< 18 cents) (default: 0.085) */
  steadyAlpha?: number;
  /** Factor EMA ágil al girar activamente la clavija (18..65 cents) (default: 0.30) */
  tuningAlpha?: number;
  /** Umbral en semitonos para considerar cambio a otra nota/cuerda (default: 0.65) */
  jumpSemitones?: number;
  /** Tiempo en ms que se retiene la nota clavada tras apagar la cuerda (default: 650) */
  holdMs?: number;
}

const HISTORY_SIZE = 12;

function freqToLogSemitones(freq: number): number {
  return 12 * Math.log2(freq);
}

function logSemitonesToFreq(semi: number): number {
  return Math.pow(2, semi / 12);
}

function interquartileTrimmedMean(values: readonly number[]): number {
  const n = values.length;
  if (n === 1) return values[0]!;
  const sorted = values.slice().sort((a, b) => a - b);
  if (n <= 4) {
    const mid = n >>> 1;
    return n % 2 === 1
      ? sorted[mid]!
      : 0.5 * (sorted[mid - 1]! + sorted[mid]!);
  }
  const trim = Math.floor(n * 0.25);
  let sum = 0;
  let count = 0;
  for (let i = trim; i < n - trim; i++) {
    sum += sorted[i]!;
    count++;
  }
  return sum / count;
}

export class PitchSmoother {
  private readonly steadyAlpha: number;
  private readonly tuningAlpha: number;
  private readonly jumpSemitones: number;
  private readonly holdMs: number;

  private readonly history: number[] = [];
  private readonly jumpCandidates: number[] = [];
  private smoothedSemi: number | null = null;
  private lastClarity = 0;
  private lastValidTimestamp = 0;
  private prevRms = 0;
  private attackBlankFrames = 0;
  private manualMode = false;

  constructor(options?: PitchSmootherOptions) {
    this.steadyAlpha = options?.steadyAlpha ?? 0.085;
    this.tuningAlpha = options?.tuningAlpha ?? 0.3;
    this.jumpSemitones = options?.jumpSemitones ?? 0.65;
    this.holdMs = options?.holdMs ?? 650;
  }

  public setManualMode(enabled: boolean): void {
    this.manualMode = enabled;
  }

  public reset(): void {
    this.history.length = 0;
    this.jumpCandidates.length = 0;
    this.smoothedSemi = null;
    this.lastClarity = 0;
    this.lastValidTimestamp = 0;
    this.prevRms = 0;
    this.attackBlankFrames = 0;
  }

  public update(
    frequency: number | null,
    clarity: number,
    rms: number,
    nowMs: number
  ): SmoothedPitch {
    // Detectar golpe brusco de púa/dedo cuando ya había una nota sonando
    if (
      this.smoothedSemi !== null &&
      this.prevRms > 0.008 &&
      rms > this.prevRms * 2.6
    ) {
      this.attackBlankFrames = 2;
    }
    this.prevRms = rms;

    if (this.attackBlankFrames > 0) {
      this.attackBlankFrames--;
      if (this.smoothedSemi !== null) {
        return {
          frequency: logSemitonesToFreq(this.smoothedSemi),
          clarity: this.lastClarity,
          rms,
          isHolding: false,
        };
      }
    }

    const requiredClarity = this.manualMode
      ? 0.58
      : this.smoothedSemi === null
        ? 0.75
        : 0.72;

    if (
      frequency !== null &&
      frequency > 0 &&
      Number.isFinite(frequency) &&
      clarity >= requiredClarity
    ) {
      const rawSemi = freqToLogSemitones(frequency);

      // Si salta a otra cuerda/nota (> 65 cents), confirmar rápido en modo Manual (2 cuadros) o estricto en Auto (3)
      if (
        this.smoothedSemi !== null &&
        Math.abs(rawSemi - this.smoothedSemi) > this.jumpSemitones
      ) {
        this.jumpCandidates.push(rawSemi);
        if (this.manualMode) {
          if (this.jumpCandidates.length >= 2) {
            const prev = this.jumpCandidates[this.jumpCandidates.length - 2]!;
            if (Math.abs(rawSemi - prev) < 0.5) {
              this.history.length = 0;
              this.jumpCandidates.length = 0;
              this.smoothedSemi = 0.5 * (prev + rawSemi);
            } else if (this.jumpCandidates.length > 3) {
              this.jumpCandidates.shift();
            }
          }
        } else if (this.jumpCandidates.length >= 3) {
          const first = this.jumpCandidates[this.jumpCandidates.length - 3]!;
          const second = this.jumpCandidates[this.jumpCandidates.length - 2]!;
          if (
            Math.abs(rawSemi - second) < 0.25 &&
            Math.abs(second - first) < 0.25
          ) {
            // Nueva nota confirmada: salto limpio sin arrastrar el promedio anterior
            this.history.length = 0;
            this.jumpCandidates.length = 0;
            this.smoothedSemi = interquartileTrimmedMean([
              first,
              second,
              rawSemi,
            ]);
          } else if (this.jumpCandidates.length > 4) {
            this.jumpCandidates.shift();
          }
        }
        // Mientras no se confirme el cambio de nota, mantener lectura previa sin sacudir la aguja
        if (this.jumpCandidates.length > 0) {
          this.lastValidTimestamp = nowMs;
          return {
            frequency: logSemitonesToFreq(this.smoothedSemi),
            clarity: this.lastClarity,
            rms,
            isHolding: false,
          };
        }
      } else {
        this.jumpCandidates.length = 0;
      }

      this.history.push(rawSemi);
      if (this.history.length > HISTORY_SIZE) {
        this.history.shift();
      }

      const trimmedSemi = interquartileTrimmedMean(this.history);

      if (this.smoothedSemi === null) {
        this.smoothedSemi = trimmedSemi;
      } else {
        const diffSemitones = Math.abs(trimmedSemi - this.smoothedSemi);
        // < 18 cents (0.18 semitonos): modo ultra-estable para clavar la nota;
        // >= 18 cents: seguimiento fluido al girar la clavija.
        const baseAlpha =
          diffSemitones > 0.18 ? this.tuningAlpha : this.steadyAlpha;
        this.smoothedSemi += baseAlpha * (trimmedSemi - this.smoothedSemi);
      }

      this.lastClarity = clarity;
      this.lastValidTimestamp = nowMs;

      return {
        frequency: logSemitonesToFreq(this.smoothedSemi),
        clarity,
        rms,
        isHolding: false,
      };
    }

    if (
      this.smoothedSemi !== null &&
      nowMs - this.lastValidTimestamp <= this.holdMs
    ) {
      return {
        frequency: logSemitonesToFreq(this.smoothedSemi),
        clarity: this.lastClarity * 0.85,
        rms,
        isHolding: true,
      };
    }

    this.history.length = 0;
    this.jumpCandidates.length = 0;
    this.smoothedSemi = null;
    return {
      frequency: null,
      clarity: 0,
      rms,
      isHolding: false,
    };
  }
}
