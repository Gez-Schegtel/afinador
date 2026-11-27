// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import {
  BEAT_UNIT_NAMES,
  BEAT_UNIT_PLURALS,
  BEAT_UNIT_SYMBOLS,
  MAX_BPM,
  METERS,
  MIN_BPM,
  buildBarPattern,
  clampBpm,
  formatGrouping,
  getMeter,
  supportsSubdivision,
  type MeterId,
  type MeterKind,
} from '../core/rhythm/meters';
import {
  HeaderActions,
  HeaderSubtitle,
  useSpaceShortcut,
} from '../shell/AppShell';
import { useMetronome } from '../shell/MetronomeContext';

const KIND_GROUP_LABELS: Readonly<Record<MeterKind, string>> = {
  simple: 'Simples (pulso de negra)',
  compound: 'Compuestos (pulso de negra con puntillo)',
  irregular: 'Irregulares / amalgama (pulso de corchea)',
};

const KIND_ORDER: readonly MeterKind[] = ['simple', 'compound', 'irregular'];

/** Sección Metrónomo (Spec 004). */
export function MetronomeSection() {
  const metronome = useMetronome();
  const { settings, running, updateSettings } = metronome;
  const meter = getMeter(settings.meterId);
  const pattern = useMemo(() => buildBarPattern(settings), [settings]);
  const [bpmInput, setBpmInput] = useState(String(settings.bpm));
  const [lit, setLit] = useState<number | null>(null);

  useSpaceShortcut(metronome.toggle);

  useEffect(() => {
    setBpmInput(String(settings.bpm));
  }, [settings.bpm]);

  // Indicador visual sincronizado con el reloj de audio (sin re-renders salvo al cambiar el clic).
  useEffect(() => {
    if (!running) {
      setLit(null);
      return;
    }
    let raf = 0;
    let lastKey = '';
    const loop = () => {
      const click = metronome.getVisualClick();
      const key = click ? `${click.barIndex}:${click.unitInBar}` : '';
      if (key !== lastKey) {
        lastKey = key;
        setLit(click ? click.unitInBar : null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, metronome.getVisualClick]);

  const commitBpm = () => {
    const parsed = Number.parseFloat(bpmInput.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      updateSettings({ bpm: clampBpm(parsed) });
      setBpmInput(String(clampBpm(parsed)));
    } else {
      setBpmInput(String(settings.bpm));
    }
  };

  const unitSymbol = BEAT_UNIT_SYMBOLS[meter.beatUnit];
  const grouping = meter.groupings[settings.groupingIndex] ?? meter.groupings[0]!;
  const pulseCount = grouping.length;

  return (
    <>
      <HeaderSubtitle>
        {running
          ? `${meter.id} · ${unitSymbol} = ${settings.bpm}${metronome.wakeLocked ? ' · Pantalla activa' : ''}`
          : 'Compases simples, compuestos e irregulares'}
      </HeaderSubtitle>
      <HeaderActions>
        <span className="desktop-shortcut-hint">Espacio: Iniciar / Detener</span>
      </HeaderActions>

      {metronome.error && (
        <div className="error-banner" role="alert">
          {metronome.error}
        </div>
      )}

      <div className="pedal-workspace">
        <section className="pedal-screen metronome-screen" aria-label="Visor del metrónomo">
          <div className="tempo-readout" aria-live="off">
            <span className="tempo-unit">{unitSymbol}</span>
            <span className="tempo-equals">=</span>
            <span className="tempo-value">{settings.bpm}</span>
          </div>
          <p className="tempo-caption">
            {settings.bpm} {BEAT_UNIT_PLURALS[meter.beatUnit]} por minuto
          </p>

          <div className="beat-leds" role="img" aria-label={`Compás de ${meter.id}, ${pulseCount} pulsos`}>
            {pattern.pulseLengths.map((_length, pulseIndex) => (
              <div key={pulseIndex} className="beat-group">
                {pattern.slots
                  .filter((slot) => slot.pulseIndex === pulseIndex)
                  .map((slot, indexInPulse) => (
                    <span
                      key={slot.unit}
                      className={[
                        'beat-led',
                        indexInPulse === 0 ? 'is-pulse' : 'is-sub',
                        slot.kind === 'accent' ? 'is-accent' : '',
                        slot.kind === null ? 'is-silent' : '',
                        lit === slot.unit ? 'is-lit' : '',
                      ].join(' ')}
                    />
                  ))}
                <span className="beat-group-label">{pulseIndex + 1}</span>
              </div>
            ))}
          </div>

          <p className="meter-caption">
            <strong>{meter.id}</strong> · {meter.description} · {pulseCount} pulsos
            {meter.kind === 'irregular' ? ` (${formatGrouping(grouping)})` : ''}
          </p>
        </section>

        <div className="pedal-controls-col">
          <section className="calibration-card" aria-label="Tempo">
            <div className="calibration-header">
              <div className="calibration-title-group">
                <span className="calibration-label">TEMPO</span>
                <span className="calibration-range">
                  {MIN_BPM}–{MAX_BPM} · BPM de {BEAT_UNIT_NAMES[meter.beatUnit]} ({unitSymbol})
                </span>
              </div>
              <div className="calibration-stepper">
                <button type="button" className="step-btn" onClick={() => updateSettings({ bpm: settings.bpm - 5 })} disabled={settings.bpm <= MIN_BPM} aria-label="Bajar 5 BPM">−5</button>
                <button type="button" className="step-btn step-btn-fine" onClick={() => updateSettings({ bpm: settings.bpm - 1 })} disabled={settings.bpm <= MIN_BPM} aria-label="Bajar 1 BPM">−1</button>
                <label className="hz-input-wrap">
                  <span className="hz-prefix">{unitSymbol}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_BPM}
                    max={MAX_BPM}
                    step="1"
                    value={bpmInput}
                    onChange={(e) => setBpmInput(e.target.value)}
                    onBlur={commitBpm}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    aria-label="Tempo en BPM"
                  />
                  <span className="hz-suffix">BPM</span>
                </label>
                <button type="button" className="step-btn step-btn-fine" onClick={() => updateSettings({ bpm: settings.bpm + 1 })} disabled={settings.bpm >= MAX_BPM} aria-label="Subir 1 BPM">+1</button>
                <button type="button" className="step-btn" onClick={() => updateSettings({ bpm: settings.bpm + 5 })} disabled={settings.bpm >= MAX_BPM} aria-label="Subir 5 BPM">+5</button>
              </div>
            </div>
          </section>

          <section className="target-card" aria-label="Compás">
            <div className="target-header">
              <div className="calibration-title-group">
                <span className="calibration-label">COMPÁS</span>
                <span className="calibration-range">{meter.description}</span>
              </div>
            </div>

            <select
              className="target-select"
              value={settings.meterId}
              onChange={(e) =>
                updateSettings({ meterId: e.target.value as MeterId, groupingIndex: 0 })
              }
              aria-label="Compás"
            >
              {KIND_ORDER.map((kind) => (
                <optgroup key={kind} label={KIND_GROUP_LABELS[kind]}>
                  {METERS.filter((m) => m.kind === kind).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} — {m.description}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {meter.groupings.length > 1 && (
              <div className="preset-chips" role="group" aria-label="Agrupación de corcheas">
                {meter.groupings.map((g, index) => (
                  <button
                    key={formatGrouping(g)}
                    type="button"
                    className={`chip-btn ${index === settings.groupingIndex ? 'is-active' : ''}`}
                    onClick={() => updateSettings({ groupingIndex: index })}
                    aria-pressed={index === settings.groupingIndex}
                  >
                    {formatGrouping(g)}
                  </button>
                ))}
              </div>
            )}

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.accentFirst}
                onChange={(e) => updateSettings({ accentFirst: e.target.checked })}
              />
              <span>Acentuar el primer tiempo</span>
            </label>

            {supportsSubdivision(meter) && (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.subdivision}
                  onChange={(e) => updateSettings({ subdivision: e.target.checked })}
                />
                <span>Subdivisión (corcheas de cada pulso)</span>
              </label>
            )}
          </section>

          <footer className="pedal-footswitch-area">
            <button
              type="button"
              className={`footswitch-btn ${running ? 'is-listening' : ''}`}
              onClick={metronome.toggle}
            >
              <span className="footswitch-led" />
              {running ? 'DETENER METRÓNOMO' : 'INICIAR METRÓNOMO'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

export default MetronomeSection;
