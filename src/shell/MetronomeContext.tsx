// SPDX-License-Identifier: GPL-3.0-or-later
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MetronomeEngine } from '../audio/metronome-engine';
import { setAudioBusy } from './audio-activity';
import {
  resolveMetronomeSettings,
  type MetronomeSettings,
  type ScheduledClick,
} from '../core/rhythm/meters';

const STORAGE_METRONOME_KEY = 'afinador_metronome';

export interface MetronomeController {
  readonly settings: MetronomeSettings;
  readonly running: boolean;
  readonly wakeLocked: boolean;
  readonly error: string | null;
  readonly updateSettings: (patch: Partial<MetronomeSettings>) => void;
  readonly start: () => void;
  readonly stop: () => void;
  readonly toggle: () => void;
  readonly getVisualClick: () => ScheduledClick | null;
}

const MetronomeContext = createContext<MetronomeController | null>(null);

function loadSettings(): MetronomeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_METRONOME_KEY);
    return resolveMetronomeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return resolveMetronomeSettings(null);
  }
}

/**
 * El metrónomo vive a nivel de la app (Spec 006): sigue sonando al cambiar de sección, pero el
 * afinador lo detiene antes de abrir el micrófono (Spec 004 §2.4).
 */
export function MetronomeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<MetronomeSettings>(loadSettings);
  const [running, setRunning] = useState(false);
  const [wakeLocked, setWakeLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const engineRef = useRef<MetronomeEngine | null>(null);

  const getEngine = useCallback((): MetronomeEngine => {
    if (!engineRef.current) {
      engineRef.current = new MetronomeEngine(settingsRef.current, {
        onRunningChange: setRunning,
        onWakeLockChange: setWakeLocked,
        onError: setError,
      });
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    engineRef.current?.updateSettings(settings);
    try {
      localStorage.setItem(STORAGE_METRONOME_KEY, JSON.stringify(settings));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }
  }, [settings]);

  useEffect(() => {
    setAudioBusy('metronome', running);
  }, [running]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    []
  );

  const updateSettings = useCallback((patch: Partial<MetronomeSettings>) => {
    setSettings((prev) => resolveMetronomeSettings({ ...prev, ...patch }));
  }, []);

  const start = useCallback(() => {
    setError(null);
    void getEngine().start();
  }, [getEngine]);

  const stop = useCallback(() => {
    void engineRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (engineRef.current?.isRunning()) {
      void engineRef.current.stop();
    } else {
      setError(null);
      void getEngine().start();
    }
  }, [getEngine]);

  const getVisualClick = useCallback(
    () => engineRef.current?.getVisualClick() ?? null,
    []
  );

  const value = useMemo<MetronomeController>(
    () => ({
      settings,
      running,
      wakeLocked,
      error,
      updateSettings,
      start,
      stop,
      toggle,
      getVisualClick,
    }),
    [settings, running, wakeLocked, error, updateSettings, start, stop, toggle, getVisualClick]
  );

  return (
    <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>
  );
}

export function useMetronome(): MetronomeController {
  const ctx = useContext(MetronomeContext);
  if (!ctx) {
    throw new Error('useMetronome() debe usarse dentro de <MetronomeProvider>');
  }
  return ctx;
}
