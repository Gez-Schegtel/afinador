// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { AudioArbitrator, type AudioChannel } from './audio-arbitrator';
import { isAudioBusy, setAudioBusy } from './audio-activity';

describe('AudioArbitrator (Spec 008)', () => {
  it('impone exclusión mutua del micrófono y entre canales incompatibles', async () => {
    const busied: Array<[AudioChannel, boolean]> = [];
    const arb = new AudioArbitrator({
      onBusyChange: (ch, busy) => busied.push([ch, busy]),
    });

    const stopTuner = vi.fn(async () => undefined);
    const stopMetronome = vi.fn();
    const stopTabs = vi.fn();
    const stopTone = vi.fn();

    arb.register('tuner', { stop: stopTuner });
    arb.register('metronome', { stop: stopMetronome });
    arb.register('tabs', { stop: stopTabs });
    arb.register('tone', { stop: stopTone });

    // Metrónomo + tono activos; abrir el afinador debe detenerlos a ambos.
    arb.setActive('metronome', true);
    arb.setActive('tone', true);
    const stoppedByTuner = await arb.acquire('tuner');
    expect(stoppedByTuner).toEqual(['metronome', 'tone']);
    expect(stopMetronome).toHaveBeenCalledTimes(1);
    expect(stopTone).toHaveBeenCalledTimes(1);
    expect(stopTabs).not.toHaveBeenCalled();

    // Arrancar tablaturas mientras corre el afinador detiene al afinador.
    arb.setActive('tuner', true);
    const stoppedByTabs = await arb.acquire('tabs');
    expect(stoppedByTabs).toEqual(['tuner']);
    expect(stopTuner).toHaveBeenCalledTimes(1);

    // Tablaturas activas: tono o metrónomo las detienen, y el tono convive con el metrónomo.
    arb.setActive('tabs', true);
    expect(await arb.acquire('tone')).toEqual(['tabs']);
    expect(stopTabs).toHaveBeenCalledTimes(1);

    arb.setActive('tone', true);
    expect(await arb.acquire('metronome')).toEqual([]);
    expect(arb.isActive('tone')).toBe(true);
    expect(busied.some(([c, b]) => c === 'tuner' && b)).toBe(true);

    // Detención síncrona para preservar gesto de usuario en el mismo turno
    arb.setActive('tabs', true);
    expect(arb.stopConflictsSync('tuner')).toEqual(['tabs', 'tone']);
    expect(arb.isActive('tabs')).toBe(false);
    expect(arb.isActive('tone')).toBe(false);
  });

  it('sincroniza isAudioBusy al usar la integración por defecto', () => {
    setAudioBusy('tuner', false);
    setAudioBusy('metronome', false);
    setAudioBusy('tabs', false);
    setAudioBusy('tone', false);

    const arb = new AudioArbitrator();
    arb.setActive('tabs', true);
    expect(isAudioBusy()).toBe(true);
    arb.release('tabs');
    expect(isAudioBusy()).toBe(false);
  });
});
