// SPDX-License-Identifier: GPL-3.0-or-later
import {
  Suspense,
  lazy,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  routeToHash,
  sectionRoute,
  type SectionId,
} from './navigation/routes';
import { useHashRoute } from './navigation/useHashRoute';
import { AppShellContext, type AppShellServices } from './shell/AppShell';
import { MetronomeProvider } from './shell/MetronomeContext';
import { useGlobalKeyboard } from './shell/useGlobalKeyboard';
import { TunerSection } from './sections/TunerSection';

// Acordes y Metrónomo se cargan bajo demanda para no agrandar el arranque del afinador.
const ChordsSection = lazy(() => import('./sections/ChordsSection'));
const MetronomeSection = lazy(() => import('./sections/MetronomeSection'));

const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
  tuner: 'AFINADOR CROMÁTICO',
  chords: 'ACORDES',
  metronome: 'METRÓNOMO',
};

export function App() {
  const [route, navigate] = useHashRoute();
  const [subtitleEl, setSubtitleEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const spaceActionRef = useRef<(() => void) | null>(null);

  const setSpaceAction = useCallback((action: (() => void) | null) => {
    spaceActionRef.current = action;
  }, []);

  useGlobalKeyboard(spaceActionRef);

  const services = useMemo<AppShellServices>(
    () => ({
      headerSubtitleEl: subtitleEl,
      headerActionsEl: actionsEl,
      setSpaceAction,
      navigate,
    }),
    [subtitleEl, actionsEl, setSpaceAction, navigate]
  );

  return (
    <AppShellContext.Provider value={services}>
      <MetronomeProvider>
      <div className="pedal-chassis" data-section={route.section}>
        <header className="pedal-header">
          <div className="brand">
            <img
              src={`${import.meta.env.BASE_URL}icons/icon.svg`}
              alt=""
              className="brand-icon"
            />
            <div>
              <h1 className="brand-title">{SECTION_TITLES[route.section]}</h1>
              <p className="brand-subtitle" ref={setSubtitleEl} />
            </div>
          </div>
          <div className="header-right" ref={setActionsEl} />
        </header>

        <nav className="section-nav" aria-label="Secciones">
          {SECTION_ORDER.map((section) => {
            const active = route.section === section;
            return (
              <a
                key={section}
                href={routeToHash(sectionRoute(section))}
                className={`section-nav-btn ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {SECTION_LABELS[section]}
              </a>
            );
          })}
        </nav>

        <Suspense fallback={<p className="section-loading">Cargando…</p>}>
          {route.section === 'tuner' && <TunerSection />}
          {route.section === 'chords' && <ChordsSection tab={route.tab} />}
          {route.section === 'metronome' && <MetronomeSection />}
        </Suspense>
      </div>
      </MetronomeProvider>
    </AppShellContext.Provider>
  );
}

export default App;
