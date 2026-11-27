# Spec 001 — Modo Manual de Largo Alcance (Nota + Octava) y Consola Desktop en 2 Columnas

- **ID:** `001`
- **Estado:** `Implementado`
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** DSP (`mpm.ts`, `smoother.ts`), AudioWorklet (`pitch-worklet.ts`, `tuner-engine.ts`), Música (`notes.ts`), UI (`TargetNoteControl.tsx`, `TunerGauge.tsx`, `App.tsx`, `index.css`)

---

## 1. Problema / Motivación

1. En modo exclusivamente automático, ciertas cuerdas (cuerdas muy flojas tras un reencordado, cuerdas finas con poco volumen o bajos en micrófonos pequeños) pueden tardar en enganchar o mostrar notas vecinas lejos del tono objetivo.
2. En el arco visual estándar (`±50 cents`), una cuerda caída varios semitonos deja la aguja clavada contra el tope izquierdo sin mostrar avance real hasta entrar dentro del último medio semitono.
3. En monitores panorámicos de escritorio (`PC`), la columna única estrecha de `480px` estirada al alto completo dejaba demasiado espacio vacío lateral y separaciones verticales incómodas.

## 2. Propuesta Funcional y UX (Móvil y PC)

- **Selector `MODO DE AFINACIÓN` (`AUTOMÁTICO` / `MANUAL`):**
  - **Automático:** detección cromática libre en `27.5–2000 Hz`.
  - **Manual:** despliega la sección **«Nota objetivo»** con dos selectores directos (**Nota** `C..B` y **Octava** `0..5`, cubriendo `A0–B5`) más botones rápidos de 1 clic para las cuerdas estándar de Guitarra (`6ª E2..1ª E4`) y Bajo (`5ª B0..1ª G2`). El último objetivo elegido persiste en `localStorage` (`afinador_target_midi`).
- **Auto-escala visual en modo Manual:** cuando el error supera `±55 cents`, el arco pasa automáticamente a **Escala Amplia (`±6 semitonos`)** indicando los semitonos faltantes; al acercarse dentro de `±46 cents`, vuelve a **Escala Fina (`±50 cents`)** para afinar con precisión.
- **Diseño responsivo:**
  - **Móvil (`< 900px`):** conserva sin cambios la disposición vertical de 1 columna optimizada para el pulgar.
  - **Escritorio (`>= 900px`):** consola centrada de **2 columnas** (`max-width: 1020px`), con el visor amplio a la izquierda y los controles + botón principal a la derecha, más atajo con la barra **Espaciadora** para activar/detener sin soltar el instrumento.

## 3. Impacto Técnico (DSP / Audio / UI)

- **Sensibilidad en Automático:** ajuste de puerta de entrada en `mpm.ts` (`minRms = 0.0035`, `minClarity = 0.72`) y `smoother.ts` (`0.75 / 0.68`).
- **Rango DSP asimétrico en Manual (`pitch-worklet.ts`):** al enviar `targetHz` al `AudioWorklet`, acota la búsqueda entre **`-11.5` semitonos abajo** y **`+5` semitonos arriba** (`minRms = 0.0025`, `minClarity = 0.58`, `clarityThreshold = 0.92`) para cubrir hasta casi una octava por debajo sin saltar al 2º armónico, junto con confirmación acelerada (`2` cuadros) en `PitchSmoother`.

## 4. Fuera de Alcance

- Presets de afinaciones alternativas completas (Open G, DADGAD, etc.): basta elegir directamente la Nota + Octava objetivo.
- Generación de tonos audibles de referencia (reservado para un spec posterior).

## 5. Criterios de Aceptación y Tests

- [x] Test en `notes.test.ts` validando `forcedMidi` a `-800 cents`, `midiFromNoteAndOctave` y catálogo completo sin duplicados.
- [x] Test en `mpm.test.ts` validando detección de `G3` caída `-800 cents` (`~123.5 Hz`) con armónicos dominantes dentro del rango manual `-11.5 / +5 st`.
- [x] Verificación visual mediante capturas en Chromium Headless (`1440×900` escritorio y `412×915` móvil).
- [x] Documentación actualizada en `README.md` y registro en `ROADMAP.md`.
