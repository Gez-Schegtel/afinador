/**
 * FFT Radix-2 Cooley–Tukey en doble precisión (Float64Array) sin asignaciones por cuadro.
 * Permite calcular la autocorrelación lineal exacta en O(N log N) mediante el
 * teorema de Wiener–Khinchin con precisión numérica de 64 bits (~1e-15).
 */
export class FFT64 {
  public readonly size: number;
  private readonly bitRev: Uint32Array;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT64 requiere potencia de 2; recibido: ${size}`);
    }
    this.size = size;
    this.bitRev = new Uint32Array(size);

    const bits = Math.round(Math.log2(size));
    for (let i = 0; i < size; i++) {
      let rev = 0;
      let val = i;
      for (let b = 0; b < bits; b++) {
        rev = (rev << 1) | (val & 1);
        val >>>= 1;
      }
      this.bitRev[i] = rev;
    }

    const half = size >>> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      const angle = (-2 * Math.PI * k) / size;
      this.cosTable[k] = Math.cos(angle);
      this.sinTable[k] = Math.sin(angle);
    }
  }

  /**
   * Transformada rápida de Fourier in-place.
   * @param real Parte real (longitud === size)
   * @param imag Parte imaginaria (longitud === size)
   * @param inverse true para IFFT (incluye normalización 1/size)
   */
  public transform(
    real: Float64Array,
    imag: Float64Array,
    inverse: boolean = false
  ): void {
    const n = this.size;
    const bitRev = this.bitRev;

    for (let i = 0; i < n; i++) {
      const j = bitRev[i]!;
      if (j > i) {
        const tr = real[i]!;
        real[i] = real[j]!;
        real[j] = tr;

        const ti = imag[i]!;
        imag[i] = imag[j]!;
        imag[j] = ti;
      }
    }

    const cosTable = this.cosTable;
    const sinTable = this.sinTable;
    const sinSign = inverse ? -1 : 1;

    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >>> 1;
      const step = n / len;

      for (let i = 0; i < n; i += len) {
        let tableIdx = 0;
        for (let j = 0; j < halfLen; j++) {
          const uIdx = i + j;
          const vIdx = uIdx + halfLen;

          const wr = cosTable[tableIdx]!;
          const wi = sinSign * sinTable[tableIdx]!;
          tableIdx += step;

          const vr = real[vIdx]!;
          const vi = imag[vIdx]!;

          const tr = wr * vr - wi * vi;
          const ti = wr * vi + wi * vr;

          real[vIdx] = real[uIdx]! - tr;
          imag[vIdx] = imag[uIdx]! - ti;
          real[uIdx] = real[uIdx]! + tr;
          imag[uIdx] = imag[uIdx]! + ti;
        }
      }
    }

    if (inverse) {
      const invN = 1 / n;
      for (let i = 0; i < n; i++) {
        real[i]! *= invN;
        imag[i]! *= invN;
      }
    }
  }
}

/**
 * Autocorrelación lineal exacta de una señal REAL mediante Wiener–Khinchin con la mitad del
 * costo de una FFT compleja: la señal de N puntos (con relleno de ceros) se empaqueta como
 * N/2 complejos z[m] = x[2m] + i·x[2m+1], se transforma con una FFT de N/2 puntos y se
 * separa el espectro; el espectro de potencia (real y par) se vuelve a empaquetar para la
 * transformada inversa. Sin asignaciones por cuadro.
 */
export class RealAutocorrelator {
  /** Tamaño lógico de la DFT (potencia de 2 ≥ 2·maxLength). */
  public readonly size: number;
  private readonly half: number;
  private readonly fft: FFT64;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly power: Float64Array;
  private readonly cosN: Float64Array;
  private readonly sinN: Float64Array;

  constructor(maxLength: number) {
    let size = 4;
    while (size < 2 * maxLength) size <<= 1;
    this.size = size;
    this.half = size >>> 1;
    this.fft = new FFT64(this.half);
    this.re = new Float64Array(this.half);
    this.im = new Float64Array(this.half);
    this.power = new Float64Array(this.half + 1);
    this.cosN = new Float64Array(this.half + 1);
    this.sinN = new Float64Array(this.half + 1);
    for (let k = 0; k <= this.half; k++) {
      const angle = (2 * Math.PI * k) / size;
      this.cosN[k] = Math.cos(angle);
      this.sinN[k] = Math.sin(angle);
    }
  }

  /**
   * Calcula r[τ] = Σ x[i]·x[i+τ] para τ = 0 … maxLag (incluido) sobre las primeras `n` muestras
   * de `input` y lo escribe en `out`.
   */
  public compute(
    input: Float64Array,
    n: number,
    out: Float64Array,
    maxLag: number
  ): void {
    const M = this.half;
    const re = this.re;
    const im = this.im;
    const P = this.power;
    const cosN = this.cosN;
    const sinN = this.sinN;

    // 1. Empaquetar x (con ceros a partir de n) como M complejos.
    for (let m = 0; m < M; m++) {
      const i0 = 2 * m;
      const i1 = i0 + 1;
      re[m] = i0 < n ? input[i0]! : 0;
      im[m] = i1 < n ? input[i1]! : 0;
    }
    this.fft.transform(re, im, false);

    // 2. Separar X[k] (k = 0…M) y calcular el espectro de potencia P[k] = |X[k]|².
    for (let k = 0; k <= M; k++) {
      const a = k % M;
      const b = (M - k) % M;
      const zr = re[a]!;
      const zi = im[a]!;
      const zr2 = re[b]!;
      const zi2 = im[b]!;
      const er = 0.5 * (zr + zr2);
      const ei = 0.5 * (zi - zi2);
      const or = 0.5 * (zi + zi2);
      const oi = -0.5 * (zr - zr2);
      const c = cosN[k]!;
      const s = sinN[k]!;
      const xr = er + c * or + s * oi;
      const xi = ei + c * oi - s * or;
      P[k] = xr * xr + xi * xi;
    }

    // 3. Reempaquetar el espectro real y par para la inversa: Y[k] = E[k] + i·O[k].
    for (let k = 0; k < M; k++) {
      const pk = P[k]!;
      const pm = P[M - k]!;
      const e = 0.5 * (pk + pm);
      const d = 0.5 * (pk - pm);
      re[k] = e - d * sinN[k]!;
      im[k] = d * cosN[k]!;
    }
    this.fft.transform(re, im, true);

    // 4. y[m] = r[2m] + i·r[2m+1]
    const limit = Math.min(maxLag, this.size - 1);
    for (let tau = 0; tau <= limit; tau++) {
      const m = tau >>> 1;
      out[tau] = (tau & 1) === 0 ? re[m]! : im[m]!;
    }
  }
}
