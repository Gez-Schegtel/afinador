import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pitch-worklet.ts?worker&url', () => ({ default: 'pitch-worklet.js' }));

import { TunerEngine, type TunerEngineStatus } from './tuner-engine';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

const fakeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });

let contexts: FakeAudioContext[] = [];
let addModuleGate: Deferred<void> | null = null;
let addModuleError: Error | null = null;

class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  closed = false;
  destination = {};
  audioWorklet = {
    addModule: async () => {
      if (addModuleGate) await addModuleGate.promise;
      if (addModuleError) throw addModuleError;
    },
  };
  constructor() {
    contexts.push(this);
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.closed = true;
  }
  createMediaStreamSource() {
    return fakeNode();
  }
  createGain() {
    return { ...fakeNode(), gain: { value: 1 } };
  }
}

class FakeWorkletNode {
  port = { onmessage: null as unknown, postMessage: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

let streams: FakeStream[] = [];
let getUserMediaGate: Deferred<void> | null = null;

beforeEach(() => {
  contexts = [];
  streams = [];
  addModuleGate = null;
  addModuleError = null;
  getUserMediaGate = null;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        if (getUserMediaGate) await getUserMediaGate.promise;
        const stream = new FakeStream();
        streams.push(stream);
        return stream;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createEngine() {
  const statuses: TunerEngineStatus[] = [];
  const errors: string[] = [];
  const engine = new TunerEngine({
    onPitch: () => undefined,
    onStatusChange: (s) => statuses.push(s),
    onError: (m) => errors.push(m),
  });
  return { engine, statuses, errors };
}

describe('TunerEngine — arranque y detención robustos (Spec 006)', () => {
  it('un doble start() durante el arranque crea un único motor', async () => {
    const { engine } = createEngine();
    getUserMediaGate = deferred<void>();
    const first = engine.start();
    const second = engine.start();
    expect(second).toBe(first);
    getUserMediaGate.resolve();
    await Promise.all([first, second]);

    expect(engine.getStatus()).toBe('running');
    expect(streams).toHaveLength(1);
    expect(contexts).toHaveLength(1);

    await engine.stop();
    expect(engine.getStatus()).toBe('idle');
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
    expect(contexts[0]!.closed).toBe(true);
  });

  it('stop() durante el arranque libera el micrófono y el AudioContext adquiridos después', async () => {
    const { engine, statuses } = createEngine();
    addModuleGate = deferred<void>();
    const starting = engine.start();
    // Esperar a que el arranque llegue a addModule (micrófono y contexto ya adquiridos).
    await vi.waitFor(() => expect(contexts).toHaveLength(1));

    await engine.stop();
    addModuleGate.resolve();
    await starting;

    expect(engine.getStatus()).toBe('idle');
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
    expect(contexts[0]!.closed).toBe(true);
    expect(statuses).not.toContain('running');
  });

  it('si addModule falla, detiene las pistas y cierra el contexto', async () => {
    const { engine, errors } = createEngine();
    addModuleError = new Error('no se pudo cargar el worklet');
    await engine.start();

    expect(engine.getStatus()).toBe('idle');
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
    expect(contexts[0]!.closed).toBe(true);
    expect(errors[0]).toContain('no se pudo cargar el worklet');
  });

  it('se puede volver a arrancar después de una cancelación', async () => {
    const { engine } = createEngine();
    getUserMediaGate = deferred<void>();
    const cancelledStart = engine.start();
    await engine.stop();
    getUserMediaGate.resolve();
    await cancelledStart;
    // El stream que llegó tarde se liberó sin quedar asociado al motor.
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);

    getUserMediaGate = null;
    await engine.start();
    expect(engine.getStatus()).toBe('running');
    expect(streams).toHaveLength(2);
    await engine.stop();
  });
});
