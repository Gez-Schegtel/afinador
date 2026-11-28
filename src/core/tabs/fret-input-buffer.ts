// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Máquina de estados pura para buffer numérico de trastes de 2 dígitos en 400 ms (Spec 013).
 * Ejemplo (maxFret = 24): pulsar `1` y luego `5` dentro de 400 ms combina a `15`;
 * fuera de 400 ms escribe `1` y luego `5`; rechaza combinaciones `> maxFret`.
 */

export const FRET_BUFFER_WINDOW_MS = 400;

export interface FretBufferState {
  readonly pendingDigit: number | null;
  readonly lastTimestampMs: number;
}

export const INITIAL_FRET_BUFFER: FretBufferState = {
  pendingDigit: null,
  lastTimestampMs: 0,
};

export interface FretBufferStepResult {
  readonly nextState: FretBufferState;
  readonly fret: number | null;
  readonly mergedFromPending: boolean;
  readonly rejected: boolean;
}

export function resetFretBuffer(): FretBufferState {
  return INITIAL_FRET_BUFFER;
}

export function pushFretDigit(
  state: FretBufferState,
  digit: number,
  timestampMs: number,
  maxFret = 24
): FretBufferStepResult {
  const safeMax = Math.max(12, Math.min(30, Math.trunc(maxFret)));
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    return {
      nextState: INITIAL_FRET_BUFFER,
      fret: null,
      mergedFromPending: false,
      rejected: true,
    };
  }

  const withinWindow =
    state.pendingDigit !== null &&
    state.pendingDigit > 0 &&
    timestampMs - state.lastTimestampMs >= 0 &&
    timestampMs - state.lastTimestampMs <= FRET_BUFFER_WINDOW_MS;

  if (withinWindow) {
    const combined = state.pendingDigit! * 10 + digit;
    if (combined <= safeMax) {
      return {
        nextState: INITIAL_FRET_BUFFER,
        fret: combined,
        mergedFromPending: true,
        rejected: false,
      };
    }
    return {
      nextState: INITIAL_FRET_BUFFER,
      fret: null,
      mergedFromPending: false,
      rejected: true,
    };
  }

  if (digit > safeMax) {
    return {
      nextState: INITIAL_FRET_BUFFER,
      fret: null,
      mergedFromPending: false,
      rejected: true,
    };
  }

  return {
    nextState:
      digit > 0 && digit * 10 <= safeMax
        ? { pendingDigit: digit, lastTimestampMs: timestampMs }
        : INITIAL_FRET_BUFFER,
    fret: digit,
    mergedFromPending: false,
    rejected: false,
  };
}
