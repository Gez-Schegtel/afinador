// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Comparador puro A/B de revisiones de `ScoreDocument` (Spec 014).
 * Detecta diferencias globales (metadatos, pistas agregadas/eliminadas, afinación/tempo/compás)
 * y señala con exactitud los compases `(trackId, barIndex)` modificados frente a idénticos.
 */

import { formatPitchName } from '../music/spelling';
import type { ScoreBar, ScoreDocument, ScoreTrack } from './model';

export interface BarDiffEntry {
  readonly trackId: string;
  readonly trackName: string;
  readonly barIndex: number;
  readonly summary: string;
}

export interface ScoreDiffSummary {
  readonly identical: boolean;
  readonly globalChanges: readonly string[];
  readonly modifiedBars: readonly BarDiffEntry[];
  readonly identicalBarCount: number;
  readonly totalComparedBars: number;
}

function summarizeBarSignature(bar: ScoreBar | undefined): string {
  if (!bar) return '<missing>';
  return bar.voices
    .map((v) =>
      v.beats
        .map((b) => {
          const notesSig = b.notes
            .map(
              (n) =>
                `${n.stringIndex}:${n.fret}:${n.midi}:${n.bendPoints.length}:${n.hammerOrPull ? 'h' : ''}:${n.palmMute ? 'pm' : ''}:${n.deadNote ? 'x' : ''}`
            )
            .sort()
            .join(',');
          return `${b.duration}.${b.dots}${b.tuplet ? `t${b.tuplet.enter}/${b.tuplet.in}` : ''}${b.isRest ? 'R' : ''}(${notesSig})`;
        })
        .join('|')
    )
    .join(' // ');
}

function tuningKey(track: ScoreTrack): string {
  return track.isPercussion
    ? 'drums'
    : track.tuning.map((n) => `${formatPitchName(n)}${n.octave}`).join(' ');
}

export function diffScoreDocuments(docA: ScoreDocument, docB: ScoreDocument): ScoreDiffSummary {
  const globalChanges: string[] = [];

  if (docA.title !== docB.title) globalChanges.push(`Título: «${docA.title}» → «${docB.title}»`);
  if (docA.artist !== docB.artist) globalChanges.push(`Artista: «${docA.artist}» → «${docB.artist}»`);

  const maxMasterBars = Math.max(docA.masterBars.length, docB.masterBars.length);
  if (docA.masterBars.length !== docB.masterBars.length) {
    globalChanges.push(
      `Cantidad de compases: ${docA.masterBars.length} → ${docB.masterBars.length}`
    );
  }
  for (let i = 0; i < maxMasterBars; i++) {
    const a = docA.masterBars[i];
    const b = docB.masterBars[i];
    if (!a || !b) continue;
    if (
      a.timeSignature.numerator !== b.timeSignature.numerator ||
      a.timeSignature.denominator !== b.timeSignature.denominator
    ) {
      globalChanges.push(
        `Compás ${i + 1}: métrica ${a.timeSignature.numerator}/${a.timeSignature.denominator} → ${b.timeSignature.numerator}/${b.timeSignature.denominator}`
      );
    }
    const bpmA = a.tempoChanges[0]?.bpm;
    const bpmB = b.tempoChanges[0]?.bpm;
    if (bpmA !== bpmB && (bpmA !== undefined || bpmB !== undefined)) {
      globalChanges.push(`Compás ${i + 1}: tempo ${bpmA ?? '—'} → ${bpmB ?? '—'} BPM`);
    }
  }

  const tracksByIdA = new Map(docA.tracks.map((t) => [t.id, t]));
  const tracksByIdB = new Map(docB.tracks.map((t) => [t.id, t]));

  for (const t of docA.tracks) {
    if (!tracksByIdB.has(t.id)) {
      globalChanges.push(`Pista eliminada: «${t.name}»`);
    }
  }
  for (const t of docB.tracks) {
    if (!tracksByIdA.has(t.id)) {
      globalChanges.push(`Pista agregada: «${t.name}»`);
    }
  }

  const modifiedBars: BarDiffEntry[] = [];
  let identicalBarCount = 0;
  let totalComparedBars = 0;

  for (const tA of docA.tracks) {
    const tB = tracksByIdB.get(tA.id);
    if (!tB) continue;

    if (tuningKey(tA) !== tuningKey(tB) || tA.capo !== tB.capo) {
      globalChanges.push(
        `Afinación/Capo en «${tA.name}»: ${tuningKey(tA)} (Capo ${tA.capo}) → ${tuningKey(tB)} (Capo ${tB.capo})`
      );
    }

    const barCount = Math.max(tA.bars.length, tB.bars.length);
    for (let bi = 0; bi < barCount; bi++) {
      totalComparedBars++;
      const sigA = summarizeBarSignature(tA.bars[bi]);
      const sigB = summarizeBarSignature(tB.bars[bi]);
      if (sigA === sigB) {
        identicalBarCount++;
      } else {
        const notesA = (tA.bars[bi]?.voices[0]?.beats ?? []).reduce(
          (acc, beat) => acc + beat.notes.length,
          0
        );
        const notesB = (tB.bars[bi]?.voices[0]?.beats ?? []).reduce(
          (acc, beat) => acc + beat.notes.length,
          0
        );
        modifiedBars.push({
          trackId: tA.id,
          trackName: tB.name,
          barIndex: bi,
          summary: !tA.bars[bi]
            ? 'Compás agregado'
            : !tB.bars[bi]
              ? 'Compás eliminado'
              : `Notas: ${notesA} → ${notesB}`,
        });
      }
    }
  }

  return {
    identical: globalChanges.length === 0 && modifiedBars.length === 0,
    globalChanges,
    modifiedBars,
    identicalBarCount,
    totalComparedBars,
  };
}
