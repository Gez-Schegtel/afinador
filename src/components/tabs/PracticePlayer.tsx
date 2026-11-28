// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Modo Práctica estilo Songsterr (Spec 009).
 * Consumidor de solo lectura de ScoreDocument dividido en 3 zonas fijas ergonómicas:
 * Zona 1 (Barra superior), Zona 2 (Lienzo central con auto-scroll/bucle A–B),
 * Zona 3 (Consola inferior, Speed Trainer, Count-in, Metrónomo, Transposición y Mezclador).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import * as alphaTab from '@coderline/alphatab/core';
import {
  SCORE_THEME_LABELS,
  applyScoreTheme,
  createAlphaTabSettings,
  type ScoreTheme,
} from '../../audio/alphatab-runtime';
import {
  ScreenWakeController,
  computeBarStartTicks,
  findActiveBeatAtTick,
  findBarIndexAtTick,
  formatPlaybackTime,
  loadPracticePreferences,
  savePracticePreferences,
  type ActiveBeatSnapshot,
  type PracticeLayoutMode,
  type PracticePreferences,
  type PracticeStaveMode,
} from '../../audio/tab-audio-engine';
import { extractChordProFromDocument, parseChordProText } from '../../core/music/chordpro';
import {
  createGuidedTuningSession,
  setActiveGuidedSession,
} from '../../core/music/guided-tuning';
import { documentToAlphaTabScore } from '../../core/tabs/alphatab-bridge';
import type { BeatSyncMap } from '../../core/tabs/beat-sync';
import type { ScoreDocument } from '../../core/tabs/model';
import {
  MAX_TRANSPOSITION_ST,
  MIN_TRANSPOSITION_ST,
  clampTranspositionSemitones,
  computeLoopTickRange,
  effectiveBpmAtSpeed,
  formatEffectiveTuningLabel,
  resolveSetlistAdjacent,
} from '../../core/tabs/practice-state';
import {
  MAX_PLAYBACK_SPEED_PCT,
  MIN_PLAYBACK_SPEED_PCT,
  SPEED_PRESETS_PCT,
  advanceSpeedTrainerOnLoop,
  clampSpeedPct,
  createSpeedTrainerState,
  formatSpeedTrainerProgress,
  normalizeSpeedTrainerConfig,
  type SpeedTrainerConfig,
  type SpeedTrainerState,
} from '../../core/tabs/speed-trainer';
import { HeaderActions, HeaderSubtitle, useSpaceShortcut } from '../../shell/AppShell';
import { audioArbitrator } from '../../shell/audio-arbitrator';
import type {
  SavedLoopPreset,
  ScoreRevisionRecord,
  SetlistRecord,
} from '../../storage/tabs-db';
import { BeatMapperView } from './BeatMapperView';
import { ChordProView } from './ChordProView';
import { DiffViewer } from './DiffViewer';
import { ExportScorePanel } from './ExportScorePanel';
import { LiveFretboard } from './LiveFretboard';
import { VirtualKeyboard } from './VirtualKeyboard';

type PracticeDrawerId = 'none' | 'mixer' | 'speed-trainer' | 'loops' | 'transpose' | 'settings';

interface TrackMixState {
  volume: number; // 0..1.5
  pan: number; // -1..+1
  mute: boolean;
  solo: boolean;
}

export interface PracticePlayerProps {
  doc: ScoreDocument;
  activeTrackIndex: number;
  onChangeTrackIndex: (index: number) => void;
  chordProText?: string;
  isTemporary?: boolean;
  isFavorite?: boolean;
  setlists?: readonly SetlistRecord[];
  activeSetlist?: SetlistRecord | null;
  resumeBarIndex?: number;
  userSoundFontBytes?: Uint8Array | null;
  userSoundFontName?: string | null;
  savedLoops?: readonly SavedLoopPreset[];
  onBackToLibrary: () => void;
  onNavigateSetlist?: (docId: string) => void;
  onKeepTemporaryDocument?: (doc: ScoreDocument) => Promise<void>;
  onToggleFavorite?: () => Promise<void>;
  onAddToSetlist?: (setlistId: string) => Promise<void>;
  onSaveLoop?: (name: string, startBar: number, endBar: number) => Promise<void>;
  onDeleteLoop?: (loopId: string) => Promise<void>;
  onLoadUserSoundFont?: (name: string, bytes: Uint8Array) => Promise<void>;
  onClearUserSoundFont?: () => Promise<void>;
  onProgressSave?: (trackIndex: number, barIndex: number, speedPct: number) => void;
  onFilterByArtist?: (artist: string) => void;
  beatSyncMap?: BeatSyncMap | null;
  revisions?: readonly ScoreRevisionRecord[];
  onSaveBeatSyncMap?: (map: BeatSyncMap) => Promise<void>;
  onSaveRevision?: (label: string, snapshot: ScoreDocument) => Promise<void>;
  onDeleteRevision?: (revId: string) => Promise<void>;
  onRestoreRevision?: (snapshot: ScoreDocument, label: string) => void;
  onOpenEditor?: () => void;
  onOpenTuner?: () => void;
}

function staveEnumFromMode(mode: PracticeStaveMode): alphaTab.StaveProfile {
  if (mode === 'Tab') return alphaTab.StaveProfile.Tab;
  if (mode === 'Score') return alphaTab.StaveProfile.Score;
  return alphaTab.StaveProfile.ScoreTab;
}

function initialMixForDoc(doc: ScoreDocument): TrackMixState[] {
  return doc.tracks.map((t) => ({
    volume: t.mix.volume,
    pan: t.mix.pan,
    mute: t.mix.mute,
    solo: t.mix.solo,
  }));
}

export function PracticePlayer({
  doc,
  activeTrackIndex,
  onChangeTrackIndex,
  chordProText,
  isTemporary = false,
  isFavorite = false,
  setlists = [],
  activeSetlist = null,
  resumeBarIndex,
  userSoundFontBytes = null,
  userSoundFontName = null,
  savedLoops = [],
  onBackToLibrary,
  onNavigateSetlist,
  onKeepTemporaryDocument,
  onToggleFavorite,
  onAddToSetlist,
  onSaveLoop,
  onDeleteLoop,
  onLoadUserSoundFont,
  onClearUserSoundFont,
  onProgressSave,
  onFilterByArtist,
  beatSyncMap = null,
  revisions = [],
  onSaveBeatSyncMap,
  onSaveRevision,
  onDeleteRevision,
  onRestoreRevision,
  onOpenEditor,
  onOpenTuner,
}: PracticePlayerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const wakeRef = useRef(new ScreenWakeController());
  const sfInputRef = useRef<HTMLInputElement | null>(null);

  // Refs imperativos para lectura de posición a 60Hz sin re-renderizar React en cada sub-pulso
  const counterElRef = useRef<HTMLSpanElement | null>(null);
  const scrubElRef = useRef<HTMLInputElement | null>(null);
  const livePosRef = useRef({
    currentTime: 0,
    endTime: 1,
    currentTick: 0,
    endTick: 1,
    barIndex: 0,
  });
  const prevTickRef = useRef(0);
  const draggingScrubRef = useRef(false);
  const trackIdxRef = useRef(activeTrackIndex);
  trackIdxRef.current = activeTrackIndex;

  const [prefs, setPrefs] = useState<PracticePreferences>(loadPracticePreferences);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<PracticeDrawerId>('none');
  const [scrolledAway, setScrolledAway] = useState(false);
  const [showLiveInstrument, setShowLiveInstrument] = useState(false);
  const [showChordPro, setShowChordPro] = useState(false);
  const [showBeatMapper, setShowBeatMapper] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const beatMapperPlayingRef = useRef(false);
  const [activeBeatDisplay, setActiveBeatDisplay] = useState<ActiveBeatSnapshot>({
    key: 'none',
    fretNotes: [],
    midis: [],
  });
  const showLiveInstrumentRef = useRef(showLiveInstrument);
  showLiveInstrumentRef.current = showLiveInstrument;
  const lastBeatKeyRef = useRef('none');

  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStartBar, setLoopStartBar] = useState(0);
  const [loopEndBar, setLoopEndBar] = useState(() => Math.max(0, doc.masterBars.length - 1));
  const [newLoopName, setNewLoopName] = useState('');

  const [transposeSt, setTransposeSt] = useState(0);
  const [masterVol, setMasterVol] = useState(1);
  const [metronomeVol, setMetronomeVol] = useState(0.7);
  const [mixStates, setMixStates] = useState<TrackMixState[]>(() => initialMixForDoc(doc));

  const [trainerConfig, setTrainerConfig] = useState<SpeedTrainerConfig>(() =>
    normalizeSpeedTrainerConfig({ initialPct: 50, targetPct: 100, stepPct: 5, loopsPerStage: 2 })
  );
  const [trainerState, setTrainerState] = useState<SpeedTrainerState>(() =>
    createSpeedTrainerState(trainerConfig, false)
  );

  // Refs mutables para handlers de eventos alphaTab
  const loopEnabledRef = useRef(loopEnabled);
  loopEnabledRef.current = loopEnabled;
  const loopRangeRef = useRef<{ startTick: number; endTick: number } | null>(null);
  const trainerConfigRef = useRef(trainerConfig);
  trainerConfigRef.current = trainerConfig;
  const trainerStateRef = useRef(trainerState);
  trainerStateRef.current = trainerState;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const userSoundFontRef = useRef(userSoundFontBytes);
  userSoundFontRef.current = userSoundFontBytes;
  const resumeBarRef = useRef(resumeBarIndex);
  resumeBarRef.current = resumeBarIndex;
  const onProgressSaveRef = useRef(onProgressSave);
  onProgressSaveRef.current = onProgressSave;

  const barStarts = useMemo(() => computeBarStartTicks(doc.masterBars), [doc.masterBars]);
  const barStartsRef = useRef(barStarts);
  barStartsRef.current = barStarts;

  const totalBars = Math.max(1, doc.masterBars.length);
  const baseBpm = doc.masterBars[0]?.tempoChanges[0]?.bpm ?? 100;
  const effectiveBpm = effectiveBpmAtSpeed(baseBpm, prefs.speedPct);
  const activeTrack = doc.tracks[activeTrackIndex] ?? doc.tracks[0];

  const sectionMarkers = useMemo(() => {
    const out: { barIndex: number; label: string; tick: number }[] = [];
    doc.masterBars.forEach((mb, idx) => {
      const label = mb.section?.text.trim();
      if (label) {
        out.push({
          barIndex: idx,
          label,
          tick: barStarts[idx] ?? 0,
        });
      }
    });
    return out;
  }, [doc.masterBars, barStarts]);

  const setlistPrevId = useMemo(
    () =>
      activeSetlist
        ? resolveSetlistAdjacent(
            activeSetlist.items.map((i) => i.docId),
            doc.id,
            -1
          )
        : null,
    [activeSetlist, doc.id]
  );

  const setlistNextId = useMemo(
    () =>
      activeSetlist
        ? resolveSetlistAdjacent(
            activeSetlist.items.map((i) => i.docId),
            doc.id,
            1
          )
        : null,
    [activeSetlist, doc.id]
  );

  // Persistir preferencias
  useEffect(() => {
    savePracticePreferences(prefs);
  }, [prefs]);

  // Reiniciar estados locales dependientes de la canción al cambiar de documento
  useEffect(() => {
    setMixStates(initialMixForDoc(doc));
    setTransposeSt(0);
    setLoopEnabled(false);
    setLoopStartBar(0);
    setLoopEndBar(Math.max(0, doc.masterBars.length - 1));
    setTrainerState((prev) => createSpeedTrainerState(trainerConfigRef.current, prev.active));
    setScrolledAway(false);
    setErrorMsg(null);
    setStatusMsg(null);
  }, [doc]);

  // Sincronizar bucle UI -> alphaTab
  const computedRange = useMemo(
    () => computeLoopTickRange(doc.masterBars, loopStartBar, loopEndBar),
    [doc.masterBars, loopStartBar, loopEndBar]
  );
  loopRangeRef.current = computedRange
    ? { startTick: computedRange.startTick, endTick: computedRange.endTick }
    : null;

  // Inicializar alphaTab una sola vez por documento
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    setReady(false);
    setErrorMsg(null);
    const p = prefsRef.current;
    const settings = createAlphaTabSettings(p.theme);
    settings.display.scale = p.zoomPct / 100;
    settings.display.staveProfile = staveEnumFromMode(p.staveProfile);
    settings.display.layoutMode =
      p.layoutMode === 'horizontal'
        ? alphaTab.LayoutMode.Horizontal
        : alphaTab.LayoutMode.Page;
    settings.player.enableUserInteraction = true;
    settings.player.scrollMode = p.autoScroll
      ? alphaTab.ScrollMode.Continuous
      : alphaTab.ScrollMode.Off;
    if (scrollFrameRef.current) {
      settings.player.scrollElement = scrollFrameRef.current;
    }

    const api = new alphaTab.AlphaTabApi(container, settings);
    apiRef.current = api;

    const unsubLoaded = api.scoreLoaded.on((loadedScore) => {
      const targetTrack =
        loadedScore.tracks[trackIdxRef.current] ?? loadedScore.tracks[0];
      if (targetTrack && trackIdxRef.current !== 0) {
        api.renderTracks([targetTrack]);
      }
      api.playbackSpeed = prefsRef.current.speedPct / 100;
      api.metronomeVolume = prefsRef.current.metronomeEnabled ? metronomeVol : 0;
      api.countInVolume = prefsRef.current.countInBars > 0 ? 0.85 : 0;
      if (userSoundFontRef.current) {
        api.loadSoundFont(userSoundFontRef.current, false);
      }
      if (
        typeof resumeBarRef.current === 'number' &&
        resumeBarRef.current > 0 &&
        barStartsRef.current[resumeBarRef.current] !== undefined
      ) {
        api.tickPosition = barStartsRef.current[resumeBarRef.current] ?? 0;
      }
      setReady(true);
    });

    const unsubError = api.error.on((err) => {
      setErrorMsg(err.message || 'No se pudo procesar la partitura.');
    });

    const unsubState = api.playerStateChanged.on((args) => {
      const playing = args.state === alphaTab.synth.PlayerState.Playing;
      setIsPlaying(playing);
      audioArbitrator.setActive('tabs', playing);
      if (playing) {
        void wakeRef.current.acquire();
      } else {
        void wakeRef.current.release();
        const barIdx = livePosRef.current.barIndex;
        onProgressSaveRef.current?.(trackIdxRef.current, barIdx, prefsRef.current.speedPct);
      }
    });

    const handleLoopStep = () => {
      const st = trainerStateRef.current;
      if (!st.active || !loopEnabledRef.current) return;
      const next = advanceSpeedTrainerOnLoop(trainerConfigRef.current, st);
      trainerStateRef.current = next;
      setTrainerState(next);
      if (next.currentPct !== prefsRef.current.speedPct) {
        api.playbackSpeed = next.currentPct / 100;
        setPrefs((prev) => ({ ...prev, speedPct: next.currentPct }));
      }
    };

    const unsubPosition = api.playerPositionChanged.on((args) => {
      const barIdx = findBarIndexAtTick(barStartsRef.current, args.currentTick);
      livePosRef.current = {
        currentTime: args.currentTime,
        endTime: Math.max(1, args.endTime),
        currentTick: args.currentTick,
        endTick: Math.max(1, args.endTick),
        barIndex: barIdx,
      };
      // Detectar vuelta de bucle A–B para avanzar el Speed Trainer
      const activeRange = loopRangeRef.current;
      if (
        loopEnabledRef.current &&
        activeRange &&
        prevTickRef.current > activeRange.endTick - 360 &&
        args.currentTick < prevTickRef.current - 480
      ) {
        handleLoopStep();
      }
      prevTickRef.current = args.currentTick;
    });

    const unsubRange = api.playbackRangeChanged.on((ev) => {
      if (!ev.playbackRange) return;
      const starts = barStartsRef.current;
      const a = findBarIndexAtTick(starts, ev.playbackRange.startTick);
      const b = findBarIndexAtTick(
        starts,
        Math.max(ev.playbackRange.startTick, ev.playbackRange.endTick - 1)
      );
      setLoopStartBar(Math.min(a, b));
      setLoopEndBar(Math.max(a, b));
      setLoopEnabled(true);
      api.isLooping = true;
    });

    const unsubFinished = api.playerFinished.on(() => {
      if (loopEnabledRef.current && !loopRangeRef.current) {
        handleLoopStep();
      }
    });

    const unregisterAudio = audioArbitrator.register('tabs', {
      stop: () => {
        api.pause();
        audioArbitrator.setActive('tabs', false);
        void wakeRef.current.release();
      },
    });

    api.renderScore(documentToAlphaTabScore(doc));

    // Animación RAF ligera solo para actualizar el texto de contador y barra sin re-renders
    let rafId = 0;
    let lastCounterText = '';
    const tickUi = () => {
      const pos = livePosRef.current;
      const txt = `${formatPlaybackTime(pos.currentTime)} / ${formatPlaybackTime(pos.endTime)} · Compás ${pos.barIndex + 1}/${Math.max(1, doc.masterBars.length)}`;
      if (counterElRef.current && txt !== lastCounterText) {
        counterElRef.current.textContent = txt;
        lastCounterText = txt;
      }
      if (scrubElRef.current && !draggingScrubRef.current && pos.endTick > 0) {
        scrubElRef.current.max = String(pos.endTick);
        scrubElRef.current.value = String(pos.currentTick);
      }
      if (showLiveInstrumentRef.current) {
        const snap = findActiveBeatAtTick(doc, trackIdxRef.current, barStartsRef.current, pos.currentTick);
        if (snap.key !== lastBeatKeyRef.current) {
          lastBeatKeyRef.current = snap.key;
          setActiveBeatDisplay(snap);
        }
      }
      rafId = requestAnimationFrame(tickUi);
    };
    rafId = requestAnimationFrame(tickUi);

    return () => {
      cancelAnimationFrame(rafId);
      unregisterAudio();
      audioArbitrator.release('tabs');
      void wakeRef.current.release();
      unsubLoaded();
      unsubError();
      unsubState();
      unsubPosition();
      unsubRange();
      unsubFinished();
      api.destroy();
      apiRef.current = null;
      setIsPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Cambio de pista sin detener reproducción ni perder posición
  useEffect(() => {
    const api = apiRef.current;
    if (!api?.score) return;
    const track = api.score.tracks[activeTrackIndex];
    if (track) {
      api.renderTracks([track]);
    }
  }, [activeTrackIndex]);

  // Actualizar ajustes visuales en alphaTab (tema, notación, zoom, layout, auto-scroll)
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    applyScoreTheme(api.settings, prefs.theme);
    api.settings.display.scale = prefs.zoomPct / 100;
    api.settings.display.staveProfile = staveEnumFromMode(prefs.staveProfile);
    api.settings.display.layoutMode =
      prefs.layoutMode === 'horizontal'
        ? alphaTab.LayoutMode.Horizontal
        : alphaTab.LayoutMode.Page;
    api.settings.player.scrollMode =
      prefs.autoScroll && !scrolledAway
        ? alphaTab.ScrollMode.Continuous
        : alphaTab.ScrollMode.Off;
    api.updateSettings();
    api.render();
  }, [prefs.theme, prefs.zoomPct, prefs.staveProfile, prefs.layoutMode, prefs.autoScroll, scrolledAway]);

  // Actualizar velocidad, metrónomo, count-in y bucle
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.playbackSpeed = prefs.speedPct / 100;
  }, [prefs.speedPct]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.metronomeVolume = prefs.metronomeEnabled ? metronomeVol : 0;
  }, [prefs.metronomeEnabled, metronomeVol]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.countInVolume = prefs.countInBars > 0 ? 0.85 : 0;
  }, [prefs.countInBars]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.isLooping = loopEnabled;
    api.playbackRange = loopEnabled && computedRange
      ? { startTick: computedRange.startTick, endTick: computedRange.endTick }
      : null;
  }, [loopEnabled, computedRange]);

  const togglePlayback = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (isPlaying) {
      api.pause();
      return;
    }
    void audioArbitrator.acquire('tabs').then(() => {
      api.play();
    });
  }, [isPlaying]);

  useSpaceShortcut(togglePlayback);

  const jumpToBar = useCallback(
    (barIdx: number) => {
      const api = apiRef.current;
      if (!api) return;
      const clamped = Math.max(0, Math.min(totalBars - 1, barIdx));
      const tick = barStarts[clamped] ?? 0;
      api.tickPosition = tick;
      livePosRef.current = { ...livePosRef.current, currentTick: tick, barIndex: clamped };
    },
    [barStarts, totalBars]
  );

  const applyTrackMix = useCallback(
    (trackIdx: number, patch: Partial<TrackMixState>) => {
      setMixStates((prev) =>
        prev.map((item, idx) => (idx === trackIdx ? { ...item, ...patch } : item))
      );
      const api = apiRef.current;
      const abTrack = api?.score?.tracks[trackIdx];
      if (!api || !abTrack) return;
      if (patch.volume !== undefined) {
        api.changeTrackVolume([abTrack], patch.volume);
      }
      if (patch.mute !== undefined) {
        api.changeTrackMute([abTrack], patch.mute);
      }
      if (patch.solo !== undefined) {
        api.changeTrackSolo([abTrack], patch.solo);
      }
      if (patch.pan !== undefined) {
        abTrack.playbackInfo.balance = Math.max(0, Math.min(16, Math.round((patch.pan + 1) * 8)));
        if (!isPlaying) {
          api.loadMidiForScore();
        }
      }
    },
    [isPlaying]
  );

  const applyTransposition = useCallback(
    (nextSt: number) => {
      const clamped = clampTranspositionSemitones(nextSt);
      setTransposeSt(clamped);
      const api = apiRef.current;
      if (!api?.score) return;
      const pitchedTracks = api.score.tracks.filter((_, idx) => !doc.tracks[idx]?.isPercussion);
      if (pitchedTracks.length > 0) {
        api.changeTrackTranspositionPitch(pitchedTracks, clamped);
      }
    },
    [doc.tracks]
  );

  const toggleSpeedTrainer = useCallback(
    (enable?: boolean) => {
      const nextActive = enable ?? !trainerState.active;
      const next = createSpeedTrainerState(trainerConfig, nextActive);
      setTrainerState(next);
      trainerStateRef.current = next;
      if (nextActive) {
        setLoopEnabled(true);
        setPrefs((prev) => ({ ...prev, speedPct: next.currentPct }));
      }
    },
    [trainerConfig, trainerState.active]
  );

  const openGuidedTuner = useCallback(() => {
    if (activeTrack && !activeTrack.isPercussion && activeTrack.tuning.length > 0) {
      setActiveGuidedSession(
        createGuidedTuningSession({
          docId: doc.id,
          songTitle: doc.title,
          trackName: activeTrack.name,
          tuning: activeTrack.tuning,
          capo: activeTrack.capo,
        })
      );
    }
    onOpenTuner?.();
  }, [activeTrack, doc.id, doc.title, onOpenTuner]);

  const chordProDoc = useMemo(
    () =>
      chordProText
        ? parseChordProText(chordProText)
        : extractChordProFromDocument(doc, activeTrackIndex),
    [chordProText, doc, activeTrackIndex]
  );

  const handleBeatMapperSynthControl = useCallback(
    ({
      playing,
      tick,
      speedRatio,
      synthVol,
    }: {
      playing: boolean;
      tick: number;
      speedRatio: number;
      synthVol: number;
    }) => {
      const api = apiRef.current;
      if (!api) return;
      api.masterVolume = synthVol;
      api.playbackSpeed = speedRatio;
      const wasPlaying = beatMapperPlayingRef.current;
      beatMapperPlayingRef.current = playing;
      if (playing && !wasPlaying) {
        api.tickPosition = tick;
        void audioArbitrator.acquire('tabs').then(() => {
          apiRef.current?.play();
        });
      } else if (!playing && wasPlaying) {
        api.pause();
      }
    },
    []
  );

  // Atajos de teclado contextuales de Práctica (se pausan en inputs/selects)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToBar(livePosRef.current.barIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToBar(livePosRef.current.barIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToBar(0);
      } else if (e.key === 'l' || e.key === 'L') {
        setLoopEnabled((prev) => {
          const next = !prev;
          if (!next && trainerStateRef.current.active) {
            toggleSpeedTrainer(false);
          }
          return next;
        });
      } else if (e.key === 'm' && !e.shiftKey) {
        setPrefs((prev) => ({ ...prev, metronomeEnabled: !prev.metronomeEnabled }));
      } else if ((e.key === 'M' || e.key === 'm') && e.shiftKey) {
        const cur = mixStates[activeTrackIndex];
        if (cur) applyTrackMix(activeTrackIndex, { mute: !cur.mute });
      } else if (e.key === 's' || e.key === 'S') {
        const cur = mixStates[activeTrackIndex];
        if (cur) applyTrackMix(activeTrackIndex, { solo: !cur.solo });
      } else if (e.key === 'c' || e.key === 'C') {
        setPrefs((prev) => ({
          ...prev,
          countInBars: prev.countInBars === 0 ? 1 : prev.countInBars === 1 ? 2 : 0,
        }));
      } else if (e.key === '[') {
        setPrefs((prev) => ({ ...prev, speedPct: clampSpeedPct(prev.speedPct - 5) }));
      } else if (e.key === ']') {
        setPrefs((prev) => ({ ...prev, speedPct: clampSpeedPct(prev.speedPct + 5) }));
      } else if (e.key === 'e' || e.key === 'E') {
        onOpenEditor?.();
      } else if (e.key === 't' || e.key === 'T') {
        openGuidedTuner();
      } else if (e.key === 'Escape') {
        setDrawer('none');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTrackIndex,
    applyTrackMix,
    jumpToBar,
    mixStates,
    onOpenEditor,
    openGuidedTuner,
    toggleSpeedTrainer,
  ]);

  const handleSaveLoopSubmit = async () => {
    if (!onSaveLoop) return;
    const label =
      newLoopName.trim() || `Compases ${loopStartBar + 1}–${loopEndBar + 1}`;
    await onSaveLoop(label, loopStartBar, loopEndBar);
    setNewLoopName('');
    setStatusMsg(`Bucle guardado: ${label}`);
  };

  const handleSoundFontPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    apiRef.current?.loadSoundFont(bytes, false);
    if (onLoadUserSoundFont) {
      await onLoadUserSoundFont(file.name, bytes);
    }
    setStatusMsg(`SoundFont activo: ${file.name}`);
  };

  const activeMix = mixStates[activeTrackIndex] ?? {
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
  };

  const tuningBadgeText = activeTrack
    ? activeTrack.isPercussion
      ? 'Kit de Batería GM'
      : formatEffectiveTuningLabel(activeTrack.tuning, activeTrack.capo, transposeSt)
    : 'Sin pista';

  return (
    <>
      <HeaderSubtitle>
        {doc.title} · {effectiveBpm} BPM ({prefs.speedPct}%)
      </HeaderSubtitle>
      <HeaderActions>
        <span className="desktop-shortcut-hint">
          Espacio: Play · ←/→: Compás · L: Loop · S: Solo · E: Editar
        </span>
      </HeaderActions>

      <div className="practice-shell">
        {/* ZONA 1: BARRA SUPERIOR */}
        <header className="panel-card practice-topbar">
          <div className="practice-topbar-left">
            <button type="button" className="chip-btn" onClick={onBackToLibrary}>
              ← Biblioteca
            </button>

            {activeSetlist && onNavigateSetlist && (
              <div className="practice-setlist-nav" aria-label={`Setlist ${activeSetlist.name}`}>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={!setlistPrevId}
                  onClick={() => setlistPrevId && onNavigateSetlist(setlistPrevId)}
                >
                  ◀ Ant.
                </button>
                <span className="origin-badge">{activeSetlist.name}</span>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={!setlistNextId}
                  onClick={() => setlistNextId && onNavigateSetlist(setlistNextId)}
                >
                  Sig. ▶
                </button>
              </div>
            )}

            <div className="practice-song-meta">
              <div className="library-item-title">
                <strong>{doc.title}</strong>
                <span className="origin-badge">
                  {doc.origin.kind === 'factory'
                    ? 'Fábrica'
                    : doc.origin.kind === 'studio'
                      ? 'Estudio'
                      : doc.origin.kind === 'catalog'
                        ? doc.origin.sourceName
                        : isTemporary
                          ? 'Temporal'
                          : 'Mi Tab'}
                </span>
              </div>
              <div className="practice-song-sub">
                {doc.artist && (
                  <button
                    type="button"
                    className="link-inline-btn"
                    onClick={() => onFilterByArtist?.(doc.artist)}
                  >
                    {doc.artist}
                  </button>
                )}
                <button
                  type="button"
                  className="link-inline-btn"
                  onClick={openGuidedTuner}
                  title="Abrir Afinador Guiado por Pista (T)"
                >
                  {tuningBadgeText} · Afinar (T)
                </button>
              </div>
            </div>
          </div>

          <div className="practice-topbar-right">
            <label className="tabs-theme-label">
              <span>Pista</span>
              <select
                className="target-select tabs-theme-select"
                value={activeTrackIndex}
                onChange={(e) => onChangeTrackIndex(Number(e.target.value))}
                aria-label="Selector de pista"
              >
                {doc.tracks.map((t, idx) => (
                  <option key={t.id} value={idx}>
                    {t.isPercussion ? '🥁 ' : t.family === 'bass' ? '🎸 ' : '🎶 '}
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={`chip-btn ${activeMix.solo ? 'is-active' : ''}`}
              onClick={() => applyTrackMix(activeTrackIndex, { solo: !activeMix.solo })}
              title="Solo pista activa (S)"
            >
              S
            </button>
            <button
              type="button"
              className={`chip-btn ${activeMix.mute ? 'is-active' : ''}`}
              onClick={() => applyTrackMix(activeTrackIndex, { mute: !activeMix.mute })}
              title="Silenciar pista activa (Shift+M)"
            >
              M
            </button>

            <select
              className="target-select tabs-theme-select"
              value={prefs.staveProfile}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, staveProfile: e.target.value as PracticeStaveMode }))
              }
              aria-label="Modo de notación"
            >
              <option value="Tab">Solo Tab</option>
              <option value="ScoreTab">Tab + Pentagrama</option>
              <option value="Score">Solo Pentagrama</option>
            </select>

            <select
              className="target-select tabs-theme-select"
              value={prefs.theme}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, theme: e.target.value as ScoreTheme }))
              }
              aria-label="Tema de la partitura"
            >
              {(Object.keys(SCORE_THEME_LABELS) as ScoreTheme[]).map((k) => (
                <option key={k} value={k}>
                  {SCORE_THEME_LABELS[k]}
                </option>
              ))}
            </select>

            {isTemporary && onKeepTemporaryDocument && (
              <button
                type="button"
                className="chip-btn is-active"
                onClick={() => void onKeepTemporaryDocument(doc)}
              >
                Conservar en Biblioteca
              </button>
            )}

            {onToggleFavorite && !isTemporary && (
              <button
                type="button"
                className={`chip-btn ${isFavorite ? 'is-active' : ''}`}
                onClick={() => void onToggleFavorite()}
                aria-label={isFavorite ? 'Quitar favorito' : 'Marcar favorito'}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            )}

            {onAddToSetlist && !isTemporary && setlists.length > 0 && (
              <select
                className="target-select tabs-theme-select"
                defaultValue=""
                aria-label="Agregar tema a setlist"
                onChange={(e) => {
                  if (e.target.value) void onAddToSetlist(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="">+ Setlist…</option>
                {setlists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {onOpenEditor && (
              <button
                type="button"
                className="chip-btn is-active"
                onClick={onOpenEditor}
                title="Abrir en Modo Edición (E)"
              >
                Editar (E)
              </button>
            )}

            <button
              type="button"
              className="chip-btn"
              onClick={() => window.print()}
              title="Imprimir / Exportar PDF vectorial"
            >
              Imprimir / PDF
            </button>
          </div>
        </header>

        {errorMsg && (
          <div className="error-banner" role="alert">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <p className="info-banner tabs-subroute-note" role="status">
            {statusMsg}
          </p>
        )}

        {/* ZONA 2: LIENZO CENTRAL INTERACTIVO */}
        <section
          className={`score-stage theme-${prefs.theme} practice-canvas-zone`}
          aria-label="Lienzo de tablatura"
        >
          {/* Barra rápida de secciones y Bucle A-B */}
          <div className="practice-section-strip">
            <div className="preset-chips">
              {sectionMarkers.map((sec) => (
                <button
                  key={`${sec.barIndex}-${sec.label}`}
                  type="button"
                  className="chip-btn"
                  onClick={() => jumpToBar(sec.barIndex)}
                >
                  {sec.label} ({sec.barIndex + 1})
                </button>
              ))}
            </div>

            <div className="practice-loop-bar">
              <button
                type="button"
                className={`chip-btn ${loopEnabled ? 'is-active' : ''}`}
                onClick={() => {
                  const next = !loopEnabled;
                  setLoopEnabled(next);
                  if (!next && trainerState.active) toggleSpeedTrainer(false);
                }}
              >
                {loopEnabled ? 'Bucle A–B ON' : 'Bucle A–B'}
              </button>
              <label className="tabs-theme-label">
                <span>A</span>
                <input
                  type="number"
                  className="target-select bar-num-input"
                  min={1}
                  max={totalBars}
                  value={loopStartBar + 1}
                  onChange={(e) => {
                    const a = Math.max(0, Math.min(totalBars - 1, Number(e.target.value) - 1));
                    setLoopStartBar(Math.min(a, loopEndBar));
                    setLoopEnabled(true);
                  }}
                  aria-label="Compás inicial del bucle"
                />
              </label>
              <label className="tabs-theme-label">
                <span>B</span>
                <input
                  type="number"
                  className="target-select bar-num-input"
                  min={1}
                  max={totalBars}
                  value={loopEndBar + 1}
                  onChange={(e) => {
                    const b = Math.max(0, Math.min(totalBars - 1, Number(e.target.value) - 1));
                    setLoopEndBar(Math.max(b, loopStartBar));
                    setLoopEnabled(true);
                  }}
                  aria-label="Compás final del bucle"
                />
              </label>
              {loopEnabled && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    setLoopEnabled(false);
                    if (trainerState.active) toggleSpeedTrainer(false);
                  }}
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                className={`chip-btn ${drawer === 'loops' ? 'is-active' : ''}`}
                onClick={() => setDrawer((d) => (d === 'loops' ? 'none' : 'loops'))}
              >
                Bucles ({savedLoops.length})
              </button>
            </div>
          </div>

          {prefs.leftHanded && (
            <p className="tuning-changes">
              Modo para zurdos activo: lectura invertida horizontalmente en el visor de mástil/guía.
            </p>
          )}

          <div className="practice-viewport-wrapper">
            {scrolledAway && (
              <button
                type="button"
                className="chip-btn is-active practice-return-cursor"
                onClick={() => setScrolledAway(false)}
              >
                Volver al cursor
              </button>
            )}
            <div
              ref={scrollFrameRef}
              className="practice-scroll-frame"
              onWheel={() => {
                if (isPlaying && prefs.autoScroll && !scrolledAway) setScrolledAway(true);
              }}
              onTouchMove={() => {
                if (isPlaying && prefs.autoScroll && !scrolledAway) setScrolledAway(true);
              }}
            >
              <div
                ref={viewportRef}
                className={`score-viewport ${prefs.leftHanded ? 'is-lefthanded' : ''}`}
              />
            </div>
          </div>
        </section>

        {/* INSTRUMENTO EN VIVO (DIAPASÓN / TECLADO, OCULTO EN PERCUSIÓN) */}
        {showLiveInstrument && activeTrack && !activeTrack.isPercussion && (
          activeTrack.family === 'keyboard' || activeTrack.tuning.length === 0 ? (
            <VirtualKeyboard
              activeMidis={activeBeatDisplay.midis}
              leftHanded={prefs.leftHanded}
            />
          ) : (
            <LiveFretboard
              tuning={activeTrack.tuning}
              capo={activeTrack.capo}
              leftHanded={prefs.leftHanded}
              activeNotes={activeBeatDisplay.fretNotes}
              scaleContext={doc.scaleContext}
            />
          )
        )}

        {/* VISTA CHORDPRO Y CEJILLA MATEMÁTICA (CAPO 0–12) */}
        {showChordPro && (
          <ChordProView
            chordProDoc={chordProDoc}
            tuning={activeTrack?.tuning ?? []}
            leftHanded={prefs.leftHanded}
            onChangeLeftHanded={(left) =>
              setPrefs((p) => ({ ...p, leftHanded: left }))
            }
          />
        )}

        {/* PANEL BEAT-MAPPER, REVISIONES A/B Y EXPORTACIÓN OFFLINE (SPEC 014) */}
        {showExportPanel && (
          <ExportScorePanel
            doc={doc}
            activeTrackIndex={activeTrackIndex}
            onClose={() => setShowExportPanel(false)}
          />
        )}

        {showBeatMapper && (
          <BeatMapperView
            doc={doc}
            initialSyncMap={beatSyncMap}
            onSaveSyncMap={onSaveBeatSyncMap ?? (async () => {})}
            onSynthControl={handleBeatMapperSynthControl}
          />
        )}

        {showDiffViewer && (
          <DiffViewer
            currentDoc={doc}
            revisions={revisions}
            onSaveSnapshot={async (label) => {
              await onSaveRevision?.(label, doc);
              setStatusMsg(`Instantánea «${label}» guardada.`);
            }}
            onDeleteRevision={async (revId) => {
              await onDeleteRevision?.(revId);
            }}
            onRestoreRevision={(snapshot, label) => {
              onRestoreRevision?.(snapshot, label);
              setStatusMsg(`Revisión «${label}» restaurada.`);
            }}
            onAuditionBar={(barIdx) => {
              jumpToBar(barIdx);
              if (!isPlaying) {
                togglePlayback();
              }
            }}
          />
        )}

        {/* PANELES DESLIZABLES / DRAWERS CONTEXTUALES */}
        {drawer !== 'none' && (
          <section className="panel-card practice-drawer" aria-label="Panel de herramienta">
            <div className="tabs-toolbar">
              <strong>
                {drawer === 'mixer'
                  ? 'Mezclador Multipista y SoundFont (.sf2)'
                  : drawer === 'speed-trainer'
                    ? 'Entrenador Progresivo de Velocidad (Speed Trainer)'
                    : drawer === 'loops'
                      ? 'Bucles A–B Guardados'
                      : drawer === 'transpose'
                        ? 'Transposición (−12 a +12 semitonos)'
                        : 'Ajustes de Visor y Atajos'}
              </strong>
              <button type="button" className="chip-btn" onClick={() => setDrawer('none')}>
                Cerrar
              </button>
            </div>

            {drawer === 'speed-trainer' && (
              <div className="practice-drawer-grid">
                <label className="tuning-field">
                  <span>Inicio ({trainerConfig.initialPct}%)</span>
                  <input
                    type="range"
                    min={MIN_PLAYBACK_SPEED_PCT}
                    max={MAX_PLAYBACK_SPEED_PCT}
                    step={5}
                    value={trainerConfig.initialPct}
                    onChange={(e) =>
                      setTrainerConfig((c) =>
                        normalizeSpeedTrainerConfig({ ...c, initialPct: Number(e.target.value) })
                      )
                    }
                  />
                </label>
                <label className="tuning-field">
                  <span>Meta ({trainerConfig.targetPct}%)</span>
                  <input
                    type="range"
                    min={MIN_PLAYBACK_SPEED_PCT}
                    max={MAX_PLAYBACK_SPEED_PCT}
                    step={5}
                    value={trainerConfig.targetPct}
                    onChange={(e) =>
                      setTrainerConfig((c) =>
                        normalizeSpeedTrainerConfig({ ...c, targetPct: Number(e.target.value) })
                      )
                    }
                  />
                </label>
                <label className="tuning-field">
                  <span>Paso (+{trainerConfig.stepPct}%)</span>
                  <input
                    type="number"
                    className="target-select"
                    min={1}
                    max={50}
                    value={trainerConfig.stepPct}
                    onChange={(e) =>
                      setTrainerConfig((c) =>
                        normalizeSpeedTrainerConfig({ ...c, stepPct: Number(e.target.value) })
                      )
                    }
                  />
                </label>
                <label className="tuning-field">
                  <span>Vueltas por etapa</span>
                  <input
                    type="number"
                    className="target-select"
                    min={1}
                    max={16}
                    value={trainerConfig.loopsPerStage}
                    onChange={(e) =>
                      setTrainerConfig((c) =>
                        normalizeSpeedTrainerConfig({
                          ...c,
                          loopsPerStage: Number(e.target.value),
                        })
                      )
                    }
                  />
                </label>
                <div className="tabs-toolbar-actions">
                  <button
                    type="button"
                    className={`chip-btn ${trainerState.active ? 'is-active' : ''}`}
                    onClick={() => toggleSpeedTrainer()}
                  >
                    {trainerState.active ? 'Desactivar Speed Trainer' : 'Iniciar Speed Trainer'}
                  </button>
                  <span className="origin-badge">
                    {formatSpeedTrainerProgress(trainerConfig, trainerState)}
                  </span>
                </div>
              </div>
            )}

            {drawer === 'mixer' && (
              <div className="mixer-panel">
                <div className="practice-drawer-grid">
                  <label className="tuning-field">
                    <span>Volumen Maestro ({Math.round(masterVol * 100)}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={masterVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMasterVol(v);
                        if (apiRef.current) apiRef.current.masterVolume = v;
                      }}
                    />
                  </label>
                  <label className="tuning-field">
                    <span>Volumen Metrónomo ({Math.round(metronomeVol * 100)}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={metronomeVol}
                      onChange={(e) => setMetronomeVol(Number(e.target.value))}
                    />
                  </label>
                </div>

                <div className="mixer-tracks-list">
                  {doc.tracks.map((track, idx) => {
                    const mix = mixStates[idx] ?? {
                      volume: 1,
                      pan: 0,
                      mute: false,
                      solo: false,
                    };
                    return (
                      <div key={track.id} className="mixer-track-row">
                        <strong>{track.name}</strong>
                        <label className="tabs-theme-label">
                          <span>Vol {Math.round(mix.volume * 100)}%</span>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={mix.volume}
                            onChange={(e) =>
                              applyTrackMix(idx, { volume: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="tabs-theme-label">
                          <span>Pan {mix.pan === 0 ? 'C' : mix.pan < 0 ? 'L' : 'R'}</span>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.25}
                            value={mix.pan}
                            onChange={(e) =>
                              applyTrackMix(idx, { pan: Number(e.target.value) })
                            }
                          />
                        </label>
                        <div className="tabs-toolbar-actions">
                          <button
                            type="button"
                            className={`chip-btn ${mix.mute ? 'is-active' : ''}`}
                            onClick={() => applyTrackMix(idx, { mute: !mix.mute })}
                          >
                            Mute
                          </button>
                          <button
                            type="button"
                            className={`chip-btn ${mix.solo ? 'is-active' : ''}`}
                            onClick={() => applyTrackMix(idx, { solo: !mix.solo })}
                          >
                            Solo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="tabs-toolbar-actions">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() =>
                      doc.tracks.forEach((_, idx) =>
                        applyTrackMix(idx, { volume: 1, pan: 0, mute: false, solo: false })
                      )
                    }
                  >
                    Restablecer mezcla
                  </button>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={prefs.manualTrackChanges}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, manualTrackChanges: e.target.checked }))
                      }
                    />
                    <span>Marcadores manuales de cambio de pista</span>
                  </label>

                  <input
                    ref={sfInputRef}
                    type="file"
                    hidden
                    accept=".sf2"
                    onChange={(e) => void handleSoundFontPick(e)}
                  />
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => sfInputRef.current?.click()}
                  >
                    Cargar .sf2 propio {userSoundFontName ? `(${userSoundFontName})` : ''}
                  </button>
                  {userSoundFontName && onClearUserSoundFont && (
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => {
                        void onClearUserSoundFont();
                        setStatusMsg('Restaurado SoundFont sonivox.sf2 integrado.');
                      }}
                    >
                      Usar sonivox.sf2
                    </button>
                  )}
                </div>
              </div>
            )}

            {drawer === 'transpose' && (
              <div className="practice-drawer-grid">
                <label className="tuning-field">
                  <span>
                    Semitonos ({transposeSt > 0 ? `+${transposeSt}` : transposeSt} st)
                  </span>
                  <input
                    type="range"
                    min={MIN_TRANSPOSITION_ST}
                    max={MAX_TRANSPOSITION_ST}
                    step={1}
                    value={transposeSt}
                    onChange={(e) => applyTransposition(Number(e.target.value))}
                  />
                </label>
                <div className="tabs-toolbar-actions">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyTransposition(transposeSt - 1)}
                  >
                    -1 st
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyTransposition(0)}
                  >
                    0 (Original)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyTransposition(transposeSt + 1)}
                  >
                    +1 st
                  </button>
                </div>
                <p className="tuning-changes">Sonando en: {tuningBadgeText}</p>
              </div>
            )}

            {drawer === 'loops' && (
              <div className="mixer-panel">
                {onSaveLoop && (
                  <div className="library-filter-row">
                    <input
                      type="text"
                      className="target-select"
                      placeholder={`Nombre (Compases ${loopStartBar + 1}–${loopEndBar + 1})`}
                      value={newLoopName}
                      onChange={(e) => setNewLoopName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="chip-btn is-active"
                      onClick={() => void handleSaveLoopSubmit()}
                    >
                      Guardar bucle A–B actual
                    </button>
                  </div>
                )}
                {savedLoops.length === 0 ? (
                  <p className="tuning-changes">
                    No hay bucles guardados para este tema todavía.
                  </p>
                ) : (
                  <div className="preset-chips">
                    {savedLoops.map((lp) => (
                      <span key={lp.id} className="saved-loop-pill">
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => {
                            setLoopStartBar(lp.startBar);
                            setLoopEndBar(lp.endBar);
                            setLoopEnabled(true);
                          }}
                        >
                          {lp.name} ({lp.startBar + 1}–{lp.endBar + 1})
                        </button>
                        {onDeleteLoop && (
                          <button
                            type="button"
                            className="chip-btn"
                            onClick={() => void onDeleteLoop(lp.id)}
                            aria-label={`Borrar ${lp.name}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {drawer === 'settings' && (
              <div className="practice-drawer-grid">
                <label className="tuning-field">
                  <span>Zoom ({prefs.zoomPct}%)</span>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={10}
                    value={prefs.zoomPct}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, zoomPct: Number(e.target.value) }))
                    }
                  />
                </label>
                <label className="tuning-field">
                  <span>Orientación</span>
                  <select
                    className="target-select"
                    value={prefs.layoutMode}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        layoutMode: e.target.value as PracticeLayoutMode,
                      }))
                    }
                  >
                    <option value="page">Multipágina vertical</option>
                    <option value="horizontal">Tira horizontal continua</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.autoScroll}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, autoScroll: e.target.checked }))
                    }
                  />
                  <span>Auto-scroll inteligente</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.leftHanded}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, leftHanded: e.target.checked }))
                    }
                  />
                  <span>Modo para zurdos</span>
                </label>
                <p className="tuning-changes desktop-shortcut-hint">
                  Atajos: Espacio (Play/Pausa) · ←/→ (Compás) · Home (Inicio) · L (Loop) ·
                  [ / ] (Velocidad) · M (Metrónomo) · C (Count-in) · S (Solo) · Shift+M
                  (Silenciar mi pista) · E (Editar).
                </p>
              </div>
            )}
          </section>
        )}

        {/* ZONA 3: CONSOLA INFERIOR DE PRÁCTICA */}
        <footer className="panel-card practice-console">
          <div className="practice-transport-row">
            <div className="tabs-toolbar-actions">
              <button
                type="button"
                className="chip-btn"
                onClick={() => jumpToBar(0)}
                title="Volver al inicio (Home)"
              >
                ⏮ Inicio
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => jumpToBar(livePosRef.current.barIndex - 1)}
                title="Compás anterior (←)"
              >
                ◀
              </button>
              <button
                type="button"
                className={`chip-btn ${isPlaying ? 'is-active' : ''}`}
                onClick={togglePlayback}
                disabled={!ready}
              >
                {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => jumpToBar(livePosRef.current.barIndex + 1)}
                title="Compás siguiente (→)"
              >
                ▶|
              </button>
            </div>

            <input
              ref={scrubElRef}
              type="range"
              className="practice-scrub"
              min={0}
              max={1}
              defaultValue={0}
              aria-label="Posición de reproducción"
              onPointerDown={() => {
                draggingScrubRef.current = true;
              }}
              onPointerUp={() => {
                draggingScrubRef.current = false;
              }}
              onChange={(e) => {
                const tick = Number(e.target.value);
                if (apiRef.current) apiRef.current.tickPosition = tick;
              }}
            />

            <span ref={counterElRef} className="practice-time-counter">
              00:00 / 00:00 · Compás 1/{totalBars}
            </span>
          </div>

          <div className="practice-tools-row">
            <div className="preset-chips" aria-label="Velocidad de reproducción">
              {SPEED_PRESETS_PCT.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`chip-btn ${prefs.speedPct === pct ? 'is-active' : ''}`}
                  onClick={() => setPrefs((p) => ({ ...p, speedPct: pct }))}
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                className="chip-btn"
                onClick={() =>
                  setPrefs((p) => ({ ...p, speedPct: clampSpeedPct(p.speedPct - 5) }))
                }
              >
                -5%
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() =>
                  setPrefs((p) => ({ ...p, speedPct: clampSpeedPct(p.speedPct + 5) }))
                }
              >
                +5%
              </button>
              <span className="origin-badge">
                {prefs.speedPct}% · {effectiveBpm} BPM
              </span>
            </div>

            <div className="tabs-toolbar-actions">
              <button
                type="button"
                className={`chip-btn ${trainerState.active || drawer === 'speed-trainer' ? 'is-active' : ''}`}
                onClick={() =>
                  setDrawer((d) => (d === 'speed-trainer' ? 'none' : 'speed-trainer'))
                }
              >
                Speed Trainer {trainerState.active ? `(${trainerState.currentPct}%)` : ''}
              </button>

              <button
                type="button"
                className={`chip-btn ${prefs.countInBars > 0 ? 'is-active' : ''}`}
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    countInBars: p.countInBars === 0 ? 1 : p.countInBars === 1 ? 2 : 0,
                  }))
                }
                title="Conteo previo (C)"
              >
                Count-in: {prefs.countInBars === 0 ? 'Off' : `${prefs.countInBars} comp.`}
              </button>

              <button
                type="button"
                className={`chip-btn ${prefs.metronomeEnabled ? 'is-active' : ''}`}
                onClick={() =>
                  setPrefs((p) => ({ ...p, metronomeEnabled: !p.metronomeEnabled }))
                }
                title="Metrónomo de partitura (M)"
              >
                Metrónomo {prefs.metronomeEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                className={`chip-btn ${transposeSt !== 0 || drawer === 'transpose' ? 'is-active' : ''}`}
                onClick={() =>
                  setDrawer((d) => (d === 'transpose' ? 'none' : 'transpose'))
                }
              >
                Tono {transposeSt === 0 ? '0' : transposeSt > 0 ? `+${transposeSt}` : transposeSt}
              </button>

              <button
                type="button"
                className={`chip-btn ${drawer === 'mixer' ? 'is-active' : ''}`}
                onClick={() => setDrawer((d) => (d === 'mixer' ? 'none' : 'mixer'))}
              >
                Mezclador
              </button>

              <button
                type="button"
                className={`chip-btn ${drawer === 'settings' ? 'is-active' : ''}`}
                onClick={() => setDrawer((d) => (d === 'settings' ? 'none' : 'settings'))}
              >
                Zoom {prefs.zoomPct}% · Ajustes
              </button>

              {activeTrack && !activeTrack.isPercussion && (
                <button
                  type="button"
                  className={`chip-btn ${showLiveInstrument ? 'is-active' : ''}`}
                  onClick={() => setShowLiveInstrument((s) => !s)}
                >
                  {activeTrack.family === 'keyboard' ? 'Teclado en vivo' : 'Diapasón en vivo'}
                </button>
              )}

              <button
                type="button"
                className={`chip-btn ${showChordPro ? 'is-active' : ''}`}
                onClick={() => setShowChordPro((s) => !s)}
              >
                Acordes / Capo
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
          </div>
        </footer>
      </div>
    </>
  );
}
