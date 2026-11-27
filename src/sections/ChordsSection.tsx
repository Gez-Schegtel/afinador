import { useCallback, useEffect, useState } from 'react';
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
import { HeaderSubtitle } from '../shell/AppShell';

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
        <section className="panel-card section-placeholder">
          <span className="calibration-label">IDENTIFICAR ACORDE</span>
          <p className="idle-hint">Disponible próximamente.</p>
        </section>
      )}
    </>
  );
}

export default ChordsSection;
