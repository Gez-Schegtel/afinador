// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Teclado virtual en tiempo real para pistas de teclado o entrada directa en Modo Edición (Spec 012).
 */

import { mod12 } from '../../core/music/spelling';

interface VirtualKeyboardProps {
  activeMidis: readonly number[];
  startMidi?: number;
  endMidi?: number;
  leftHanded?: boolean;
  onClickMidi?: (midi: number) => void;
}

const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const NOTE_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function VirtualKeyboard({
  activeMidis,
  startMidi = 36,
  endMidi = 84,
  leftHanded = false,
  onClickMidi,
}: VirtualKeyboardProps) {
  const activeSet = new Set(activeMidis);
  const whites: { midi: number; index: number }[] = [];
  const blacks: { midi: number; leftWhiteIndex: number }[] = [];

  for (let m = startMidi; m <= endMidi; m++) {
    const pc = mod12(m);
    if (IS_BLACK[pc]) {
      blacks.push({ midi: m, leftWhiteIndex: Math.max(0, whites.length - 1) });
    } else {
      whites.push({ midi: m, index: whites.length });
    }
  }

  const keyW = 24;
  const whiteH = 92;
  const blackW = 14;
  const blackH = 56;
  const width = Math.max(200, whites.length * keyW);

  const whiteX = (idx: number) => (leftHanded ? (whites.length - 1 - idx) * keyW : idx * keyW);
  const blackX = (leftIdx: number) =>
    leftHanded
      ? (whites.length - 1 - leftIdx) * keyW - blackW * 0.5
      : (leftIdx + 1) * keyW - blackW * 0.5;

  return (
    <div className="live-instrument-box">
      <strong className="tuning-changes">Teclado Virtual en Vivo (C2–C6)</strong>
      <div className="score-viewport">
        <svg
          className="virtual-keyboard-svg"
          viewBox={`0 0 ${width} ${whiteH + 4}`}
          role="img"
          aria-label="Teclado musical en vivo"
        >
          {whites.map(({ midi, index }) => {
            const active = activeSet.has(midi);
            const x = whiteX(index);
            const pc = mod12(midi);
            const oct = Math.floor(midi / 12) - 1;
            return (
              <g
                key={midi}
                style={onClickMidi ? { cursor: 'pointer' } : undefined}
                onClick={onClickMidi ? () => onClickMidi(midi) : undefined}
              >
                <rect
                  x={x}
                  y={1}
                  width={keyW - 1}
                  height={whiteH}
                  rx={3}
                  fill={active ? 'var(--led-amber)' : '#f3e3c3'}
                  stroke="var(--border-chassis)"
                  strokeWidth={1}
                />
                {(pc === 0 || active) && (
                  <text
                    x={x + (keyW - 1) * 0.5}
                    y={whiteH - 8}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="800"
                    fill="#1a0b1f"
                  >
                    {pc === 0 ? `C${oct}` : NOTE_LABELS[pc]}
                  </text>
                )}
              </g>
            );
          })}

          {blacks.map(({ midi, leftWhiteIndex }) => {
            const active = activeSet.has(midi);
            const x = blackX(leftWhiteIndex);
            return (
              <rect
                key={midi}
                x={x}
                y={1}
                width={blackW}
                height={blackH}
                rx={2}
                fill={active ? 'var(--select)' : '#1a0b1f'}
                stroke="#3d2146"
                strokeWidth={1}
                style={onClickMidi ? { cursor: 'pointer' } : undefined}
                onClick={onClickMidi ? () => onClickMidi(midi) : undefined}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
