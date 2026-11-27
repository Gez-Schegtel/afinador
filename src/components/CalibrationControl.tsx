import { useEffect, useState } from 'react';
import {
  DEFAULT_A4_HZ,
  MAX_A4_HZ,
  MIN_A4_HZ,
  QUICK_A4_PRESETS,
  clampA4,
} from '../core/music/notes';

interface CalibrationControlProps {
  a4Hz: number;
  onChange: (nextA4Hz: number) => void;
}

export function CalibrationControl({
  a4Hz,
  onChange,
}: CalibrationControlProps) {
  const [inputValue, setInputValue] = useState<string>(String(a4Hz));

  useEffect(() => {
    setInputValue(String(a4Hz));
  }, [a4Hz]);

  const commitInput = () => {
    const parsed = Number.parseFloat(inputValue.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      const next = clampA4(parsed);
      onChange(next);
      setInputValue(String(next));
    } else {
      setInputValue(String(a4Hz));
    }
  };

  return (
    <section
      className="calibration-card"
      aria-label="Calibración de frecuencia de referencia A4"
    >
      <div className="calibration-header">
        <div className="calibration-title-group">
          <span className="calibration-label">PITCH / CALIBRACIÓN</span>
          <span className="calibration-range">
            {MIN_A4_HZ}–{MAX_A4_HZ} Hz (paso 0.5 / 1 Hz)
          </span>
        </div>

        <div className="calibration-stepper">
          <button
            type="button"
            className="step-btn"
            onClick={() => onChange(clampA4(a4Hz - 1))}
            disabled={a4Hz <= MIN_A4_HZ}
            aria-label="Bajar 1 Hz"
            title="-1 Hz"
          >
            −1
          </button>
          <button
            type="button"
            className="step-btn step-btn-fine"
            onClick={() => onChange(clampA4(a4Hz - 0.5))}
            disabled={a4Hz <= MIN_A4_HZ}
            aria-label="Bajar 0.5 Hz"
            title="-0.5 Hz"
          >
            −.5
          </button>

          <label className="hz-input-wrap">
            <span className="hz-prefix">A4</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_A4_HZ}
              max={MAX_A4_HZ}
              step="0.1"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={commitInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              aria-label="Frecuencia de La4 en Hz"
            />
            <span className="hz-suffix">Hz</span>
          </label>

          <button
            type="button"
            className="step-btn step-btn-fine"
            onClick={() => onChange(clampA4(a4Hz + 0.5))}
            disabled={a4Hz >= MAX_A4_HZ}
            aria-label="Subir 0.5 Hz"
            title="+0.5 Hz"
          >
            +.5
          </button>
          <button
            type="button"
            className="step-btn"
            onClick={() => onChange(clampA4(a4Hz + 1))}
            disabled={a4Hz >= MAX_A4_HZ}
            aria-label="Subir 1 Hz"
            title="+1 Hz"
          >
            +1
          </button>
        </div>
      </div>

      <div className="preset-chips" role="group" aria-label="Referencias rápidas A4">
        {QUICK_A4_PRESETS.map((preset) => {
          const active = Math.abs(a4Hz - preset) < 0.05;
          return (
            <button
              key={preset}
              type="button"
              className={`chip-btn ${active ? 'is-active' : ''}`}
              onClick={() => onChange(preset)}
            >
              {preset} Hz{preset === DEFAULT_A4_HZ ? ' · Est.' : ''}
            </button>
          );
        })}
      </div>
    </section>
  );
}
