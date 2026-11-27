import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { AppRoute } from '../navigation/routes';

/**
 * Servicios que la «cáscara» de la app ofrece a cada sección (Spec 006):
 * ranuras del encabezado (portales), el atajo `Espacio` contextual y la navegación.
 */
export interface AppShellServices {
  readonly headerSubtitleEl: HTMLElement | null;
  readonly headerActionsEl: HTMLElement | null;
  readonly setSpaceAction: (action: (() => void) | null) => void;
  readonly navigate: (route: AppRoute) => void;
}

export const AppShellContext = createContext<AppShellServices | null>(null);

export function useAppShell(): AppShellServices {
  const shell = useContext(AppShellContext);
  if (!shell) {
    throw new Error('useAppShell() debe usarse dentro de <AppShellContext.Provider>');
  }
  return shell;
}

/** Texto del subtítulo del encabezado para la sección activa. */
export function HeaderSubtitle({ children }: { children: ReactNode }) {
  const { headerSubtitleEl } = useAppShell();
  return headerSubtitleEl ? createPortal(children, headerSubtitleEl) : null;
}

/** Indicadores de la sección activa en el lado derecho del encabezado. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { headerActionsEl } = useAppShell();
  return headerActionsEl ? createPortal(children, headerActionsEl) : null;
}

/** Registra la acción de `Espacio` mientras la sección está montada. */
export function useSpaceShortcut(action: (() => void) | null): void {
  const { setSpaceAction } = useAppShell();
  useEffect(() => {
    setSpaceAction(action);
    return () => setSpaceAction(null);
  }, [action, setSpaceAction]);
}
