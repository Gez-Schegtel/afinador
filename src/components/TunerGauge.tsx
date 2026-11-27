import { useEffect, useRef } from 'react';
import type { ChromaticMatch } from '../core/music/notes';

export interface GaugeFrameData {
  match: ChromaticMatch | null;
  isHolding: boolean;
  rms: number;
  isListening: boolean;
}

interface TunerGaugeProps {
  frameRef: React.RefObject<GaugeFrameData>;
  displayMatch: ChromaticMatch | null;
  isListening: boolean;
  isHolding: boolean;
  a4Hz: number;
}

const MAX_DISPLAY_CENTS = 50;
const MAX_ARC_RAD = (68 * Math.PI) / 180;
const LED_COUNT = 41; // -50 a +50 en pasos de 2.5 cents

function centsToAngle(cents: number): number {
  const clamped = Math.max(
    -MAX_DISPLAY_CENTS,
    Math.min(MAX_DISPLAY_CENTS, cents)
  );
  return -Math.PI / 2 + (clamped / MAX_DISPLAY_CENTS) * MAX_ARC_RAD;
}

export function TunerGauge({
  frameRef,
  displayMatch,
  isListening,
  isHolding,
  a4Hz,
}: TunerGaugeProps) {
  const strobeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const arcCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const strobeCanvas = strobeCanvasRef.current;
    const arcCanvas = arcCanvasRef.current;
    if (!strobeCanvas || !arcCanvas) return;

    const strobeCtx = strobeCanvas.getContext('2d');
    const arcCtx = arcCanvas.getContext('2d');
    if (!strobeCtx || !arcCtx) return;

    let animationId = 0;
    let currentNeedleCents = 0;
    let strobePhase = 0;
    let needleOpacity = 0.25;
    let lastTime = performance.now();

    const resizeOne = (
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D
    ) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resizeAll = () => {
      resizeOne(strobeCanvas, strobeCtx);
      resizeOne(arcCanvas, arcCtx);
    };

    resizeAll();
    const observer = new ResizeObserver(resizeAll);
    observer.observe(strobeCanvas);
    observer.observe(arcCanvas);

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const frame = frameRef.current;
      const match = frame?.match ?? null;
      const active = match !== null;
      const lockedInTune = active && match.direction === 'in-tune';

      let accentColor = '#64748b';
      if (active) {
        if (lockedInTune) {
          accentColor = '#10b981'; // Esmeralda clavado
        } else if (match.direction === 'flat') {
          accentColor = '#f59e0b'; // Ámbar bajo
        } else {
          accentColor = '#fb7185'; // Coral alto
        }
      }

      // --- A. VISOR ESTROBOSCÓPICO FINO ---
      const sw = strobeCanvas.getBoundingClientRect().width;
      const sh = strobeCanvas.getBoundingClientRect().height;
      strobeCtx.clearRect(0, 0, sw, sh);

      if (active && !frame?.isHolding) {
        // Zona muerta ultra-fina (±0.35 ct) para que al clavar la nota el estroboscopio quede inmóvil
        const effectiveDrift =
          Math.abs(match.cents) < 0.35
            ? 0
            : Math.max(-45, Math.min(45, match.cents));
        strobePhase += effectiveDrift * 5.0 * dt;
      }

      const barPeriod = 36;
      const offset = ((strobePhase % barPeriod) + barPeriod) % barPeriod;

      strobeCtx.save();
      strobeCtx.globalAlpha = active ? (frame?.isHolding ? 0.45 : 0.9) : 0.16;
      for (let x = -barPeriod + offset; x < sw + barPeriod; x += barPeriod) {
        const grad = strobeCtx.createLinearGradient(
          x,
          0,
          x + barPeriod * 0.55,
          0
        );
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, accentColor);
        grad.addColorStop(1, 'transparent');
        strobeCtx.fillStyle = grad;
        strobeCtx.fillRect(x, 3, barPeriod * 0.55, sh - 6);
      }

      const vignette = strobeCtx.createLinearGradient(0, 0, sw, 0);
      vignette.addColorStop(0, '#070a12');
      vignette.addColorStop(0.14, 'rgba(7, 10, 18, 0)');
      vignette.addColorStop(0.86, 'rgba(7, 10, 18, 0)');
      vignette.addColorStop(1, '#070a12');
      strobeCtx.globalAlpha = 1;
      strobeCtx.fillStyle = vignette;
      strobeCtx.fillRect(0, 0, sw, sh);

      strobeCtx.strokeStyle = lockedInTune ? '#10b981' : '#475569';
      strobeCtx.lineWidth = lockedInTune ? 2.5 : 2;
      strobeCtx.beginPath();
      strobeCtx.moveTo(sw / 2, 0);
      strobeCtx.lineTo(sw / 2, sh);
      strobeCtx.stroke();
      strobeCtx.restore();

      // --- B. ARCO DE LEDs + AGUJA AMORTIGUADA TIPO PEDAL ---
      const w = arcCanvas.getBoundingClientRect().width;
      const h = arcCanvas.getBoundingClientRect().height;
      arcCtx.clearRect(0, 0, w, h);

      // Retención magnética suave en el centro cuando está dentro de la zona AFINADO,
      // igual que la aguja amortiguada de un pedal Boss TU-3 / Korg Pitchblack.
      let targetCents = 0;
      if (match) {
        targetCents =
          lockedInTune && Math.abs(match.cents) <= 1.8
            ? match.cents * 0.35
            : match.clampedCents;
      }

      const dampingRate = active ? 7.5 : 5.0;
      currentNeedleCents +=
        (targetCents - currentNeedleCents) * (1 - Math.exp(-dampingRate * dt));

      const targetOpacity = active ? (frame?.isHolding ? 0.65 : 1) : 0.22;
      needleOpacity +=
        (targetOpacity - needleOpacity) * (1 - Math.exp(-10 * dt));

      const cx = w / 2;
      const cy = h * 0.9;
      const radius = Math.min(w * 0.44, h * 0.76);

      const midLed = (LED_COUNT - 1) / 2;
      for (let i = 0; i < LED_COUNT; i++) {
        const ledCents = ((i - midLed) / midLed) * MAX_DISPLAY_CENTS;
        const angle = centsToAngle(ledCents);
        const isCenterLed = i === midLed;
        const distFromNeedle = Math.abs(currentNeedleCents - ledCents);

        let lit = false;
        let ledColor = '#1e293b';

        if (active) {
          if (isCenterLed && lockedInTune) {
            lit = true;
            ledColor = '#10b981';
          } else if (!lockedInTune && distFromNeedle <= 2.6) {
            lit = true;
            ledColor = accentColor;
          } else if (
            !lockedInTune &&
            ((ledCents < 0 && ledCents >= currentNeedleCents) ||
              (ledCents > 0 && ledCents <= currentNeedleCents))
          ) {
            ledColor =
              match.direction === 'flat'
                ? 'rgba(245, 158, 11, 0.28)'
                : 'rgba(251, 113, 133, 0.28)';
          }
        } else if (isCenterLed) {
          ledColor = '#334155';
        }

        const innerR = radius - (isCenterLed ? 16 : 10);
        const outerR = radius + (isCenterLed ? 6 : 2);
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        arcCtx.save();
        if (lit) {
          arcCtx.shadowColor = ledColor;
          arcCtx.shadowBlur = isCenterLed ? 16 : 10;
        }
        arcCtx.beginPath();
        arcCtx.moveTo(x1, y1);
        arcCtx.lineTo(x2, y2);
        arcCtx.strokeStyle = ledColor;
        arcCtx.lineWidth = isCenterLed ? 5 : 3;
        arcCtx.lineCap = 'round';
        arcCtx.stroke();
        arcCtx.restore();
      }

      arcCtx.textAlign = 'center';
      arcCtx.textBaseline = 'middle';
      arcCtx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';

      for (const c of [-50, -30, -10, 0, 10, 30, 50]) {
        const angle = centsToAngle(c);
        const labelR = radius + 19;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        arcCtx.fillStyle = c === 0 ? '#10b981' : '#64748b';
        arcCtx.fillText(c > 0 ? `+${c}` : `${c}`, lx, ly);
      }

      const needleAngle = centsToAngle(currentNeedleCents);
      const needleLen = radius - 14;
      const nx = cx + Math.cos(needleAngle) * needleLen;
      const ny = cy + Math.sin(needleAngle) * needleLen;

      arcCtx.save();
      arcCtx.globalAlpha = needleOpacity;
      if (active) {
        arcCtx.shadowColor = accentColor;
        arcCtx.shadowBlur = 12;
      }

      arcCtx.beginPath();
      arcCtx.moveTo(cx, cy);
      arcCtx.lineTo(nx, ny);
      arcCtx.strokeStyle = accentColor;
      arcCtx.lineWidth = 3.4;
      arcCtx.lineCap = 'round';
      arcCtx.stroke();
      arcCtx.restore();

      arcCtx.beginPath();
      arcCtx.arc(cx, cy, 9, 0, Math.PI * 2);
      arcCtx.fillStyle = active ? accentColor : '#334155';
      arcCtx.fill();

      arcCtx.beginPath();
      arcCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      arcCtx.fillStyle = '#070a12';
      arcCtx.fill();

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [frameRef]);

  const isInTune = displayMatch?.direction === 'in-tune';
  const isFlat = displayMatch?.direction === 'flat';
  const isSharp = displayMatch?.direction === 'sharp';

  let statusClass = 'status-idle';
  if (displayMatch) {
    statusClass = isInTune
      ? 'status-in-tune'
      : isFlat
        ? 'status-flat'
        : 'status-sharp';
  }

  const formattedCents = displayMatch
    ? `${displayMatch.cents >= 0 ? '+' : ''}${displayMatch.cents.toFixed(1)} ct`
    : '— ct';

  return (
    <section className="pedal-screen" aria-label="Visor del afinador cromático">
      <div
        className="strobe-window"
        title="Visor estroboscópico fino: queda quieto al clavar la nota"
      >
        <canvas ref={strobeCanvasRef} className="strobe-canvas" />
      </div>

      <div className="arc-window">
        <canvas ref={arcCanvasRef} className="arc-canvas" />
      </div>

      <div className={`pedal-readout ${isHolding ? 'is-holding' : ''}`}>
        <div className="pedal-note-stage">
          <span
            className={`guide-arrow arrow-left ${isFlat || isInTune ? 'is-lit' : ''} ${isInTune ? 'in-tune' : ''}`}
            aria-hidden="true"
          >
            ▶
          </span>

          <div className="pedal-note-box">
            {displayMatch ? (
              <>
                <span className={`pedal-letter ${statusClass}`}>
                  {displayMatch.note.letter}
                </span>
                <div className="pedal-accidental-col">
                  <span
                    className={`pedal-sharp ${displayMatch.note.isSharp ? 'is-lit' : ''}`}
                  >
                    ♯
                  </span>
                  <span className="pedal-octave">
                    {displayMatch.note.octave}
                  </span>
                </div>
              </>
            ) : (
              <span className="pedal-letter note-empty">—</span>
            )}
          </div>

          <span
            className={`guide-arrow arrow-right ${isSharp || isInTune ? 'is-lit' : ''} ${isInTune ? 'in-tune' : ''}`}
            aria-hidden="true"
          >
            ◀
          </span>
        </div>

        <div className="pedal-subnote">
          {displayMatch ? (
            <>
              <span className="latin-pill">{displayMatch.note.latinName}</span>
              <span className={`lock-badge ${statusClass}`}>
                {isInTune
                  ? '✓ AFINADO'
                  : isFlat
                    ? 'BAJO · SUBIR ↑'
                    : 'ALTO · BAJAR ↓'}
              </span>
            </>
          ) : (
            <span className="idle-hint">
              {isListening
                ? 'Tocá cualquier cuerda (guitarra o bajo)...'
                : 'En espera · Activá el pedal abajo'}
            </span>
          )}
        </div>

        <div className="telemetry-strip">
          <div className="telemetry-cell">
            <span className="telemetry-label">DESVIACIÓN</span>
            <span className={`telemetry-val ${statusClass}`}>
              {formattedCents}
            </span>
          </div>
          <div className="telemetry-sep" />
          <div className="telemetry-cell">
            <span className="telemetry-label">MEDIDO</span>
            <span className="telemetry-val">
              {displayMatch ? `${displayMatch.detectedHz.toFixed(1)} Hz` : '— Hz'}
            </span>
          </div>
          <div className="telemetry-sep" />
          <div className="telemetry-cell">
            <span className="telemetry-label">REF (A4={a4Hz})</span>
            <span className="telemetry-val telemetry-ref">
              {displayMatch ? `${displayMatch.targetHz.toFixed(1)} Hz` : '— Hz'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
