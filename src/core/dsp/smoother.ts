/**
 * Estabilizador temporal de alta precisión para afinador tipo pedal:
 * - Filtro de mediana de 5 muestras en espacio logarítmico (semitonos) para rechazar
 *   cualquier transitorio de ataque de púa o dedos sin sesgar la media.
 * - Promedio exponencial ponderado por claridad^2 con detección rápida de giro de clavija
 *   o cambio de cuerda: clava centésimas de cent al sostener una nota y responde al instante
 *   al mover la afinación.
 */

export interface SmoothedPitch {
  frequency: number | null;
  clarity: number;
  rms: number;
  isHolding: boolean;
}

export interface PitchSmootherOptions {
  /** Factor base de respuesta en ajuste ultra-fino (default: 0.30) */
  fineAlpha?: number;
  /** Umbral en semitonos para reinicio instantáneo al cambiar de nota (default: 0.65) */
  jumpSemitones?: number;
  /** Tiempo en ms que se retiene la última nota válida al apagarse la cuerda (default: 550) */
  holdMs?: number;
}

function freqToLogSemitones(freq: number): number {
  return 12 * Math.log2(freq);
}

function logSemitonesToFreq(semi: number): number {
  return Math.pow(2, semi / 12);
}

function medianOfSmallArray(values: readonly number[]): number {
  const copy = values.slice().sort((a, b) => a - b);
  const mid = copy.length >>> 1;
  return copy[mid]!;
}

export class PitchSmoother {
  private readonly fineAlpha: number;
  private readonly jumpSemitones: number;
  private readonly holdMs: number;

  private readonly history: number[] = [];
  private smoothedSemi: number | null = null;
  private lastClarity = 0;
  private lastValidTimestamp = 0;

  constructor(options?: PitchSmootherOptions) {
    this.fineAlpha = options?.fineAlpha ?? 0.3;
    this.jumpSemitones = options?.jumpSemitones ?? 0.65;
    this.holdMs = options?.holdMs ?? 550;
  }

  public reset(): void {
    this.history.length = 0;
    this.smoothedSemi = null;
    this.lastClarity = 0;
    this.lastValidTimestamp = 0;
  }

  public update(
    frequency: number | null,
    clarity: number,
    rms: number,
    nowMs: number
  ): SmoothedPitch {
    if (frequency !== null && frequency > 0 && Number.isFinite(frequency)) {
      const rawSemi = freqToLogSemitones(frequency);

      if (
        this.smoothedSemi !== null &&
        Math.abs(rawSemi - this.smoothedSemi) > this.jumpSemitones
      ) {
        // Si ya llevamos 2 cuadros seguidos lejos, el músico tocó otra nota: limpiar historial viejo
        const prev = this.history[this.history.length - 1];
        if (prev !== undefined && Math.abs(rawSemi - prev) < 0.25) {
          this.history.length = 0;
          this.smoothedSemi = rawSemi;
        }
      }

      this.history.push(rawSemi);
      if (this.history.length > 5) {
        this.history.shift();
      }

      const filteredSemi = medianOfSmallArray(this.history);

      if (
        this.smoothedSemi === null ||
        Math.abs(filteredSemi - this.smoothedSemi) > this.jumpSemitones
      ) {
        this.smoothedSemi = filteredSemi;
      } else {
        // Si la cuerda se está moviendo (girando clavija > 3 cents), acelerar seguimiento;
        // si está quieta (< 3 cents), suavizar ponderando por clarity^2 para precisión estroboscópica.
        const diffSemitones = Math.abs(filteredSemi - this.smoothedSemi);
        const dynamicBoost = diffSemitones > 0.03 ? 0.55 : this.fineAlpha;
        const weight = Math.max(0.15, Math.min(1, clarity * clarity)) * dynamicBoost;
        this.smoothedSemi += weight * (filteredSemi - this.smoothedSemi);
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
    this.smoothedSemi = null;
    return {
      frequency: null,
      clarity: 0,
      rms,
      isHolding: false,
    };
  }
}
