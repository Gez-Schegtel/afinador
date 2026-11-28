// SPDX-License-Identifier: GPL-3.0-or-later
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';

interface NodeFsLike {
  readFileSync(path: URL): Uint8Array;
}

const builtinFs = (
  globalThis as unknown as {
    process?: { getBuiltinModule?: (name: string) => unknown };
  }
).process?.getBuiltinModule?.('node:fs') as NodeFsLike | undefined;

interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  rgba: Uint8Array;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePngRgba(bytes: Uint8Array): DecodedPng {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    expect(bytes[i]).toBe(signature[i]);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8]!;
      colorType = bytes[dataStart + 9]!;
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  expect(colorType).toBe(6);
  expect(bitDepth).toBe(8);

  const totalIdat = idatParts.reduce((acc, part) => acc + part.length, 0);
  const compressed = new Uint8Array(totalIdat);
  let pos = 0;
  for (const part of idatParts) {
    compressed.set(part, pos);
    pos += part.length;
  }

  const raw = unzlibSync(compressed);
  const stride = width * 4;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart]!;
    const outRow = y * stride;
    const prevRow = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const curr = raw[rowStart + 1 + x]!;
      const left = x >= 4 ? rgba[outRow + x - 4]! : 0;
      const up = y > 0 ? rgba[prevRow + x]! : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[prevRow + x - 4]! : 0;

      let val = curr;
      if (filter === 1) val = (curr + left) & 0xff;
      else if (filter === 2) val = (curr + up) & 0xff;
      else if (filter === 3) val = (curr + ((left + up) >>> 1)) & 0xff;
      else if (filter === 4) val = (curr + paethPredictor(left, up, upLeft)) & 0xff;
      rgba[outRow + x] = val;
    }
  }

  return { width, height, bitDepth, colorType, rgba };
}

describe('Íconos y favicon RGBA sin borde negro', () => {
  const iconPaths = [
    '../public/icons/favicon-32.png',
    '../public/icons/favicon-64.png',
    '../public/icons/icon-192.png',
    '../public/icons/icon-512.png',
  ];

  it('usa PNG RGBA (colorType 6), esquinas transparentes y cero píxeles oscuros', () => {
    expect(builtinFs).toBeDefined();
    for (const relPath of iconPaths) {
      const bytes = builtinFs!.readFileSync(new URL(relPath, import.meta.url));
      const png = decodePngRgba(bytes);
      const { width, height, rgba } = png;

      const alphaAt = (x: number, y: number) => rgba[(y * width + x) * 4 + 3]!;
      expect(alphaAt(0, 0), `${relPath} esquina sup-izq`).toBe(0);
      expect(alphaAt(width - 1, 0), `${relPath} esquina sup-der`).toBe(0);
      expect(alphaAt(0, height - 1), `${relPath} esquina inf-izq`).toBe(0);
      expect(alphaAt(width - 1, height - 1), `${relPath} esquina inf-der`).toBe(0);

      let darkPixels = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i]! < 90) {
          darkPixels++;
        }
      }
      expect(darkPixels, `${relPath} píxeles oscuros`).toBe(0);
    }
  });
});
