# Spec 004 — Metrónomo con Compases, BPM y Acento del Primer Tiempo

- **ID:** `004`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Ritmo (nuevo `src/core/rhythm/`), Audio (nuevo `src/audio/metronome-engine.ts` + temporizador en *Web Worker*), UI (nueva sección), Wake Lock
- **Depende de:** [Spec 006](./006-navegacion-por-secciones.md) (sección propia y metrónomo a nivel de la app)

> **Pedido original:** «Quiero que tenga una sección con metrónomo. Varios compases y bpm. Que deje marcar el tiempo inicial fuerte o no.»

---

## 1. Problema / Motivación

Practicar con un pulso estable sin depender de otra app, con el mismo criterio que el resto del proyecto: **libre, offline y sin publicidad**. Para que sea musicalmente correcto, el metrónomo tiene que respetar qué figura lleva el pulso en cada compás. No es lo mismo un 6/8 que un 2/4, aunque ambos tengan dos pulsos.

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Controles

- **Tempo:**
  - lectura grande del BPM con su **figura de pulso** (`♩ = 120`, `♩. = 80`, `♪ = 210`), para que no haya ambigüedad;
  - botones `−5`, `−1`, `+1`, `+5` (mismo patrón que la calibración de A4) y campo numérico;
  - rango **30–300**.
- **Compás:** selector con la lista de §2.2.
- **Agrupación:** solo en los compases irregulares (5/8: `2+3` o `3+2`; 7/8: `2+2+3`, `2+3+2` o `3+2+2`).
- **«Acentuar el primer tiempo»** (activado por defecto): el primer clic del compás suena distinto.
- **«Subdivisión»** (activada por defecto). Solo aparece en compases compuestos e irregulares: hace sonar las corcheas internas de cada pulso. Sin subdivisión, 6/8 y 2/4 sonarían idénticos.
- **Botón Iniciar / Detener** grande (estilo *footswitch*) y atajo `Espacio` dentro de la sección.
- **Indicador visual:** un LED por pulso. Se enciende el pulso actual; el primero tiene otro color si está acentuado. En compuestos e irregulares, un punto pequeño por cada corchea de subdivisión.

**Celular (`< 900px`):** una columna (tempo grande, LEDs, controles y botón al pie). **Escritorio (`>= 900px`):** dos columnas (tempo y LEDs a la izquierda; controles y botón a la derecha), como la consola del afinador.

**Persistencia:** `afinador_metronome` en `localStorage` (BPM, compás, agrupación, acento y subdivisión). Valores por defecto: **4/4, ♩ = 100, acento activado y subdivisión activada**.

### 2.2 Base teórica: compases

- **Simple:** el pulso se divide en **2** (negra = 2 corcheas). El BPM se refiere a la **negra** (`♩`).
- **Compuesto:** numerador 6, 9 o 12 sobre 8. El pulso es la **negra con puntillo** (`♩.`) y se divide en **3** corcheas; hay 2, 3 o 4 pulsos por compás. El BPM se refiere a la negra con puntillo.
- **Irregular (de amalgama):** 5/8 y 7/8 combinan grupos de 2 y 3 corcheas, así que los pulsos tienen **distinta duración**. Como no hay un pulso constante, el BPM se refiere a la **corchea** (`♪`); la agrupación define dónde empieza cada pulso.

| Compás | Tipo | Pulsos por compás | Figura del BPM | Corcheas por compás | Inicios de pulso (en corcheas) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2/4 | Simple binario | 2 | ♩ | — | — |
| 3/4 | Simple ternario | 3 | ♩ | — | — |
| 4/4 | Simple cuaternario | 4 | ♩ | — | — |
| 5/4 | Simple (quíntuple) | 5 | ♩ | — | — |
| 6/8 | Compuesto binario | 2 | ♩. | 6 | 1, 4 |
| 9/8 | Compuesto ternario | 3 | ♩. | 9 | 1, 4, 7 |
| 12/8 | Compuesto cuaternario | 4 | ♩. | 12 | 1, 4, 7, 10 |
| 5/8 | Irregular (2+3 / 3+2) | 2 | ♪ | 5 | 1, 3 / 1, 4 |
| 7/8 | Irregular (2+2+3 / 2+3+2 / 3+2+2) | 3 | ♪ | 7 | 1, 3, 5 / 1, 3, 6 / 1, 4, 6 |

**Duraciones** (`b` = BPM):

| Tipo | Clic de pulso | Clic de corchea |
| :--- | :--- | :--- |
| Simple | `60 / b` s | — |
| Compuesto | `60 / b` s | `60 / (3b)` s |
| Irregular | — | `60 / b` s |

En los irregulares, cada pulso dura 2 o 3 corcheas.

**Sonidos** (sintetizados, sin archivos):

1. **Acento:** primer clic del compás, si está activado.
2. **Pulso:** inicio de cada pulso.
3. **Subdivisión:** corcheas internas, más suave.

Sin acento, el primer clic suena como un pulso común.

### 2.3 Precisión temporal

- Los clics se programan con el **reloj de audio** (`AudioContext.currentTime`) usando el patrón de *look-ahead*: un temporizador cada ~25 ms agenda los clics de los próximos ~120 ms.
- El temporizador corre en un ***Web Worker***, cuyos temporizadores no se estrangulan como los del hilo principal en pestañas en segundo plano. Así el metrónomo sigue estable mientras se lee una partitura en otra pestaña.
- El instante de cada clic se calcula como `inicio + k · duración`, **sin acumular sumas**, para que no haya deriva.
- Un cambio de BPM se aplica desde el próximo clic. Un cambio de compás, de agrupación o de subdivisión reinicia el compás desde el tiempo 1.
- El indicador visual se sincroniza con el reloj de audio en `requestAnimationFrame`.

### 2.4 Convivencia con el afinador

El afinador captura audio crudo, sin cancelación de eco (`GEMINI.md` §2.3), así que escucharía los clics. Por eso **activar el micrófono detiene el metrónomo**. El metrónomo nunca puede arrancar con el micrófono activo, porque salir del Afinador lo apaga (Spec 006). Mientras suena, se mantiene la pantalla encendida (Wake Lock).

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/rhythm/meters.ts` (puro):** definición de compases, agrupaciones, patrón de clics por compás (tipo de cada clic y posición en corcheas o pulsos), duración de cada unidad, rango de BPM y validación de preferencias guardadas. Con tests.
- **`src/audio/metronome-engine.ts`:** `AudioContext` propio, *scheduler* con *look-ahead*, síntesis de clics (oscilador + envolvente exponencial de ~40 ms), cola de eventos para la UI y Wake Lock.
- **`src/audio/metronome-timer.worker.ts`:** temporizador de 25 ms.
- **UI:** `src/sections/MetronomeSection.tsx`, con estilos basados en variables CSS (preparado para Spec 007).
- No se toca el DSP del afinador ni sus invariantes.

## 4. Fuera de Alcance

- Acentos secundarios configurables por tiempo y patrones personalizados.
- Polirritmias.
- Subdivisiones en compases simples (corcheas, tresillos, semicorcheas).
- *Tap tempo*.
- Entrenador de tempo progresivo.
- Compases 2/2, 3/8, 3/2 y otros.
- Sonidos grabados.
- Vibración.
- Términos de tempo (*Allegro*, etc.).

## 5. Criterios de Aceptación y Tests

- [x] `meters.test.ts`:
  - 6/8 a `♩. = 60` → 6 clics, pulsos en las corcheas 1 y 4, 1 s por pulso y 1/3 s por corchea;
  - 7/8 `2+2+3` a `♪ = 210` → inicios en 1, 3 y 5;
  - 4/4 → 4 clics con acento solo en el primero (y ninguno si el acento está desactivado);
  - sin subdivisión, 6/8 → 2 clics;
  - límites del BPM;
  - fallback de preferencias inválidas.
- [x] Test del cálculo de instantes: 120 BPM en 4/4 durante 1000 clics → todos los instantes son exactamente `k · 0.5 s`.
- [x] Verificación visual en móvil y escritorio.
- [x] Prueba manual: activar el micrófono detiene el metrónomo.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. Rango de BPM **30–300**: cubre baladas lentas y compases irregulares rápidos medidos en corcheas.
2. Lista de compases de §2.2.
3. Exclusión mutua con el micrófono (§2.4), en lugar de intentar filtrar los clics.
4. Subdivisión activada por defecto en compuestos e irregulares.
