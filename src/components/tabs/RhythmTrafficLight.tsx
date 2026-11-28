// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Indicador de semáforo rítmico por compás con diagnóstico PPQ = 960 y botón
 * de completado determinístico con silencios mínimos (Spec 013).
 */

import { inspectVoiceRhythm } from '../../core/tabs/rest-completion';
import type { ScoreBar, TimeSignature } from '../../core/tabs/model';

interface RhythmTrafficLightProps {
  barIndex: number;
  bar: ScoreBar;
  voiceIndex: number;
  timeSignature: TimeSignature;
  onCompleteWithRests: () => void;
}

export function RhythmTrafficLight({
  barIndex,
  bar,
  voiceIndex,
  timeSignature,
  onCompleteWithRests,
}: RhythmTrafficLightProps) {
  const voice = bar.voices[voiceIndex];
  const beats = voice?.beats ?? [];
  const report = inspectVoiceRhythm(beats, timeSignature);

  return (
    <div
      className={`rhythm-traffic-light is-${report.status}`}
      role="status"
      aria-label={`Estado rítmico compás ${barIndex + 1}`}
    >
      <span className="rhythm-dot" aria-hidden="true" />
      <span className="rhythm-summary">
        Compás {barIndex + 1} (Voz {voiceIndex + 1}): {report.humanSummary}
      </span>
      {report.status === 'incomplete' && (
        <button
          type="button"
          className="chip-btn is-active"
          onClick={onCompleteWithRests}
        >
          Completar con silencios
        </button>
      )}
    </div>
  );
}
