/**
 * Temporizador del metrónomo (Spec 004). Corre en un Web Worker porque sus temporizadores no se
 * estrangulan como los del hilo principal cuando la pestaña queda en segundo plano.
 * Solo emite «tick»: los clics se programan con el reloj de audio en el hilo principal.
 */

const TICK_MS = 25;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<'start' | 'stop'>) => void) | null;
  postMessage: (message: 'tick') => void;
};

let timer: ReturnType<typeof setInterval> | null = null;

scope.onmessage = (event) => {
  if (event.data === 'start' && timer === null) {
    timer = setInterval(() => scope.postMessage('tick'), TICK_MS);
  } else if (event.data === 'stop' && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
};
