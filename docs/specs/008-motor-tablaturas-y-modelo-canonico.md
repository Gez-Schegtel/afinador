# Spec 008 — Motor Base de Tablaturas, Activos Estáticos y Modelo Canónico (PPQ = 960)

- **ID:** `008`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Navegación (`routes.ts`, `App.tsx`, `index.css`), Núcleo Tablaturas (nuevos `src/core/tabs/`), Audio (`src/shell/audio-arbitrator.ts`, `audio-activity.ts`), PWA / Activos estáticos (`vite.config.ts`, `package.json`, `public/`)
- **Depende de:** [Spec 002](./002-afinaciones.md) (`spelling.ts`, `tunings.ts`), [Spec 006](./006-navegacion-por-secciones.md) (navegación por *hash*, portales `AppShell`, ciclo de vida de audio) y [Spec 007](./007-identidad-visual-endurend.md) (identidad visual Endurend)
- **Origen:** traduce la **Fase 0** y los cimientos arquitectónicos de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md) adaptándolos a la arquitectura de *Endurend Musical Gadgets*.

---

## 1. Problema / Motivación

1. El repositorio hoy integra Afinador, Diccionario/Identificador de Acordes y Metrónomo, pero carece de una estructura común para cargar, validar, representar y reproducir partituras y tablaturas multipista.
2. Agregar un módulo estilo *Songsterr + Guitar Pro Web* sin romper el afinador exige resolver antes los cimientos:
   - un **modelo canónico propio** (`ScoreDocument`) desacoplado de la librería de renderizado, con aritmética rítmica exacta (`PPQ = 960`) sin errores de punto flotante;
   - empaquetado **100% libre y local** de motor de notación, fuentes SMuFL y SoundFont, compatible con **GitHub Pages (`/afinador/`)**, **Capacitor Android (`/`)** y navegador estándar **sin depender de `SharedArrayBuffer` ni CDNs externos**;
   - expansión limpia de la navegación superior y **arbitraje centralizado de audio** para que micrófono crudo, metrónomo y reproductor de tablaturas jamás interfieran entre sí.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Navegación y chasis

- Se incorpora la **4ª sección** en la barra superior (`src/navigation/routes.ts`): **`Tablaturas`** (`#/tablaturas`), junto a *Afinador*, *Acordes* y *Metrónomo*.
- **Sub-rutas por *hash*:**
  - `#/tablaturas` → Biblioteca unificada (por defecto al entrar a la sección);
  - `#/tablaturas/practica` → Modo Práctica (estilo Songsterr, [Spec 009](./009-reproductor-practica-y-biblioteca-byot.md));
  - `#/tablaturas/estudio` → Modo Edición (estilo Guitar Pro, [Spec 013](./013-editor-tablaturas-nucleo.md));
  - `#/tablaturas/escalas` → Gimnasio de Escalas, Modos y Arpegios ([Spec 010](./010-generador-escalas-modos-arpegios.md));
  - `#/tablaturas/catalogos` → Catálogos Externos JSON y fuentes ([Spec 011](./011-catalogos-externos-json.md)).
- Las rutas de *Afinador*, *Acordes* y *Metrónomo* no cambian. El módulo `Tablaturas` se carga con **`React.lazy()`**, de modo que el arranque inicial del Afinador no crece ni en memoria ni en tiempo de carga.
- **Comportamiento en celular (`< 900px`):** se protegen las vistas de `Afinador`, `Acordes` y `Metrónomo` (`480px`). En `.section-nav`, los 4 botones mantienen altura táctil `≥ 40 px` a `412px` de ancho (y pasan a grilla `2×2` en pantallas ultraestrechas `< 360px`). En `Tablaturas`, el contenido fluye en columna única.
- **Comportamiento en escritorio (`>= 900px`):** `.pedal-chassis` conserva `max-width: 1020px` en las 3 secciones existentes y se amplía a `max-width: 1380px` únicamente cuando `data-section="tabs"`, dando espacio cómodo para partitura, barra rápida de secciones y paneles.
- **Persistencia / Estado:** la ruta activa vive en `window.location.hash` (compatible con «Atrás» de Android). El arranque sin *hash* sigue abriendo `#/afinador`.

### 2.2 Modelo Canónico de Partitura (`ScoreDocument`, `PPQ = 960`)

Toda la app (Biblioteca, Práctica, Generador de Escalas, Edición y Exportadores) trabaja sobre un único árbol inmutable/clonable puro en `src/core/tabs/model.ts`:

1. **Aritmética racional exacta (`src/core/tabs/rhythm.ts`):**
   - Resolución base entera **`PPQ = 960` ticks por negra**. `960` es múltiplo exacto de `2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 32, 40, 48, 60, 64, 96, 120, 160, 192, 240, 320 y 480` (cubre de redonda a fusa, puntillos, doble puntillo, tresillos y quintillos como enteros exactos).
   - Para grupos irregulares con denominadores primos fuera de `960` (como septillos `7:4` o `7:8`), se opera con **fracciones racionales reducidas `{ num, den }`** exactas (`mcd`) —**prohibido el uso de punto flotante** en sumas o validaciones de duración.
   - `masterBarCapacity(timeSignature)` calcula la capacidad exacta de compás; `validateBarRhythm(voice, timeSignature)` devuelve `'complete' | 'incomplete' | 'exceeded'` y la diferencia exacta en ticks/fracción.
2. **Estructura del árbol `ScoreDocument`:**
   - **Metadatos:** `id`, `title`, `artist`, `album`, `subtitle`, `copyright`, `license`, `difficulty`, `tags[]`, `origin` (`factory` | `byot` | `catalog` | `studio`, más enlace opcional al origen).
   - **`masterBars[]`:** cifra de compás (`num/den`), cambios de tempo (`bpm`, `beatUnit`), armadura de clave, repeticiones (`repeatStart`, `repeatEndCount`), casillas (`alternateEndings[]`), saltos estructurales (*D.C.*, *D.S.*, *Segno*, *Coda*, *Fine*), etiqueta de sección (`Intro`, `Verse`, `Chorus`, `Solo`, `Outro`…), fermata y marcador manual de cambio de pista (`trackSwitchCue`).
   - **`tracks[]`:** `id`, `name`, `family` (`guitar` | `bass` | `drums` | `keyboard` | `other`), `midiProgram` (General MIDI), `isPercussion`, `tuning` como `SpelledNote[]` (directamente compatible con `src/core/music/spelling.ts` y `tunings.ts`), `capo`, mezcla inicial (`volume`, `pan`, `mute`, `solo`) y `bars[]`.
   - **`bars[]` → `voices[]` (`Voz 1` y `Voz 2`) → `beats[]`:** duración base (`1..64`), `dots` (`0 | 1 | 2`), `tuplet` (`{ enter, in }` opcional), `isRest`, `chordSymbol` opcional, `lyrics` opcional, `pickStroke`, `brushDirection`, dinámica (`ppp`–`fff`), horquilla (`crescendo`/`decrescendo`), `notes[]`.
   - **`notes[]`:** `stringIndex`, `fret`, `midi` (o instrumento de percusión GM), `tieDestination`, `hammerPull`, `slide` (`legato | shift | intoAbove | intoBelow | outUp | outDown`), `bendPoints[]` (`time 0..100`, `value quarterTones`), `vibrato` (`none | slight | wide`), `whammyBarPoints[]`, `palmMute`, `letRing`, `deadNote`, `ghostNote`, `harmonic` (`natural | artificial | pinch | tap | semi`), `tapping`, `slapPop`, `graceNote`, `staccato`, `accent` (`normal | heavy`), `tremoloPicking`, `trill`.
   - **`scaleContext` opcional:** generado por [Spec 010](./010-generador-escalas-modos-arpegios.md) (`rootMidi`, `intervals[]`, `degreeLabels[]`, `characteristicDegrees[]`) para coloreado modal del diapasón.

### 2.3 Arbitraje central de audio (`AudioArbitrator`)

Hoy existen dos fuentes de audio en la app (*Afinador* y *Metrónomo*) con exclusión mutua manual en `TunerSection.tsx`. Al sumar *Reproductor de Tablaturas* y *Tonos de Referencia*, se unifica en un coordinador explícito (`src/shell/audio-arbitrator.ts`):
- El micrófono crudo (`TunerEngine`) es **estrictamente exclusivo**: activarlo detiene automáticamente el metrónomo global, la reproducción de tablaturas y cualquier tono de referencia, informando con un aviso breve.
- Al revés: iniciar una tablatura o un tono de referencia mientras el micrófono está abierto solicita primero detener `TunerEngine` de forma asíncrona (`stop()`) para no dejar el micrófono abierto ni contaminar sesiones futuras.
- Cada motor reporta su actividad a `audio-activity.ts` (`'tuner' | 'metronome' | 'tabs' | 'tone'`) para que `whenAudioIdle()` de `src/main.tsx` nunca recargue la PWA durante una práctica o grabación.

---

## 3. Impacto Técnico (DSP / Audio / UI / Empaquetado)

- **Dependencias libres nuevas (sin CDNs en tiempo de ejecución):**
  - `@coderline/alphatab` (`MPL-2.0`) — motor de renderizado multipágina/scroll, parsers `.gp3/.gp4/.gp5/.gpx/.gp`, `.musicxml/.xml/.mxl`, `.mid/.midi`, `.alphatex` y reproductor Web Audio/Web Worker con SoundFont (configurado explícitamente **sin `SharedArrayBuffer`** y con rutas resueltas mediante `${import.meta.env.BASE_URL}`).
  - Fuente SMuFL `Bravura` (`SIL OFL-1.1`) y SoundFont libre `sonivox.sf2` (`Apache-2.0`), incluidos en los activos estáticos locales (reemplazables por `.sf2` propios del usuario en Spec 009).
  - `fflate` (`MIT`) — descompresión/compresión `.zip` síncrona/asíncrona en navegador para BYOT, `.gp`, `.mxl`, paquetes de ensayo y catálogos.
- **Puente bidireccional (`src/core/tabs/alphatab-bridge.ts`):** convierte `ScoreDocument ↔ AlphaTab Score` preservando metadatos, afinaciones con ortografía de `spelling.ts`, `Voz 1/2`, técnicas y `PPQ = 960`. Incluye diagnóstico explícito si un archivo `.tg` heredado usa una versión binaria no admitida.
- **PWA y Capacitor (`vite.config.ts`, `GEMINI.md` §3.3 & §5):**
  - Todos los trabajadores (*Web Workers*), fuente SMuFL y SoundFont se sirven desde rutas relativas a `base` (`/` o `/afinador/`).
  - Ajuste de `workbox.maximumFileSizeToCacheInBytes` en `vite.config.ts` para que el precache *offline* incluya el SoundFont (`~4–5 MB`), los glifos SMuFL y el *chunk* diferido de Tablaturas.
- **DSP del afinador (`src/core/dsp/`):** intacto, cero cambios ni asignaciones nuevas.

---

## 4. Fuera de Alcance

- Interfaz visual del reproductor estilo Songsterr y biblioteca IndexedDB ([Spec 009](./009-reproductor-practica-y-biblioteca-byot.md)).
- Generador de escalas y ejemplos de fábrica ([Spec 010](./010-generador-escalas-modos-arpegios.md)).
- Catálogos externos JSON ([Spec 011](./011-catalogos-externos-json.md)).
- Herramientas de práctica integradas, Editor Guitar Pro, Exportadores avanzados y Beat-Mapper ([Specs 012–014](./012-herramientas-practica-integradas.md)).

---

## 5. Criterios de Aceptación y Tests

- [x] `rhythm.test.ts`: verificación exacta (cero error de redondeo) en duración de negras, corcheas, tresillos, quintillos, septillos (`7:4`), ligaduras y puntillos simples/dobles; `validateBarRhythm` detecta compases completos, incompletos y excedidos en compases simples, compuestos y de amalgama.
- [x] `model.test.ts`: clonación segura, invariantes de cuerdas/trastes y lectura MIDI consistente con `spelling.ts` y `tunings.ts`.
- [x] `alphatab-bridge.test.ts`: conversión ida y vuelta (`ScoreDocument → AlphaTab → ScoreDocument`) sin pérdida de notas, compases, tempo ni afinación; importación básica de `.alphatex`, `.musicxml` y `.mid`.
- [x] `routes.test.ts`: parseo, serialización y fallback para las rutas `#/tablaturas` y sub-rutas `#/tablaturas/{practica,estudio,escalas,catalogos}` preservando todas las rutas de `Specs 001–007`.
- [x] `audio-arbitrator.test.ts`: exclusión mutua entre micrófono (`TunerEngine`), `MetronomeEngine` y `TabAudioEngine`; actualización correcta de `isAudioBusy()`.
- [x] Verificación de build y *code-splitting*: `VITE_BASE_PATH=/afinador/ npm run build && npm run cap:sync` mantiene el chunk de `TunerSection` aislado del chunk de `alphaTab` y sirve fuentes/SoundFont tanto con base `/` como `/afinador/`.
- [x] Verificación visual móvil (`412×915`) y escritorio (`1440×900`) de la barra de 4 secciones.
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Modelo canónico propio desacoplado de `alphaTab`:** evita atar toda la lógica de edición, escalas, exportadores y *diff* a estructuras internas de una biblioteca externa y garantiza `PPQ = 960` puro y testeable en Node con Vitest.
2. **4ª pestaña superior `Tablaturas`:** conserva el chasis compacto en móvil y el *footswitch* libre de toques accidentales (siguiendo Spec 006).
3. **Sin `SharedArrayBuffer`:** permite ejecutar el módulo tanto en GitHub Pages (sin cabeceras COOP/COEP) como en Android WebView y PWA *offline*.
4. **Licencias compatibles:** `alphaTab` (`MPL-2.0`), `Bravura` (`OFL-1.1`), `sonivox.sf2` (`Apache-2.0`) y `fflate` (`MIT`) son 100% libres y compatibles con distribución en F-Droid y código `GPL-3.0-or-later`.
