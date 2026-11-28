// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exportador puro a MIDI Estándar SMF Tipo 1 (`.mid`) en `PPQ = 960` con mapa de tempo,
 * cifras de compás, voces múltiples, canales de percusión y pitch-bend desde `bendPoints` (Spec 014).
 */

import { scoreBeatTicks, type ScoreDocument } from '../model';
import { barCapacityTicks, PPQ, ticksToNumberFloor } from '../rhythm';

interface MidiEvent {
  readonly tick: number;
  readonly priority: number;
  readonly bytes: readonly number[];
}

function writeUint32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function writeUint16(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

function writeVarLen(value: number): number[] {
  let v = Math.max(0, Math.trunc(value));
  const buf = [v & 0x7f];
  while ((v >>>= 7) > 0) {
    buf.push((v & 0x7f) | 0x80);
  }
  return buf.reverse();
}

function encodeTrackChunk(events: readonly MidiEvent[]): number[] {
  const sorted = [...events].sort((a, b) =>
    a.tick !== b.tick ? a.tick - b.tick : a.priority - b.priority
  );
  const data: number[] = [];
  let prevTick = 0;
  for (const ev of sorted) {
    const delta = Math.max(0, ev.tick - prevTick);
    data.push(...writeVarLen(delta), ...ev.bytes);
    prevTick = ev.tick;
  }
  // Meta End of Track
  data.push(0x00, 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...writeUint32(data.length), ...data];
}

function denominatorPower(den: number): number {
  let p = 0;
  let d = den;
  while (d > 1) {
    d >>= 1;
    p++;
  }
  return p;
}

export function exportMidiBytes(doc: ScoreDocument): Uint8Array {
  const trackChunks: number[][] = [];

  // Pista 0: Meta Eventos de Tempo y Cifra de Compás
  const metaEvents: MidiEvent[] = [];
  let barStartTick = 0;
  doc.masterBars.forEach((mb, bi) => {
    const prevMb = bi > 0 ? doc.masterBars[bi - 1] : null;
    if (
      !prevMb ||
      prevMb.timeSignature.numerator !== mb.timeSignature.numerator ||
      prevMb.timeSignature.denominator !== mb.timeSignature.denominator
    ) {
      metaEvents.push({
        tick: barStartTick,
        priority: 0,
        bytes: [
          0xff,
          0x58,
          0x04,
          mb.timeSignature.numerator & 0xff,
          denominatorPower(mb.timeSignature.denominator) & 0xff,
          24,
          8,
        ],
      });
    }
    for (const tc of mb.tempoChanges) {
      const mpq = Math.max(100000, Math.round(60_000_000 / Math.max(20, tc.bpm)));
      metaEvents.push({
        tick: barStartTick + Math.max(0, Math.round(tc.tickOffset)),
        priority: 1,
        bytes: [0xff, 0x51, 0x03, (mpq >>> 16) & 0xff, (mpq >>> 8) & 0xff, mpq & 0xff],
      });
    }
    barStartTick += ticksToNumberFloor(
      barCapacityTicks(mb.timeSignature.numerator, mb.timeSignature.denominator)
    );
  });
  trackChunks.push(encodeTrackChunk(metaEvents));

  // Pistas musicales y de percusión
  let nextPitchedCh = 0;
  doc.tracks.forEach((track) => {
    let ch = 9;
    if (!track.isPercussion) {
      if (nextPitchedCh === 9) nextPitchedCh++;
      ch = nextPitchedCh % 16;
      nextPitchedCh++;
    }

    const events: MidiEvent[] = [];
    if (!track.isPercussion) {
      events.push({
        tick: 0,
        priority: 0,
        bytes: [0xc0 | ch, Math.max(0, Math.min(127, track.midiProgram))],
      });
    }

    let cursorBar = 0;
    doc.masterBars.forEach((mb, bi) => {
      const barCap = ticksToNumberFloor(
        barCapacityTicks(mb.timeSignature.numerator, mb.timeSignature.denominator)
      );
      const bar = track.bars[bi];
      if (bar) {
        bar.voices.forEach((voice) => {
          let cursorBeat = cursorBar;
          voice.beats.forEach((beat) => {
            const dur = Math.max(1, ticksToNumberFloor(scoreBeatTicks(beat)));
            if (!beat.isRest) {
              beat.notes.forEach((note) => {
                const vel = Math.max(
                  20,
                  Math.min(127, Math.round(track.mix.volume * 95))
                );
                const pitch = Math.max(0, Math.min(127, note.midi));
                events.push({
                  tick: cursorBeat,
                  priority: 2,
                  bytes: [0x90 | ch, pitch, vel],
                });

                // Curva de Pitch Bend (+/- 2 semitonos estándar = 8192 center)
                if (note.bendPoints.length > 0 && !track.isPercussion) {
                  note.bendPoints.forEach((bp) => {
                    const semiOffset = bp.value / 2;
                    const bendVal = Math.max(
                      0,
                      Math.min(16383, Math.round(8192 + (semiOffset / 2) * 8192))
                    );
                    events.push({
                      tick: cursorBeat + Math.round((bp.offset / 100) * dur),
                      priority: 3,
                      bytes: [0xe0 | ch, bendVal & 0x7f, (bendVal >>> 7) & 0x7f],
                    });
                  });
                  events.push({
                    tick: cursorBeat + dur,
                    priority: 1,
                    bytes: [0xe0 | ch, 0x00, 0x40], // Centro 8192
                  });
                }

                events.push({
                  tick: cursorBeat + dur,
                  priority: 1,
                  bytes: [0x80 | ch, pitch, 0],
                });
              });
            }
            cursorBeat += dur;
          });
        });
      }
      cursorBar += barCap;
    });

    trackChunks.push(encodeTrackChunk(events));
  });

  const numTracks = trackChunks.length;
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0x00,
    0x00,
    0x00,
    0x06,
    ...writeUint16(1),
    ...writeUint16(numTracks),
    ...writeUint16(PPQ),
  ];

  const totalBytes = header.length + trackChunks.reduce((acc, ch) => acc + ch.length, 0);
  const out = new Uint8Array(totalBytes);
  out.set(header, 0);
  let pos = header.length;
  for (const chunk of trackChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
