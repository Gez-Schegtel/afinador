// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Parser, extractor desde ScoreDocument y serializador puro de ChordPro (.cho) (Spec 012).
 * Soporta directivas estándar ({title}, {artist}, {key}, {capo}, {tempo}, {soc}/{eoc}, {c})
 * y alineación exacta por columna de acordes `[C]` / `[Am7]` sobre sílabas de letra.
 */

import type { ScoreDocument } from '../tabs/model';

export type ChordProSectionType = 'normal' | 'chorus' | 'verse' | 'comment';

export interface PositionedChord {
  /** Columna (0-based en caracteres de la línea de letra) donde entra el acorde. */
  readonly column: number;
  readonly symbol: string;
}

export interface ChordProLine {
  readonly sectionType: ChordProSectionType;
  readonly lyrics: string;
  readonly chords: readonly PositionedChord[];
  readonly comment?: string;
}

export interface ChordProDocument {
  readonly title: string;
  readonly artist: string;
  readonly key: string;
  readonly capo: number;
  readonly bpm: number;
  readonly lines: readonly ChordProLine[];
  readonly uniqueChords: readonly string[];
}

export function parseChordProText(raw: string): ChordProDocument {
  const linesOut: ChordProLine[] = [];
  const uniqueSet = new Set<string>();
  let title = '';
  let artist = '';
  let key = '';
  let capo = 0;
  let bpm = 100;
  let sectionType: ChordProSectionType = 'normal';

  const rawLines = raw.replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    const dirMatch = /^\{([^:}]+)(?::(.*))?\}$/.exec(trimmed);
    if (dirMatch) {
      const name = dirMatch[1]!.trim().toLowerCase();
      const val = (dirMatch[2] ?? '').trim();

      if (name === 'title' || name === 't') {
        title = val;
      } else if (name === 'artist' || name === 'subtitle' || name === 'st') {
        artist = artist ? `${artist} · ${val}` : val;
      } else if (name === 'key') {
        key = val;
      } else if (name === 'capo') {
        const parsedCapo = Number.parseInt(val, 10);
        if (Number.isFinite(parsedCapo)) {
          capo = Math.max(0, Math.min(12, parsedCapo));
        }
      } else if (name === 'tempo') {
        const parsedBpm = Number.parseInt(val, 10);
        if (Number.isFinite(parsedBpm) && parsedBpm > 0) {
          bpm = parsedBpm;
        }
      } else if (name === 'start_of_chorus' || name === 'soc') {
        sectionType = 'chorus';
        if (val) linesOut.push({ sectionType: 'comment', lyrics: '', chords: [], comment: val });
      } else if (name === 'end_of_chorus' || name === 'eoc') {
        sectionType = 'normal';
      } else if (name === 'start_of_verse' || name === 'sov') {
        sectionType = 'verse';
        if (val) linesOut.push({ sectionType: 'comment', lyrics: '', chords: [], comment: val });
      } else if (name === 'end_of_verse' || name === 'eov') {
        sectionType = 'normal';
      } else if (name === 'comment' || name === 'c') {
        linesOut.push({ sectionType: 'comment', lyrics: '', chords: [], comment: val });
      }
      continue;
    }

    // Extraer tokens `[Acorde]` conservando posición exacta en `lyrics`
    let lyrics = '';
    const chords: PositionedChord[] = [];
    let i = 0;
    while (i < rawLine.length) {
      if (rawLine[i] === '[') {
        const closeIdx = rawLine.indexOf(']', i + 1);
        if (closeIdx > i + 1) {
          const sym = rawLine.slice(i + 1, closeIdx).trim();
          if (sym) {
            chords.push({ column: lyrics.length, symbol: sym });
            uniqueSet.add(sym);
          }
          i = closeIdx + 1;
          continue;
        }
      }
      lyrics += rawLine[i];
      i++;
    }

    if (lyrics.length > 0 || chords.length > 0 || trimmed.length === 0) {
      linesOut.push({ sectionType, lyrics, chords });
    }
  }

  return {
    title,
    artist,
    key,
    capo,
    bpm,
    lines: linesOut,
    uniqueChords: [...uniqueSet],
  };
}

/** Extrae una vista ChordPro desde las etiquetas de acorde, secciones y letras de un `ScoreDocument`. */
export function extractChordProFromDocument(
  doc: ScoreDocument,
  trackIndex = 0
): ChordProDocument {
  const track = doc.tracks[trackIndex] ?? doc.tracks[0];
  const firstMb = doc.masterBars[0];
  const lines: ChordProLine[] = [];
  const uniqueSet = new Set<string>();

  if (!track) {
    return {
      title: doc.title,
      artist: doc.artist,
      key: '',
      capo: 0,
      bpm: firstMb?.tempoChanges[0]?.bpm ?? 100,
      lines: [],
      uniqueChords: [],
    };
  }

  const BARS_PER_LINE = 4;
  for (let startBar = 0; startBar < track.bars.length; startBar += BARS_PER_LINE) {
    const endBar = Math.min(track.bars.length, startBar + BARS_PER_LINE);
    let currentComment: string | undefined;
    const chords: PositionedChord[] = [];
    let lyricSegments = '';

    for (let b = startBar; b < endBar; b++) {
      const mb = doc.masterBars[b];
      if (mb?.section?.text) {
        currentComment = mb.section.text;
      }
      const bar = track.bars[b];
      const beats = bar?.voices[0]?.beats ?? [];
      for (const beat of beats) {
        if (beat.chordSymbol) {
          chords.push({ column: lyricSegments.length, symbol: beat.chordSymbol });
          uniqueSet.add(beat.chordSymbol);
        }
        const word = beat.lyrics?.trim();
        if (word) {
          lyricSegments += `${word} `;
        } else if (beat.chordSymbol) {
          lyricSegments += '      ';
        }
      }
    }

    if (currentComment) {
      lines.push({ sectionType: 'comment', lyrics: '', chords: [], comment: currentComment });
    }
    if (chords.length > 0 || lyricSegments.trim().length > 0) {
      lines.push({
        sectionType: 'normal',
        lyrics: lyricSegments.trimEnd(),
        chords,
      });
    }
  }

  return {
    title: doc.title,
    artist: doc.artist,
    key: '',
    capo: track.capo,
    bpm: firstMb?.tempoChanges[0]?.bpm ?? 100,
    lines,
    uniqueChords: [...uniqueSet],
  };
}

export function formatChordProText(doc: ChordProDocument): string {
  const out: string[] = [];
  if (doc.title) out.push(`{title: ${doc.title}}`);
  if (doc.artist) out.push(`{artist: ${doc.artist}}`);
  if (doc.key) out.push(`{key: ${doc.key}}`);
  if (doc.capo > 0) out.push(`{capo: ${doc.capo}}`);
  if (doc.bpm > 0) out.push(`{tempo: ${doc.bpm}}`);
  if (out.length > 0) out.push('');

  let inChorus = false;
  for (const line of doc.lines) {
    if (line.sectionType === 'chorus' && !inChorus) {
      out.push('{start_of_chorus}');
      inChorus = true;
    } else if (line.sectionType !== 'chorus' && inChorus) {
      out.push('{end_of_chorus}');
      inChorus = false;
    }

    if (line.sectionType === 'comment' && line.comment) {
      out.push(`{comment: ${line.comment}}`);
      continue;
    }

    if (line.chords.length === 0) {
      out.push(line.lyrics);
      continue;
    }

    // Reconstruir línea insertando `[Acorde]` en cada columna ordenada
    const sorted = [...line.chords].sort((a, b) => a.column - b.column);
    let composed = '';
    let cursor = 0;
    const baseText = line.lyrics;
    for (const c of sorted) {
      const targetCol = Math.min(Math.max(0, c.column), baseText.length);
      if (targetCol > cursor) {
        composed += baseText.slice(cursor, targetCol);
        cursor = targetCol;
      }
      composed += `[${c.symbol}]`;
    }
    if (cursor < baseText.length) {
      composed += baseText.slice(cursor);
    }
    out.push(composed);
  }
  if (inChorus) out.push('{end_of_chorus}');

  return out.join('\n');
}
