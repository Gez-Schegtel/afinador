// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Sincronizador manual de audio local (Beat-Mapper + WSOLA sin SharedArrayBuffer, Spec 014).
 * Cero detección automática por IA: muestra forma de onda en <canvas>, permite Tap-Sync
 * en vivo con tecla `B`, micro-ajuste ±10 ms, mezcla Audio↔Sintetizador y `.sync.json`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SyncAudioPlayer, type DecodedAudioInfo } from '../../audio/sync-audio-player';
import {
  addOrMoveSyncAnchor,
  audioTimeToBarTick,
  barTickToAudioTime,
  createEmptyBeatSyncMap,
  interpolateBeatSyncBars,
  nudgeSyncAnchor,
  parseSyncJson,
  serializeSyncJson,
  type BeatSyncMap,
} from '../../core/tabs/beat-sync';
import type { ScoreDocument } from '../../core/tabs/model';

interface BeatMapperViewProps {
  doc: ScoreDocument;
  initialSyncMap: BeatSyncMap | null;
  onSaveSyncMap: (map: BeatSyncMap) => Promise<void>;
  onSynthControl?: (opts: { playing: boolean; tick: number; speedRatio: number; synthVol: number }) => void;
}

export function BeatMapperView({
  doc,
  initialSyncMap,
  onSaveSyncMap,
  onSynthControl,
}: BeatMapperViewProps) {
  const [syncMap, setSyncMap] = useState<BeatSyncMap>(
    () => initialSyncMap ?? createEmptyBeatSyncMap(doc.id)
  );
  const [audioInfo, setAudioInfo] = useState<DecodedAudioInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedPct, setSpeedPct] = useState(100);
  const [crossfadeAudioPct, setCrossfadeAudioPct] = useState(75); // 100 = solo audio local, 0 = solo synth
  const [waveZoom, setWaveZoom] = useState(1);
  const [selectedBar, setSelectedBar] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const playerRef = useRef<SyncAudioPlayer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const syncInputRef = useRef<HTMLInputElement | null>(null);
  const currentTimeRef = useRef(0);
  const selectedBarRef = useRef(selectedBar);
  selectedBarRef.current = selectedBar;

  useEffect(() => {
    setSyncMap(initialSyncMap ?? createEmptyBeatSyncMap(doc.id));
  }, [doc.id, initialSyncMap]);

  useEffect(() => {
    const player = new SyncAudioPlayer({
      onPosition: (t) => {
        currentTimeRef.current = t;
        setCurrentTimeSec(t);
      },
      onEnded: () => setIsPlaying(false),
    });
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ratio = speedPct / 100;
    const audioVol = crossfadeAudioPct / 100;
    const synthVol = (100 - crossfadeAudioPct) / 100;
    playerRef.current?.setSpeed(ratio);
    playerRef.current?.setVolume(audioVol);
    onSynthControl?.({
      playing: isPlaying,
      tick: audioTimeToBarTick(syncMap, doc.masterBars, currentTimeRef.current),
      speedRatio: ratio,
      synthVol,
    });
  }, [speedPct, crossfadeAudioPct, isPlaying, syncMap, doc.masterBars, onSynthControl]);

  // Dibujar waveform + líneas de compás en <canvas>
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#140a19';
    ctx.fillRect(0, 0, w, h);

    if (!audioInfo) {
      ctx.fillStyle = '#d2b98f';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Cargá un archivo de audio local (.mp3 / .wav / .flac / .ogg) para ver la onda', w / 2, h / 2);
      return;
    }

    const pcm = audioInfo.monoSamples;
    const dur = Math.max(0.1, audioInfo.durationSec);
    const windowSec = dur / waveZoom;
    const startSec = Math.max(0, Math.min(dur - windowSec, currentTimeSec - windowSec * 0.25));
    const startSample = Math.floor(startSec * audioInfo.sampleRate);
    const spanSamples = Math.max(1, Math.floor(windowSec * audioInfo.sampleRate));

    ctx.strokeStyle = '#c9a0ea';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx0 = startSample + Math.floor((x / w) * spanSamples);
      const idx1 = Math.min(pcm.length - 1, idx0 + Math.max(1, Math.floor(spanSamples / w)));
      let minV = 1;
      let maxV = -1;
      for (let i = idx0; i <= idx1; i += Math.max(1, Math.floor((idx1 - idx0) / 16))) {
        const s = pcm[i] ?? 0;
        if (s < minV) minV = s;
        if (s > maxV) maxV = s;
      }
      const yTop = ((1 - maxV) / 2) * (h - 20) + 10;
      const yBot = ((1 - minV) / 2) * (h - 20) + 10;
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBot);
    }
    ctx.stroke();

    // Marcadores de compás
    const bars = interpolateBeatSyncBars(syncMap.anchors, doc.masterBars.length);
    bars.forEach((b) => {
      if (b.timeSec < startSec || b.timeSec > startSec + windowSec) return;
      const x = ((b.timeSec - startSec) / windowSec) * w;
      const isAnchor = syncMap.anchors.some((a) => a.barIndex === b.barIndex);
      ctx.strokeStyle = isAnchor ? '#f59e0b' : 'rgba(243,227,195,0.28)';
      ctx.lineWidth = isAnchor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = isAnchor ? '#f59e0b' : '#a98d75';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(b.barIndex + 1), x + 3, 12);
    });

    // Cabezal activo
    const playX = ((currentTimeSec - startSec) / windowSec) * w;
    if (playX >= 0 && playX <= w) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
    }
  }, [audioInfo, currentTimeSec, waveZoom, syncMap, doc.masterBars.length]);

  const tapMarkBeat = useCallback(() => {
    const barIdx = selectedBarRef.current;
    const t = currentTimeRef.current;
    setSyncMap((prev) => addOrMoveSyncAnchor(prev, barIdx, t));
    setSelectedBar((prev) => Math.min(Math.max(0, doc.masterBars.length - 1), prev + 1));
    setStatusMsg(`Anclado Compás ${barIdx + 1} en ${t.toFixed(2)} s.`);
  }, [doc.masterBars.length]);

  // Atajo rápido `B` para Tap-Sync en vivo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        tapMarkBeat();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tapMarkBeat]);

  const handleLoadAudio = async (file: File | undefined) => {
    if (!file || !playerRef.current) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = await playerRef.current.loadAudioBytes(bytes, file.name);
    setAudioInfo(info);
    setSyncMap((prev) => ({ ...prev, audioFileName: file.name }));
    setStatusMsg(`Audio cargado localmente (${info.fileName}, ${info.durationSec.toFixed(1)} s). Nunca sale de tu dispositivo.`);
  };

  const handleDownloadSyncJson = () => {
    const blob = new Blob([serializeSyncJson(syncMap)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\w-]+/g, '_') || 'tab'}.sync.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const interpolated = useMemo(
    () => interpolateBeatSyncBars(syncMap.anchors, doc.masterBars.length),
    [syncMap.anchors, doc.masterBars.length]
  );

  return (
    <section className="panel-card beatmapper-panel" aria-label="Beat-Mapper Manual y WSOLA">
      <div className="tabs-toolbar">
        <div>
          <strong>Beat-Mapper Manual + WSOLA (Sin SharedArrayBuffer · Cero IA)</strong>
          <div className="tuning-changes">
            Pulsá <strong>B</strong> en tiempo real en cada compás, ajustá ±10 ms y mezclá Audio↔Sintetizador.
          </div>
        </div>
        <div className="tabs-toolbar-actions">
          <input
            ref={audioInputRef}
            type="file"
            hidden
            accept=".mp3,.wav,.flac,.ogg,audio/*"
            onChange={(e) => {
              void handleLoadAudio(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" className="chip-btn is-active" onClick={() => audioInputRef.current?.click()}>
            Cargar Audio (.mp3/.wav)
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => void onSaveSyncMap(syncMap).then(() => setStatusMsg('Sincronización guardada en IndexedDB.'))}
          >
            Guardar Sync
          </button>
          <button type="button" className="chip-btn" onClick={handleDownloadSyncJson}>
            Exportar .sync.json
          </button>
          <input
            ref={syncInputRef}
            type="file"
            hidden
            accept=".json,.sync.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const parsed = parseSyncJson(await f.text());
                setSyncMap(parsed);
                setStatusMsg('Archivo .sync.json importado.');
              } catch (err) {
                setStatusMsg(err instanceof Error ? err.message : 'Error leyendo .sync.json');
              }
            }}
          />
          <button type="button" className="chip-btn" onClick={() => syncInputRef.current?.click()}>
            Importar .sync.json
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="beatmapper-waveform"
        width={900}
        height={130}
        onClick={(e) => {
          if (!audioInfo) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
          const win = audioInfo.durationSec / waveZoom;
          const start = Math.max(0, Math.min(audioInfo.durationSec - win, currentTimeSec - win * 0.25));
          const targetSec = Math.max(0, Math.min(audioInfo.durationSec, start + frac * win));
          currentTimeRef.current = targetSec;
          setCurrentTimeSec(targetSec);
          playerRef.current?.seek(targetSec);
        }}
      />

      <div className="practice-tools-row">
        <div className="tabs-toolbar-actions">
          <button
            type="button"
            className={`chip-btn ${isPlaying ? 'is-active' : ''}`}
            disabled={!audioInfo}
            onClick={() => {
              if (!playerRef.current) return;
              if (isPlaying) {
                playerRef.current.pause();
                setIsPlaying(false);
              } else {
                void playerRef.current.play().then(() => setIsPlaying(true));
              }
            }}
          >
            {isPlaying ? '⏸ Pausar Audio' : '▶ Reproducir Audio'}
          </button>

          <button type="button" className="chip-btn is-active" onClick={tapMarkBeat}>
            Tap Compás {selectedBar + 1} (B)
          </button>

          <button
            type="button"
            className="chip-btn"
            onClick={() => setSyncMap((m) => nudgeSyncAnchor(m, selectedBar, -10))}
          >
            −10 ms
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => setSyncMap((m) => nudgeSyncAnchor(m, selectedBar, 10))}
          >
            +10 ms
          </button>
        </div>

        <div className="tabs-toolbar-actions">
          <label className="tabs-theme-label">
            <span>Compás</span>
            <select
              className="target-select tabs-theme-select"
              value={selectedBar}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setSelectedBar(idx);
                const targetT = barTickToAudioTime(syncMap, doc.masterBars, idx * 3840);
                currentTimeRef.current = targetT;
                setCurrentTimeSec(targetT);
                playerRef.current?.seek(targetT);
              }}
            >
              {interpolated.map((b) => (
                <option key={b.barIndex} value={b.barIndex}>
                  Compás {b.barIndex + 1} ({b.timeSec.toFixed(2)}s)
                </option>
              ))}
            </select>
          </label>

          <label className="tabs-theme-label">
            <span>Velocidad WSOLA ({speedPct}%)</span>
            <input
              type="range"
              min={15}
              max={150}
              step={5}
              value={speedPct}
              onChange={(e) => setSpeedPct(Number(e.target.value))}
            />
          </label>

          <label className="tabs-theme-label">
            <span>Audio {crossfadeAudioPct}% ↔ Synth {100 - crossfadeAudioPct}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={crossfadeAudioPct}
              onChange={(e) => setCrossfadeAudioPct(Number(e.target.value))}
            />
          </label>

          <label className="tabs-theme-label">
            <span>Zoom onda ({waveZoom}×)</span>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={waveZoom}
              onChange={(e) => setWaveZoom(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {statusMsg && <p className="tuning-changes">{statusMsg}</p>}
    </section>
  );
}
