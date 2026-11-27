# Spec 005 — Identificador de Acordes desde el Mástil (Guitarra y Bajo)

- **ID:** `005`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Música (nuevo `src/core/music/chord-identify.ts`), UI (pestaña *Identificar* de la sección Acordes, nuevo componente de mástil)
- **Depende de:** [Spec 003](./003-acordes.md) (motor de acordes y ortografía), [Spec 002](./002-afinaciones.md) (instrumentos y afinaciones) y [Spec 006](./006-navegacion-por-secciones.md) (sección Acordes)
- **Origen:** desagregado del borrador del Spec 003.

> **Pedido original:** «También me gustaría que te deje seleccionar desde un dibujo de un mástil de guitarra o bajo notas y que te nombre el acorde que hayas ingresado. La idea de esto último es poder saber el nombre de un acorde que no conocés, pero sabés la forma o posición del mismo. Todo lo que hagas tiene que estar respaldado con teoría musical.»

---

## 1. Problema / Motivación

Saber cómo se llama una forma que se sabe tocar, pero no nombrar. Hay que hacerlo con rigor: un mismo conjunto de notas puede tener **más de un nombre válido**. Por ejemplo, `C E G A` es `C6` con Do en el bajo y `Am7` con La en el bajo. La herramienta tiene que mostrar todas las lecturas correctas, ordenadas, en lugar de inventar una sola.

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Flujo

1. Sección **Acordes → Identificar**.
2. **Instrumento y afinación** con el `TuningPicker` del Spec 002: guitarras de 6, 7 y 8 cuerdas y bajos de 4, 5 y 6, con todo su catálogo. Por defecto, Guitarra de 6 · Estándar.
3. **Mástil interactivo vertical** (cuerdas en columnas de grave a aguda, trastes en filas desde la cejuela, del 0 al 15, con marcas en los trastes 3, 5, 7, 9, 12 —doble— y 15).
   - Tocar un traste marca esa nota. Hay **una nota por cuerda**, como al tocar de verdad; tocar otro traste de la misma cuerda la reemplaza.
   - Tocar el traste marcado lo borra, y la cuerda queda muda (`×`).
   - La fila `0` es la cuerda al aire.
   - Botón **Limpiar**.
4. **Resultado en vivo:**
   - **Mejor lectura:** símbolo (`Am7/C`), nombre en español (`La menor séptima, con bajo en Do (1ª inversión)`), notas escritas y grado de cada nota.
   - **Otras lecturas válidas:** hasta 3 alternativas.
   - Botón **«Ver en el diccionario»**: abre la raíz y el tipo de la lectura en el Spec 003.
   - **Con dos notas:** si forman una quinta justa, el acorde de quinta (`C5`); si no, el **intervalo** desde el bajo (p. ej. «3ª mayor»).
   - **Sin lectura válida:** las notas y sus intervalos desde el bajo, con el aviso «No forma un acorde del catálogo».

- **Comportamiento en celular (`< 900px`):** mástil a ancho completo y resultado fijo encima (lo primero que se ve).
- **Comportamiento en escritorio (`>= 900px`):** mástil a la izquierda y resultado a la derecha.
- **Persistencia / Estado:** se guarda el instrumento y la afinación (`afinador_chords_identify`). Las notas marcadas no se guardan.

### 2.2 Base teórica: algoritmo de identificación

1. **Notas que suenan:** MIDI de cada cuerda (afinación + traste). La **más grave** es el bajo.
2. **Clases de altura:** conjunto sin repetir octavas.
3. **Candidatos:** para cada clase presente como posible raíz y cada tipo del catálogo del Spec 003 (mismas 20 fórmulas), el conjunto es una lectura válida si:
   - todas las notas presentes pertenecen al tipo;
   - están todas las notas del tipo, con la **misma regla de omisión del Spec 003**: solo la quinta justa, y solo en tipos de 4 o más notas;
   - la raíz está presente (no se buscan lecturas «sin fundamental»).
4. **Inversiones:** si el bajo no es la raíz, se escribe con barra (`C/E`). El bajo se escribe **como nota del acorde**: con Do en el bajo, `E+` (`E G♯ B♯`) se cifra `E+/B♯`, no `E+/C`. Con el bajo en la 3ª es **1ª inversión**, en la 5ª **2ª inversión** y en la 7ª **3ª inversión**; en cualquier otra nota, «con bajo en X».
5. **Orden de las lecturas:**
   1. sin notas omitidas antes que con omisiones;
   2. raíz en el bajo antes que inversiones;
   3. tipos con menos notas antes (tríadas, luego cuatríadas, luego novenas);
   4. orden del catálogo;
   5. distancia de la raíz sobre el bajo (para ordenar de forma estable las lecturas de los acordes simétricos).

   Ejemplos:
   - `x02010` (`A E G C E`, bajo La) → **`Am7`**, alternativa `C6/A`.
   - `x32210` (`C E A C E`, bajo Do) → **`Am/C`** (exacto) antes que `C6` sin quinta.
   - `x3424x` (`C F♯ A D♯`) → **`C°7`**, alternativas `D♯°7/C`, `F♯°7/C` y `A°7/C` (acorde simétrico). Por la regla del punto 6 se escribe `D♯°7` = `D♯ F♯ A C` (2 alteraciones) y no `E♭°7` = `E♭ G♭ B𝄫 D𝄫` (6).
6. **Ortografía del resultado:** las clases de altura no dicen si la raíz es `C♯` o `D♭`. Se elige, entre las 17 raíces del Spec 003, la que **minimiza la cantidad total de alteraciones** del acorde escrito (una doble cuenta 2). Por ejemplo:
   - clase 1 mayor → `D♭` (`D♭ F A♭`, 2) antes que `C♯` (`C♯ E♯ G♯`, 3);
   - clase 1 menor → `C♯m` (`C♯ E G♯`, 2) antes que `D♭m` (`D♭ F♭ A♭`, 3);
   - clase 3 mayor → `E♭` antes que `D♯` (que lleva `F𝄪`).

   Si hay **empate** (`F♯` / `G♭`, `D♯m` / `E♭m`), se muestra primero la versión con sostenidos y se indica la equivalente con bemoles. Las notas marcadas en el mástil se rotulan con la ortografía de la mejor lectura.
7. **Intervalos (dos notas):** por semitonos desde el bajo, con sus nombres usuales:

   | Semitonos | Intervalo | Semitonos | Intervalo |
   | :---: | :--- | :---: | :--- |
   | 1 | 2ª menor | 7 | 5ª justa (`X5`) |
   | 2 | 2ª mayor | 8 | 6ª menor |
   | 3 | 3ª menor | 9 | 6ª mayor |
   | 4 | 3ª mayor | 10 | 7ª menor |
   | 5 | 4ª justa | 11 | 7ª mayor |
   | 6 | tritono (4ª aumentada / 5ª disminuida) | 0 | unísono u octava |

   La nota superior se escribe según el intervalo nombrado.

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/music/chord-identify.ts` (puro):** candidatos, orden, ortografía mínima, inversiones e intervalos. Usa `chords.ts`, `intervals.ts`, `spelling.ts` y `tunings.ts`. Con tests.
- **UI:** `ChordIdentifier.tsx` y `Fretboard.tsx` (SVG accesible: cada traste es un botón con `aria-label`, p. ej. «Cuerda 5, traste 3: C3»). Estilos con variables CSS.
- Costo: hasta 12 raíces × 20 tipos por cambio, trivial.

## 4. Fuera de Alcance

- Reconocer el acorde **por el micrófono** (detección polifónica: otro problema de DSP).
- Lecturas sin fundamental, poliacordes y tensiones alteradas (`7♭9`, `13`, etc.).
- Más de una nota por cuerda.
- Mástil para zurdos.
- Escuchar el acorde.

## 5. Criterios de Aceptación y Tests

- [x] `chord-identify.test.ts`:
  - `x32010` → `C`;
  - `022000` → `Em`;
  - `x02010` → `Am7` con alternativa `C6/A`;
  - `x32210` → `Am/C` primero;
  - `xx0232` → `D`;
  - `xx0212` → `D7`;
  - `x24432` → `Bm`;
  - `320003` → `G`;
  - `x355xx` → `C5`;
  - `x3424x` → `C°7` y sus 3 alternativas simétricas (`D♯°7/C`, `F♯°7/C`, `A°7/C`);
  - `{C, E, G♯}` con Do en el bajo → `C+` y alternativas `E+/B♯` y `A♭+/C`;
  - ortografía mínima (`D♭`, `E♭`, `C♯m`, empate `F♯ / G♭`);
  - intervalos de dos notas;
  - conjunto sin lectura (`C C♯ D`);
  - bajo de 4 cuerdas estándar: `x35x` (C2 G2) → `C5` y `875x` (C2 E2 G2) → `C`.
- [x] Verificación visual en móvil y escritorio.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. Mástil vertical en todos los tamaños, la misma orientación que los diagramas del Spec 003.
2. Trastes 0–15.
3. Sin lecturas sin fundamental.
4. Mejor lectura más hasta 3 alternativas.
5. Ante empates enarmónicos, sostenidos primero, mostrando también la versión con bemoles.
