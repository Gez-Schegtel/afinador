# Spec 013 — Modo Edición Estilo Guitar Pro: Command Bus Reversible, Escritura 100% por Teclado y Multipista

- **ID:** `013`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Núcleo Tablaturas (`src/core/tabs/commands.ts`, `history.ts`, `fret-input-buffer.ts`, `rest-completion.ts`, `string-shift.ts`), Audio (feedback de escritura y Web MIDI opcional), UI (`src/components/tabs/ScoreEditor.tsx`, `TrackInspector.tsx`, `RhythmTrafficLight.tsx`)
- **Depende de:** [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md), [Spec 009](./009-reproductor-practica-y-biblioteca-byot.md) y [Spec 012](./012-herramientas-practica-integradas.md)
- **Origen:** traduce las secciones **§1 (Modo Edición), §5 y Fase 5** de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md).

---

## 1. Problema / Motivación

1. Escribir o corregir tablaturas desde la web suele requerir el ratón para cada nota o depender de editores de escritorio propietarios. Un compositor o transcriptor necesita **escritura fluida 100% desde teclado**, *Undo/Redo* confiable y validación rítmica inmediata por compás.
2. Editar directamente mientras se toca en Modo Práctica provoca borrados accidentales; por el contrario, forzar flujos separados hace tedioso corregir un traste equivocado durante el ensayo.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Cambio Instantáneo Práctica ↔ Edición y *Copy-on-Write*

- Botón **«Editar» (`E`)** desde Modo Práctica (`#/tablaturas/practica`) cambia inmediatamente a **Modo Edición (`#/tablaturas/estudio`)** conservando **pista, compás y posición de desplazamiento**.
- Botón **«Volver a Práctica»** oculta paletas de edición, desactiva atajos de escritura y deja listos los cambios para tocar al instante.
- **Protección de orígenes inmutables:** si la pieza proviene de Fábrica ([Spec 010](./010-generador-escalas-modos-arpegios.md)) o de un Catálogo Externo ([Spec 011](./011-catalogos-externos-json.md)), al ejecutar la primera edición se crea automáticamente una **copia editable local en «Mis Tabs»** vinculada a su origen.
- Desde **«Estudio / Crear Tablatura»** también puede crearse una partitura nueva desde cero (eligiendo instrumento, afinación del [Spec 002](./002-afinaciones.md), compás y BPM inicial) o retomar el último borrador editado.

### 2.2 Ergonomía de Escritura y Reglas Rítmicas

1. **Capa ligera de Cursor (*Caret*) `< 16 ms`:** el *Caret* `(track, bar, voice, beat, string)` y el número tecleado se pintan en una capa inmediata sin esperar al re-maquetado del Web Worker de `alphaTab`, evitando pérdida de foco de teclado o cortes del motor de audio.
2. **Buffer numérico de 2 dígitos (`400 ms`, `src/core/tabs/fret-input-buffer.ts`):** pulsar `1` y luego `5` dentro de `400 ms` escribe traste `15`; esperar o mover el cursor (`→`/`←`/`↑`/`↓`) confirma `1`. Valida rango contra los trastes configurados (`0–24`, ampliable a `30`).
3. **Duración persistente (*Sticky Duration*) y navegación fluida:**
   - Las notas nuevas heredan la duración activa hasta ajustarla con `+`/`-`, puntillo (`.`), doble puntillo, silencio (`R`), ligadura (*tie*, `L`) o grupos irregulares (`3`, `5`, `6`, `7`).
   - Pulsar `→` al final del último compás completo crea automáticamente un nuevo compás vacío.
   - `Insert` agrega un pulso antes del cursor; `Supr` borra la nota o pulso seleccionado; escribir en otra cuerda del mismo pulso forma notas simultáneas (acorde).
   - **Movimiento inteligente entre cuerdas (`Alt + ↑ / ↓`, `src/core/tabs/string-shift.ts`):** traslada la nota a la cuerda adyacente recalculando el traste necesario para **conservar la altura MIDI exacta** (si no existe traste válido en el diapasón, mantiene estado e informa sin corromper el compás).
4. **Semáforo rítmico y completado determinístico (`src/core/tabs/rest-completion.ts`):**
   - Cada compás muestra su estado rítmico: **neutro/verde** (completo en `PPQ = 960`), **ámbar** (incompleto) o **rojo** (excedido). Al pulsar el indicador se abre el diagnóstico exacto (ej. *«Falta 1 corchea / 480 ticks»*).
   - Atajo/botón de **completado determinístico:** rellena los huecos finales de un compás incompleto con la combinación mínima exacta de silencios (descomposición voraz sobre potencias de duración y puntillos en `PPQ = 960`).
5. **Selección por rango y bloques:** `Shift + Flechas` o arrastre con ratón para **cortar, copiar, pegar, duplicar, borrar, transponer o aplicar técnicas en bloque**.
6. **Entradas alternativas y *feedback*:** clic directo en el Diapasón/Teclado en vivo ([Spec 012](./012-herramientas-practica-integradas.md)), botón de **Feedback sonoro al escribir** (dispara la nota vía SoundFont) y soporte progresivo opcional para **Web MIDI** en escritorio (degradación limpia si el navegador/WebView no lo expone).

### 2.3 Disposición de Pantalla, Paleta Contextual y Gestor Multipista

1. **Barra superior de Documento:** Título editable, botón **«Volver a Práctica»**, indicador de autoguardado (*debounced* `1.5 s` en `IndexedDB`), **Deshacer (`Ctrl/Cmd+Z`) / Rehacer (`Ctrl/Cmd+Y`)**, **Play desde cursor (`Espacio`)**, botón de **Feedback sonoro**, indicador clicable del **Semáforo de Compases** y botón **Exportar**.
2. **Panel izquierdo compacto (Paleta Contextual adaptada a Cuerdas / Batería / Teclado):**
   - **Ritmo:** redonda a semifusa, puntillo, doble puntillo, silencio, ligadura (*tie*), grupos irregulares (`3`, `5`, `6`, `7`).
   - **Técnicas esenciales:** *Hammer/Pull* (`H`), *Slide* (`S` — legato, shift, in/out), *Vibrato* (`V` / wide vibrato), *Palm Mute* (`P`), *Let Ring*, *Dead Note* (`X`), *Ghost Note* (`G`), *Armónicos* (`N` natural / artificial / pinch / tap), *Tapping*, *Slap/Pop*, *Grace Note*, *Staccato*, *Acento*, *Marcato*, *Dirección de púa*, *Brush/Arpeggio*, *Tremolo Picking*, *Trino* y *Dinámicas (`ppp`–`fff`, crescendo/decrescendo)*.
   - **Estructura:** cifra de compás, tempo (BPM), armadura de clave, repeticiones (`xN`), casillas (`1.`, `2.`), *D.C./D.S./Coda*, etiqueta de sección, diagrama de acorde sobre pulso (`A`), letra bajo pulso y marcador manual de cambio de pista.
3. **Panel inferior / lateral de Pistas e Inspector:** agregar, duplicar, reordenar y eliminar pistas; programa General MIDI, modo percusión, `4–8` cuerdas, afinación cuerda por cuerda (integrado con el catálogo de [Spec 002](./002-afinaciones.md)) y cejilla (`Capo`).

- **Comportamiento en celular (`< 900px`):** aunque la edición profunda está pensada para teclado en PC, en móvil ofrece teclado numérico táctil de trastes (`0–24`), botones rápidos de duración y técnicas esenciales en barra inferior para correcciones rápidas en ensayo.
- **Comportamiento en escritorio (`>= 900px`):** interfaz completa de 3 áreas (barra superior, paleta izquierda compacta + lienzo central con *Caret*, inspector inferior/lateral de pistas) dentro del chasis expandido `1380px`.
- **Persistencia / Estado:** autoguardado continuo en `IndexedDB` (`1.5 s` de debounce) + historial reversible en memoria por sesión de edición.

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/tabs/commands.ts` + `history.ts` (puros):** patrón *Command* estricto (`execute(doc)`, `undo(doc)` y `BatchCommand`) como única capa autorizada para mutar `ScoreDocument`.
- **`src/core/tabs/fret-input-buffer.ts`, `rest-completion.ts` y `string-shift.ts`:** funciones puras y determinísticas separadas de React/DOM.
- **`src/components/tabs/ScoreEditor.tsx`:** maneja todos los atajos del mapa de teclado de Edición, suspendidos automáticamente cuando el foco está en `<input>`/`<textarea>`/`<select>`.

---

## 4. Fuera de Alcance

- Editor gráfico de curvas de *Bend/Whammy*, polifonía de `Voz 1 / Voz 2`, editor dedicado de kit de batería y editor ChordPro dividido en vivo ([Spec 014](./014-edicion-avanzada-exportacion-y-beat-mapper.md)).
- Exportadores binarios/XML (`.gp`, `MusicXML`, `.mid`), Beat-Mapper manual y comparador Diff A/B ([Spec 014](./014-edicion-avanzada-exportacion-y-beat-mapper.md)).

---

## 5. Criterios de Aceptación y Tests

- [x] `commands.test.ts`: todas las mutaciones (escribir/borrar nota, cambiar duración, copiar/pegar rango, insertar/eliminar compás, aplicar técnicas en bloque, editar pista) cumplen `undo(execute(doc))` idéntico al estado previo y `redo` restaura exactamente el resultado; prueba de `batch()` para bloques.
- [x] `fret-input-buffer.test.ts`: secuencia `1`→`5` dentro de `400 ms` produce `15`; fuera de `400 ms` produce `1` y luego `5`; rechazo limpio de trastes fuera del rango máximo del instrumento.
- [x] `rest-completion.test.ts`: cualquier hueco en `PPQ = 960` dentro de compases `2/4`, `3/4`, `4/4`, `6/8` y `7/8` se completa con la secuencia mínima exacta de silencios y deja `validateBarRhythm === 'complete'`.
- [x] `string-shift.test.ts`: `Alt+↑/↓` conserva exactamente la nota MIDI en guitarra estándar, *Drop D*, 7/8 cuerdas y bajo; no muta si queda fuera del rango de trastes.
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`).
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Command Bus único para mutaciones:** garantiza que ninguna acción de teclado, ratón, diapasón o Web MIDI pueda romper la integridad rítmica ni dejar fuera de sincronía el historial de `Undo/Redo`.
2. ***Copy-on-write* al editar orígenes externos/fábrica:** protege los presets y catálogos cacheados permitiendo personalizar cualquier ejercicio o tema en 1 clic.
