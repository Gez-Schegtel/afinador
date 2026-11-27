import type { ChordsTab } from '../navigation/routes';
import { HeaderSubtitle } from '../shell/AppShell';

interface ChordsSectionProps {
  tab: ChordsTab;
}

/** Sección Acordes (Specs 003 y 005). */
export function ChordsSection({ tab }: ChordsSectionProps) {
  return (
    <>
      <HeaderSubtitle>Diccionario e identificador de acordes</HeaderSubtitle>
      <section className="panel-card section-placeholder" aria-live="polite">
        <span className="calibration-label">
          {tab === 'identify' ? 'IDENTIFICAR ACORDE' : 'DICCIONARIO DE ACORDES'}
        </span>
        <p className="idle-hint">Disponible próximamente.</p>
      </section>
    </>
  );
}

export default ChordsSection;
