# Spec 002 — Catálogo de Afinaciones por Instrumento (Guitarra 6/7/8 y Bajo 4/5/6)

- **ID:** `002`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Música (`src/core/music/`), UI Móvil/PC (`TargetNoteControl.tsx`, `TunerGauge.tsx`, `App.tsx`, `index.css`), Persistencia (`localStorage`)
- **Depende de:** [Spec 001](./001-modo-manual-y-consola-desktop.md) (modo Manual con nota objetivo `forcedMidi`)
- **Revisa:** la exclusión «Presets de afinaciones alternativas completas» de Spec 001 §4.

> **Pedido original:** «Quiero que el programa tenga una gran colección de [afinaciones]. Afinaciones estándar, dropeadas, abiertas, etc. La idea es que puedas seleccionar una afinación y que te diga a qué nota tenés que llegar con cada cuerda para alcanzarla. Acordate que tiene que funcionar para bajo y podemos agregar compatibilidad con guitarras de 7 y 8 cuerdas. Todo lo que hagas tiene que estar respaldado con teoría musical.»

---

## 1. Problema / Motivación

1. En modo Manual hay que conocer de memoria la **nota y la octava** de cada cuerda en una afinación alternativa. Los accesos rápidos de Spec 001 solo cubren guitarra de 6 cuerdas y bajo de 5 en afinación estándar.
2. Un error frecuente al cambiar de afinación es apuntar a la **octava equivocada** (por ejemplo, subir la 6ª a D3 en vez de bajarla a D2 en *Drop D*), lo que puede romper la cuerda o dejarla floja.
3. Las guitarras de 7 y 8 cuerdas y los bajos de 4, 5 y 6 cuerdas tienen afinaciones propias que hoy no están contempladas.

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Flujo

1. En modo **Manual**, la tarjeta `MODO DE AFINACIÓN` muestra dos selectores: **Instrumento** (Guitarra de 6 / 7 / 8, Bajo de 4 / 5 / 6) y **Afinación**. Las afinaciones se filtran por instrumento y se agrupan en *Estándar y bajadas*, *Drop*, *Abiertas* y *Otras*.
2. Debajo aparece el **resumen** de la afinación:
   - sus notas de la cuerda más grave a la más aguda (p. ej. `D2 A2 D3 G3 B3 E4`);
   - una **descripción** breve (p. ej. `Medio tono abajo`, `Sol mayor al aire`);
   - las **cuerdas que cambian respecto de la estándar** con su desplazamiento (p. ej. `6ª: E2 → D2 (−2 st)`). Si todas las cuerdas se desplazan lo mismo, se resume (`Todas las cuerdas −1 st respecto de la estándar`);
   - **avisos**: `Sube la tensión` cuando alguna cuerda queda por encima de la estándar, o `Requiere juego de cuerdas específico` (afinaciones que usan otro juego, como BEAD o EADGC).
3. Una **fila de botones por cuerda** (`6ª D2`, `5ª A2`, …) reemplaza los accesos rápidos fijos de Guitarra/Bajo de Spec 001. Tocar una cuerda la fija como **nota objetivo**, con el mismo mecanismo `forcedMidi` y la ventana DSP `−11.5 / +5 st`.
4. Los selectores libres **Nota + Octava** de Spec 001 se conservan para objetivos que no pertenecen a la afinación. Las teclas negras se listan con sus dos nombres enarmónicos (`C♯ / D♭`).
5. Al cambiar de afinación o de instrumento: si la nota objetivo actual pertenece a la nueva afinación, se conserva; si no, se selecciona la **cuerda más grave**.
6. El visor muestra la nota objetivo con la **ortografía de la afinación** (p. ej. `E♭` en *Medio tono abajo*, no `D♯`). Para eso se agrega el indicador `♭` en el mismo lugar que el indicador `♯` actual.

- **Comportamiento en celular (`< 900px`):** se mantiene la tarjeta vertical. Instrumento y Afinación van en una grilla de 2 columnas (como Nota/Octava). Los botones de cuerda forman una grilla de hasta 6 columnas; con 7 u 8 cuerdas pasan a 4 columnas (2 filas), sin achicar las áreas táctiles.
- **Comportamiento en escritorio (`>= 900px`):** columna de controles derecha; todas las cuerdas en una sola fila.
- **Persistencia / Estado:** `localStorage` con `afinador_manual_mode` (`'1'`/`'0'`), `afinador_instrument` y `afinador_tuning_id`, además del ya existente `afinador_target_midi`. Valores por defecto: **Automático**, **Guitarra 6 cuerdas · Estándar** y **E2**. Un valor guardado desconocido (por ejemplo, una afinación eliminada del catálogo) cae a la estándar del instrumento.
- Las frecuencias mostradas se recalculan con el `A4` activo.

### 2.2 Base teórica y convenciones

- **Notación científica de altura:** `C4` es el Do central y `A4` la referencia calibrable. `MIDI = 12 · (octava + 1) + clase_de_altura(letra) + alteración`. La octava se asocia a la **letra escrita**: `C♭4` suena como `B3` (MIDI 59) y `B♯3` como `C4` (MIDI 60).
- **Temperamento igual de 12 notas:** `f = A4 · 2^((MIDI − 69) / 12)`.
- **Numeración de cuerdas:** desde la más aguda (`1ª`) hasta la más grave (`6ª`, `7ª`, `8ª` en guitarra; `4ª`, `5ª`, `6ª` en bajo), igual que la convención ya usada en la app. Las afinaciones se escriben de **grave a agudo**, como se nombran (DADGAD).
- **Ortografía:** cada afinación se guarda con nombres escritos (letra + alteración + octava), no solo con números MIDI. Las bajadas de medio tono se escriben con bemoles (`E♭ A♭ D♭ G♭ B♭ E♭`); las afinaciones en C♯ y *Drop C♯*, con sostenidos. Dentro de una misma afinación nunca se mezclan sostenidos y bemoles.
- **Afinaciones *Drop*:** bajan **un tono (2 semitonos)** la cuerda más grave respecto de su afinación base. Así, las tres cuerdas graves forman **fundamental – quinta justa – octava** (7 y 12 semitonos sobre la grave), un acorde de quinta tocable con un solo dedo.
- **Afinaciones abiertas:** las cuerdas al aire forman una tríada: Open D / G / C / E / A (mayores) y Open D menor (menor). **DADGAD** forma `Dsus4` (D, G, A).
- **Bajadas uniformes:** todas las cuerdas bajan la misma cantidad de semitonos, así que se conservan los intervalos de la afinación estándar (4ª justa entre cuerdas, salvo la 3ª mayor G–B de la guitarra).

### 2.3 Catálogo inicial

Notas de grave a agudo. MIDI y desplazamientos verificados por script y luego por tests. `Δ` es la diferencia en semitonos con la estándar del mismo instrumento. La columna «Afinación» muestra el **nombre corto** (el que aparece en el selector) y, tras el `·`, la **descripción** que aparece en el resumen.

| Instrumento | Afinación | Cuerdas | MIDI | Δ vs. estándar | Avisos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Guitarra 6 | Estándar | E2 A2 D3 G3 B3 E4 | 40 45 50 55 59 64 | — | |
| Guitarra 6 | E♭ estándar · medio tono abajo | E♭2 A♭2 D♭3 G♭3 B♭3 E♭4 | 39 44 49 54 58 63 | −1 en todas | |
| Guitarra 6 | D estándar · un tono abajo | D2 G2 C3 F3 A3 D4 | 38 43 48 53 57 62 | −2 en todas | |
| Guitarra 6 | C♯ estándar · tono y medio abajo | C♯2 F♯2 B2 E3 G♯3 C♯4 | 37 42 47 52 56 61 | −3 en todas | |
| Guitarra 6 | C estándar · dos tonos abajo | C2 F2 B♭2 E♭3 G3 C4 | 36 41 46 51 55 60 | −4 en todas | |
| Guitarra 6 | Drop D | D2 A2 D3 G3 B3 E4 | 38 45 50 55 59 64 | 6ª −2 | |
| Guitarra 6 | Drop C♯ | C♯2 G♯2 C♯3 F♯3 A♯3 D♯4 | 37 44 49 54 58 63 | 6ª −3, resto −1 | |
| Guitarra 6 | Drop C | C2 G2 C3 F3 A3 D4 | 36 43 48 53 57 62 | 6ª −4, resto −2 | |
| Guitarra 6 | Drop B | B1 F♯2 B2 E3 G♯3 C♯4 | 35 42 47 52 56 61 | 6ª −5, resto −3 | |
| Guitarra 6 | Doble Drop D | D2 A2 D3 G3 B3 D4 | 38 45 50 55 59 62 | 6ª y 1ª −2 | |
| Guitarra 6 | Open D · Re mayor al aire | D2 A2 D3 F♯3 A3 D4 | 38 45 50 54 57 62 | 6ª −2, 3ª −1, 2ª −2, 1ª −2 | |
| Guitarra 6 | Open D menor · Re menor al aire | D2 A2 D3 F3 A3 D4 | 38 45 50 53 57 62 | 6ª −2, 3ª/2ª/1ª −2 | |
| Guitarra 6 | Open G · Sol mayor al aire | D2 G2 D3 G3 B3 D4 | 38 43 50 55 59 62 | 6ª/5ª/1ª −2 | |
| Guitarra 6 | Open C · Do mayor al aire | C2 G2 C3 G3 C4 E4 | 36 43 48 55 60 64 | 6ª −4, 5ª/4ª −2, **2ª +1** | Sube la tensión |
| Guitarra 6 | Open E · Mi mayor al aire | E2 B2 E3 G♯3 B3 E4 | 40 47 52 56 59 64 | **5ª/4ª +2, 3ª +1** | Sube la tensión |
| Guitarra 6 | Open A · La mayor al aire | E2 A2 E3 A3 C♯4 E4 | 40 45 52 57 61 64 | **4ª/3ª/2ª +2** | Sube la tensión |
| Guitarra 6 | DADGAD · Dsus4 al aire | D2 A2 D3 G3 A3 D4 | 38 45 50 55 57 62 | 6ª/2ª/1ª −2 | |
| Guitarra 7 | Estándar | B1 E2 A2 D3 G3 B3 E4 | 35 40 45 50 55 59 64 | — | |
| Guitarra 7 | B♭ estándar · medio tono abajo | B♭1 E♭2 A♭2 D♭3 G♭3 B♭3 E♭4 | 34 39 44 49 54 58 63 | −1 en todas | |
| Guitarra 7 | A estándar · un tono abajo | A1 D2 G2 C3 F3 A3 D4 | 33 38 43 48 53 57 62 | −2 en todas | |
| Guitarra 7 | Drop A | A1 E2 A2 D3 G3 B3 E4 | 33 40 45 50 55 59 64 | 7ª −2 | |
| Guitarra 8 | Estándar | F♯1 B1 E2 A2 D3 G3 B3 E4 | 30 35 40 45 50 55 59 64 | — | |
| Guitarra 8 | Drop E | E1 B1 E2 A2 D3 G3 B3 E4 | 28 35 40 45 50 55 59 64 | 8ª −2 | |
| Bajo 4 | Estándar | E1 A1 D2 G2 | 28 33 38 43 | — | |
| Bajo 4 | E♭ estándar · medio tono abajo | E♭1 A♭1 D♭2 G♭2 | 27 32 37 42 | −1 en todas | |
| Bajo 4 | D estándar · un tono abajo | D1 G1 C2 F2 | 26 31 36 41 | −2 en todas | |
| Bajo 4 | Drop D | D1 A1 D2 G2 | 26 33 38 43 | 4ª −2 | |
| Bajo 4 | Drop C | C1 G1 C2 F2 | 24 31 36 41 | 4ª −4, resto −2 | |
| Bajo 4 | BEAD · 4 cuerdas graves de un bajo de 5 | B0 E1 A1 D2 | 23 28 33 38 | −5 en todas | Requiere juego específico |
| Bajo 5 | Estándar | B0 E1 A1 D2 G2 | 23 28 33 38 43 | — | |
| Bajo 5 | B♭ estándar · medio tono abajo | B♭0 E♭1 A♭1 D♭2 G♭2 | 22 27 32 37 42 | −1 en todas | |
| Bajo 5 | Drop A | A0 E1 A1 D2 G2 | 21 28 33 38 43 | 5ª −2 | |
| Bajo 5 | EADGC · juego con Do agudo | E1 A1 D2 G2 C3 | 28 33 38 43 48 | +5 en todas | Requiere juego específico |
| Bajo 6 | Estándar | B0 E1 A1 D2 G2 C3 | 23 28 33 38 43 48 | — | |

**Regla de avisos:** «Sube la tensión» se **calcula** (alguna cuerda con `Δ > 0`) salvo en las afinaciones marcadas como «requiere juego específico». En esas, comparar índice a índice con la estándar no tiene sentido porque cambia el juego de cuerdas.

**Límite inferior:** el catálogo se restringe a cuerdas `>= A0` (MIDI 21, 27.5 Hz), coherente con `TARGET_NOTE_MIN_MIDI`, el piso DSP de 25 Hz en Manual y el pasa-altos de 24 Hz. *Drop A* de bajo de 5 cuerdas funciona porque esta función usa el modo Manual, cuyo piso es de 25 Hz.

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/music/spelling.ts` (nuevo, puro):** tipos `PitchName` / `SpelledNote`, conversión a MIDI, formato (`♯ ♭ 𝄪 𝄫`), nombres latinos (`Mi♭`), parser (`'Eb2'`, `'F♯1'`) y ortografía por defecto con sostenidos. Es la base de los specs 003 y 005.
- **`src/core/music/tunings.ts` (nuevo, puro):** instrumentos, catálogo, cambios respecto de la estándar, regla de tensión y validación de valores persistidos.
- **`src/core/music/notes.ts`:** `describeMidiNote()` y `resolveChromaticNote()` aceptan una ortografía opcional para la nota objetivo; `NoteDescriptor` suma `accidental`. Se eliminan `QUICK_GUITAR_STRINGS` / `QUICK_BASS_STRINGS`, reemplazados por el catálogo.
- **UI:** `TuningPicker.tsx` (nuevo, reutilizable en los specs 003 y 005), `TargetNoteControl.tsx` (selectores, resumen, avisos y botones de cuerda), `TunerGauge.tsx` (indicador `♭`), `App.tsx` (estado y persistencia; al crear el motor se le envía la configuración Manual vigente, porque el efecto del modo Manual corre antes de que el motor exista).
- **DSP:** sin cambios. Cada cuerda usa la ventana Manual existente: en *Drop D*, una 6ª todavía en E2 queda +2 st sobre D2, dentro del margen +5 st, y el visor indica «BAJAR». Sin asignaciones nuevas en el worklet.

## 4. Fuera de Alcance

- Detectar automáticamente qué cuerda se está tocando dentro de la afinación.
- Editor de afinaciones personalizadas.
- Otros instrumentos (ukelele, violín…), guitarras de 12 cuerdas y afinación *Nashville* (cuerdas octavadas).
- Cuerdas por debajo de A0 (p. ej. F♯0 en bajos extendidos).
- Tablas de calibres o tensiones en kg (solo hay un aviso cualitativo).
- Temperamentos no iguales y afinaciones «compensadas».

## 5. Criterios de Aceptación y Tests

- [x] `spelling.test.ts`: conversión a MIDI con bordes de octava (`C♭4 = 59`, `B♯3 = 60`), dobles alteraciones (`F𝄪4 = 67`, `B𝄫3 = 57`), formato y parser.
- [x] `tunings.test.ts`:
  - la tabla de MIDI de §2.3 completa;
  - cuerdas estrictamente ascendentes;
  - rango A0–B5;
  - cantidad de cuerdas igual a la del instrumento;
  - ids únicos y una única «Estándar» por instrumento;
  - nunca se mezclan sostenidos y bemoles en una afinación;
  - *Drop* = fundamental–quinta–octava en las 3 cuerdas graves;
  - abiertas = tríada declarada;
  - regla de avisos de tensión;
  - fallback de valores persistidos inválidos.
- [x] `notes.test.ts`: `resolveChromaticNote()` con ortografía forzada (`E♭2` en vez de `D♯2`).
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`), incluida la guitarra de 8 cuerdas.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. **Ortografía de *Drop C♯* y *C♯ estándar*:** con sostenidos, la nomenclatura más difundida. Los nombres son enarmónicamente equivalentes a *Drop D♭* / *D♭ estándar*.
2. **Indicador `♭` en el visor:** solo cuando la nota objetivo pertenece a una afinación escrita con bemoles. En Automático se mantienen los sostenidos.
3. **Botones de cuerda en lugar de los accesos rápidos fijos:** con la afinación por defecto (Guitarra 6 · Estándar) se obtienen los mismos botones de guitarra que antes; los de bajo se obtienen eligiendo «Bajo 5 · Estándar».
4. **El modo Automático/Manual pasa a persistirse**, para no perder la configuración al volver a la app.
