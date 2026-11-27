// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Registro mínimo de actividad de audio (afinador / metrónomo). Sirve para no recargar la app
 * por una actualización del Service Worker mientras el usuario está afinando o tocando.
 */

const busyKeys = new Set<string>();
const idleListeners = new Set<() => void>();

export function setAudioBusy(key: string, busy: boolean): void {
  if (busy) {
    busyKeys.add(key);
    return;
  }
  busyKeys.delete(key);
  if (busyKeys.size === 0) {
    const listeners = [...idleListeners];
    idleListeners.clear();
    for (const listener of listeners) listener();
  }
}

export function isAudioBusy(): boolean {
  return busyKeys.size > 0;
}

/** Ejecuta `callback` una sola vez, apenas no quede audio activo (o enseguida si ya no hay). */
export function whenAudioIdle(callback: () => void): void {
  if (!isAudioBusy()) {
    callback();
    return;
  }
  idleListeners.add(callback);
}
