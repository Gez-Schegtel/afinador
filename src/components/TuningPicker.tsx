// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import {
  INSTRUMENTS,
  TUNING_GROUP_LABELS,
  TUNING_GROUP_ORDER,
  standardTuningFor,
  tuningsForInstrument,
  type InstrumentFamily,
  type InstrumentId,
} from '../core/music/tunings';

const ALL_FAMILIES: readonly InstrumentFamily[] = ['guitar', 'bass'];

interface TuningPickerProps {
  instrumentId: InstrumentId;
  tuningId: string;
  onChange: (instrumentId: InstrumentId, tuningId: string) => void;
  /** Familias de instrumentos ofrecidas (por defecto, guitarra y bajo). */
  families?: readonly InstrumentFamily[];
}

/**
 * Selector Instrumento + Afinación (Spec 002), reutilizable en otras secciones.
 */
export function TuningPicker({
  instrumentId,
  tuningId,
  onChange,
  families = ALL_FAMILIES,
}: TuningPickerProps) {
  const instruments = useMemo(
    () => INSTRUMENTS.filter((inst) => families.includes(inst.family)),
    [families]
  );

  const groupedTunings = useMemo(() => {
    const list = tuningsForInstrument(instrumentId);
    return TUNING_GROUP_ORDER.map((group) => ({
      group,
      label: TUNING_GROUP_LABELS[group],
      tunings: list.filter((t) => t.group === group),
    })).filter((g) => g.tunings.length > 0);
  }, [instrumentId]);

  return (
    <div className="tuning-picker">
      <select
        className="target-select"
        value={instrumentId}
        onChange={(e) => {
          const next = e.target.value as InstrumentId;
          onChange(next, standardTuningFor(next).id);
        }}
        aria-label="Instrumento"
      >
        {instruments.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.label}
          </option>
        ))}
      </select>

      <select
        className="target-select"
        value={tuningId}
        onChange={(e) => onChange(instrumentId, e.target.value)}
        aria-label="Afinación"
      >
        {groupedTunings.map((g) => (
          <optgroup key={g.group} label={g.label}>
            {g.tunings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
