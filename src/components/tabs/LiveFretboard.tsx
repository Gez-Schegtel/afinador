// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Visualizador interactivo de diapasón (4–8 cuerdas, trastes 0–24) en tiempo real (Spec 012).
 * Muestra las notas que suenan sincronizadas, línea de cejilla/Capo, colores por grado modal
 * cuando existe `scaleContext`, modo para zurdos y soporte de clic directo para Modo Edición.
 */

import { useMemo, useState } from 'react';
import { chordPitchClasses, findQuality } from '../../core/music/chords';
import { SCALES_CATALOG, type ScaleDefinition } from '../../core/music/scales';
import {
  defaultSharpPitchName,
  formatPitchName,
  mod12,
  type SpelledNote,
} from '../../core/music/spelling';
import type { ScaleContext } from '../../core/tabs/model';
import { buildFretboardScaleMap } from '../../core/tabs/scale-fingering';

export interface ActiveFretNote {
  readonly stringIndex: number;
  readonly fret: number;
}

interface LiveFretboardProps {
  tuning: readonly SpelledNote[];
  capo?: number;
  maxFret?: number;
  leftHanded?: boolean;
  activeNotes: readonly ActiveFretNote[];
  scaleContext?: ScaleContext;
  onClickFret?: (stringIndex: number, fret: number) => void;
}

const STORAGE_SCALE_COLORS_KEY = 'endurend_live_scale_colors';

function loadScaleColorsPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_SCALE_COLORS_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function LiveFretboard({
  tuning,
  capo = 0,
  maxFret = 24,
  leftHanded = false,
  activeNotes,
  scaleContext,
  onClickFret,
}: LiveFretboardProps) {
  const [showScaleMap, setShowScaleMap] = useState<boolean>(loadScaleColorsPref);

  const scaleDef = useMemo<ScaleDefinition | undefined>(() => {
    if (!scaleContext) return undefined;
    const match = SCALES_CATALOG.find(
      (s) =>
        s.intervals.length === scaleContext.intervals.length &&
        s.intervals.every((iv, idx) => iv === scaleContext.intervals[idx])
    );
    if (match) return match;
    return {
      id: 'custom-scale',
      name: 'Escala de la pista',
      category: 'pentatonic-exotic',
      description: '',
      intervals: scaleContext.intervals,
      degreeLabels: scaleContext.degreeLabels,
      characteristicDegrees: scaleContext.characteristicDegrees,
      chordDegreeIndices: [0, 2, 4],
      droneQualityId: 'maj',
      isArpeggio: false,
    };
  }, [scaleContext]);

  const rootPitch = useMemo(
    () => (scaleContext ? defaultSharpPitchName(scaleContext.rootMidi) : null),
    [scaleContext]
  );

  const degreeMap = useMemo(() => {
    if (!scaleDef || !rootPitch || !showScaleMap) return null;
    const map = buildFretboardScaleMap(tuning, rootPitch, scaleDef, maxFret);
    const byKey = new Map<string, (typeof map)[number]>();
    map.forEach((n) => byKey.set(`${n.stringIndex}:${n.fret}`, n));
    return byKey;
  }, [scaleDef, rootPitch, showScaleMap, tuning, maxFret]);

  const chordPcs = useMemo(() => {
    if (!scaleDef || !rootPitch) return new Set<number>();
    const q = findQuality(scaleDef.droneQualityId);
    return q ? new Set(chordPitchClasses(rootPitch, q)) : new Set<number>();
  }, [scaleDef, rootPitch]);

  if (tuning.length === 0) return null;

  const activeSet = new Set(activeNotes.map((n) => `${n.stringIndex}:${n.fret}`));
  const nStrings = tuning.length;
  const fretW = 30;
  const strH = 22;
  const padX = 34;
  const padT = 18;
  const width = padX * 2 + (maxFret + 1) * fretW;
  const height = padT + (nStrings - 1) * strH + 34;
  const markers = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);

  const fretCenterX = (fret: number) => {
    const visualFret = leftHanded ? maxFret - fret : fret;
    return padX + visualFret * fretW + fretW * 0.5;
  };
  const fretWireX = (wireIdx: number) => {
    const visualIdx = leftHanded ? maxFret + 1 - wireIdx : wireIdx;
    return padX + visualIdx * fretW;
  };

  return (
    <div className="live-instrument-box">
      <div className="tabs-toolbar">
        <strong className="tuning-changes">
          Diapasón en vivo · {tuning.map(formatPitchName).join(' ')}
          {capo > 0 ? ` · Capo ${capo}` : ''}
          {leftHanded ? ' · Zurdo' : ''}
        </strong>
        {scaleContext && scaleDef && (
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showScaleMap}
              onChange={(e) => {
                setShowScaleMap(e.target.checked);
                try {
                  localStorage.setItem(STORAGE_SCALE_COLORS_KEY, e.target.checked ? '1' : '0');
                } catch {
                  // Ignorar
                }
              }}
            />
            <span>Mostrar mapa de escala / Colores por grado ({scaleDef.name})</span>
          </label>
        )}
      </div>

      <div className="score-viewport">
        <svg
          className="live-fretboard-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Diapasón interactivo en vivo"
        >
          {/* Trastes */}
          {Array.from({ length: maxFret + 1 }, (_, fret) => {
            const wire = fretWireX(fret + 1);
            const isCapo = capo > 0 && fret === capo;
            return (
              <g key={`f-${fret}`}>
                <line
                  x1={wire}
                  y1={padT - 5}
                  x2={wire}
                  y2={padT + (nStrings - 1) * strH + 5}
                  stroke={
                    isCapo
                      ? 'var(--led-amber)'
                      : fret === 0
                        ? 'var(--text-primary)'
                        : 'var(--border-chassis)'
                  }
                  strokeWidth={isCapo ? 4 : fret === 0 ? 3.2 : 1}
                />
                {markers.has(fret) && (
                  <text
                    x={fretCenterX(fret)}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="800"
                    fill="var(--text-muted)"
                  >
                    {fret}
                  </text>
                )}
              </g>
            );
          })}

          {/* Cuerdas */}
          {tuning.map((note, stringIndex) => {
            const row = nStrings - 1 - stringIndex;
            const y = padT + row * strH;
            return (
              <g key={`s-${stringIndex}`}>
                <text
                  x={leftHanded ? width - 16 : 16}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill="var(--text-secondary)"
                >
                  {formatPitchName(note)}
                </text>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="var(--text-muted)"
                  strokeWidth={1 + (nStrings - row) * 0.14}
                />
              </g>
            );
          })}

          {/* Puntos de escala + notas activas + celdas clicables */}
          {tuning.map((_, stringIndex) => {
            const row = nStrings - 1 - stringIndex;
            const cy = padT + row * strH;
            return Array.from({ length: maxFret + 1 }, (__, fret) => {
              const cx = fretCenterX(fret);
              const degNode = degreeMap?.get(`${stringIndex}:${fret}`);
              const isActive = activeSet.has(`${stringIndex}:${fret}`);
              if (!degNode && !isActive && !onClickFret) return null;

              let fill = 'transparent';
              let stroke = 'transparent';
              let label = '';
              let textFill = 'var(--bg-outer)';
              let r = 8;

              if (degNode) {
                const isChordTone = chordPcs.has(mod12(degNode.midi));
                fill =
                  degNode.role === 'root'
                    ? 'var(--led-amber)'
                    : degNode.role === 'characteristic'
                      ? 'var(--led-green)'
                      : isChordTone || degNode.role === 'chord'
                        ? 'var(--select)'
                        : 'var(--bg-elevated)';
                stroke = 'var(--border-chassis)';
                label = degNode.degreeLabel;
                if (degNode.role === 'scale' && !isChordTone) {
                  textFill = 'var(--text-primary)';
                }
              }

              if (isActive) {
                r = 9.5;
                fill = 'var(--led-amber)';
                stroke = '#ffffff';
                label = String(fret);
                textFill = 'var(--bg-outer)';
              }

              return (
                <g
                  key={`c-${stringIndex}-${fret}`}
                  style={onClickFret ? { cursor: 'pointer' } : undefined}
                  onClick={onClickFret ? () => onClickFret(stringIndex, fret) : undefined}
                >
                  <rect
                    x={cx - fretW * 0.5}
                    y={cy - strH * 0.5}
                    width={fretW}
                    height={strH}
                    fill="transparent"
                  />
                  {(degNode || isActive) && (
                    <>
                      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1.6} />
                      <text
                        x={cx}
                        y={cy + 3}
                        textAnchor="middle"
                        fontSize="8.5"
                        fontWeight="900"
                        fill={textFill}
                      >
                        {label}
                      </text>
                    </>
                  )}
                </g>
              );
            });
          })}
        </svg>
      </div>
    </div>
  );
}
