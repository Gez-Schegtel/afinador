import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TunerEngine, type TunerEngineStatus } from '../audio/tuner-engine';
import {
  DEFAULT_A4_HZ,
  clampA4,
  clampTargetMidi,
  describeMidiNote,
  midiToFrequency,
  resolveChromaticNote,
  type ChromaticMatch,
  type HysteresisContext,
} from '../core/music/notes';
import { spelledToMidi, type PitchName } from '../core/music/spelling';
import {
  resolveTuningSelection,
  spellingForMidi,
  tuningMidis,
  type InstrumentId,
  type TuningDefinition,
} from '../core/music/tunings';
import { CalibrationControl } from '../components/CalibrationControl';
import { TargetNoteControl } from '../components/TargetNoteControl';
import { TunerGauge, type GaugeFrameData } from '../components/TunerGauge';
import {
  HeaderActions,
  HeaderSubtitle,
  useSpaceShortcut,
} from '../shell/AppShell';
import { useMetronome } from '../shell/MetronomeContext';

const STORAGE_A4_KEY = 'afinador_a4_hz';
const STORAGE_TARGET_MIDI_KEY = 'afinador_target_midi';
const STORAGE_MANUAL_MODE_KEY = 'afinador_manual_mode';
const STORAGE_INSTRUMENT_KEY = 'afinador_instrument';
const STORAGE_TUNING_KEY = 'afinador_tuning_id';
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

function loadInitialManualMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_MANUAL_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadInitialTuning(): {
  instrument: InstrumentId;
  tuning: TuningDefinition;
} {
  try {
    return resolveTuningSelection(
      localStorage.getItem(STORAGE_INSTRUMENT_KEY),
      localStorage.getItem(STORAGE_TUNING_KEY)
    );
  } catch {
    return resolveTuningSelection(null, null);
  }
}

function saveToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignorar si el almacenamiento está restringido
  }
}

interface ManualConfig {
  isManual: boolean;
  targetMidi: number;
  spelling: PitchName | null;
}

export function TunerSection() {
  const [a4Hz, setA4Hz] = useState<number>(loadInitialA4);
  const [isManual, setIsManual] = useState<boolean>(loadInitialManualMode);
  const [targetMidi, setTargetMidi] = useState<number>(loadInitialTargetMidi);
  const [tuningSelection, setTuningSelection] = useState(loadInitialTuning);
  const tuning = tuningSelection.tuning;

  // La nota objetivo se escribe con la ortografía de la afinación si es una de sus cuerdas.
  const targetSpelling = useMemo(
    () => (isManual ? spellingForMidi(tuning, targetMidi) : null),
    [isManual, tuning, targetMidi]
  );

  const [isListening, setIsListening] = useState(false);
  const [engineStatus, setEngineStatus] = useState<TunerEngineStatus>('idle');
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [wakeLocked, setWakeLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const metronome = useMetronome();
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;

  const [displayMatch, setDisplayMatch] = useState<ChromaticMatch | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);

  const a4Ref = useRef<number>(a4Hz);
  const manualConfigRef = useRef<ManualConfig>({
    isManual,
    targetMidi,
    spelling: targetSpelling,
  });
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
    () =>
      isManual ? describeMidiNote(targetMidi, a4Hz, targetSpelling) : null,
    [isManual, targetMidi, a4Hz, targetSpelling]
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
        forcedMidi,
        manualConfigRef.current.spelling
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
    saveToStorage(STORAGE_INSTRUMENT_KEY, tuningSelection.instrument);
    saveToStorage(STORAGE_TUNING_KEY, tuningSelection.tuning.id);
  }, [tuningSelection]);

  useEffect(() => {
    manualConfigRef.current = { isManual, targetMidi, spelling: targetSpelling };
    saveToStorage(STORAGE_TARGET_MIDI_KEY, String(targetMidi));
    saveToStorage(STORAGE_MANUAL_MODE_KEY, isManual ? '1' : '0');

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
  }, [isManual, targetMidi, targetSpelling]);

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
            forcedMidi,
            manualConfigRef.current.spelling
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
      onStatusChange: setEngineStatus,
      onWakeLockChange: setWakeLocked,
      onError: setErrorMsg,
    });

    engineRef.current = engine;
    // El efecto de modo Manual corre antes que este: enviar la configuración vigente al
    // motor recién creado (modo Manual persistido entre sesiones).
    if (manualConfigRef.current.isManual) {
      engine.setTargetFrequency(
        midiToFrequency(manualConfigRef.current.targetMidi, a4Ref.current),
        true
      );
    }
    return () => {
      void engine.stop();
    };
  }, []);

  const handleSelectTuning = useCallback(
    (instrument: InstrumentId, tuningId: string) => {
      const next = resolveTuningSelection(instrument, tuningId);
      setTuningSelection(next);
      // Conservar la nota objetivo si pertenece a la nueva afinación; si no, ir a la cuerda más grave.
      setTargetMidi((current) =>
        tuningMidis(next.tuning).includes(current)
          ? current
          : spelledToMidi(next.tuning.notes[0]!)
      );
    },
    []
  );

  const toggleListening = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const status = engine.getStatus();
    // Mientras arranca o se detiene, los toques extra se ignoran (no crean otro motor).
    if (status === 'running') {
      void engine.stop();
    } else if (status === 'idle') {
      setErrorMsg(null);
      // El micrófono captura audio crudo: los clics del metrónomo se colarían en la lectura.
      if (metronomeRef.current.running) {
        metronomeRef.current.stop();
        setNotice('Se detuvo el metrónomo para que el micrófono no capte sus clics.');
      } else {
        setNotice(null);
      }
      void engine.start();
    }
  }, []);

  useSpaceShortcut(toggleListening);

  const isBusy = engineStatus === 'starting' || engineStatus === 'stopping';
  const footswitchLabel =
    engineStatus === 'starting'
      ? 'INICIANDO…'
      : engineStatus === 'stopping'
        ? 'DETENIENDO…'
        : isListening
          ? 'DETENER ENTRADA'
          : 'ACTIVAR AFINADOR';

  return (
    <>
      <HeaderSubtitle>
        {isListening && sampleRate
          ? `DSP 64-bit · ${(sampleRate / 1000).toFixed(1)} kHz${wakeLocked ? ' · Pantalla activa' : ''}`
          : 'Guitarra y Bajo · 27.5–2000 Hz'}
      </HeaderSubtitle>

      <HeaderActions>
        <span className="desktop-shortcut-hint">Espacio: Activar / Detener</span>
        <div className="signal-meter" title="Nivel de señal de entrada">
          <span className="signal-dot" data-active={isListening} />
          <div className="signal-track">
            <div
              className="signal-fill"
              style={{ width: `${Math.round(inputLevel * 100)}%` }}
            />
          </div>
        </div>
      </HeaderActions>

      {notice && (
        <div className="info-banner" role="status">
          {notice}
        </div>
      )}

      {errorMsg && (
        <div className="error-banner" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="pedal-workspace">
        <TunerGauge
          frameRef={gaugeFrameRef}
          displayMatch={displayMatch}
          lockedNote={lockedNote}
          isManual={isManual}
          isListening={isListening}
          isHolding={isHolding}
          a4Hz={a4Hz}
        />

        <div className="pedal-controls-col">
          <TargetNoteControl
            isManual={isManual}
            targetMidi={targetMidi}
            a4Hz={a4Hz}
            instrumentId={tuningSelection.instrument}
            tuning={tuning}
            targetSpelling={targetSpelling}
            onToggleMode={setIsManual}
            onSelectTargetMidi={setTargetMidi}
            onSelectTuning={handleSelectTuning}
          />

          <CalibrationControl a4Hz={a4Hz} onChange={setA4Hz} />

          <footer className="pedal-footswitch-area">
            <button
              type="button"
              className={`footswitch-btn ${isListening ? 'is-listening' : ''}`}
              onClick={toggleListening}
              disabled={isBusy}
              aria-busy={isBusy}
            >
              <span className="footswitch-led" />
              {footswitchLabel}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

export default TunerSection;
