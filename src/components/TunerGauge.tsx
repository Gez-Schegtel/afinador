import { useEffect, useRef } from 'react';
import type { ChromaticMatch, NoteDescriptor } from '../core/music/notes';

export interface GaugeFrameData {
  match: ChromaticMatch | null;
  isHolding: boolean;
  rms: number;
  isListening: boolean;
}

interface TunerGaugeProps {
  frameRef: React.RefObject<GaugeFrameData>;
  displayMatch: ChromaticMatch | null;
  lockedNote?: NoteDescriptor | null;
  isManual?: boolean;
  isListening: boolean;
  isHolding: boolean;
  a4Hz: number;
}

const MAX_ARC_RAD = (68 * Math.PI) / 180;
const LED_COUNT = 41; // -max a +max

function centsToAngle(cents: number, maxDisplayCents: number): number {
  const clamped = Math.max(-maxDisplayCents, Math.min(maxDisplayCents, cents));
  return -Math.PI / 2 + (clamped / maxDisplayCents) * MAX_ARC_RAD;
}

export function TunerGauge({
  frameRef,
  displayMatch,
  lockedNote = null,
  isManual = false,
  isListening,
  isHolding,
  a4Hz,
}: TunerGaugeProps) {
  const strobeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const arcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isManualRef = useRef(isManual);
  isManualRef.current = isManual;

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
    let isCoarseScale = false;
    let lastTime = performance.now();

    // Tamaños en píxeles CSS, actualizados solo al redimensionar (no se mide el layout por cuadro).
    const strobeSize = { w: 1, h: 1 };
    const arcSize = { w: 1, h: 1 };

    const resizeOne = (
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      size: { w: number; h: number }
    ) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size.w = rect.width;
      size.h = rect.height;
    };

    const resizeAll = () => {
      resizeOne(strobeCanvas, strobeCtx, strobeSize);
      resizeOne(arcCanvas, arcCtx, arcSize);
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
      const manual = isManualRef.current;
      const lockedInTune = active && match.direction === 'in-tune';

      // Auto-rango con histéresis en modo Manual:
      // > ±55 ct entra a escala amplia (±600 ct = ±6 st); < ±46 ct vuelve a escala fina (±50 ct)
      if (manual && active) {
        const absCents = Math.abs(match.cents);
        if (!isCoarseScale && absCents > 55) {
          isCoarseScale = true;
        } else if (isCoarseScale && absCents < 46) {
          isCoarseScale = false;
        }
      } else {
        isCoarseScale = false;
      }

      const activeScaleMax = isCoarseScale ? 600 : 50;

      let accentColor = '#64748b';
      if (active) {
        if (lockedInTune) {
          accentColor = '#10b981';
        } else if (match.direction === 'flat') {
          accentColor = '#f59e0b';
        } else {
          accentColor = '#fb7185';
        }
      }

      // --- A. VISOR ESTROBOSCÓPICO FINO ---
      const sw = strobeSize.w;
      const sh = strobeSize.h;
      strobeCtx.clearRect(0, 0, sw, sh);

      if (active && !frame?.isHolding) {
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

      // --- B. ARCO DE LEDs + AGUJA AMORTIGUADA CON AUTO-ESCALA ---
      const w = arcSize.w;
      const h = arcSize.h;
      arcCtx.clearRect(0, 0, w, h);

      let targetCents = 0;
      if (match) {
        targetCents =
          lockedInTune && Math.abs(match.cents) <= 1.8
            ? match.cents * 0.35
            : Math.max(-activeScaleMax, Math.min(activeScaleMax, match.cents));
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
      const ledTolerance = activeScaleMax * 0.052;
      for (let i = 0; i < LED_COUNT; i++) {
        const ledCents = ((i - midLed) / midLed) * activeScaleMax;
        const angle = centsToAngle(ledCents, activeScaleMax);
        const isCenterLed = i === midLed;
        const distFromNeedle = Math.abs(currentNeedleCents - ledCents);

        let lit = false;
        let ledColor = '#1e293b';

        if (active) {
          if (isCenterLed && lockedInTune) {
            lit = true;
            ledColor = '#10b981';
          } else if (!lockedInTune && distFromNeedle <= ledTolerance) {
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

      const scaleTicks = isCoarseScale
        ? [-600, -400, -200, 0, 200, 400, 600]
        : [-50, -30, -10, 0, 10, 30, 50];

      for (const c of scaleTicks) {
        const angle = centsToAngle(c, activeScaleMax);
        const labelR = radius + 21;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        arcCtx.fillStyle = c === 0 ? '#10b981' : isCoarseScale ? '#94a3b8' : '#64748b';
        const label = isCoarseScale
          ? c === 0
            ? '0'
            : `${c > 0 ? '+' : ''}${c / 100}st`
          : c > 0
            ? `+${c}`
            : `${c}`;
        arcCtx.fillText(label, lx, ly);
      }

      if (isCoarseScale) {
        arcCtx.font = '700 9.5px system-ui, -apple-system, sans-serif';
        arcCtx.fillStyle = '#38bdf8';
        arcCtx.fillText(
          'ESCALA AMPLIA (±6 SEMITONOS)',
          cx,
          cy - radius * 0.44
        );
      }

      const needleAngle = centsToAngle(currentNeedleCents, activeScaleMax);
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

  const activeOrLockedNote = displayMatch?.note ?? lockedNote;
  const targetHzText = displayMatch
    ? `${displayMatch.targetHz.toFixed(1)} Hz`
    : lockedNote
      ? `${lockedNote.frequency.toFixed(1)} Hz`
      : '— Hz';

  let badgeLabel = '';
  if (displayMatch) {
    if (isInTune) {
      badgeLabel = '✓ AFINADO';
    } else if (isManual && Math.abs(displayMatch.cents) > 55) {
      const semitonesOff = (Math.abs(displayMatch.cents) / 100).toFixed(1);
      badgeLabel = isFlat
        ? `MUY BAJO (−${semitonesOff} st) · SUBIR ↑↑`
        : `MUY ALTO (+${semitonesOff} st) · BAJAR ↓↓`;
    } else {
      badgeLabel = isFlat ? 'BAJO · SUBIR ↑' : 'ALTO · BAJAR ↓';
    }
  }

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
            {activeOrLockedNote ? (
              <>
                <span
                  className={`pedal-letter ${displayMatch ? statusClass : 'note-waiting'}`}
                >
                  {activeOrLockedNote.letter}
                </span>
                <div className="pedal-accidental-col">
                  <span
                    className={`pedal-sharp ${activeOrLockedNote.accidental !== 0 ? `is-lit ${displayMatch ? '' : 'is-waiting'}` : ''}`}
                  >
                    {activeOrLockedNote.accidental < 0 ? '♭' : '♯'}
                  </span>
                  <span className="pedal-octave">
                    {activeOrLockedNote.octave}
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
              <span className={`lock-badge ${statusClass}`}>{badgeLabel}</span>
            </>
          ) : lockedNote ? (
            <>
              <span className="latin-pill">
                OBJETIVO: {lockedNote.fullName} ({lockedNote.latinName})
              </span>
              <span className="idle-hint">
                {isListening
                  ? `Modo manual · Esperando ${lockedNote.fullName}...`
                  : 'Modo manual · Activá el pedal abajo'}
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
              {targetHzText}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
