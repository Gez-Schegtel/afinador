import { useEffect, useMemo, useRef, useState } from 'react';
import { TunerEngine } from './audio/tuner-engine';
import {
  DEFAULT_A4_HZ,
  clampA4,
  clampTargetMidi,
  describeMidiNote,
  midiToFrequency,
  resolveChromaticNote,
  type ChromaticMatch,
  type HysteresisContext,
} from './core/music/notes';
import { CalibrationControl } from './components/CalibrationControl';
import { TargetNoteControl } from './components/TargetNoteControl';
import { TunerGauge, type GaugeFrameData } from './components/TunerGauge';

const STORAGE_A4_KEY = 'afinador_a4_hz';
const STORAGE_TARGET_MIDI_KEY = 'afinador_target_midi';
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

function loadInitialTargetMidi(): number {
  try {
    const raw = localStorage.getItem(STORAGE_TARGET_MIDI_KEY);
    if (!raw) return 40; // E2 (6ª cuerda guitarra)
    return clampTargetMidi(Number.parseInt(raw, 10));
  } catch {
    return 40;
  }
}

export function App() {
  const [a4Hz, setA4Hz] = useState<number>(loadInitialA4);
  const [isManual, setIsManual] = useState<boolean>(false);
  const [targetMidi, setTargetMidi] = useState<number>(loadInitialTargetMidi);

  const [isListening, setIsListening] = useState(false);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [wakeLocked, setWakeLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [displayMatch, setDisplayMatch] = useState<ChromaticMatch | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);

  const a4Ref = useRef<number>(a4Hz);
  const manualConfigRef = useRef({ isManual, targetMidi });
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

  const lockedNote = useMemo(
    () => (isManual ? describeMidiNote(targetMidi, a4Hz) : null),
    [isManual, targetMidi, a4Hz]
  );

  const engineRef = useRef<TunerEngine | null>(null);

  useEffect(() => {
    a4Ref.current = a4Hz;
    try {
      localStorage.setItem(STORAGE_A4_KEY, String(a4Hz));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }

    if (manualConfigRef.current.isManual) {
      engineRef.current?.setTargetFrequency(
        midiToFrequency(manualConfigRef.current.targetMidi, a4Hz),
        false
      );
    }

    if (lastFrequencyRef.current !== null) {
      const forcedMidi = manualConfigRef.current.isManual
        ? manualConfigRef.current.targetMidi
        : null;
      const updated = resolveChromaticNote(
        lastFrequencyRef.current,
        a4Hz,
        hysteresisRef.current,
        forcedMidi
      );
      hysteresisRef.current = {
        previousMidi: updated.note.midi,
        previousDirection: updated.direction,
      };
      gaugeFrameRef.current.match = updated;
      setDisplayMatch(updated);
    }
  }, [a4Hz]);

  useEffect(() => {
    manualConfigRef.current = { isManual, targetMidi };
    try {
      localStorage.setItem(STORAGE_TARGET_MIDI_KEY, String(targetMidi));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }

    lastFrequencyRef.current = null;
    hysteresisRef.current = {
      previousMidi: null,
      previousDirection: null,
    };
    gaugeFrameRef.current.match = null;
    gaugeFrameRef.current.isHolding = false;
    setDisplayMatch(null);
    setIsHolding(false);

    engineRef.current?.setTargetFrequency(
      isManual ? midiToFrequency(targetMidi, a4Ref.current) : null,
      true
    );
  }, [isManual, targetMidi]);

  useEffect(() => {
    const engine = new TunerEngine({
      onPitch: (reading) => {
        const now = performance.now();
        const level = Math.min(1, Math.sqrt(reading.rms * 12));

        if (reading.frequency !== null) {
          lastFrequencyRef.current = reading.frequency;
          const prevCtx = hysteresisRef.current;
          const forcedMidi = manualConfigRef.current.isManual
            ? manualConfigRef.current.targetMidi
            : null;
          const match = resolveChromaticNote(
            reading.frequency,
            a4Ref.current,
            prevCtx,
            forcedMidi
          );

          const stateChanged =
            match.note.midi !== prevCtx.previousMidi ||
            match.direction !== prevCtx.previousDirection;

          hysteresisRef.current = {
            previousMidi: match.note.midi,
            previousDirection: match.direction,
          };

          gaugeFrameRef.current = {
            match,
            isHolding: reading.isHolding,
            rms: reading.rms,
            isListening: true,
          };

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
          lockedNote={lockedNote}
          isListening={isListening}
          isHolding={isHolding}
          a4Hz={a4Hz}
        />

        <TargetNoteControl
          isManual={isManual}
          targetMidi={targetMidi}
          a4Hz={a4Hz}
          onToggleMode={setIsManual}
          onSelectTargetMidi={setTargetMidi}
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
