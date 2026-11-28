# Spec 010 — Gimnasio Procedimental de Escalas, Modos, Arpegios y Ejemplos de Fábrica

- **ID:** `010`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Música (nuevo `src/core/music/scales.ts`), Núcleo Tablaturas (nuevos `src/core/tabs/scale-generator.ts`, `factory-examples.ts`), UI Móvil/PC (`src/components/tabs/ScaleGym.tsx`), Biblioteca ([Spec 009](./009-reproductor-practica-y-biblioteca-byot.md))
- **Depende de:** [Spec 002](./002-afinaciones.md) (`spelling.ts`, `tunings.ts`), [Spec 003](./003-acordes.md) (`intervals.ts`, `chords.ts`) y [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md) (`ScoreDocument`, `PPQ = 960`)
- **Origen:** traduce íntegro [`anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md`](../anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md) y **§2.2 / Fase 2** del [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md).

---

## 1. Problema / Motivación

1. Al abrir la app por primera vez, la biblioteca BYOT está vacía si el usuario no trae archivos propios. Incluir canciones comerciales con copyright es inviable legalmente y guardar decenas de binarios pesados infla la PWA y el APK.
2. Muchos músicos necesitan estudiar modos griegos, menor armónica/melódica, escalas simétricas y arpegios en afinaciones alternativas (como *Drop D*, *E♭*, 7 cuerdas o bajo de 4/5 cuerdas) sin depender de tablas rígidas codificadas a mano solo para guitarra estándar.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Flujo y dos puntos de acceso

1. **Ejemplos Curados de Fábrica (16 ítems en la Biblioteca):** disponibles desde el primer segundo, generados al vuelo desde definiciones declarativas (`< 5 KB` en el *bundle*, cero archivos binarios estáticos) y etiquetados como `Fábrica / Práctica`:
   1. Calentamiento Cromático `1-2-3-4` (Púa alterna + Batería, `4/4 · 90 BPM`)
   2. Pentatónica Menor de La (Caja 1 + Backing Rock, `4/4 · 100 BPM`)
   3. Escala de Blues de Mi Menor (Con Bends y Slides, `4/4 · 95 BPM`)
   4. Modo Jónico — Do Mayor (3 Notas por Cuerda, `4/4 · 110 BPM`)
   5. Modo Dórico en Re (Grupos de 3 notas + Vamp Dm7, `4/4 · 105 BPM`)
   6. Modo Frigio en Mi (Patrón por terceras + Drone Em, `4/4 · 110 BPM`)
   7. Modo Lidio en Fa (Ascendente/Descendente + Drone Fmaj7♯11, `4/4 · 100 BPM`)
   8. Modo Mixolidio en Sol (Grupos de 4 notas + Vamp G7, `4/4 · 115 BPM`)
   9. Modo Eólico en La Menor (Legato 3NPS, `4/4 · 120 BPM`)
   10. Modo Locrio en Si (Posición fija + Drone Bm7♭5, `4/4 · 95 BPM`)
   11. Menor Armónica en La (Secuencia neoclásica *Pedal Tone*, `4/4 · 125 BPM`)
   12. Frigio Dominante en Mi (Estudio Flamenco / Metal, `4/4 · 115 BPM`)
   13. Menor Melódica en Do (Estudio Jazz Corcheas, `4/4 · 110 BPM`)
   14. Arpegios de Tríadas Mayor/Menor (*Sweep Picking* 3 y 5 cuerdas, `4/4 · 100 BPM`)
   15. Progresión de Arpegios Cuatríadas II–V–I (`Dm7 → G7 → Cmaj7`, `4/4 · 100 BPM`)
   16. **Groove Dórico y Arpegios en Bajo de 4 Cuerdas** (`4/4 · 100 BPM`) — permite probar el filtro *Bajo* desde el día uno.
2. **Sección «Gimnasio de Escalas y Arpegios» (`#/tablaturas/escalas`):**
   - Selectores de **Categoría**, **Escala/Arpegio**, **Tonalidad**, **Instrumento/Afinación** (`Spec 002`), **Sistema de Digitación**, **Posición**, **Patrón melódico**, **Figura rítmica**, **Articulación**, **Tempo (BPM)** y **Acompañamiento opcional**.
   - Vista previa instantánea del diapasón coloreado por grados y fórmula escrita (`1 2 ♭3 4 5 6 ♭7`) más notas ortográficas reales derivadas vía `intervals.ts` y `spelling.ts`.
   - Acciones directas: **«Practicar ahora»** (abre un `ScoreDocument` en memoria directo en Modo Práctica con bucle automático opcional), **«Guardar en Mi Biblioteca»** (persiste en `IndexedDB` para Setlists) y **«Abrir en Editor»** (copia editable en Modo Edición).

- **Comportamiento en celular (`< 900px`):** vista vertical con diagrama previo compacto arriba y selectores debajo.
- **Comportamiento en escritorio (`>= 900px`):** consola de configuración a la izquierda y vista previa interactiva del diapasón + ficha teórica a la derecha.
- **Persistencia / Estado:** `localStorage` (`endurend_scale_gym`) guarda última escala/arpegio, tonalidad, instrumento/afinación, sistema, figura y tempo. Por defecto: Guitarra 6 · Estándar, La menor pentatónica, Caja Posición 1, `100 BPM`.

### 2.2 Base teórica exacta y algoritmos determinísticos (Cero IA)

1. **Catálogo de Escalas, Modos y Arpegios (`src/core/music/scales.ts`):**
   - **7 Modos Griegos (Diatónica):**
     - Jónico (`[0, 2, 4, 5, 7, 9, 11]` · `1 2 3 4 5 6 7` · caract. `4, 7`)
     - Dórico (`[0, 2, 3, 5, 7, 9, 10]` · `1 2 ♭3 4 5 6 ♭7` · caract. `6`)
     - Frigio (`[0, 1, 3, 5, 7, 8, 10]` · `1 ♭2 ♭3 4 5 ♭6 ♭7` · caract. `♭2`)
     - Lidio (`[0, 2, 4, 6, 7, 9, 11]` · `1 2 3 ♯4 5 6 7` · caract. `♯4`)
     - Mixolidio (`[0, 2, 4, 5, 7, 9, 10]` · `1 2 3 4 5 6 ♭7` · caract. `♭7`)
     - Eólico (`[0, 2, 3, 5, 7, 8, 10]` · `1 2 ♭3 4 5 ♭6 ♭7` · caract. `♭6`)
     - Locrio (`[0, 1, 3, 5, 6, 8, 10]` · `1 ♭2 ♭3 4 ♭5 ♭6 ♭7` · caract. `♭2, ♭5`)
   - **Menor Armónica y modos clave:** Menor Armónica (`[0, 2, 3, 5, 7, 8, 11]`), Frigio Dominante (`[0, 1, 4, 5, 7, 8, 10]`), Lidio ♯2 (`[0, 3, 4, 6, 7, 9, 11]`), Superlocrio 𝄫7 / Alterada Armónica (`[0, 1, 3, 4, 6, 8, 9]`).
   - **Menor Melódica (ascendente) y modos clave:** Menor Melódica (`[0, 2, 3, 5, 7, 9, 11]`), Dórico ♭2 (`[0, 1, 3, 5, 7, 9, 10]`), Lidio Aumentado (`[0, 2, 4, 6, 8, 9, 11]`), Lidio Dominante (`[0, 2, 4, 6, 7, 9, 10]`), Mixolidio ♭6 (`[0, 2, 4, 5, 7, 8, 10]`), Locrio ♮2 (`[0, 2, 3, 5, 6, 8, 10]`), Superlocrio / Alterada (`[0, 1, 3, 4, 6, 8, 10]`).
   - **Pentatónicas, Blues, Exóticas y Simétricas:** Pentatónica Mayor (`[0, 2, 4, 7, 9]`), Pentatónica Menor (`[0, 3, 5, 7, 10]`), Blues Menor (`[0, 3, 5, 6, 7, 10]`), Blues Mayor (`[0, 2, 3, 4, 7, 9]`), Tonos Enteros (`[0, 2, 4, 6, 8, 10]`), Disminuida Tono–Semitono (`[0, 2, 3, 5, 6, 8, 9, 11]`), Disminuida Semitono–Tono (`[0, 1, 3, 4, 6, 7, 9, 10]`), Hirajoshi (`[0, 2, 3, 7, 8]`), Doble Armónica Mayor / Bizantina (`[0, 1, 4, 5, 7, 8, 11]`).
   - **14 Arpegios (Tríadas y Cuatríadas):** `Maj`, `m`, `aug`, `dim`, `sus2`, `sus4`, `Maj7`, `m7`, `7`, `m7♭5`, `dim7`, `mMaj7`, `Maj7♯5` y `9`.
   - *Nota ortográfica:* reutiliza `intervals.ts` / `spelling.ts`; en escalas simétricas/blues de 6 u 8 notas donde se repita una letra genérica (p. ej. `♭3` y `3` en Blues Mayor o `♭5` y `5` en Blues Menor), los grados se etiquetan explícitamente sin exceder doble alteración.
2. **Sistemas de Digitación sobre cualquier `tuningMidis: number[]` (`4–8` cuerdas):**
   - **3 Notas por Cuerda (3NPS):** para escalas de 7 notas, asigna exactamente 3 notas consecutivas por cuerda desde `Posición 1–7`, cuidando una apertura ergonómica (`≤ 5` trastes; en trastes graves propone/desplaza a una octava superior o posición equivalente si la extensión supera el límite).
   - **Cajas / Posición Fija (`CAGED` / `4–5` trastes):** ventana `[minFret, minFret + 4]` con tolerancia de extensión de `1` traste en límites, cubriendo `Posición 1–5`.
   - **2 Octavas desde Tónica:** localiza la tónica más grave disponible en las dos cuerdas más graves dentro de la posición y recorre 2 octavas minimizando saltos de trastes.
   - **Horizontal en Una Sola Cuerda:** trastes `0–22` sobre la cuerda elegida.
   - ***Sweep Picking* (Arpegios de 3, 4 y 5 cuerdas):** 1 nota por cuerda en cuerdas internas y 2 notas con ligado (*hammer-on/pull-off*) en extremos, anotando dirección de púa.
3. **Patrones Melódicos, Rítmica Exacta y Acompañamiento:**
   - **Patrones:** Ascendente+Descendente, Solo Ascendente, Solo Descendente, Por Terceras diatónicas, Grupos de 3 (`(0,1,2), (1,2,3)…`), Grupos de 4 (`(0,1,2,3)…`), *Pedal Tone* (contra tónica o 5ª), *String Skipping* y *Sweep Picking*.
   - **Figuras rítmicas y cierre exacto (`PPQ = 960`):** negras (`1/4`), corcheas (`1/8`), tresillos de corchea (`1/8` en tuplet `3`) y semicorcheas (`1/16`). Si el patrón termina antes de completar el último compás, cierra el compás automáticamente con nota final larga en tónica o silencios exactos para bucle infinito sin cortes rítmicos.
   - **Articulación automática:** Púa alterna, Legato (*H/P* entre notas de la misma cuerda) o *Palm Mute*.
   - **Acompañamiento determinístico opcional (1 clic):** pista de Batería (`Rock 4/4`, `Balada / 8th`, `Tresillo / Shuffle`, `Clic de Hi-Hat`) y pista de **Acorde Pedal (*Modal Drone*) + Bajo** adaptada al modo (ej. `Dm7`/6ª para Dórico, `Fmaj7♯11` para Lidio, `G7` para Mixolidio, `E7♭9` para Frigio Dominante, `Bm7♭5` para Locrio), con mezcla independiente y metadatos `scaleContext`.

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/music/scales.ts` (puro):** catálogo completo, grados característicos y cálculo ortográfico usando `intervals.ts` y `spelling.ts`.
- **`src/core/tabs/scale-generator.ts` y `factory-examples.ts` (puros):** generador de digitaciones, secuencias, cierre matemático de compás en `PPQ = 960` y generación de los 16 ejemplos de fábrica.
- **UI:** `src/components/tabs/ScaleGym.tsx`, enlazado desde `#/tablaturas/escalas` y con los 16 ejemplos precargados automáticamente al inicializar la Biblioteca ([Spec 009](./009-reproductor-practica-y-biblioteca-byot.md)).

---

## 4. Fuera de Alcance

- Generación probabilística, *licks* improvisados o algoritmos con IA/ML (prohibidos).
- Escalas microtonales (cuartos de tono / *maqam* fuera de 12-TET).

---

## 5. Criterios de Aceptación y Tests

- [x] `scales.test.ts`: verificación de vectores de semitonos, grados característicos y ortografía válida (sin triples alteraciones) en todo el catálogo sobre las 17 raíces.
- [x] `scale-fingering.test.ts`: las notas digitadas corresponden exactamente a las clases de altura de la escala/arpegio; orden MIDI ascendente; apertura ergonómica respetada; pruebas en guitarra de 6/7/8 cuerdas (`Estándar`, `Drop D`, `E♭`) y bajo de 4/5 cuerdas.
- [x] `scale-generator.test.ts`: todos los patrones y figuras rítmicas —incluidos los **16 ejemplos curados de fábrica**— producen compases 100% válidos (`validateBarRhythm === 'complete'` en `PPQ = 960`) y `scaleContext` coherente.
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`).
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Generación en memoria en lugar de binarios estáticos:** mantiene el tamaño del *bundle* mínimo (`< 5 KB`) y garantiza los 16 ejemplos disponibles *offline* desde el segundo cero.
2. **Reutilización total de `spelling.ts`, `intervals.ts` y `tunings.ts`:** asegura coherencia teórica absoluta entre Afinador, Diccionario de Acordes y Gimnasio de Escalas en cualquier afinación.
