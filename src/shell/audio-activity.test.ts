// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { isAudioBusy, setAudioBusy, whenAudioIdle } from './audio-activity';

describe('Actividad de audio (recarga diferida del Service Worker)', () => {
  it('ejecuta la recarga recién cuando no queda audio activo', () => {
    const reload = vi.fn();
    setAudioBusy('tuner', true);
    setAudioBusy('metronome', true);
    whenAudioIdle(reload);
    expect(reload).not.toHaveBeenCalled();
    setAudioBusy('tuner', false);
    expect(reload).not.toHaveBeenCalled();
    setAudioBusy('metronome', false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(isAudioBusy()).toBe(false);

    const immediate = vi.fn();
    whenAudioIdle(immediate);
    expect(immediate).toHaveBeenCalledTimes(1);
  });
});
