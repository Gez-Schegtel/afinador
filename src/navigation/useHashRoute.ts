// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { parseRoute, routeToHash, type AppRoute } from './routes';

function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

/**
 * Ruta activa según `location.hash`. Navegar cambia el hash, así que «Atrás» (navegador o
 * botón de Android en Capacitor) vuelve a la sección anterior.
 */
export function useHashRoute(): [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(currentHash()));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(currentHash()));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    const hash = routeToHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setRoute(next);
    }
  }, []);

  return [route, navigate];
}
