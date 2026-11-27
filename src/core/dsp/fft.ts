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
