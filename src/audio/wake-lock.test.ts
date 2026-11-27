import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenWakeLocker } from './wake-lock';

class FakeSentinel {
  released = false;
  private readonly listeners: Array<() => void> = [];
  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener);
  }
  async release() {
    this.released = true;
    for (const l of this.listeners) l();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScreenWakeLocker (Spec 006)', () => {
  it('libera el bloqueo si disable() llega mientras acquire() espera', async () => {
    let resolveRequest!: (s: FakeSentinel) => void;
    const sentinel = new FakeSentinel();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      wakeLock: {
        request: () =>
          new Promise<FakeSentinel>((resolve) => {
            resolveRequest = resolve;
          }),
      },
    });

    const statuses: boolean[] = [];
    const locker = new ScreenWakeLocker((locked) => statuses.push(locked));
    const enabling = locker.enable();
    await locker.disable();
    resolveRequest(sentinel);

    expect(await enabling).toBe(false);
    expect(sentinel.released).toBe(true);
    expect(statuses).not.toContain(true);
  });

  it('mantiene y luego libera el bloqueo en el flujo normal', async () => {
    const sentinel = new FakeSentinel();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      wakeLock: { request: async () => sentinel },
    });

    const statuses: boolean[] = [];
    const locker = new ScreenWakeLocker((locked) => statuses.push(locked));
    expect(await locker.enable()).toBe(true);
    expect(statuses).toEqual([true]);
    await locker.disable();
    expect(sentinel.released).toBe(true);
    expect(statuses.at(-1)).toBe(false);
  });
});
