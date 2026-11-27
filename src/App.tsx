import { useEffect, useRef, useState } from 'react';
import { TunerEngine } from './audio/tuner-engine';
import {
  DEFAULT_A4_HZ,
  clampA4,
  resolveChromaticNote,
  type ChromaticMatch,
  type HysteresisContext,
} from './core/music/notes';
import { CalibrationControl } from './components/CalibrationControl';
import { TunerGauge, type GaugeFrameData } from './components/TunerGauge';

const STORAGE_A4_KEY = 'afinador_a4_hz';
const UI_READOUT_INTERVAL_MS = 85; // ~12 Hz para lectura digital calma y legible

function loadInitialA4(): number {
  try {
    const raw = localStorage.getItem(STORAGE_A4_KEY);
    if (!raw) return DEFAULT_A4_HZ;
    return clampA4(Number.parseFloat(raw));
  } catch {
    return DEFAULT_A4_HZ;
  }
}

export function App() {
  const [a4Hz, setA4Hz] = useState<number>(loadInitialA4);
  const [isListening, setIsListening] = useState(false);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [wakeLocked, setWakeLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [displayMatch, setDisplayMatch] = useState<ChromaticMatch | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);

  const a4Ref = useRef<number>(a4Hz);
  const lastFrequencyRef = useRef<number | null>(null);
  const hysteresisRef = useRef<HysteresisContext>({
    previousMidi: null,
    previousDirection: null,
  });
  const lastUiUpdateTimeRef = useRef<number>(0);

  const gaugeFrameRef = useRef<GaugeFrameData>({
    match: null,
    isHolding: false,
    rms: 0,
    isListening: false,
  });

  useEffect(() => {
    a4Ref.current = a4Hz;
    try {
      localStorage.setItem(STORAGE_A4_KEY, String(a4Hz));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }

    if (lastFrequencyRef.current !== null) {
      const updated = resolveChromaticNote(
        lastFrequencyRef.current,
        a4Hz,
        hysteresisRef.current
      );
      hysteresisRef.current = {
        previousMidi: updated.note.midi,
        previousDirection: updated.direction,
      };
      gaugeFrameRef.current.match = updated;
      setDisplayMatch(updated);
    }
  }, [a4Hz]);

  const engineRef = useRef<TunerEngine | null>(null);

  useEffect(() => {
    const engine = new TunerEngine({
      onPitch: (reading) => {
        const now = performance.now();
        const level = Math.min(1, Math.sqrt(reading.rms * 12));

        if (reading.frequency !== null) {
          lastFrequencyRef.current = reading.frequency;
          const prevCtx = hysteresisRef.current;
          const match = resolveChromaticNote(
            reading.frequency,
            a4Ref.current,
            prevCtx
          );

          const stateChanged =
            match.note.midi !== prevCtx.previousMidi ||
            match.direction !== prevCtx.previousDirection;

          hysteresisRef.current = {
            previousMidi: match.note.midi,
            previousDirection: match.direction,
          };

          // El Canvas 60 FPS recibe siempre el último cuadro exacto al instante:
          gaugeFrameRef.current = {
            match,
            isHolding: reading.isHolding,
            rms: reading.rms,
            isListening: true,
          };

          // El texto numérico se refresca inmediatamente ante cambios de nota/estado,
          // o cada ~85 ms para que los dígitos sean serenos y fáciles de leer.
          if (
            stateChanged ||
            now - lastUiUpdateTimeRef.current >= UI_READOUT_INTERVAL_MS
          ) {
            lastUiUpdateTimeRef.current = now;
            setDisplayMatch(match);
            setIsHolding(reading.isHolding);
            setInputLevel(level);
          }
        } else {
          lastFrequencyRef.current = null;
          hysteresisRef.current = {
            previousMidi: null,
            previousDirection: null,
          };
          gaugeFrameRef.current = {
            match: null,
            isHolding: false,
            rms: reading.rms,
            isListening: true,
          };
          setDisplayMatch(null);
          setIsHolding(false);
          if (now - lastUiUpdateTimeRef.current >= UI_READOUT_INTERVAL_MS) {
            lastUiUpdateTimeRef.current = now;
            setInputLevel(level);
          }
        }
      },
      onStateChange: (running, sr) => {
        setIsListening(running);
        setSampleRate(sr);
        if (!running) {
          lastFrequencyRef.current = null;
          hysteresisRef.current = {
            previousMidi: null,
            previousDirection: null,
          };
          gaugeFrameRef.current = {
            match: null,
            isHolding: false,
            rms: 0,
            isListening: false,
          };
          setDisplayMatch(null);
          setIsHolding(false);
          setInputLevel(0);
        }
      },
      onWakeLockChange: setWakeLocked,
      onError: setErrorMsg,
    });

    engineRef.current = engine;
    return () => {
      void engine.stop();
    };
  }, []);

  const toggleListening = async () => {
    setErrorMsg(null);
    const engine = engineRef.current;
    if (!engine) return;
    if (isListening) {
      await engine.stop();
    } else {
      await engine.start();
    }
  };

  return (
    <div className="pedal-chassis">
      <header className="pedal-header">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon.svg`}
            alt=""
            className="brand-icon"
          />
          <div>
            <h1 className="brand-title">AFINADOR CROMÁTICO</h1>
            <p className="brand-subtitle">
              {isListening && sampleRate
                ? `DSP 64-bit · ${(sampleRate / 1000).toFixed(1)} kHz${wakeLocked ? ' · Pantalla activa' : ''}`
                : 'Guitarra y Bajo · 27.5–2000 Hz'}
            </p>
          </div>
        </div>

        <div className="signal-meter" title="Nivel de señal de entrada">
          <span className="signal-dot" data-active={isListening} />
          <div className="signal-track">
            <div
              className="signal-fill"
              style={{ width: `${Math.round(inputLevel * 100)}%` }}
            />
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="error-banner" role="alert">
          {errorMsg}
        </div>
      )}

      <main className="pedal-body">
        <TunerGauge
          frameRef={gaugeFrameRef}
          displayMatch={displayMatch}
          isListening={isListening}
          isHolding={isHolding}
          a4Hz={a4Hz}
        />

        <CalibrationControl a4Hz={a4Hz} onChange={setA4Hz} />
      </main>

      <footer className="pedal-footswitch-area">
        <button
          type="button"
          className={`footswitch-btn ${isListening ? 'is-listening' : ''}`}
          onClick={() => void toggleListening()}
        >
          <span className="footswitch-led" />
          {isListening ? 'DETENER ENTRADA' : 'ACTIVAR AFINADOR'}
        </button>
      </footer>
    </div>
  );
}

export default App;
