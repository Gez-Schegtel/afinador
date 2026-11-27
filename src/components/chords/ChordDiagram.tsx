// SPDX-License-Identifier: GPL-3.0-or-later
import type { Barre } from '../../core/music/voicings';

interface ChordDiagramProps {
  /** Traste por cuerda, de la más grave a la más aguda (null = muda, 0 = al aire). */
  frets: readonly (number | null)[];
  /** Rótulo de cada cuerda que suena (grado o nota). */
  labels: readonly (string | null)[];
  /** Cuerdas cuya nota es la raíz (se resaltan). */
  rootStrings: readonly boolean[];
  barre: Barre | null;
  /** Descripción accesible (p. ej. «Cm7, x35343»). */
  ariaLabel: string;
}

const STRING_GAP = 20;
const FRET_GAP = 24;
const ROWS = 5;
const PAD_LEFT = 24;
const PAD_RIGHT = 10;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const DOT_R = 8.4;

/**
 * Diagrama de acorde en SVG estático (Spec 003): cuerdas verticales de grave (izquierda) a aguda
 * (derecha), cejuela o traste inicial, × / ○, cejilla y puntos rotulados. Los colores salen de
 * variables CSS para poder cambiar el tema sin tocar el componente.
 */
export function ChordDiagram({
  frets,
  labels,
  rootStrings,
  barre,
  ariaLabel,
}: ChordDiagramProps) {
  const n = frets.length;
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const hasOpen = frets.some((f) => f === 0);
  const maxFret = fretted.length > 0 ? Math.max(...fretted) : 0;
  const minFret = fretted.length > 0 ? Math.min(...fretted) : 1;
  const baseFret = hasOpen || maxFret <= ROWS ? 1 : minFret;

  const width = PAD_LEFT + (n - 1) * STRING_GAP + PAD_RIGHT;
  const height = PAD_TOP + ROWS * FRET_GAP + PAD_BOTTOM;
  const x = (stringIndex: number) => PAD_LEFT + stringIndex * STRING_GAP;
  const rowY = (fret: number) => PAD_TOP + (fret - baseFret + 0.5) * FRET_GAP;

  return (
    <svg
      className="chord-diagram"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>

      {/* Trastes */}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          className={i === 0 && baseFret === 1 ? 'cd-nut' : 'cd-fret'}
          x1={x(0)}
          x2={x(n - 1)}
          y1={PAD_TOP + i * FRET_GAP}
          y2={PAD_TOP + i * FRET_GAP}
        />
      ))}

      {/* Cuerdas */}
      {frets.map((_, i) => (
        <line
          key={`s${i}`}
          className="cd-string"
          x1={x(i)}
          x2={x(i)}
          y1={PAD_TOP}
          y2={PAD_TOP + ROWS * FRET_GAP}
        />
      ))}

      {baseFret > 1 && (
        <text className="cd-fret-number" x={PAD_LEFT - 14} y={rowY(baseFret) + 4}>
          {baseFret}
        </text>
      )}

      {/* × / ○ sobre la cejuela */}
      {frets.map((f, i) =>
        f === null || f === 0 ? (
          <text key={`m${i}`} className="cd-marker" x={x(i)} y={PAD_TOP - 7}>
            {f === null ? '×' : '○'}
          </text>
        ) : null
      )}

      {barre && (
        <rect
          className="cd-barre"
          x={x(barre.fromString) - DOT_R}
          y={rowY(barre.fret) - DOT_R}
          width={x(barre.toString) - x(barre.fromString) + 2 * DOT_R}
          height={2 * DOT_R}
          rx={DOT_R}
        />
      )}

      {/* Puntos */}
      {frets.map((f, i) =>
        f !== null && f > 0 ? (
          <g key={`d${i}`}>
            <circle
              className={rootStrings[i] ? 'cd-dot cd-dot-root' : 'cd-dot'}
              cx={x(i)}
              cy={rowY(f)}
              r={DOT_R}
            />
            <text className="cd-dot-label" x={x(i)} y={rowY(f) + 3.2}>
              {labels[i]}
            </text>
          </g>
        ) : null
      )}

      {/* Rótulo de cada cuerda que suena, debajo del diagrama */}
      {frets.map((f, i) =>
        f !== null ? (
          <text
            key={`b${i}`}
            className={rootStrings[i] ? 'cd-bottom-label cd-bottom-root' : 'cd-bottom-label'}
            x={x(i)}
            y={PAD_TOP + ROWS * FRET_GAP + 15}
          >
            {labels[i]}
          </text>
        ) : null
      )}
    </svg>
  );
}
