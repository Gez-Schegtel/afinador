import { HeaderSubtitle } from '../shell/AppShell';

/** Sección Metrónomo (Spec 004). */
export function MetronomeSection() {
  return (
    <>
      <HeaderSubtitle>Compases simples, compuestos e irregulares</HeaderSubtitle>
      <section className="panel-card section-placeholder" aria-live="polite">
        <span className="calibration-label">METRÓNOMO</span>
        <p className="idle-hint">Disponible próximamente.</p>
      </section>
    </>
  );
}

export default MetronomeSection;
