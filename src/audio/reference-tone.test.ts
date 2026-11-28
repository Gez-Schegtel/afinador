// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { AudioArbitrator } from '../shell/audio-arbitrator';
import { computePluckedStringHarmonics } from './reference-tone';

describe('Tono de referencia audible y exclusión en AudioArbitrator (Spec 012)', () => {
  it('calcula frecuencias exactas según A4 (432, 440 y 442 Hz)', () => {
    const a4_432 = computePluckedStringHarmonics(69, 432);
    const a4_440 = computePluckedStringHarmonics(69, 440);
    const a4_442 = computePluckedStringHarmonics(69, 442);

    expect(a4_432.fundamentalHz).toBeCloseTo(432, 6);
    expect(a4_440.fundamentalHz).toBeCloseTo(440, 6);
    expect(a4_442.fundamentalHz).toBeCloseTo(442, 6);
    expect(a4_440.partials[1]?.freqHz).toBeCloseTo(880, 6);
  });

  it('garantiza exclusión mutua bidireccional entre el tono guía y el micrófono en AudioArbitrator', async () => {
    const arb = new AudioArbitrator({ onBusyChange: () => {} });
    const stopTuner = vi.fn();
    const stopTone = vi.fn();

    arb.register('tuner', { stop: stopTuner });
    arb.register('tone', { stop: stopTone });

    // Con el micrófono activo, iniciar tono detiene el micrófono
    arb.setActive('tuner', true);
    await arb.acquire('tone');
    expect(stopTuner).toHaveBeenCalledTimes(1);

    // Con el tono activo, activar el micrófono detiene el tono de referencia
    arb.setActive('tone', true);
    arb.stopConflictsSync('tuner');
    expect(stopTone).toHaveBeenCalledTimes(1);
  });
});
