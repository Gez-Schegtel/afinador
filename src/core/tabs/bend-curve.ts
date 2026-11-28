// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Matemática pura y presets estándar para curvas de Bend / Whammy Bar (Spec 014).
 * Offsets en porcentaje [0, 100] e incrementos de altura en cuartos de tono [-4, +4]
 * (2 = +1/2 tono, 4 = +1 tono completo, -4 = -1 tono / dive).
 */

import type { BendPoint } from './model';

export const MIN_BEND_QUARTER_TONES = -4;
export const MAX_BEND_QUARTER_TONES = 4;

export type BendPresetId = 'half' | 'full' | 'release' | 'pre-bend' | 'hold';

export const BEND_PRESET_LABELS: Readonly<Record<BendPresetId, string>> = {
  half: '1/2 tono (+0.5)',
  full: 'Full (+1 tono)',
  release: 'Bend & Release',
  'pre-bend': 'Pre-bend',
  hold: 'Hold (Sostener)',
};

export function clampBendPoint(pt: BendPoint): BendPoint {
  const offset = Number.isFinite(pt.offset)
    ? Math.max(0, Math.min(100, Math.round(pt.offset)))
    : 0;
  const value = Number.isFinite(pt.value)
    ? Math.max(MIN_BEND_QUARTER_TONES, Math.min(MAX_BEND_QUARTER_TONES, Math.round(pt.value)))
    : 0;
  return { offset, value };
}

export function normalizeBendCurve(points: readonly BendPoint[]): BendPoint[] {
  if (points.length === 0) return [];
  const clamped = points.map(clampBendPoint).sort((a, b) => a.offset - b.offset);
  const out: BendPoint[] = [];
  for (const pt of clamped) {
    const prev = out[out.length - 1];
    if (prev && prev.offset === pt.offset) {
      out[out.length - 1] = pt;
    } else {
      out.push(pt);
    }
  }
  return out;
}

export function createBendPresetCurve(preset: BendPresetId): BendPoint[] {
  switch (preset) {
    case 'half':
      return [
        { offset: 0, value: 0 },
        { offset: 50, value: 2 },
        { offset: 100, value: 2 },
      ];
    case 'full':
      return [
        { offset: 0, value: 0 },
        { offset: 50, value: 4 },
        { offset: 100, value: 4 },
      ];
    case 'release':
      return [
        { offset: 0, value: 0 },
        { offset: 35, value: 4 },
        { offset: 65, value: 4 },
        { offset: 100, value: 0 },
      ];
    case 'pre-bend':
      return [
        { offset: 0, value: 4 },
        { offset: 50, value: 4 },
        { offset: 100, value: 4 },
      ];
    case 'hold':
      return [
        { offset: 0, value: 2 },
        { offset: 100, value: 2 },
      ];
  }
}

export function formatBendSemitonesLabel(quarterTones: number): string {
  const semis = quarterTones / 2;
  if (semis === 0) return '0';
  return semis > 0 ? `+${semis} st` : `${semis} st`;
}
