// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Paleta de Kit de Batería estándar General MIDI con lectura clara de pieza activa (Spec 014).
 */

export interface DrumPieceSpec {
  readonly gmId: number;
  readonly short: string;
  readonly nameEs: string;
}

export const DRUM_KIT_PIECES: readonly DrumPieceSpec[] = [
  { gmId: 36, short: 'BD', nameEs: 'Bombo (Kick)' },
  { gmId: 38, short: 'SD', nameEs: 'Caja (Snare)' },
  { gmId: 37, short: 'SS', nameEs: 'Sidestick / Aro' },
  { gmId: 40, short: 'RS', nameEs: 'Rimshot Eléctrico' },
  { gmId: 42, short: 'CH', nameEs: 'Hi-Hat Cerrado' },
  { gmId: 44, short: 'PH', nameEs: 'Hi-Hat Pedal' },
  { gmId: 46, short: 'OH', nameEs: 'Hi-Hat Abierto' },
  { gmId: 45, short: 'LT', nameEs: 'Tom Grave' },
  { gmId: 47, short: 'MT', nameEs: 'Tom Medio' },
  { gmId: 50, short: 'HT', nameEs: 'Tom Agudo' },
  { gmId: 49, short: 'CR', nameEs: 'Plato Crash' },
  { gmId: 51, short: 'RD', nameEs: 'Plato Ride' },
  { gmId: 53, short: 'RB', nameEs: 'Ride Bell (Campana)' },
  { gmId: 52, short: 'CH', nameEs: 'Plato China' },
  { gmId: 55, short: 'SP', nameEs: 'Plato Splash' },
];

export function describeDrumPiece(gmId: number | undefined): string {
  if (gmId === undefined) return 'Seleccioná una pieza GM';
  const found = DRUM_KIT_PIECES.find((p) => p.gmId === gmId);
  return found ? `${found.nameEs} (GM ${found.gmId})` : `Percusión GM ${gmId}`;
}

interface DrumPaletteProps {
  activePieceId: number | undefined;
  onSelectPiece: (gmId: number) => void;
}

export function DrumPalette({ activePieceId, onSelectPiece }: DrumPaletteProps) {
  return (
    <section className="panel-card drum-palette-panel" aria-label="Paleta de Kit de Batería GM">
      <div className="tabs-toolbar">
        <strong>Kit de Batería (General MIDI)</strong>
        <span className="origin-badge">{describeDrumPiece(activePieceId)}</span>
      </div>
      <div className="preset-chips">
        {DRUM_KIT_PIECES.map((piece) => (
          <button
            key={piece.gmId}
            type="button"
            className={`chip-btn ${activePieceId === piece.gmId ? 'is-active' : ''}`}
            onClick={() => onSelectPiece(piece.gmId)}
            title={`${piece.nameEs} (MIDI ${piece.gmId})`}
          >
            {piece.short} · {piece.nameEs}
          </button>
        ))}
      </div>
    </section>
  );
}
