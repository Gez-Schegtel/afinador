# Spec 014 — Edición Avanzada, Exportadores Universales (.gp / MusicXML / MIDI), Beat-Mapper Manual y Revisiones Diff A/B

- **ID:** `014`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Núcleo Tablaturas (`src/core/tabs/bend-curve.ts`, `score-diff.ts`, `beat-sync.ts`, `src/core/tabs/exporters/`), Audio/DSP (`src/core/dsp/wsola.ts`, `src/audio/sync-audio-player.ts`), Almacenamiento (`src/storage/tabs-db.ts`), UI (`BendEditorModal.tsx`, `DrumPalette.tsx`, `BeatMapperView.tsx`, `DiffViewer.tsx`)
- **Depende de:** [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md), [Spec 009](./009-reproductor-practica-y-biblioteca-byot.md) y [Spec 013](./013-editor-tablaturas-nucleo.md)
- **Origen:** traduce las secciones **§5.1–§5.2 (editores especializados), §6 y Fase 6** de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md).

---

## 1. Problema / Motivación

1. Para cerrar el ciclo completo de un editor profesional estilo Guitar Pro, faltan herramientas avanzadas de escritura (curvas precisas de *Bend/Whammy*, polifonía de `Voz 1 / Voz 2`, kit estándar de batería y editor ChordPro dividido) junto con exportación universal para intercambiar partituras con TuxGuitar, Guitar Pro o MuseScore.
2. Muchos músicos aprenden sobre una grabación real (`.mp3`/`.wav`/`.flac`/`.ogg`) en lugar de depender solo del sintetizador MIDI: hace falta un **sincronizador manual determinístico (sin IA)** con *time-stretching* sin `SharedArrayBuffer` y un **comparador visual/auditivo de revisiones (`Diff A/B`)**.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Editores Especializados

1. **Editor visual de Curva de *Bend / Whammy* (`src/core/tabs/bend-curve.ts`):**
   - Grilla temporal (`0–100%`) vs altura en cuartos de tono (`−4` a `+4`, es decir ±2 tonos) con nodos arrastrables y botones de accesibilidad.
   - Presets de 1 clic: **`1/2`** (+0.5 tono), **`Full`** (+1 tono), **`Release`**, **`Pre-bend`** y **`Hold`**.
2. **Polifonía real de voces (`Voz 1` / `Voz 2`, `Ctrl/Cmd + 1 / 2`):** permite escribir líneas simultáneas independientes (ej. melodía + bajo en *fingerstyle*), atenuando visualmente la voz inactiva. Cada voz tiene su propio semáforo de validación en `PPQ = 960`.
3. **Editor de Kit de Batería:** paleta dedicada con piezas estándar General MIDI (Bombo, Caja, *Rimshot*, *Sidestick*, *Hi-Hat* cerrado/abierto/pedal, Toms, *Crash*, *Ride*, *Bell*, *China*, *Splash*) y etiqueta flotante con el nombre de pieza al navegar verticalmente con `↑`/`↓`.
4. **Editor dividido *Acordes / Letra (`ChordPro`)*:** edición de texto `.cho` en un panel con previsualización en vivo y sincronización bidireccional sobre el `ScoreDocument`.

### 2.2 Exportadores Universales Puros (`src/core/tabs/exporters/`)

Todos funcionan 100% *offline* en el cliente sin servidores ni marcas de agua:
- **Guitar Pro moderno (`.gp` — formato GP7/GP8):** contenedor `.zip` generado con `fflate` incluyendo `VERSION` y `Content/score.gpif` XML válido compatible con Guitar Pro 7/8, TuxGuitar y MuseScore.
- **`MusicXML` (`.musicxml` y `.mxl` comprimido)**.
- **`alphaTex` (`.alphatex`)**.
- **`MIDI` estándar (`.mid` SMF Tipo 1):** codifica divisiones por PPQ, mapa de tempo, cifras de compás, canales por pista y *pitch-bend* derivado de `bendPoints`.
- **`ChordPro` (`.cho`)** y **`.sync.json`**.

### 2.3 Sincronizador Manual de Audio Local (*Beat-Mapper*, Cero IA)

1. Carga un archivo de audio local (`.mp3`, `.flac`, `.ogg`, `.wav`) exclusivamente en memoria/`IndexedDB` (nunca sale del dispositivo) y dibuja su **forma de onda (*waveform*)** en `<canvas>` con zoom.
2. ***Tap-Sync* en vivo:** durante la reproducción, pulsar **`B`** en cada primer tiempo (*downbeat*) planta marcadores numerados de compás.
3. **Ajuste fino determinístico (`src/core/tabs/beat-sync.ts`):** arrastrar líneas sobre la forma de onda, micro-ajustes de `±10 ms` o marcado cada `4`/`8` compases con **interpolación lineal exacta** para los compases intermedios (garantizando monotonicidad temporal).
4. **Reproducción en pantalla dividida con preservación de tono (*WSOLA*):** estiramiento temporal determinístico (`15%–150%`) ejecutado en `AudioWorklet` / *Web Worker* estándar **sin `SharedArrayBuffer`**, junto con deslizador de mezcla **Audio de Referencia ↔ Sintetizador** dentro del Modo Práctica ([Spec 009](./009-reproductor-practica-y-biblioteca-byot.md)).
5. Guarda y exporta **`.sync.json`** (`[barIndex, timeSeconds]` + hash SHA-256 opcional del archivo de audio para auto-emparejarlo al reabrir).

### 2.4 Historial de Revisiones Local y Comparador A/B (*Diff*)

1. Permite guardar *snapshots* nombrados dentro de `IndexedDB` (*«Corregido solo compases 45–52»*).
2. **Comparador A/B (`src/core/tabs/score-diff.ts`):**
   - Lista cambios globales (metadatos, pistas agregadas/eliminadas, cambios de afinación/tempo/compás).
   - Marca con precisión los **`(trackId, barIndex)` modificados**, resalta visualmente las diferencias nota por nota, permite **audicionar Versión A vs. Versión B compás a compás** y restaurar cualquier revisión anterior mediante una transacción reversible del Command Bus ([Spec 013](./013-editor-tablaturas-nucleo.md)).

- **Comportamiento en celular (`< 900px`):** vista de revisión y *Beat-Mapper* adaptadas con botones táctiles (`Tap B`, `−10 ms`, `+10 ms`, zoom de onda) y modales compactos para curvas de bend.
- **Comportamiento en escritorio (`>= 900px`):** pantalla dividida en el *Beat-Mapper* (partitura arriba / forma de onda abajo) y vista paralela o superpuesta A/B en Comparador de Revisiones.
- **Persistencia / Estado:** *snapshots* de revisiones y mapeos `.sync.json` en `IndexedDB` (`endurend_tabs_db`).

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/dsp/wsola.ts` (puro):** implementación sin asignaciones por cuadro en tiempo real de *Waveform Similarity Overlap-Add* (WSOLA) en `Float32Array`/`Float64Array`, 100% testeable en Node con Vitest y portable a un `AudioWorklet` dedicado sin `SharedArrayBuffer`.
- **`src/core/tabs/exporters/*` (puros):** generadores independientes del DOM (`gp-exporter.ts`, `musicxml-exporter.ts`, `midi-exporter.ts`, `alphatex-exporter.ts`) validados por *round-trip* contra los importadores de [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md).
- **`src/core/tabs/score-diff.ts`, `beat-sync.ts`, `bend-curve.ts` (puros):** lógica matemática y estructural cubierta íntegramente en Vitest.

---

## 4. Fuera de Alcance

- Detección automática de *beats* o transcripción de audio a tablatura mediante IA/ML o algoritmos probabilísticos (todo marcado temporal es humano o interpolado linealmente).
- Exportación a formatos cerrados propietarios heredados anteriores a GP7 (solo `.gp` moderno GP7/GP8 ZIP+GPIF).

---

## 5. Criterios de Aceptación y Tests

- [x] `bend-curve.test.ts`: validación de puntos ordenados en `[0, 100]`, rango `[−4, +4]` en cuartos de tono y generación exacta de los 5 presets (`1/2`, `Full`, `Release`, `Pre-bend`, `Hold`).
- [x] `exporters.test.ts`: pruebas de ida y vuelta (*round-trip*): exportar un `ScoreDocument` multipista (guitarra con *bends* y dos voces + bajo + batería) a `.gp`, `.musicxml`, `.alphatex` y `.mid` y reimportarlo conservando compases, notas, alturas, duraciones `PPQ = 960` y afinaciones.
- [x] `beat-sync.test.ts`: interpolación lineal cada `4`/`8` compases, rechazo o reordenamiento ante marcas no monótonas y conversión exacta `tiempo ↔ compás`.
- [x] `wsola.test.ts`: estiramiento temporal a `0.5×`, `0.75×` y `1.25×` sobre senoides/tonos armónicos manteniendo la frecuencia fundamental intacta (`< 2 cents` de desvío) y cero `NaN`/`Infinity`.
- [x] `score-diff.test.ts`: detección exacta de compases idénticos vs. modificados entre dos revisiones A/B y cálculo correcto de resumen global.
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`) de *Beat-Mapper*, editor de *Bends*, kit de batería y Comparador A/B.
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **WSOLA en `AudioWorklet` estándar sin `SharedArrayBuffer`:** cumple la restricción crítica de funcionar igual en GitHub Pages, PWA instalada y Android WebView.
2. **Exportación `.gp` moderna basada en GPIF + ZIP (`fflate`):** formato documentado, basado en XML, interoperable directamente con Guitar Pro 7/8, TuxGuitar y MuseScore sin ingeniería inversa binaria frágil.
