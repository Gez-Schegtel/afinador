# Spec 012 — Diapasón/Teclado en Vivo, Vista ChordPro con Capo, Afinador Guiado con Tonos de Referencia e Impresión Limpia

- **ID:** `012`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Música (`src/core/music/chordpro.ts`, `capo.ts`), Audio (nuevo `src/audio/reference-tone.ts`), Secciones y UI (`TunerSection.tsx`, `TabsSection.tsx`, `LiveFretboard.tsx`, `VirtualKeyboard.tsx`, `ChordProView.tsx`, `@media print` en `index.css`)
- **Depende de:** [Spec 001](./001-modo-manual-y-consola-desktop.md)–[003](./003-acordes.md), [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md), [Spec 009](./009-reproductor-practica-y-biblioteca-byot.md) y [Spec 010](./010-generador-escalas-modos-arpegios.md). Absorbe e implementa el ítem de backlog «Generador de Tono de Referencia Audible» de `ROADMAP.md`.
- **Origen:** traduce **§4 (Herramientas Musicales Complementarias) y Fase 4** de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md), más **§5** de [`anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md`](../anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md).

---

## 1. Problema / Motivación

1. Al estudiar una tablatura o escala, visualizar qué notas suenan sobre el diapasón (o piano) y entender su rol armónico refuerza la lectura y el oído modal sin cambiar de aplicación.
2. Quienes acompañan con acordes y letra (`.cho` o acordes extraídos de la partitura) necesitan transposición instantánea y cálculo matemático de **cejilla (*Capo*)** con los diagramas ya validados del [Spec 003](./003-acordes.md).
3. El informe maestro proponía implementar un segundo afinador basado en *YIN* dentro del módulo de tablaturas. En *Endurend Musical Gadgets* ya contamos con un motor DSP superior (**`MPMDetector` + `QIFFT` en 64 bits, `< 0.03 cents`**): lo correcto es **conectar la tablatura con nuestro afinador real** sumándole un **Modo Guiado por Pista** y **Tonos de Referencia Audibles**.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Visualizador de Diapasón y Teclado en Tiempo Real

- **Diapasón interactivo (`4–8` cuerdas, trastes `0–24`, marcas de posición, línea de cejilla y afinación de la pista)** o **Piano Virtual** para pistas de teclado; se oculta automáticamente en pistas de batería/percusión. Respeta el **Modo para Zurdos**.
- **En Modo Práctica ([Spec 009](./009-reproductor-practica-y-biblioteca-byot.md)):** ilumina las notas que están sonando sincronizadas al reloj de audio. Cuando el `ScoreDocument` incluye metadatos `scaleContext` ([Spec 010](./010-generador-escalas-modos-arpegios.md)), habilita el interruptor **«Mostrar mapa de escala / Colores por grado»**:
  - **Tónica (`1`)**: color destacado primario;
  - **Notas del acorde base (`3`/`♭3`, `5`, `7`/`♭7`)**: color secundario bien diferenciado;
  - **Nota característica del modo (`6` Dórico, `♯4` Lidio, `♭2` Frigio, etc.)**: borde o acento propio;
  - **Resto de grados de la escala**: guía neutra de fondo con alto contraste sobre la nota en reproducción.
- **En Modo Edición ([Spec 013](./013-editor-tablaturas-nucleo.md)):** hacer clic/toque en cualquier traste o tecla escribe directamente la nota en el cursor activo.

### 2.2 Vista de Acordes, Letras (`ChordPro`) y Cejilla Dinámica (*Capo*)

- **Parser puro (`src/core/music/chordpro.ts`):** interpreta archivos `.cho` (`{title}`, `{artist}`, `{key}`, `{capo}`, `{start_of_chorus}`/`{soc}`, `{comment}`/`{c}`, `[Am7]` alineado sobre la sílaba exacta) y también extrae líneas de acordes y letras desde `ScoreDocument`.
- **Diagramas interactivos reutilizando [Spec 003](./003-acordes.md):** genera y cachea posiciones con `voicings.ts` y `ChordDiagram.tsx` (`○`, `×`, cejillas, traste inicial, digitación `1–4` inferida y selector **`< 1 / N >`** de múltiples posiciones).
- **Cejilla matemática (`Capo 0–12`, `src/core/music/capo.ts`):** al seleccionar `Capo N`, calcula la transposición en semitonos y la ortografía mínima correcta (`Sonando en B♭ · Formas con Capo 1`), actualizando diagramas y cifrado en tiempo real.
- Controles de **Transposición (`♯`/`♭`)**, **Auto-scroll regulable**, diseño en **1 o 2 columnas** y **Modo para zurdos**.

### 2.3 Puente al Afinador Real de Endurend (Modo Guiado + Tonos de Referencia)

> **Integración arquitectónica:** en lugar de duplicar el código de audio con un motor YIN paralelo, toda detección de pitch pasa por `TunerEngine` (`MPMDetector` + `QIFFT` Blackman–Harris, `A4 = 415–466 Hz`).

1. **Modo Guiado por Pista:** al tocar la Insignia de Afinación de una tablatura (o pulsar el atajo `T`), se abre el Afinador (`#/afinador?guided=...` o estado contextual vinculado) preconfigurado con las cuerdas exactas `SpelledNote[]` y `capo` de la pista activa —**tanto si coincide con alguna de las 34 afinaciones del [Spec 002](./002-afinaciones.md) como si es una afinación personalizada de la tablatura**. Muestra la lista de cuerdas de la pista, fija cada cuerda como `forcedMidi` al seleccionarla y marca en verde completada cada cuerda tras sostener **`✓ AFINADO` (`±2.5 cents`)**. Incluye un botón **«Volver a la tablatura»** para retomar la práctica al instante.
2. **Tonos de Referencia Audibles (`src/audio/reference-tone.ts`):** disponibles tanto por cuerda en el Modo Guiado como en el modo Manual estándar de [TunerSection.tsx](file:///home/juani/Documentos/Programación/endurend-tuner/src/sections/TunerSection.tsx). Sintetiza un tono armónico suave de cuerda pulsada mediante Web Audio API calibrado al `A4` vigente (`midiToFrequency(midi, a4Hz)`).
   - **Convivencia estricta:** controlado por `AudioArbitrator` ([Spec 008](./008-motor-tablaturas-y-modelo-canonico.md)); reproducir un tono de referencia pausa automáticamente el micrófono (y activar el micrófono detiene el tono de referencia).

### 2.4 Impresión Vectorial Limpia / PDF (`@media print`)

- Vista de impresión dedicada que oculta chasis, botones, navegación y paneles; renderiza únicamente la partitura (o vista de Acordes/Letra) en **negro vectorial puro sobre blanco**, con selección de pistas, modo (*Solo Tablatura*, *Tablatura + Pentagrama*, *Acordes*), ajuste de sistemas por página y regla `break-inside: avoid` para no partir pentagramas entre hojas al exportar a PDF desde el navegador.

- **Comportamiento en celular (`< 900px`):** Diapasón/Teclado en panel inferior plegable; vista ChordPro en 1 columna con tamaño táctil en las fichas `< 1 / N >`; Modo Guiado integrado sobre la tarjeta `MODO DE AFINACIÓN` del afinador móvil.
- **Comportamiento en escritorio (`>= 900px`):** Diapasón/Teclado acoplado bajo el lienzo sin tapar compases; ChordPro en 1 o 2 columnas con selector de columna y auto-scroll lateral.
- **Persistencia / Estado:** `localStorage` para preferencia de colores por grado, modo zurdo y auto-scroll en ChordPro.

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/music/chordpro.ts` y `capo.ts` (puros):** parseo de `.cho`, alineación de acordes sobre sílabas y transposición de símbolos/raíces preservando la calidad y el bajo (`C/E`).
- **`src/audio/reference-tone.ts`:** osciladores aditivos con envolvente de decaimiento natural y filtro pasa-bajos suave para sonar musical en guitarra y bajo sin archivos grabados. Integrado en `AudioArbitrator`.
- **Extensiones en `TunerSection.tsx` / `TargetNoteControl.tsx`:** aceptar lista temporal de cuerdas personalizadas desde una tablatura (`guidedTuning`) sin sobrescribir la persistencia del catálogo estándar del usuario salvo que lo pida.
- **DSP (`src/core/dsp/`):** **sin modificaciones**; se aprovecha íntegramente `MPMDetector` + `QIFFT` + `PitchSmoother`.

---

## 4. Fuera de Alcance

- Reimplementación de YIN u otro detector de pitch paralelo en `alphaTab` o en módulos separados.
- Exportación directa a `.gp`, `MusicXML`, `MIDI` o editores avanzados de batería/bends ([Spec 014](./014-edicion-avanzada-exportacion-y-beat-mapper.md)).

---

## 5. Criterios de Aceptación y Tests

- [x] `chordpro.test.ts`: parseo de metadatos, estribillos, comentarios y múltiples `[acorde]` en línea preservando posiciones exactas; extracción desde `ScoreDocument`.
- [x] `capo.test.ts`: cálculo de transposición con `Capo 0..12`, conservación de bajos invertidos (`Am7/C` → bajado con capo) y equivalencia MIDI entre nota real y forma pisada.
- [x] `guided-tuning.test.ts`: soporte de afinaciones personalizadas importadas de una tablatura en `TunerSection` sin alterar el catálogo fijo de Spec 002 y seguimiento de cuerdas completadas.
- [x] `reference-tone.test.ts`: cálculo exacto de frecuencia según `A4` (`432 / 440 / 442 Hz`) y exclusión mutua en `AudioArbitrator` respecto del micrófono.
- [x] Verificación visual móvil (`412×915`), escritorio (`1440×900`) y vista de impresión (`emulateMedia({ media: 'print' })`).
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Un único motor afinador en toda la app:** ahorra código, garantiza `< 0.03 cents` de precisión real en graves también al entrar desde una tablatura y mantiene todas las invariantes acústicas de `GEMINI.md` §2.
2. **Síntesis Web Audio pura para Tonos de Referencia:** cero muestras grabadas (`MB` ahorrados en PWA/APK) y respuesta inmediata ante cambios de `A4` en pasos de `0.1 Hz`.
