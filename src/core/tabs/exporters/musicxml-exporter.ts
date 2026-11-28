// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exportador puro a MusicXML 3.1 (`.musicxml`) y formato comprimido `.mxl` en PPQ = 960 (Spec 014).
 */

import { strToU8, zipSync } from 'fflate';
import { defaultSharpPitchName, spellMidi } from '../../music/spelling';
import { scoreBeatTicks, type ScoreDocument } from '../model';
import { barCapacityTicks, PPQ, ticksToNumberFloor, type BaseDuration } from '../rhythm';

function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function durationTypeName(d: BaseDuration): string {
  switch (d) {
    case 1:
      return 'whole';
    case 2:
      return 'half';
    case 4:
      return 'quarter';
    case 8:
      return 'eighth';
    case 16:
      return '16th';
    case 32:
      return '32nd';
    case 64:
      return '64th';
  }
}

export function exportMusicXmlString(doc: ScoreDocument): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<score-partwise version="3.1">');
  out.push('  <work><work-title>' + xmlEscape(doc.title || 'Sin título') + '</work-title></work>');
  if (doc.artist) {
    out.push('  <identification><creator type="composer">' + xmlEscape(doc.artist) + '</creator></identification>');
  }

  out.push('  <part-list>');
  doc.tracks.forEach((track, ti) => {
    const pid = `P${ti + 1}`;
    const ch = track.isPercussion ? 10 : Math.min(16, ti === 9 ? 11 : ti + 1);
    out.push(`    <score-part id="${pid}">`);
    out.push(`      <part-name>${xmlEscape(track.name || pid)}</part-name>`);
    out.push(`      <midi-instrument id="${pid}-I1">`);
    out.push(`        <midi-channel>${ch}</midi-channel>`);
    out.push(`        <midi-program>${Math.max(1, Math.min(128, track.midiProgram + 1))}</midi-program>`);
    out.push('      </midi-instrument>');
    out.push('    </score-part>');
  });
  out.push('  </part-list>');

  doc.tracks.forEach((track, ti) => {
    const pid = `P${ti + 1}`;
    out.push(`  <part id="${pid}">`);

    track.bars.forEach((bar, bi) => {
      const mb = doc.masterBars[bi];
      const num = mb?.timeSignature.numerator ?? 4;
      const den = mb?.timeSignature.denominator ?? 4;
      const barCap = ticksToNumberFloor(barCapacityTicks(num, den));

      out.push(`    <measure number="${bi + 1}">`);
      if (bi === 0) {
        out.push('      <attributes>');
        out.push(`        <divisions>${PPQ}</divisions>`);
        out.push(`        <key><fifths>${mb?.keySignature.fifths ?? 0}</fifths></key>`);
        out.push(`        <time><beats>${num}</beats><beat-type>${den}</beat-type></time>`);
        if (track.isPercussion) {
          out.push('        <clef><sign>percussion</sign><line>2</line></clef>');
        } else {
          out.push(
            track.family === 'bass'
              ? '        <clef><sign>F</sign><line>4</line></clef>'
              : '        <clef><sign>G</sign><line>2</line></clef>'
          );
          if (track.tuning.length > 0) {
            out.push('        <staff-details>');
            out.push(`          <staff-lines>${track.tuning.length}</staff-lines>`);
            track.tuning.forEach((spelled, sIdx) => {
              out.push(`          <staff-tuning line="${sIdx + 1}">`);
              out.push(`            <tuning-step>${spelled.letter}</tuning-step>`);
              if (spelled.accidental !== 0) {
                out.push(`            <tuning-alter>${spelled.accidental}</tuning-alter>`);
              }
              out.push(`            <tuning-octave>${spelled.octave}</tuning-octave>`);
              out.push('          </staff-tuning>');
            });
            if (track.capo > 0) {
              out.push(`          <capo>${track.capo}</capo>`);
            }
            out.push('        </staff-details>');
          }
        }
        out.push('      </attributes>');
      }

      const tempo = mb?.tempoChanges[0]?.bpm;
      if (tempo) {
        out.push(`      <sound tempo="${tempo}"/>`);
      }

      bar.voices.forEach((voice, vi) => {
        if (voice.beats.length === 0) return;
        if (vi > 0) {
          out.push(`      <backup><duration>${barCap}</duration></backup>`);
        }

        for (const beat of voice.beats) {
          const dur = Math.max(1, ticksToNumberFloor(scoreBeatTicks(beat)));
          const typeName = durationTypeName(beat.duration);
          const dotsXml = '<dot/>'.repeat(beat.dots);
          const tupletXml = beat.tuplet
            ? `<time-modification><actual-notes>${beat.tuplet.enter}</actual-notes><normal-notes>${beat.tuplet.in}</normal-notes></time-modification>`
            : '';

          if (beat.isRest || beat.notes.length === 0) {
            out.push(
              `      <note><rest/><duration>${dur}</duration><voice>${vi + 1}</voice><type>${typeName}</type>${dotsXml}${tupletXml}</note>`
            );
            continue;
          }

          beat.notes.forEach((note, ni) => {
            out.push('      <note>');
            if (ni > 0) out.push('        <chord/>');
            if (track.isPercussion) {
              out.push('        <unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>');
            } else {
              const sp = spellMidi(note.midi, defaultSharpPitchName(note.midi));
              out.push('        <pitch>');
              out.push(`          <step>${sp.letter}</step>`);
              if (sp.accidental !== 0) out.push(`          <alter>${sp.accidental}</alter>`);
              out.push(`          <octave>${sp.octave}</octave>`);
              out.push('        </pitch>');
            }
            out.push(`        <duration>${dur}</duration>`);
            out.push(`        <voice>${vi + 1}</voice>`);
            out.push(`        <type>${typeName}</type>`);
            if (dotsXml) out.push(`        ${dotsXml}`);
            if (tupletXml) out.push(`        ${tupletXml}`);
            if (!track.isPercussion && track.tuning.length > 0) {
              const xmlStr = Math.max(1, track.tuning.length - note.stringIndex);
              out.push('        <notations><technical>');
              out.push(`          <string>${xmlStr}</string>`);
              out.push(`          <fret>${note.fret}</fret>`);
              if (note.bendPoints.length > 0) {
                const maxQ = note.bendPoints.reduce(
                  (m, bp) => (Math.abs(bp.value) > Math.abs(m) ? bp.value : m),
                  0
                );
                out.push(`          <bend><bend-alter>${maxQ / 2}</bend-alter></bend>`);
              }
              out.push('        </technical></notations>');
            }
            out.push('      </note>');
          });
        }
      });

      out.push('    </measure>');
    });

    out.push('  </part>');
  });

  out.push('</score-partwise>');
  return out.join('\n');
}

export function exportMusicXmlBytes(doc: ScoreDocument): Uint8Array {
  return strToU8(exportMusicXmlString(doc));
}

export function exportMxlBytes(doc: ScoreDocument): Uint8Array {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`;
  return zipSync({
    'META-INF/container.xml': strToU8(containerXml),
    'score.musicxml': exportMusicXmlBytes(doc),
  });
}
