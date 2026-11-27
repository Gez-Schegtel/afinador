// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { ChordIdentifier } from '../components/chords/ChordIdentifier';
import {
  ChordDictionary,
  resolveDictionaryState,
  type DictionaryState,
} from '../components/chords/ChordDictionary';
import {
  CHORDS_TAB_LABELS,
  routeToHash,
  type ChordsTab,
} from '../navigation/routes';
import type { ChordReading } from '../core/music/chord-identify';
import { findRootIndex } from '../core/music/chords';
import { findTuning } from '../core/music/tunings';
import { HeaderSubtitle, useAppShell } from '../shell/AppShell';

const STORAGE_DICTIONARY_KEY = 'afinador_chords_dictionary';
const TABS: readonly ChordsTab[] = ['dictionary', 'identify'];

function loadDictionaryState(): DictionaryState {
  try {
    const raw = localStorage.getItem(STORAGE_DICTIONARY_KEY);
    return resolveDictionaryState(raw ? JSON.parse(raw) : null);
  } catch {
    return resolveDictionaryState(null);
  }
}

interface ChordsSectionProps {
  tab: ChordsTab;
}

/** Sección Acordes: Diccionario (Spec 003) e Identificar (Spec 005). */
export function ChordsSection({ tab }: ChordsSectionProps) {
  const [dictionary, setDictionary] = useState<DictionaryState>(loadDictionaryState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DICTIONARY_KEY, JSON.stringify(dictionary));
    } catch {
      // Ignorar si el almacenamiento está restringido
    }
  }, [dictionary]);

  const updateDictionary = useCallback((patch: Partial<DictionaryState>) => {
    setDictionary((prev) => resolveDictionaryState({ ...prev, ...patch }));
  }, []);

  const { navigate } = useAppShell();
  const openInDictionary = useCallback(
    (reading: ChordReading, tuningId: string) => {
      const isGuitar = findTuning(tuningId)?.instrument.startsWith('guitar') ?? false;
      updateDictionary({
        rootIndex: findRootIndex(reading.root),
        qualityId: reading.quality.id,
        ...(isGuitar ? { tuningId } : {}),
      });
      navigate({ section: 'chords', tab: 'dictionary' });
    },
    [navigate, updateDictionary]
  );

  return (
    <>
      <HeaderSubtitle>
        {tab === 'identify'
          ? 'Marcá una forma en el mástil y te digo qué acorde es'
          : 'Diccionario de acordes con digitaciones'}
      </HeaderSubtitle>

      <nav className="sub-tabs" aria-label="Herramientas de acordes">
        {TABS.map((t) => (
          <a
            key={t}
            href={routeToHash({ section: 'chords', tab: t })}
            className={`sub-tab ${tab === t ? 'is-active' : ''}`}
            aria-current={tab === t ? 'page' : undefined}
          >
            {CHORDS_TAB_LABELS[t]}
          </a>
        ))}
      </nav>

      {tab === 'dictionary' ? (
        <ChordDictionary state={dictionary} onChange={updateDictionary} />
      ) : (
        <ChordIdentifier onOpenInDictionary={openInDictionary} />
      )}
    </>
  );
}

export default ChordsSection;
