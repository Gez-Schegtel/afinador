// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, type RefObject } from 'react';

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

/**
 * Atajo `Espacio` contextual (Spec 006):
 * - Ejecuta la acción registrada por la sección activa si el foco no está en un control.
 * - Tras un clic de puntero en un botón/enlace (o un cambio de `<select>` hecho con el puntero),
 *   el control pierde el foco: así `Espacio` vuelve a ser el atajo y no repite la última acción.
 *   La activación por teclado (Tab + Espacio/Enter) no se altera.
 */
export function useGlobalKeyboard(
  spaceActionRef: RefObject<(() => void) | null>
): void {
  useEffect(() => {
    let lastInteractionWasPointer = false;

    const onPointerDown = () => {
      lastInteractionWasPointer = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      lastInteractionWasPointer = false;
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (FORM_TAGS.has(target.tagName) || target.isContentEditable)) {
        return;
      }
      const action = spaceActionRef.current;
      if (!action) return;
      e.preventDefault();
      action();
    };

    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return; // activación por teclado
      const control = (e.target as Element | null)?.closest?.('button, a');
      if (control instanceof HTMLElement) {
        control.blur();
      }
    };

    const onChange = (e: Event) => {
      if (lastInteractionWasPointer && e.target instanceof HTMLSelectElement) {
        e.target.blur();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
    };
  }, [spaceActionRef]);
}
