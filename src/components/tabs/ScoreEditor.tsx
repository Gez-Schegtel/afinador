// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Modo Edición Estilo Guitar Pro / Estudio Creativo (Spec 013).
 * Implementa Command Bus reversible, Caret inmediato (< 16 ms), buffer de trastes 400 ms,
 * semáforo rítmico PPQ = 960, completado exacto de silencios, Alt+↑/↓, copy-on-write,
 * autoguardado debounced 1.5 s, inspector multipista y entrada desde diapasón/Web MIDI.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as alphaTab from '@coderline/alphatab/core';
import { createAlphaTabSettings } from '../../audio/alphatab-runtime';
import { ReferenceToneEngine } from '../../audio/reference-tone';
import {
  DEFAULT_A4_HZ,
} from '../../core/music/notes';
import {
  extractChordProFromDocument,
  formatChordProText,
  parseChordProText,
} from '../../core/music/chordpro';
import { formatPitchName } from '../../core/music/spelling';
import { findTuning, resolveTuningSelection, type InstrumentId } from '../../core/music/tunings';
import { documentToAlphaTabScore } from '../../core/tabs/alphatab-bridge';
import type { BeatSyncMap } from '../../core/tabs/beat-sync';
import {
  createAddTrackCommand,
  createCompleteBarRestsCommand,
  createDeleteBarCommand,
  createDeleteNoteOrBeatCommand,
  createDuplicateTrackCommand,
  createInsertBeatCommand,
  createInsertOrAppendBarCommand,
  createPasteBeatsCommand,
  createRangeTransformCommand,
  createRemoveTrackCommand,
  createReorderTrackCommand,
  createReplaceDocumentCommand,
  createSetBeatDurationCommand,
  createSetNoteFretCommand,
  createSetNoteTechniqueCommand,
  createShiftStringCommand,
  createUpdateBeatPropsCommand,
  createUpdateMasterBarCommand,
  createUpdateMetadataCommand,
  createUpdateTrackConfigCommand,
  type BeatLocationRange,
  type CursorPosition,
  type ScoreCommand,
} from '../../core/tabs/commands';
import {
  INITIAL_FRET_BUFFER,
  pushFretDigit,
  resetFretBuffer,
} from '../../core/tabs/fret-input-buffer';
import { CommandHistory } from '../../core/tabs/history';
import {
  computeNoteMidi,
  createEmptyScoreDocument,
  validateScoreDocument,
  type BendPoint,
  type DynamicLevel,
  type ScoreBeat,
  type ScoreDocument,
} from '../../core/tabs/model';
import { inspectVoiceRhythm } from '../../core/tabs/rest-completion';
import { type BaseDuration, type DotCount, type TupletRatio } from '../../core/tabs/rhythm';
import { HeaderActions, HeaderSubtitle, useSpaceShortcut } from '../../shell/AppShell';
import { audioArbitrator } from '../../shell/audio-arbitrator';
import type { ScoreRevisionRecord } from '../../storage/tabs-db';
import { TuningPicker } from '../TuningPicker';
import { BeatMapperView } from './BeatMapperView';
import { BendEditorModal } from './BendEditorModal';
import { ChordProView } from './ChordProView';
import { DiffViewer } from './DiffViewer';
import { DrumPalette } from './DrumPalette';
import { ExportScorePanel } from './ExportScorePanel';
import { LiveFretboard } from './LiveFretboard';
import { RhythmTrafficLight } from './RhythmTrafficLight';
import { TrackInspector } from './TrackInspector';
import { VirtualKeyboard } from './VirtualKeyboard';

interface ScoreEditorProps {
  doc: ScoreDocument;
  activeTrackIndex: number;
  onChangeTrackIndex: (idx: number) => void;
  onReplaceDocument: (nextDoc: ScoreDocument) => void;
  onAutosaveDocument: (doc: ScoreDocument) => Promise<void>;
  onBackToPractice: () => void;
  chordProText?: string;
  onSaveChordProText?: (text: string) => Promise<void>;
  revisions?: readonly ScoreRevisionRecord[];
  onSaveRevision?: (label: string, snapshot: ScoreDocument) => Promise<void>;
  onDeleteRevision?: (revId: string) => Promise<void>;
  beatSyncMap?: BeatSyncMap | null;
  onSaveBeatSyncMap?: (map: BeatSyncMap) => Promise<void>;
  extraModals?: ReactNode;
}

const DURATION_OPTIONS: ReadonlyArray<{ dur: BaseDuration; label: string }> = [
  { dur: 1, label: '1 (Redonda)' },
  { dur: 2, label: '2 (Blanca)' },
  { dur: 4, label: '4 (Negra)' },
  { dur: 8, label: '8 (Corchea)' },
  { dur: 16, label: '16 (Semic.)' },
  { dur: 32, label: '32 (Fusa)' },
  { dur: 64, label: '64 (Semif.)' },
];

const DUR_ORDER: readonly BaseDuration[] = [1, 2, 4, 8, 16, 32, 64];

const DYNAMICS: readonly DynamicLevel[] = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

interface MIDIAccessLike {
  inputs: Map<string, { onmidimessage: ((ev: { data: Uint8Array }) => void) | null }>;
}

export function ScoreEditor({
  doc,
  activeTrackIndex,
  onChangeTrackIndex,
  onReplaceDocument,
  onAutosaveDocument,
  onBackToPractice,
  chordProText,
  onSaveChordProText,
  revisions = [],
  onSaveRevision,
  onDeleteRevision,
  beatSyncMap = null,
  onSaveBeatSyncMap,
  extraModals,
}: ScoreEditorProps) {
  const [cursor, setCursor] = useState<CursorPosition>({
    trackIndex: activeTrackIndex,
    barIndex: 0,
    voiceIndex: 0,
    beatIndex: 0,
    stringIndex: 0,
  });
  const [selectionAnchor, setSelectionAnchor] = useState<CursorPosition | null>(null);
  const [clipboard, setClipboard] = useState<ScoreBeat[]>([]);

  const [stickyDuration, setStickyDuration] = useState<BaseDuration>(8);
  const [stickyDots, setStickyDots] = useState<DotCount>(0);
  const [stickyTuplet, setStickyTuplet] = useState<TupletRatio | undefined>(undefined);
  const [maxFret] = useState(24);
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiSupported] = useState(() => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator);

  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'cow'>('saved');
  const [showNewWizard, setShowNewWizard] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showInstrumentInput, setShowInstrumentInput] = useState(false);
  const [showBendModal, setShowBendModal] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showSplitChordPro, setShowSplitChordPro] = useState(false);
  const [showBeatMapper, setShowBeatMapper] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [chordProDraft, setChordProDraft] = useState(
    () => chordProText ?? formatChordProText(extractChordProFromDocument(doc, activeTrackIndex))
  );
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setChordProDraft(
      chordProText ?? formatChordProText(extractChordProFromDocument(doc, activeTrackIndex))
    );
  }, [doc.id, chordProText, activeTrackIndex]);

  // Estado del asistente Nueva Partitura
  const [newTitle, setNewTitle] = useState('Nueva Composición');
  const [newInst, setNewInst] = useState<InstrumentId>('guitar6');
  const [newTuningId, setNewTuningId] = useState(() => resolveTuningSelection('guitar6', null).tuning.id);
  const [newBpm, setNewBpm] = useState(110);
  const [newNum, setNewNum] = useState(4);
  const [newDen, setNewDen] = useState(4);

  const historyRef = useRef(new CommandHistory());
  const fretBufferRef = useRef(INITIAL_FRET_BUFFER);
  const toneRef = useRef<ReferenceToneEngine | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preview sincronizado con alphaTab Worker (debounced 240ms tras mutaciones)
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewApiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  useEffect(() => {
    setCursor((prev) => ({
      ...prev,
      trackIndex: activeTrackIndex,
      barIndex: Math.min(prev.barIndex, Math.max(0, doc.masterBars.length - 1)),
    }));
  }, [activeTrackIndex, doc.masterBars.length]);

  // Limpiar historial solo cuando el usuario abre una partitura distinta (no copy-on-write)
  const prevOriginRef = useRef(doc.id);
  useEffect(() => {
    if (doc.id !== prevOriginRef.current && doc.origin.sourceId !== prevOriginRef.current) {
      historyRef.current.clear();
    }
    prevOriginRef.current = doc.id;
  }, [doc.id, doc.origin.sourceId]);

  useEffect(() => {
    const tone = new ReferenceToneEngine();
    toneRef.current = tone;
    return () => {
      tone.dispose();
      toneRef.current = null;
    };
  }, []);

  // Autoguardado continuo en IndexedDB (1.5 s de debounce)
  const scheduleAutosave = useCallback(
    (updatedDoc: ScoreDocument) => {
      setAutosaveStatus('saving');
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void onAutosaveDocument(updatedDoc).then(() => setAutosaveStatus('saved'));
      }, 1500);
    },
    [onAutosaveDocument]
  );

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const dispatchCommand = useCallback(
    (cmd: ScoreCommand, batchExtra?: ScoreCommand[]) => {
      let baseDoc = docRef.current;
      let cowNotice = false;
      // Copy-on-write sobre orígenes inmutables (Fábrica o Catálogo)
      if (baseDoc.origin.kind === 'factory' || baseDoc.origin.kind === 'catalog') {
        baseDoc = {
          ...baseDoc,
          id: `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          origin: {
            kind: 'studio',
            sourceId: baseDoc.id,
            sourceName: baseDoc.title,
            importedAt: new Date().toISOString(),
          },
        };
        cowNotice = true;
      }

      const nextDoc = batchExtra && batchExtra.length > 0
        ? historyRef.current.dispatchBatch(baseDoc, cmd.label, [cmd, ...batchExtra])
        : historyRef.current.dispatch(baseDoc, cmd);

      docRef.current = nextDoc;
      onReplaceDocument(nextDoc);
      scheduleAutosave(nextDoc);
      if (cowNotice) {
        setAutosaveStatus('cow');
        setStatusMsg('Copia editable creada en «Mis Tabs / Estudio» sin alterar el original.');
      }
      return nextDoc;
    },
    [onReplaceDocument, scheduleAutosave]
  );

  // Motor alphaTab de vista previa en tiempo real (debounced 220ms para que el Caret sea < 16ms)
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const settings = createAlphaTabSettings('endurend-dark');
    settings.display.scale = 0.88;
    const api = new alphaTab.AlphaTabApi(el, settings);
    previewApiRef.current = api;

    const unsubState = api.playerStateChanged.on((args) => {
      const playing = args.state === alphaTab.synth.PlayerState.Playing;
      setIsPreviewPlaying(playing);
      audioArbitrator.setActive('tabs', playing);
    });
    const unreg = audioArbitrator.register('tabs', {
      stop: () => {
        api.pause();
        audioArbitrator.setActive('tabs', false);
      },
    });
    api.renderScore(documentToAlphaTabScore(docRef.current));

    return () => {
      unreg();
      audioArbitrator.release('tabs');
      unsubState();
      api.destroy();
      previewApiRef.current = null;
      setIsPreviewPlaying(false);
    };
  }, []);

  useEffect(() => {
    const api = previewApiRef.current;
    if (!api) return;
    const timer = setTimeout(() => {
      const ab = documentToAlphaTabScore(doc);
      api.renderScore(ab);
      const t = api.score?.tracks[activeTrackIndex];
      if (t) api.renderTracks([t]);
    }, 220);
    return () => clearTimeout(timer);
  }, [doc, activeTrackIndex]);

  const activeTrack = doc.tracks[cursor.trackIndex] ?? doc.tracks[0];
  const stringCount = activeTrack?.isPercussion ? 1 : Math.max(1, activeTrack?.tuning.length ?? 6);
  const activeBar = activeTrack?.bars[cursor.barIndex];
  const activeVoice = activeBar?.voices[cursor.voiceIndex] ?? activeBar?.voices[0];
  const activeBeat = activeVoice?.beats[cursor.beatIndex];
  const activeNote = activeBeat?.notes.find((n) => n.stringIndex === cursor.stringIndex);
  const currentMasterBar = doc.masterBars[cursor.barIndex];

  const writeFretAtCursor = useCallback(
    (fret: number, customCursor?: CursorPosition) => {
      const pos = customCursor ?? cursor;
      const track = docRef.current.tracks[pos.trackIndex];
      if (!track) return;
      const cmd = createSetNoteFretCommand(pos, fret);
      dispatchCommand(cmd);
      if (soundFeedback && !track.isPercussion && track.tuning[pos.stringIndex]) {
        const midi = computeNoteMidi(track.tuning, track.capo, pos.stringIndex, fret);
        void toneRef.current?.play(midi, DEFAULT_A4_HZ, 0.55);
      }
    },
    [cursor, dispatchCommand, soundFeedback]
  );

  // Web MIDI opcional en escritorio
  useEffect(() => {
    if (!midiEnabled || !midiSupported) return;
    let disposed = false;
    const attachedInputs: { onmidimessage: null }[] = [];

    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccessLike>;
    };
    void nav.requestMIDIAccess?.()
      .then((access) => {
        if (disposed) return;
        for (const input of access.inputs.values()) {
          input.onmidimessage = (ev) => {
            if (!ev.data) return;
            const [status, noteMidi, velocity] = ev.data;
            if ((status! & 0xf0) === 0x90 && (velocity ?? 0) > 0 && noteMidi !== undefined) {
              const t = docRef.current.tracks[cursor.trackIndex];
              if (!t || t.isPercussion || t.tuning.length === 0) return;
              // Buscar mejor cuerda/traste válido dentro [0, maxFret]
              for (let si = t.tuning.length - 1; si >= 0; si--) {
                const candidate = noteMidi - computeNoteMidi(t.tuning, t.capo, si, 0);
                if (candidate >= 0 && candidate <= maxFret) {
                  writeFretAtCursor(candidate, { ...cursor, stringIndex: si });
                  break;
                }
              }
            }
          };
          attachedInputs.push(input as unknown as { onmidimessage: null });
        }
      })
      .catch(() => setMidiEnabled(false));

    return () => {
      disposed = true;
      attachedInputs.forEach((inp) => {
        inp.onmidimessage = null;
      });
    };
  }, [midiEnabled, midiSupported, cursor, maxFret, writeFretAtCursor]);

  const selectionRange = useMemo<BeatLocationRange | null>(() => {
    if (!selectionAnchor) return null;
    const aFirst =
      selectionAnchor.barIndex < cursor.barIndex ||
      (selectionAnchor.barIndex === cursor.barIndex && selectionAnchor.beatIndex <= cursor.beatIndex);
    const start = aFirst ? selectionAnchor : cursor;
    const end = aFirst ? cursor : selectionAnchor;
    return {
      trackIndex: cursor.trackIndex,
      voiceIndex: cursor.voiceIndex,
      startBar: start.barIndex,
      startBeat: start.beatIndex,
      endBar: end.barIndex,
      endBeat: end.beatIndex,
    };
  }, [selectionAnchor, cursor]);

  const copySelectedRange = useCallback((): ScoreBeat[] => {
    const t = docRef.current.tracks[cursor.trackIndex];
    if (!t) return [];
    const range = selectionRange ?? {
      trackIndex: cursor.trackIndex,
      voiceIndex: cursor.voiceIndex,
      startBar: cursor.barIndex,
      startBeat: cursor.beatIndex,
      endBar: cursor.barIndex,
      endBeat: cursor.beatIndex,
    };
    const collected: ScoreBeat[] = [];
    for (let b = range.startBar; b <= range.endBar; b++) {
      const beats = t.bars[b]?.voices[range.voiceIndex]?.beats ?? [];
      const from = b === range.startBar ? range.startBeat : 0;
      const to = b === range.endBar ? range.endBeat : beats.length - 1;
      for (let i = from; i <= to; i++) {
        if (beats[i]) collected.push(structuredClone(beats[i]!));
      }
    }
    setClipboard(collected);
    return collected;
  }, [cursor, selectionRange]);

  const togglePlayPreview = useCallback(() => {
    const api = previewApiRef.current;
    if (!api) return;
    if (isPreviewPlaying) {
      api.pause();
      return;
    }
    void audioArbitrator.acquire('tabs').then(() => api.play());
  }, [isPreviewPlaying]);

  useSpaceShortcut(togglePlayPreview);

  const moveCaret = useCallback(
    (dBar: number, dBeat: number, dString: number, keepSelection = false) => {
      fretBufferRef.current = resetFretBuffer();
      const d = docRef.current;
      const tr = d.tracks[cursor.trackIndex];
      if (!tr) return;

      if (keepSelection && !selectionAnchor) {
        setSelectionAnchor(cursor);
      } else if (!keepSelection && selectionAnchor) {
        setSelectionAnchor(null);
      }

      let nextBar = cursor.barIndex + dBar;
      let nextBeat = cursor.beatIndex + dBeat;
      const maxStr = tr.isPercussion ? 0 : Math.max(0, tr.tuning.length - 1);
      const nextStr = Math.max(0, Math.min(maxStr, cursor.stringIndex + dString));

      // `→` al final del último compás completo crea automáticamente un compás vacío
      if (dBeat > 0) {
        const curBeats = tr.bars[cursor.barIndex]?.voices[cursor.voiceIndex]?.beats ?? [];
        if (nextBeat >= curBeats.length) {
          if (cursor.barIndex >= tr.bars.length - 1) {
            const mb = d.masterBars[cursor.barIndex];
            const rep = mb ? inspectVoiceRhythm(curBeats, mb.timeSignature) : null;
            if (rep?.status === 'complete') {
              dispatchCommand(createInsertOrAppendBarCommand(cursor.barIndex));
              setCursor({
                ...cursor,
                barIndex: cursor.barIndex + 1,
                beatIndex: 0,
                stringIndex: nextStr,
              });
              return;
            }
          }
          nextBar = Math.min(tr.bars.length - 1, cursor.barIndex + 1);
          nextBeat = 0;
        }
      } else if (nextBeat < 0) {
        if (cursor.barIndex > 0) {
          nextBar = cursor.barIndex - 1;
          const prevBeats = tr.bars[nextBar]?.voices[cursor.voiceIndex]?.beats ?? [];
          nextBeat = Math.max(0, prevBeats.length - 1);
        } else {
          nextBeat = 0;
        }
      }

      nextBar = Math.max(0, Math.min(tr.bars.length - 1, nextBar));
      const targetLen = tr.bars[nextBar]?.voices[cursor.voiceIndex]?.beats.length ?? 1;
      nextBeat = Math.max(0, Math.min(targetLen - 1, nextBeat));

      setCursor({
        ...cursor,
        barIndex: nextBar,
        beatIndex: nextBeat,
        stringIndex: nextStr,
      });
    },
    [cursor, dispatchCommand, selectionAnchor]
  );

  // Mapa completo de teclado de Edición (suspendido en campos de texto)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        const { doc: undoneDoc } = historyRef.current.undo(docRef.current);
        docRef.current = undoneDoc;
        onReplaceDocument(undoneDoc);
        scheduleAutosave(undoneDoc);
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
        e.preventDefault();
        const { doc: redoneDoc } = historyRef.current.redo(docRef.current);
        docRef.current = redoneDoc;
        onReplaceDocument(redoneDoc);
        scheduleAutosave(redoneDoc);
        return;
      }
      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelectedRange();
        setStatusMsg('Pulsos copiados al portapapeles.');
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (clipboard.length > 0) dispatchCommand(createPasteBeatsCommand(cursor, clipboard));
        return;
      }
      if (mod && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        copySelectedRange();
        const range = selectionRange ?? {
          trackIndex: cursor.trackIndex,
          voiceIndex: cursor.voiceIndex,
          startBar: cursor.barIndex,
          startBeat: cursor.beatIndex,
          endBar: cursor.barIndex,
          endBeat: cursor.beatIndex,
        };
        dispatchCommand(createRangeTransformCommand(range, 'Cortar pulsos', () => null));
        return;
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const copied = copySelectedRange();
        if (copied.length > 0) dispatchCommand(createPasteBeatsCommand(cursor, copied));
        return;
      }
      if (mod && (e.key === '1' || e.key === '2')) {
        e.preventDefault();
        setCursor((c) => ({ ...c, voiceIndex: e.key === '1' ? 0 : 1, beatIndex: 0 }));
        return;
      }

      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        dispatchCommand(createShiftStringCommand(cursor, 1, maxFret));
        return;
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        dispatchCommand(createShiftStringCommand(cursor, -1, maxFret));
        return;
      }

      if (mod || e.altKey) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveCaret(0, -1, 0, e.shiftKey);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveCaret(0, 1, 0, e.shiftKey);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveCaret(0, 0, 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveCaret(0, 0, -1);
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const digit = Number(e.key);
        const step = pushFretDigit(fretBufferRef.current, digit, performance.now(), maxFret);
        fretBufferRef.current = step.nextState;
        if (!step.rejected && step.fret !== null) {
          writeFretAtCursor(step.fret);
        }
      } else if (e.key === 'Insert') {
        e.preventDefault();
        dispatchCommand(createInsertBeatCommand(cursor, stickyDuration, stickyDots, stickyTuplet));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        dispatchCommand(createDeleteNoteOrBeatCommand(cursor));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const idx = DUR_ORDER.indexOf(stickyDuration);
        const nextDur = DUR_ORDER[Math.max(0, idx - 1)]!;
        setStickyDuration(nextDur);
        dispatchCommand(createSetBeatDurationCommand(cursor, { duration: nextDur }));
      } else if (e.key === '-') {
        e.preventDefault();
        const idx = DUR_ORDER.indexOf(stickyDuration);
        const nextDur = DUR_ORDER[Math.min(DUR_ORDER.length - 1, idx + 1)]!;
        setStickyDuration(nextDur);
        dispatchCommand(createSetBeatDurationCommand(cursor, { duration: nextDur }));
      } else if (e.key === '.') {
        const nextDots: DotCount = stickyDots === 0 ? 1 : stickyDots === 1 ? 2 : 0;
        setStickyDots(nextDots);
        dispatchCommand(createSetBeatDurationCommand(cursor, { dots: nextDots }));
      } else if (e.key === 'r' || e.key === 'R') {
        dispatchCommand(createSetBeatDurationCommand(cursor, { isRest: !(activeBeat?.isRest ?? false) }));
      } else if (e.key === 'l' || e.key === 'L') {
        if (activeNote) {
          dispatchCommand(createSetNoteTechniqueCommand(cursor, { tieDestination: !activeNote.tieDestination }));
        }
      } else if (['3', '5', '6', '7'].includes(e.key) && e.shiftKey) {
        const n = Number(e.key);
        const tup: TupletRatio = { enter: n, in: n === 3 ? 2 : 4 };
        setStickyTuplet(tup);
        dispatchCommand(createSetBeatDurationCommand(cursor, { tuplet: tup }));
      } else if (e.key === 'h' || e.key === 'H') {
        if (activeNote) {
          dispatchCommand(createSetNoteTechniqueCommand(cursor, { hammerOrPull: !activeNote.hammerOrPull }));
        }
      } else if (e.key === 's' || e.key === 'S') {
        if (activeNote) {
          dispatchCommand(
            createSetNoteTechniqueCommand(cursor, {
              slideOut: activeNote.slideOut ? undefined : 'legato',
            })
          );
        }
      } else if (e.key === 'v' || e.key === 'V') {
        if (activeNote) {
          dispatchCommand(
            createSetNoteTechniqueCommand(cursor, {
              vibrato: activeNote.vibrato === 'none' ? 'slight' : 'none',
            })
          );
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (activeNote) {
          dispatchCommand(createSetNoteTechniqueCommand(cursor, { palmMute: !activeNote.palmMute }));
        }
      } else if (e.key === 'x' || e.key === 'X') {
        if (activeNote) {
          dispatchCommand(createSetNoteTechniqueCommand(cursor, { deadNote: !activeNote.deadNote }));
        }
      } else if (e.key === 'g' || e.key === 'G') {
        if (activeNote) {
          dispatchCommand(createSetNoteTechniqueCommand(cursor, { ghostNote: !activeNote.ghostNote }));
        }
      } else if (e.key === 'n' || e.key === 'N') {
        if (activeNote) {
          dispatchCommand(
            createSetNoteTechniqueCommand(cursor, {
              harmonic: activeNote.harmonic ? undefined : 'natural',
            })
          );
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeBeat?.isRest,
    activeNote,
    clipboard,
    copySelectedRange,
    cursor,
    dispatchCommand,
    maxFret,
    moveCaret,
    onReplaceDocument,
    scheduleAutosave,
    selectionRange,
    stickyDots,
    stickyDuration,
    stickyTuplet,
    writeFretAtCursor,
  ]);

  const handleCreateNewDoc = () => {
    const tDef = findTuning(newTuningId);
    const created = createEmptyScoreDocument({
      id: `studio-${Date.now().toString(36)}`,
      title: newTitle.trim() || 'Nueva Composición',
      bpm: newBpm,
      timeSignature: { numerator: newNum, denominator: newDen },
      barCount: 4,
      family: newInst.startsWith('bass') ? 'bass' : 'guitar',
      trackName: newInst.startsWith('bass') ? 'Bajo' : 'Guitarra',
      tuning: tDef?.notes,
      origin: { kind: 'studio', importedAt: new Date().toISOString() },
    });
    historyRef.current.clear();
    onReplaceDocument(created);
    scheduleAutosave(created);
    setShowNewWizard(false);
    setCursor({ trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringIndex: 0 });
  };

  const docValidation = useMemo(() => validateScoreDocument(doc), [doc]);

  return (
    <>
      <HeaderSubtitle>
        Estudio · {doc.title} · {docValidation.valid ? 'Métrica exacta' : `${docValidation.issues.length} avisos`}
      </HeaderSubtitle>
      <HeaderActions>
        <span className="desktop-shortcut-hint">
          0–9: Traste · +/−: Duración · Alt+↑/↓: Cuerda · Ctrl+Z/Y: Deshacer/Rehacer
        </span>
      </HeaderActions>

      <div className="editor-shell">
        {/* BARRA SUPERIOR DE DOCUMENTO */}
        <header className="panel-card practice-topbar">
          <div className="practice-topbar-left">
            <button type="button" className="chip-btn is-active" onClick={onBackToPractice}>
              ← Volver a Práctica
            </button>

            <input
              type="text"
              className="target-select"
              value={doc.title}
              aria-label="Título de partitura"
              onChange={(e) => dispatchCommand(createUpdateMetadataCommand({ title: e.target.value }))}
            />

            <span className="origin-badge">
              {autosaveStatus === 'saving'
                ? 'Guardando…'
                : autosaveStatus === 'cow'
                  ? 'Copia Estudio ✓'
                  : 'Guardado ✓'}
            </span>
          </div>

          <div className="practice-topbar-right">
            <button
              type="button"
              className="chip-btn"
              disabled={!historyRef.current.canUndo()}
              onClick={() => {
                const res = historyRef.current.undo(doc);
                onReplaceDocument(res.doc);
                scheduleAutosave(res.doc);
              }}
              title="Deshacer (Ctrl+Z)"
            >
              ↶ Deshacer
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={!historyRef.current.canRedo()}
              onClick={() => {
                const res = historyRef.current.redo(doc);
                onReplaceDocument(res.doc);
                scheduleAutosave(res.doc);
              }}
              title="Rehacer (Ctrl+Y)"
            >
              ↷ Rehacer
            </button>

            <button
              type="button"
              className={`chip-btn ${isPreviewPlaying ? 'is-active' : ''}`}
              onClick={togglePlayPreview}
            >
              {isPreviewPlaying ? '⏸ Pausar' : '▶ Probar audio'}
            </button>

            <button
              type="button"
              className={`chip-btn ${soundFeedback ? 'is-active' : ''}`}
              onClick={() => setSoundFeedback((s) => !s)}
            >
              🔊 Feedback
            </button>

            {midiSupported && (
              <button
                type="button"
                className={`chip-btn ${midiEnabled ? 'is-active' : ''}`}
                onClick={() => setMidiEnabled((m) => !m)}
              >
                MIDI {midiEnabled ? 'ON' : 'OFF'}
              </button>
            )}

            <button
              type="button"
              className="chip-btn"
              onClick={() => setShowNewWizard((s) => !s)}
            >
              + Nueva partitura
            </button>

            <button
              type="button"
              className={`chip-btn ${showBeatMapper ? 'is-active' : ''}`}
              onClick={() => setShowBeatMapper((s) => !s)}
            >
              Beat-Mapper
            </button>

            <button
              type="button"
              className={`chip-btn ${showDiffViewer ? 'is-active' : ''}`}
              onClick={() => setShowDiffViewer((s) => !s)}
            >
              Revisiones ({revisions.length})
            </button>

            <button
              type="button"
              className={`chip-btn ${showExportPanel ? 'is-active' : ''}`}
              onClick={() => setShowExportPanel((s) => !s)}
            >
              Exportar
            </button>
          </div>
        </header>

        {showExportPanel && (
          <ExportScorePanel
            doc={doc}
            activeTrackIndex={activeTrackIndex}
            onClose={() => setShowExportPanel(false)}
          />
        )}

        {statusMsg && <p className="info-banner tabs-subroute-note">{statusMsg}</p>}

        {showNewWizard && (
          <section className="panel-card editor-wizard">
            <strong>Crear nueva partitura en Estudio</strong>
            <div className="practice-drawer-grid">
              <label className="gym-field">
                <span>Título</span>
                <input
                  type="text"
                  className="target-select"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </label>
              <label className="gym-field">
                <span>Tempo (BPM)</span>
                <input
                  type="number"
                  className="target-select"
                  min={30}
                  max={300}
                  value={newBpm}
                  onChange={(e) => setNewBpm(Number(e.target.value))}
                />
              </label>
              <TuningPicker
                instrumentId={newInst}
                tuningId={newTuningId}
                onChange={(inst, tid) => {
                  setNewInst(inst);
                  setNewTuningId(tid);
                }}
              />
              <label className="gym-field">
                <span>Compás inicial</span>
                <div className="gym-row-2">
                  <input
                    type="number"
                    className="target-select"
                    min={1}
                    max={12}
                    value={newNum}
                    onChange={(e) => setNewNum(Number(e.target.value))}
                  />
                  <select
                    className="target-select"
                    value={newDen}
                    onChange={(e) => setNewDen(Number(e.target.value))}
                  >
                    <option value={4}>4</option>
                    <option value={8}>8</option>
                  </select>
                </div>
              </label>
            </div>
            <div className="tabs-toolbar-actions">
              <button type="button" className="chip-btn is-active" onClick={handleCreateNewDoc}>
                Crear y abrir
              </button>
              <button type="button" className="chip-btn" onClick={() => setShowNewWizard(false)}>
                Cancelar
              </button>
            </div>
          </section>
        )}

        {/* ÁREA PRINCIPAL DE 2 COLUMNAS EN PC: PALETA IZQUIERDA + CARET/LIENZO */}
        <div className="editor-workspace">
          <aside className="panel-card editor-palette" aria-label="Paleta contextual de edición">
            <strong>Duración activa</strong>
            <div className="preset-chips">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.dur}
                  type="button"
                  className={`chip-btn ${stickyDuration === opt.dur ? 'is-active' : ''}`}
                  onClick={() => {
                    setStickyDuration(opt.dur);
                    dispatchCommand(createSetBeatDurationCommand(cursor, { duration: opt.dur }));
                  }}
                >
                  1/{opt.dur}
                </button>
              ))}
              <button
                type="button"
                className={`chip-btn ${stickyDots > 0 ? 'is-active' : ''}`}
                onClick={() => {
                  const d: DotCount = stickyDots === 0 ? 1 : stickyDots === 1 ? 2 : 0;
                  setStickyDots(d);
                  dispatchCommand(createSetBeatDurationCommand(cursor, { dots: d }));
                }}
              >
                Puntillo ({stickyDots})
              </button>
              <button
                type="button"
                className={`chip-btn ${activeBeat?.isRest ? 'is-active' : ''}`}
                onClick={() =>
                  dispatchCommand(
                    createSetBeatDurationCommand(cursor, { isRest: !(activeBeat?.isRest ?? false) })
                  )
                }
              >
                Silencio (R)
              </button>
              <button
                type="button"
                className={`chip-btn ${stickyTuplet ? 'is-active' : ''}`}
                onClick={() => {
                  const next = stickyTuplet ? undefined : { enter: 3, in: 2 };
                  setStickyTuplet(next);
                  dispatchCommand(createSetBeatDurationCommand(cursor, { tuplet: next ?? null }));
                }}
              >
                Tresillo (3)
              </button>
            </div>

            <strong>Pulsos y Compases</strong>
            <div className="preset-chips">
              <button
                type="button"
                className="chip-btn"
                onClick={() =>
                  dispatchCommand(
                    createInsertBeatCommand(cursor, stickyDuration, stickyDots, stickyTuplet)
                  )
                }
              >
                + Pulso (Ins)
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => dispatchCommand(createDeleteNoteOrBeatCommand(cursor, true))}
              >
                Borrar pulso
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => dispatchCommand(createInsertOrAppendBarCommand(cursor.barIndex))}
              >
                + Compás
              </button>
              <button
                type="button"
                className="chip-btn"
                disabled={doc.masterBars.length <= 1}
                onClick={() => {
                  dispatchCommand(createDeleteBarCommand(cursor.barIndex));
                  setCursor((c) => ({ ...c, barIndex: Math.max(0, c.barIndex - 1), beatIndex: 0 }));
                }}
              >
                - Compás
              </button>
            </div>

            <strong>Técnicas de Nota</strong>
            <div className="preset-chips">
              <button
                type="button"
                className={`chip-btn ${activeNote?.hammerOrPull ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, {
                      hammerOrPull: !activeNote.hammerOrPull,
                    })
                  )
                }
              >
                H/P
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.slideOut ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, {
                      slideOut: activeNote.slideOut ? undefined : 'legato',
                    })
                  )
                }
              >
                Slide
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.vibrato && activeNote.vibrato !== 'none' ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, {
                      vibrato: activeNote.vibrato === 'none' ? 'slight' : 'none',
                    })
                  )
                }
              >
                Vibrato
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.palmMute ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, { palmMute: !activeNote.palmMute })
                  )
                }
              >
                PM
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.letRing ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, { letRing: !activeNote.letRing })
                  )
                }
              >
                Let Ring
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.deadNote ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, { deadNote: !activeNote.deadNote })
                  )
                }
              >
                Dead (X)
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.ghostNote ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, { ghostNote: !activeNote.ghostNote })
                  )
                }
              >
                Ghost
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.harmonic ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, {
                      harmonic: activeNote.harmonic ? undefined : 'natural',
                    })
                  )
                }
              >
                Armónico
              </button>
              <button
                type="button"
                className={`chip-btn ${activeNote?.tieDestination ? 'is-active' : ''}`}
                disabled={!activeNote}
                onClick={() =>
                  activeNote &&
                  dispatchCommand(
                    createSetNoteTechniqueCommand(cursor, {
                      tieDestination: !activeNote.tieDestination,
                    })
                  )
                }
              >
                Ligadura (L)
              </button>
              <button
                type="button"
                className="chip-btn"
                disabled={!activeNote}
                onClick={() => dispatchCommand(createShiftStringCommand(cursor, 1, maxFret))}
              >
                Alt+↑ Cuerda
              </button>
              <button
                type="button"
                className="chip-btn"
                disabled={!activeNote}
                onClick={() => dispatchCommand(createShiftStringCommand(cursor, -1, maxFret))}
              >
                Alt+↓ Cuerda
              </button>
            </div>

            <strong>Estructura, Acordes y Dinámica</strong>
            <div className="gym-row-2">
              <label className="gym-field">
                <span>BPM compás</span>
                <input
                  type="number"
                  className="target-select"
                  value={currentMasterBar?.tempoChanges[0]?.bpm ?? 100}
                  onChange={(e) =>
                    dispatchCommand(
                      createUpdateMasterBarCommand(cursor.barIndex, { bpm: Number(e.target.value) })
                    )
                  }
                />
              </label>
              <label className="gym-field">
                <span>Dinámica</span>
                <select
                  className="target-select"
                  value={activeBeat?.dynamic ?? 'mf'}
                  onChange={(e) =>
                    dispatchCommand(
                      createUpdateBeatPropsCommand(cursor, {
                        dynamic: e.target.value as DynamicLevel,
                      })
                    )
                  }
                >
                  {DYNAMICS.map((dyn) => (
                    <option key={dyn} value={dyn}>
                      {dyn}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="gym-row-2">
              <label className="gym-field">
                <span>Acorde pulso</span>
                <input
                  type="text"
                  className="target-select"
                  placeholder="Ej. Am7"
                  value={activeBeat?.chordSymbol ?? ''}
                  onChange={(e) =>
                    dispatchCommand(
                      createUpdateBeatPropsCommand(cursor, { chordSymbol: e.target.value })
                    )
                  }
                />
              </label>
              <label className="gym-field">
                <span>Sección</span>
                <input
                  type="text"
                  className="target-select"
                  placeholder="Intro / Riff"
                  value={currentMasterBar?.section?.text ?? ''}
                  onChange={(e) =>
                    dispatchCommand(
                      createUpdateMasterBarCommand(cursor.barIndex, {
                        sectionText: e.target.value || null,
                      })
                    )
                  }
                />
              </label>
            </div>

            <label className="gym-field">
              <span>Letra bajo pulso</span>
              <input
                type="text"
                className="target-select"
                placeholder="Sílaba…"
                value={activeBeat?.lyrics ?? ''}
                onChange={(e) =>
                  dispatchCommand(createUpdateBeatPropsCommand(cursor, { lyrics: e.target.value }))
                }
              />
            </label>

            <div className="tabs-toolbar-actions">
              <button
                type="button"
                className={`chip-btn ${cursor.voiceIndex === 0 ? 'is-active' : ''}`}
                onClick={() => setCursor((c) => ({ ...c, voiceIndex: 0, beatIndex: 0 }))}
                title="Voz 1 (Ctrl+1)"
              >
                Voz 1
              </button>
              <button
                type="button"
                className={`chip-btn ${cursor.voiceIndex === 1 ? 'is-active' : ''}`}
                onClick={() => setCursor((c) => ({ ...c, voiceIndex: 1, beatIndex: 0 }))}
                title="Voz 2 / Polifonía (Ctrl+2)"
              >
                Voz 2
              </button>
              <button
                type="button"
                className={`chip-btn ${(activeNote?.bendPoints.length ?? 0) > 0 ? 'is-active' : ''}`}
                disabled={!activeNote && !activeBeat}
                onClick={() => setShowBendModal(true)}
              >
                Curva Bend / Whammy
              </button>
              <button
                type="button"
                className={`chip-btn ${showInspector ? 'is-active' : ''}`}
                onClick={() => setShowInspector((s) => !s)}
              >
                Pistas ({doc.tracks.length})
              </button>
              <button
                type="button"
                className={`chip-btn ${showInstrumentInput ? 'is-active' : ''}`}
                onClick={() => setShowInstrumentInput((s) => !s)}
              >
                Diapasón / Teclado
              </button>
              <button
                type="button"
                className={`chip-btn ${showSplitChordPro ? 'is-active' : ''}`}
                onClick={() => setShowSplitChordPro((s) => !s)}
              >
                Editor ChordPro
              </button>
            </div>
          </aside>

          {/* LIENZO INTERACTIVO CON CARET < 16 MS Y SEMÁFOROS RÍTMICOS */}
          <main className="editor-main-col">
            {activeBar && currentMasterBar && (
              <RhythmTrafficLight
                barIndex={cursor.barIndex}
                bar={activeBar}
                voiceIndex={cursor.voiceIndex}
                timeSignature={currentMasterBar.timeSignature}
                onCompleteWithRests={() =>
                  dispatchCommand(
                    createCompleteBarRestsCommand(
                      cursor.trackIndex,
                      cursor.barIndex,
                      cursor.voiceIndex
                    )
                  )
                }
              />
            )}

            {/* Grilla inmediata de tablatura con Caret (<16ms sin esperar Web Worker) */}
            <section className="panel-card editor-grid-panel" aria-label="Editor rápido de compases">
              <div className="editor-bars-strip">
                {activeTrack?.bars.map((bar, bi) => {
                  const mb = doc.masterBars[bi];
                  const voice = bar.voices[cursor.voiceIndex] ?? bar.voices[0];
                  const status = mb
                    ? inspectVoiceRhythm(voice?.beats ?? [], mb.timeSignature).status
                    : 'complete';
                  return (
                    <div
                      key={bar.id}
                      className={`editor-bar-box status-${status} ${bi === cursor.barIndex ? 'is-current-bar' : ''}`}
                    >
                      <div className="editor-bar-header">
                        <span>#{bi + 1}</span>
                        <span>
                          {mb ? `${mb.timeSignature.numerator}/${mb.timeSignature.denominator}` : '4/4'}
                        </span>
                      </div>

                      <div className="editor-beats-row">
                        {(voice?.beats ?? []).map((beat, bei) => (
                          <div key={beat.id} className="editor-beat-col">
                            <span className="editor-beat-dur">
                              {beat.isRest ? `R/${beat.duration}` : `1/${beat.duration}`}
                            </span>
                            {Array.from({ length: stringCount }, (_, visualIdx) => {
                              const sIdx = activeTrack.isPercussion ? 0 : stringCount - 1 - visualIdx;
                              const note = beat.notes.find((n) => n.stringIndex === sIdx);
                              const isCaret =
                                bi === cursor.barIndex &&
                                bei === cursor.beatIndex &&
                                sIdx === cursor.stringIndex;
                              return (
                                <button
                                  key={sIdx}
                                  type="button"
                                  className={`editor-cell-btn ${isCaret ? 'is-caret' : ''}`}
                                  onClick={() =>
                                    setCursor({
                                      ...cursor,
                                      barIndex: bi,
                                      beatIndex: bei,
                                      stringIndex: sIdx,
                                    })
                                  }
                                >
                                  {note
                                    ? note.deadNote
                                      ? 'X'
                                      : activeTrack.isPercussion
                                        ? note.percussionArticulation ?? note.midi
                                        : note.fret
                                    : activeTrack.tuning[sIdx] && isCaret
                                      ? '·'
                                      : '—'}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Teclado táctil rápido para móvil (<900px) */}
            <section className="panel-card editor-mobile-pad" aria-label="Teclado táctil de trastes">
              <div className="preset-chips">
                {Array.from({ length: 25 }, (_, f) => (
                  <button
                    key={f}
                    type="button"
                    className={`chip-btn ${activeNote?.fret === f ? 'is-active' : ''}`}
                    onClick={() => writeFretAtCursor(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>

            {showInstrumentInput && activeTrack && !activeTrack.isPercussion && (
              activeTrack.family === 'keyboard' || activeTrack.tuning.length === 0 ? (
                <VirtualKeyboard
                  activeMidis={activeBeat?.notes.map((n) => n.midi) ?? []}
                  onClickMidi={(midi) => writeFretAtCursor(midi)}
                />
              ) : (
                <LiveFretboard
                  tuning={activeTrack.tuning}
                  capo={activeTrack.capo}
                  activeNotes={activeBeat?.notes.map((n) => ({ stringIndex: n.stringIndex, fret: n.fret })) ?? []}
                  onClickFret={(strIdx, fret) => {
                    const nextPos = { ...cursor, stringIndex: strIdx };
                    setCursor(nextPos);
                    writeFretAtCursor(fret, nextPos);
                  }}
                />
              )
            )}

            {activeTrack?.isPercussion && (
              <DrumPalette
                activePieceId={activeNote?.percussionArticulation ?? activeNote?.midi}
                onSelectPiece={(gmId) => writeFretAtCursor(gmId)}
              />
            )}

            {showSplitChordPro && (
              <section className="panel-card">
                <div className="tabs-toolbar">
                  <strong>Editor Dividido Acordes / Letra (ChordPro)</strong>
                  {onSaveChordProText && (
                    <button
                      type="button"
                      className="chip-btn is-active"
                      onClick={() =>
                        void onSaveChordProText(chordProDraft).then(() =>
                          setStatusMsg('Letra y acordes ChordPro guardados.')
                        )
                      }
                    >
                      Guardar ChordPro
                    </button>
                  )}
                </div>
                <div className="split-chordpro-grid">
                  <textarea
                    className="target-select chordpro-editor-textarea"
                    rows={12}
                    value={chordProDraft}
                    onChange={(e) => setChordProDraft(e.target.value)}
                    aria-label="Código ChordPro"
                  />
                  <ChordProView
                    chordProDoc={parseChordProText(chordProDraft)}
                    tuning={activeTrack?.tuning ?? []}
                  />
                </div>
              </section>
            )}

            {showBeatMapper && (
              <BeatMapperView
                doc={doc}
                initialSyncMap={beatSyncMap}
                onSaveSyncMap={onSaveBeatSyncMap ?? (async () => {})}
              />
            )}

            {showDiffViewer && (
              <DiffViewer
                currentDoc={doc}
                revisions={revisions}
                onSaveSnapshot={async (label) => {
                  await onSaveRevision?.(label, doc);
                }}
                onDeleteRevision={async (revId) => {
                  await onDeleteRevision?.(revId);
                }}
                onRestoreRevision={(snapshot, label) => {
                  dispatchCommand(createReplaceDocumentCommand(snapshot, `Restaurar «${label}»`));
                  setStatusMsg(`Revisión «${label}» restaurada (podés usar Ctrl+Z si cambiás de idea).`);
                }}
                onAuditionBar={(barIdx) => {
                  setCursor((c) => ({ ...c, barIndex: barIdx, beatIndex: 0 }));
                  togglePlayPreview();
                }}
              />
            )}

            {/* Previsualización musical alphaTab en vivo */}
            <section className="score-stage theme-endurend-dark">
              <div className="tuning-changes">
                Vista previa en pentagrama/tablatura ({activeTrack?.name ?? 'Pista'} ·{' '}
                {activeTrack?.tuning.map(formatPitchName).join(' ') || 'Percusión'})
              </div>
              <div ref={previewContainerRef} className="score-viewport" />
            </section>
          </main>
        </div>

        {showInspector && (
          <TrackInspector
            tracks={doc.tracks}
            activeTrackIndex={cursor.trackIndex}
            onSelectTrack={(idx) => {
              onChangeTrackIndex(idx);
              setCursor((c) => ({ ...c, trackIndex: idx, stringIndex: 0 }));
            }}
            onAddTrack={(opts) => dispatchCommand(createAddTrackCommand(opts))}
            onDuplicateTrack={(idx) => dispatchCommand(createDuplicateTrackCommand(idx))}
            onRemoveTrack={(idx) => {
              dispatchCommand(createRemoveTrackCommand(idx));
              onChangeTrackIndex(Math.max(0, idx - 1));
            }}
            onReorderTrack={(from, to) => dispatchCommand(createReorderTrackCommand(from, to))}
            onUpdateTrack={(idx, patch) =>
              dispatchCommand(createUpdateTrackConfigCommand(idx, patch))
            }
          />
        )}

        {showBendModal && (
          <BendEditorModal
            title={activeNote ? 'Curva Bend de Nota' : 'Curva Whammy Bar de Pulso'}
            initialPoints={
              activeNote ? activeNote.bendPoints : (activeBeat?.whammyBarPoints ?? [])
            }
            onClose={() => setShowBendModal(false)}
            onApply={(points: BendPoint[]) => {
              if (activeNote) {
                dispatchCommand(createSetNoteTechniqueCommand(cursor, { bendPoints: points }));
              } else if (activeBeat) {
                dispatchCommand(createUpdateBeatPropsCommand(cursor, { whammyBarPoints: points }));
              }
              setShowBendModal(false);
            }}
          />
        )}

        {extraModals}
      </div>
    </>
  );
}
