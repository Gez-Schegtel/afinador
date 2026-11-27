/**
 * Gestión segura de Screen Wake Lock API para evitar que Android apague la pantalla
 * mientras el usuario tiene ambas manos ocupadas afinando la guitarra.
 */
export class ScreenWakeLocker {
  private sentinel: WakeLockSentinel | null = null;
  private shouldKeepAwake = false;
  private readonly onStatusChange?: (locked: boolean) => void;

  constructor(onStatusChange?: (locked: boolean) => void) {
    this.onStatusChange = onStatusChange;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  public async enable(): Promise<boolean> {
    this.shouldKeepAwake = true;
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
    return this.acquire();
  }

  public async disable(): Promise<void> {
    this.shouldKeepAwake = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignorar errores al liberar sentinel ya cerrado
      }
      this.sentinel = null;
    }
    this.onStatusChange?.(false);
  }

  private async acquire(): Promise<boolean> {
    if (!ScreenWakeLocker.isSupported() || !this.shouldKeepAwake) {
      this.onStatusChange?.(false);
      return false;
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return false;
    }

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.onStatusChange?.(false);
      });
      this.onStatusChange?.(true);
      return true;
    } catch {
      this.onStatusChange?.(false);
      return false;
    }
  }

  private handleVisibilityChange(): void {
    if (
      this.shouldKeepAwake &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
    ) {
      void this.acquire();
    }
  }
}
