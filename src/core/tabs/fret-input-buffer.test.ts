// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  FRET_BUFFER_WINDOW_MS,
  INITIAL_FRET_BUFFER,
  pushFretDigit,
} from './fret-input-buffer';

describe('Buffer numérico de trastes de 2 dígitos en 400 ms (Spec 013)', () => {
  it('combina 1 → 5 dentro de 400 ms en 15 y los separa si excede 400 ms', () => {
    const r1 = pushFretDigit(INITIAL_FRET_BUFFER, 1, 1000, 24);
    expect(r1.fret).toBe(1);
    expect(r1.mergedFromPending).toBe(false);

    const r2Fast = pushFretDigit(r1.nextState, 5, 1000 + FRET_BUFFER_WINDOW_MS - 120, 24);
    expect(r2Fast.fret).toBe(15);
    expect(r2Fast.mergedFromPending).toBe(true);
    expect(r2Fast.rejected).toBe(false);

    const r2Slow = pushFretDigit(r1.nextState, 5, 1000 + FRET_BUFFER_WINDOW_MS + 50, 24);
    expect(r2Slow.fret).toBe(5);
    expect(r2Slow.mergedFromPending).toBe(false);
  });

  it('rechaza limpiamente trastes por encima del máximo configurado sin corromper estado', () => {
    // 2 → 9 intenta 29 > 24
    const first = pushFretDigit(INITIAL_FRET_BUFFER, 2, 2000, 24);
    expect(first.fret).toBe(2);

    const over = pushFretDigit(first.nextState, 9, 2150, 24);
    expect(over.rejected).toBe(true);
    expect(over.fret).toBeNull();
    expect(over.nextState.pendingDigit).toBeNull();

    // 3 con maxFret=24 no espera segundo dígito porque >= 30 es inalcanzable
    const immediate = pushFretDigit(INITIAL_FRET_BUFFER, 3, 2500, 24);
    expect(immediate.fret).toBe(3);
    expect(immediate.nextState.pendingDigit).toBeNull();
  });
});
