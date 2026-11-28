// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Editor gráfico y accesible de curvas de Bend / Whammy Bar (Spec 014).
 * Grilla temporal `0–100%` × altura en cuartos de tono (`-4` a `+4`, ±2 semitonos)
 * con 5 presets estándar de 1 clic (`1/2`, `Full`, `Release`, `Pre-bend`, `Hold`).
 */

import { useState } from 'react';
import {
  BEND_PRESET_LABELS,
  MAX_BEND_QUARTER_TONES,
  MIN_BEND_QUARTER_TONES,
  createBendPresetCurve,
  formatBendSemitonesLabel,
  normalizeBendCurve,
  type BendPresetId,
} from '../../core/tabs/bend-curve';
import type { BendPoint } from '../../core/tabs/model';

interface BendEditorModalProps {
  title: string;
  initialPoints: readonly BendPoint[];
  onApply: (points: BendPoint[]) => void;
  onClose: () => void;
}

export function BendEditorModal({
  title,
  initialPoints,
  onApply,
  onClose,
}: BendEditorModalProps) {
  const [points, setPoints] = useState<BendPoint[]>(() =>
    initialPoints.length > 0 ? normalizeBendCurve(initialPoints) : createBendPresetCurve('full')
  );

  const w = 320;
  const h = 180;
  const padX = 28;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const toX = (offset: number) => padX + (offset / 100) * innerW;
  const toY = (val: number) =>
    padY +
    ((MAX_BEND_QUARTER_TONES - val) / (MAX_BEND_QUARTER_TONES - MIN_BEND_QUARTER_TONES)) *
      innerH;

  const updatePoint = (idx: number, patch: Partial<BendPoint>) => {
    setPoints((prev) =>
      normalizeBendCurve(prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
    );
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-card bend-modal-card">
        <div className="tabs-toolbar">
          <strong>{title}</strong>
          <button type="button" className="chip-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="preset-chips">
          {(Object.keys(BEND_PRESET_LABELS) as BendPresetId[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip-btn"
              onClick={() => setPoints(createBendPresetCurve(preset))}
            >
              {BEND_PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        <svg className="bend-graph-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Curva de bend">
          {[-4, -2, 0, 2, 4].map((q) => {
            const y = toY(q);
            return (
              <g key={q}>
                <line
                  x1={padX}
                  y1={y}
                  x2={w - padX}
                  y2={y}
                  stroke={q === 0 ? 'var(--select)' : 'var(--border-chassis)'}
                  strokeDasharray={q === 0 ? undefined : '3 3'}
                />
                <text x={padX - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">
                  {formatBendSemitonesLabel(q)}
                </text>
              </g>
            );
          })}

          {points.length >= 2 && (
            <polyline
              fill="none"
              stroke="var(--led-amber)"
              strokeWidth={2.5}
              points={points.map((p) => `${toX(p.offset)},${toY(p.value)}`).join(' ')}
            />
          )}

          {points.map((pt, idx) => (
            <circle
              key={`${idx}-${pt.offset}`}
              cx={toX(pt.offset)}
              cy={toY(pt.value)}
              r={6}
              fill="var(--select)"
              stroke="var(--bg-screen)"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <div className="bend-points-list">
          {points.map((pt, idx) => (
            <div key={idx} className="library-filter-row">
              <span className="origin-badge">Nodo {idx + 1}</span>
              <label className="tabs-theme-label">
                <span>%</span>
                <input
                  type="number"
                  className="target-select bar-num-input"
                  min={0}
                  max={100}
                  step={5}
                  value={pt.offset}
                  onChange={(e) => updatePoint(idx, { offset: Number(e.target.value) })}
                />
              </label>
              <label className="tabs-theme-label">
                <span>Altura</span>
                <select
                  className="target-select tabs-theme-select"
                  value={pt.value}
                  onChange={(e) => updatePoint(idx, { value: Number(e.target.value) })}
                >
                  {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((v) => (
                    <option key={v} value={v}>
                      {formatBendSemitonesLabel(v)} ({v}/4)
                    </option>
                  ))}
                </select>
              </label>
              {points.length > 2 && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => setPoints((p) => p.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="tabs-toolbar-actions">
          <button
            type="button"
            className="chip-btn"
            onClick={() =>
              setPoints((p) => normalizeBendCurve([...p, { offset: 50, value: 2 }]))
            }
          >
            + Agregar nodo
          </button>
          <button type="button" className="chip-btn" onClick={() => onApply([])}>
            Limpiar bend
          </button>
          <button type="button" className="chip-btn is-active" onClick={() => onApply(points)}>
            Aplicar curva
          </button>
        </div>
      </div>
    </div>
  );
}
