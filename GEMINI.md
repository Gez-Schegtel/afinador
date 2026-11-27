# Reglas del Proyecto — Endurend Musical Gadgets (Afinador, Acordes y Metrónomo)

Estas reglas rigen todo trabajo de desarrollo, refactoring, documentación y automatización en este repositorio (tanto para Antigravity como para Claude Code).

---

## 1. Flujo Basado en Specs y Documentación Viva

1. **Leer contexto antes de modificar:** antes de implementar un cambio no trivial, revisá [`ROADMAP.md`](./ROADMAP.md) y [`docs/specs/`](./docs/specs/README.md) para entender qué ya existe y qué está en progreso.
2. **Spec primero para nuevas funcionalidades:** toda nueva funcionalidad o cambio importante de UX/DSP debe quedar registrada primero como especificación en `docs/specs/NNN-nombre-corto.md` (partiendo de `docs/specs/000-plantilla.md`) y contar con aprobación del usuario antes de modificar código.
3. **Documentación siempre sincronizada:** nunca des por terminada una tarea sin actualizar:
   - El estado del spec correspondiente (`Estado: Implementado`).
   - [`ROADMAP.md`](./ROADMAP.md) (moviendo o registrando el hito completado y ajustando el backlog).
   - [`README.md`](./README.md) si cambiaron especificaciones técnicas, parámetros del DSP, controles visibles para el usuario, comandos o requisitos de operación.
   - Los datos en [`README.md`](./README.md) deben reflejar valores **exactos** medidos y verificados en el código/tests (prohibido inventar o exagerar métricas).

---

## 2. Invariantes Críticas de Audio y DSP

1. **Cero asignaciones por cuadro en tiempo real:** dentro de `AudioWorkletProcessor.process()` (`src/audio/pitch-worklet.ts`) y `MPMDetector.detect()` (`src/core/dsp/mpm.ts`), reutilizá siempre buffers preasignados (`Float64Array` / `Float32Array`). Prohibido crear arrays o objetos grandes por cada bloque de audio.
2. **Frecuencia de muestreo dinámica:** leé siempre `AudioContext.sampleRate` en tiempo de ejecución (`44100 Hz`, `48000 Hz`, etc.). Nunca asumas `44100 Hz` fijos.
3. **Audio crudo sin filtros de voz:** mantené siempre `echoCancellation: false`, `noiseSuppression: false` y `autoGainControl: false` en `getUserMedia()` (`src/audio/tuner-engine.ts`) para no cortar el *sustain* de las cuerdas.
4. **Separación pura de núcleos matemáticos:** `src/core/dsp/` y `src/core/music/` deben permanecer **100% puros** (cero imports de React, DOM o APIs del navegador) para ejecutarse directamente en Node con Vitest y dentro del `AudioWorklet`.
5. **Estabilidad acústica real:**
   - Conservá la inmunidad a ecos de sala (preferir métricas basadas en magnitud/energía periódica como QIFFT + FFT-MPM sobre derivadas crudas de fase).
   - Mantené la histéresis tipo *Schmitt trigger* (`IN_TUNE_TOLERANCE_CENTS` / `IN_TUNE_EXIT_HYSTERESIS_CENTS` y `NOTE_SWITCH_HYSTERESIS_SEMITONES`) en `src/core/music/notes.ts` y el estabilizador `PitchSmoother` para evitar agujas nerviosas.

---

## 3. Invariantes de Interfaz, Rendimiento y Rutas

1. **Renderizado 60 FPS desacoplado de React:** la aguja, los LEDs y el estroboscopio (`src/components/TunerGauge.tsx`) se dibujan en `<canvas>` leyendo `ref`s en `requestAnimationFrame`. Evitá disparar re-renders de React en cada paquete de audio (~47 Hz); mantené *throttling* para la telemetría numérica.
2. **Proteger la vista móvil (`< 900px`):** el diseño móvil es prioritario. Las adaptaciones de escritorio deben vivir dentro de `@media (min-width: 900px)` en `src/index.css` sin romper las áreas táctiles ni el flujo vertical en teléfonos.
3. **Rutas compatibles con subdirectorio (GitHub Pages):** cualquier referencia a activos en `public/` desde JSX debe usar `${import.meta.env.BASE_URL}...` (y en `vite.config.ts` usar `base`) para funcionar tanto en `/` (Capacitor/local) como en `/afinador/` (GitHub Pages).

---

## 4. Software Libre (`GPL-3.0-or-later`) y Compatibilidad F-Droid

1. **100% libre y offline:** cero telemetría, analíticas, anuncios o peticiones a servidores externos. Todo el audio se procesa localmente en el dispositivo.
2. **Capa nativa `android/` limpia:** prohibido reintroducir el plugin propietario `com.google.gms:google-services` o dependencias cerradas en `android/build.gradle`; mantené `dependenciesInfo { includeInApk = false; includeInBundle = false }` en `android/app/build.gradle`.
3. **Higiene del repositorio:** nunca subas binarios compilados (`.apk`, `.aab`), llaves privadas (`.jks`, `.keystore`), `local.properties` ni capturas temporales al repositorio.

---

## 5. Verificación Obligatoria Antes de Confirmar / Hacer Push

Antes de cada `commit` y `push` a `main`, ejecutá y verificá con código de salida `0`:

```bash
npm test -- --run
VITE_BASE_PATH=/afinador/ npm run build
npm run cap:sync
git status
```

El build de GitHub Pages va **antes** de `cap:sync`: así `dist/` termina compilado con la base `/` que usa Capacitor, y un `npx cap copy` / `cap run` posterior no empaqueta rutas `/afinador/…` (que dejarían el APK en blanco).

Si modificaste interfaz o estilos (`src/components/`, `src/App.tsx`, `src/index.css`), verificá visualmente tanto escritorio (`1440×900`) como móvil (`412×915`) antes de dar la tarea por finalizada.
