# Especificaciones Funcionales y Técnicas (`docs/specs/`)

Este directorio centraliza el diseño de nuevas funcionalidades y mejoras del proyecto antes de escribir código (**Spec-Driven Development**), asegurando que cada cambio mantenga la precisión del motor DSP, la calidad de la interfaz y la documentación al día.

---

## Convención de Nombres y Ciclo de Vida

1. **Numeración secuencial:** cada especificación se crea como `docs/specs/NNN-nombre-corto.md` (por ejemplo, `002-tono-de-referencia.md`).
2. **Estados posibles:**
   - `Borrador` — Idea inicial o propuesta en discusión.
   - `Aprobado` — Diseño validado y listo para implementar.
   - `En progreso` — En desarrollo y pruebas.
   - `Implementado` — Completado, verificado por tests/build y reflejado en `README.md` y `ROADMAP.md`.

---

## Cómo Proponer una Nueva Funcionalidad

1. Copiá [`000-plantilla.md`](./000-plantilla.md) con el siguiente número correlativo (o pedile a Antigravity / Claude Code: *«Creá el spec 002 para [tu idea]»*).
2. Completá especialmente el **problema que resuelve**, cómo debe verse tanto en **celular** como en **PC**, y las **restricciones de audio/precisión** si aplica.
3. Una vez que el spec pasa a `Aprobado`, se implementa siguiendo sus criterios de aceptación.
4. Al finalizar la implementación:
   - Se marca el spec como `Estado: Implementado`.
   - Se agregan/actualizan los tests en `src/core/` y el build (`npm test -- --run && VITE_BASE_PATH=/afinador/ npm run build && npm run cap:sync`).
   - Se actualizan [`ROADMAP.md`](../../ROADMAP.md) y [`README.md`](../../README.md).

---

## Índice de Especificaciones

| ID | Especificación | Estado | Origen / Notas |
| :---: | :--- | :---: | :--- |
| `001` | [Modo Manual de Largo Alcance y Consola Desktop en 2 Columnas](./001-modo-manual-y-consola-desktop.md) | `Implementado` | — |
| `002` | [Catálogo de Afinaciones por Instrumento (Guitarra 6/7/8 y Bajo 4/5/6)](./002-afinaciones.md) | `Implementado` | Base de ortografía `spelling.ts` y `tunings.ts` |
| `003` | [Diccionario de Acordes con Diagramas y Variantes de Posición](./003-acordes.md) | `Implementado` | — |
| `004` | [Metrónomo con Compases, BPM y Acento del Primer Tiempo](./004-metrónomo.md) | `Implementado` | — |
| `005` | [Identificador de Acordes desde el Mástil (Guitarra y Bajo)](./005-identificador-de-acordes.md) | `Implementado` | — |
| `006` | [Navegación por Secciones (Afinador · Acordes · Metrónomo)](./006-navegacion-por-secciones.md) | `Implementado` | — |
| `007` | [Identidad Visual Endurend Musical Gadgets (Estética Stoner / Psicodélica)](./007-identidad-visual-endurend.md) | `Implementado` | — |
| `008` | [Motor Base de Tablaturas, Activos Estáticos y Modelo Canónico (PPQ = 960)](./008-motor-tablaturas-y-modelo-canonico.md) | `Implementado` | Traduce Fase 0 del [informe maestro](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md) |
| `009` | [Modo Práctica Estilo Songsterr y Biblioteca Local BYOT (IndexedDB)](./009-reproductor-practica-y-biblioteca-byot.md) | `Implementado` | Traduce §2.1, §2.4, §3 y Fase 1 del informe maestro |
| `010` | [Gimnasio Procedimental de Escalas, Modos, Arpegios y Ejemplos de Fábrica](./010-generador-escalas-modos-arpegios.md) | `Implementado` | Traduce el [anexo técnico](../anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md) y Fase 2 |
| `011` | [Catálogos Externos Enchufables (CatalogManifestV1) y Filtro Persistente por Instrumento](./011-catalogos-externos-json.md) | `Implementado` | Traduce §2.3, §2.4 y Fase 3 del informe maestro |
| `012` | [Diapasón/Teclado en Vivo, Vista ChordPro con Capo, Afinador Guiado con Tonos de Referencia e Impresión Limpia](./012-herramientas-practica-integradas.md) | `Implementado` | Traduce §4 y Fase 4 (conecta con el afinador MPM+QIFFT real) |
| `013` | [Modo Edición Estilo Guitar Pro: Command Bus Reversible, Escritura 100% por Teclado y Multipista](./013-editor-tablaturas-nucleo.md) | `Implementado` | Traduce §5 y Fase 5 del informe maestro |
| `014` | [Edición Avanzada, Exportadores Universales (.gp / MusicXML / MIDI), Beat-Mapper Manual y Revisiones Diff A/B](./014-edicion-avanzada-exportacion-y-beat-mapper.md) | `Implementado` | Traduce §5–§6 y Fase 6 del informe maestro |
