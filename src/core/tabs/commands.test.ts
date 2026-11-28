// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createAddTrackCommand,
  createCompleteBarRestsCommand,
  createDeleteBarCommand,
  createDeleteNoteOrBeatCommand,
  createInsertBeatCommand,
  createInsertOrAppendBarCommand,
  createRangeTransformCommand,
  createSetBeatDurationCommand,
  createSetNoteFretCommand,
  createSetNoteTechniqueCommand,
  createShiftStringCommand,
} from './commands';
import { CommandHistory } from './history';
import { createEmptyScoreDocument, validateScoreDocument } from './model';

describe('Command Bus reversible y CommandHistory (Spec 013)', () => {
  it('garantiza undo(execute(doc)) idéntico y redo exacto en mutaciones individuales y batch()', () => {
    const initial = createEmptyScoreDocument({ title: 'Estudio Test', barCount: 1, bpm: 110 });
    const history = new CommandHistory();

    const pos = { trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringIndex: 0 };

    const afterFret = history.dispatch(initial, createSetNoteFretCommand(pos, 5));
    expect(afterFret.tracks[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!.fret).toBe(5);
    expect(afterFret.tracks[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!.midi).toBe(45);

    const afterBatch = history.dispatchBatch(afterFret, 'Edición en bloque', [
      createSetNoteTechniqueCommand(pos, { palmMute: true, hammerOrPull: true }),
      createSetBeatDurationCommand(pos, { duration: 8, dots: 0 }),
      createInsertBeatCommand({ ...pos, beatIndex: 1 }, 8),
      createSetNoteFretCommand({ ...pos, beatIndex: 1, stringIndex: 1 }, 7),
      createShiftStringCommand({ ...pos, beatIndex: 1, stringIndex: 1 }, 1),
      createCompleteBarRestsCommand(0, 0, 0),
    ]);

    expect(afterBatch.tracks[0]!.bars[0]!.voices[0]!.beats.length).toBe(3);
    expect(afterBatch.tracks[0]!.bars[0]!.voices[0]!.beats[2]?.isRest).toBe(true);
    expect(validateScoreDocument(afterBatch).valid).toBe(true);

    // Undo del batch revierte todos los cambios atómicamente hasta `afterFret`
    const u1 = history.undo(afterBatch);
    expect(u1.doc).toEqual(afterFret);

    // Undo del comando inicial restaura estado inicial exacto
    const u2 = history.undo(u1.doc);
    expect(u2.doc).toEqual(initial);

    // Redo restaura ambos en secuencia exacta
    const r1 = history.redo(u2.doc);
    expect(r1.doc).toEqual(afterFret);
    const r2 = history.redo(r1.doc);
    expect(r2.doc).toEqual(afterBatch);
  });

  it('soporta inserción/borrado de compases, rangos y gestión de pistas multipista reversibles', () => {
    let doc = createEmptyScoreDocument({ barCount: 1 });
    const history = new CommandHistory();

    doc = history.dispatch(doc, createInsertOrAppendBarCommand(0));
    expect(doc.masterBars.length).toBe(2);

    doc = history.dispatch(
      doc,
      createAddTrackCommand({ name: 'Bajo Eléctrico', family: 'bass' })
    );
    expect(doc.tracks.length).toBe(2);

    doc = history.dispatch(
      doc,
      createRangeTransformCommand(
        { trackIndex: 0, voiceIndex: 0, startBar: 0, startBeat: 0, endBar: 1, endBeat: 0 },
        'Palm mute bloque',
        (beat) => ({ ...beat, palmMute: true })
      )
    );
    expect(doc.tracks[0]!.bars[1]!.voices[0]!.beats[0]!.palmMute).toBe(true);

    doc = history.dispatch(doc, createDeleteNoteOrBeatCommand({ trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringIndex: 0 }));
    doc = history.dispatch(doc, createDeleteBarCommand(1));
    expect(doc.masterBars.length).toBe(1);

    // Undo revierte deleteBar cleanly
    doc = history.undo(doc).doc;
    expect(doc.masterBars.length).toBe(2);
  });
});
