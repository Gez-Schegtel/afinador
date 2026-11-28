// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Vista interactiva de Acordes, Letras (ChordPro) y Cejilla matemática (Capo 0–12) (Spec 012).
 * Reutiliza íntegramente `ChordDiagram.tsx` y `voicings.ts` de Spec 003 con múltiples
 * posiciones (`< 1 / N >`), 1 o 2 columnas, transposición y auto-scroll regulable.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeShapeChordForCapo,
  describeCapoEffect,
  parseChordSymbol,
  transposeChordSymbol,
} from '../../core/music/capo';
import type { ChordProDocument } from '../../core/music/chordpro';
import { chordPitchClasses } from '../../core/music/chords';
import {
  defaultSharpPitchName,
  formatPitchName,
  mod12,
  pitchClassOf,
  spellMidi,
  spelledToMidi,
  type SpelledNote,
} from '../../core/music/spelling';
import { generateVoicings } from '../../core/music/voicings';
import { ChordDiagram } from '../chords/ChordDiagram';

interface ChordProViewProps {
  chordProDoc: ChordProDocument;
  tuning: readonly SpelledNote[];
  leftHanded?: boolean;
  onChangeLeftHanded?: (left: boolean) => void;
}

const STORAGE_CHORDPRO_PREFS = 'endurend_chordpro_prefs';

function loadColsPref(): 1 | 2 {
  try {
    return localStorage.getItem(STORAGE_CHORDPRO_PREFS) === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

export function ChordProView({
  chordProDoc,
  tuning,
  leftHanded = false,
  onChangeLeftHanded,
}: ChordProViewProps) {
  const [transposeSt, setTransposeSt] = useState(0);
  const [capo, setCapo] = useState(chordProDoc.capo);
  const [preferFlats, setPreferFlats] = useState(false);
  const [columns, setColumns] = useState<1 | 2>(loadColsPref);
  const [autoScrollPx, setAutoScrollPx] = useState(0); // 0 = detenido
  const [voicingIndices, setVoicingIndices] = useState<Record<string, number>>({});

  const lyricsBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCapo(chordProDoc.capo);
  }, [chordProDoc.capo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHORDPRO_PREFS, String(columns));
    } catch {
      // Ignorar
    }
  }, [columns]);

  // Auto-scroll regulable con RAF
  useEffect(() => {
    if (autoScrollPx <= 0) return;
    let rafId = 0;
    let lastTs = performance.now();
    let carry = 0;
    const step = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      carry += autoScrollPx * dt;
      if (carry >= 1 && lyricsBoxRef.current) {
        const px = Math.floor(carry);
        carry -= px;
        lyricsBoxRef.current.scrollTop += px;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [autoScrollPx]);

  const tuningMidis = useMemo(() => tuning.map(spelledToMidi), [tuning]);

  const chordDiagrams = useMemo(() => {
    return chordProDoc.uniqueChords.map((rawSymbol) => {
      const transposedSounding = transposeChordSymbol(rawSymbol, transposeSt, preferFlats);
      const shapedSymbol = computeShapeChordForCapo(transposedSounding, capo, preferFlats);
      const parsed = parseChordSymbol(shapedSymbol);
      const voicings =
        parsed?.quality && tuningMidis.length >= 4
          ? generateVoicings(tuningMidis, parsed.root, parsed.quality)
          : [];
      return {
        rawSymbol,
        soundingSymbol: transposedSounding,
        shapedSymbol,
        parsed,
        voicings,
      };
    });
  }, [chordProDoc.uniqueChords, transposeSt, preferFlats, capo, tuningMidis]);

  const transposedKey = chordProDoc.key
    ? transposeChordSymbol(chordProDoc.key, transposeSt, preferFlats)
    : '';

  return (
    <div className="panel-card chordpro-panel">
      <div className="tabs-toolbar">
        <div>
          <strong>Vista Acordes y Letras (ChordPro + Capo)</strong>
          <div className="tuning-changes">{describeCapoEffect(transposedKey, capo)}</div>
        </div>

        <div className="tabs-toolbar-actions">
          <label className="tabs-theme-label">
            <span>Capo</span>
            <select
              className="target-select tabs-theme-select"
              value={capo}
              onChange={(e) => setCapo(Number(e.target.value))}
              aria-label="Cejilla Capo"
            >
              {Array.from({ length: 13 }, (_, c) => (
                <option key={c} value={c}>
                  {c === 0 ? 'Sin capo (0)' : `Traste ${c}`}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="chip-btn"
            onClick={() => setTransposeSt((t) => Math.max(-12, t - 1))}
          >
            -1 st
          </button>
          <span className="origin-badge">
            Tono {transposeSt > 0 ? `+${transposeSt}` : transposeSt} st
          </span>
          <button
            type="button"
            className="chip-btn"
            onClick={() => setTransposeSt((t) => Math.min(12, t + 1))}
          >
            +1 st
          </button>

          <button
            type="button"
            className={`chip-btn ${preferFlats ? 'is-active' : ''}`}
            onClick={() => setPreferFlats((p) => !p)}
          >
            {preferFlats ? 'Bemoles ♭' : 'Sostenidos ♯'}
          </button>

          <button
            type="button"
            className={`chip-btn ${columns === 2 ? 'is-active' : ''}`}
            onClick={() => setColumns((c) => (c === 1 ? 2 : 1))}
          >
            {columns === 2 ? '2 Columnas' : '1 Columna'}
          </button>

          {onChangeLeftHanded && (
            <button
              type="button"
              className={`chip-btn ${leftHanded ? 'is-active' : ''}`}
              onClick={() => onChangeLeftHanded(!leftHanded)}
            >
              Zurdo
            </button>
          )}

          <label className="tabs-theme-label">
            <span>Auto-scroll {autoScrollPx > 0 ? `${autoScrollPx}px/s` : 'Off'}</span>
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={autoScrollPx}
              onChange={(e) => setAutoScrollPx(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {/* Banco interactivo de diagramas del Spec 003 */}
      {chordDiagrams.length > 0 && (
        <div className="chordpro-diagrams-strip">
          {chordDiagrams.map((item) => {
            const idx = item.voicings.length > 0
              ? (voicingIndices[item.shapedSymbol] ?? 0) % item.voicings.length
              : 0;
            const voicing = item.voicings[idx];
            const rootPc = item.parsed ? pitchClassOf(item.parsed.root) : 0;
            const chordPcs =
              item.parsed?.quality ? chordPitchClasses(item.parsed.root, item.parsed.quality) : [];
            void chordPcs;

            return (
              <div key={item.rawSymbol} className="chord-info-card chordpro-diagram-card">
                <div className="tabs-toolbar">
                  <strong>{item.shapedSymbol}</strong>
                  {capo > 0 && item.soundingSymbol !== item.shapedSymbol && (
                    <span className="origin-badge">Suena {item.soundingSymbol}</span>
                  )}
                </div>

                {voicing ? (
                  <>
                    <div className={leftHanded ? 'is-lefthanded-diagram' : undefined}>
                      <ChordDiagram
                        frets={voicing.frets}
                        labels={voicing.midis.map((m) =>
                          m === null ? null : formatPitchName(spellMidi(m, defaultSharpPitchName(m)))
                        )}
                        rootStrings={voicing.midis.map(
                          (m) => m !== null && mod12(m) === rootPc
                        )}
                        barre={voicing.barre}
                        ariaLabel={`${item.shapedSymbol}`}
                      />
                    </div>
                    <div className="voicing-pager">
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={item.voicings.length <= 1}
                        onClick={() =>
                          setVoicingIndices((prev) => ({
                            ...prev,
                            [item.shapedSymbol]:
                              (idx - 1 + item.voicings.length) % item.voicings.length,
                          }))
                        }
                      >
                        &lt;
                      </button>
                      <span className="tuning-changes">
                        {idx + 1} / {item.voicings.length}
                      </span>
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={item.voicings.length <= 1}
                        onClick={() =>
                          setVoicingIndices((prev) => ({
                            ...prev,
                            [item.shapedSymbol]: (idx + 1) % item.voicings.length,
                          }))
                        }
                      >
                        &gt;
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="tuning-changes">Cifrado: {item.shapedSymbol}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Líneas de acordes y letra */}
      <div
        ref={lyricsBoxRef}
        className={`chordpro-lyrics-sheet ${columns === 2 ? 'cols-2' : ''}`}
      >
        {chordProDoc.lines.length === 0 ? (
          <p className="tuning-changes">
            Esta partitura no contiene cifrado de acordes ni letra. Agregá cifrados con el Modo Edición
            o abrí un archivo `.cho` desde la Biblioteca.
          </p>
        ) : (
          chordProDoc.lines.map((line, i) => {
            if (line.sectionType === 'comment') {
              return (
                <p key={i} className="chordpro-comment">
                  ▸ {line.comment}
                </p>
              );
            }

            // Construir línea superior de cifrados alineada por columna monoespaciada
            let chordLine = '';
            for (const c of line.chords) {
              const displaySym = computeShapeChordForCapo(
                transposeChordSymbol(c.symbol, transposeSt, preferFlats),
                capo,
                preferFlats
              );
              const pad = Math.max(0, c.column - chordLine.length);
              chordLine += ' '.repeat(pad) + displaySym + ' ';
            }

            return (
              <div
                key={i}
                className={`chordpro-line ${line.sectionType === 'chorus' ? 'is-chorus' : ''}`}
              >
                {chordLine.trim().length > 0 && (
                  <pre className="chordpro-chords-row">{chordLine}</pre>
                )}
                <pre className="chordpro-lyrics-row">{line.lyrics || ' '}</pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
