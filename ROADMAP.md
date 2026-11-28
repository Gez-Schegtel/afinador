# Roadmap — Endurend Musical Gadgets

Registro cronológico de lo construido hasta el momento y próximos hitos planificados para el proyecto. Para proponer o detallar nuevas funcionalidades, revisá [`docs/specs/README.md`](./docs/specs/README.md).

---

## ✅ Hitos Completados

### Fase 1 — Base PWA, Motor DSP 64-bit y Calibración `A4`
- Inicialización del proyecto con **Vite + React 19 + TypeScript + Vitest** y soporte **PWA offline** (`vite-plugin-pwa`).
- Implementación del motor DSP puro (`src/core/dsp/`) con **FFT Radix-2 (`FFT64`)** + **McLeod Pitch Method (`MPMDetector`)** sobre ventana de `8192` muestras ejecutado en hilo dedicado `AudioWorklet`.
- Captura de micrófono en audio crudo (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`) leyendo `AudioContext.sampleRate` dinámicamente (`44.1 / 48 kHz`) y bloqueo de pantalla activa (**Screen Wake Lock**).
- Calibración dinámica **`A4 = 415.0–466.0 Hz`** (incluyendo `430`, `432`, `440`, `442`, `444 Hz`, pasos de `0.1 / 0.5 / 1 Hz` y guardado persistente en `localStorage`).
- Publicación como Software Libre bajo licencia **GNU GPL v3 (`GPL-3.0-or-later`)**.

### Fase 2 — Visor Cromático Estilo Pedal y Despliegue Continuo
- Interfaz móvil estilo pedal cromático universal (`27.5–2000 Hz`, cubriendo guitarra y bajo de 4, 5 y 6 cuerdas sin configuración previa) con visor estroboscópico superior, arco de 41 LEDs a 60 FPS e indicador dedicado `♯`.
- Despliegue automático de la PWA en **GitHub Pages** (`https://gez-schegtel.github.io/afinador/`) vía [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).
- Proyecto nativo Android con **Capacitor** (`android/`, permiso `RECORD_AUDIO`, pantalla siempre encendida y sin dependencias propietarias de Google para compatibilidad con **F-Droid**) y pipeline CI/CD [`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml) actualizado a **Node.js 24** para generar `.apk` y `.sha256` en Actions y Releases.

### Fase 3 — Estabilización Acústica Real
- Pre-filtrado pasa-banda **Butterworth de 2º orden (`24–1800 Hz`)** dentro del `AudioWorklet` para rechazar golpes sub-audibles y ruido de ambiente agudo.
- Reemplazo del refinamiento de fase por **interpolación espectral QIFFT de log-magnitud con ventana Blackman–Harris de 4 términos** (`< 0.03 cents` medidos por la suite), inmune a rebotes y ecos de sala.
- Estabilizador **`PitchSmoother`** con supresión de ataque de púa (*attack blanking*), **media recortada intercuartil de 12 cuadros (`~255 ms`)** y EMA de doble velocidad (`0.085` en reposo / `0.30` al girar clavija).
- Histéresis tipo pedal (*Schmitt trigger*): bloqueo **`✓ AFINADO`** en `±2.5 cents` con retención hasta `±4.0 cents` y frontera entre semitonos a `±56 cents`.

### Fase 4 — Modo Manual de Largo Alcance, Consola Desktop y Specs (`Spec 001`)
- Selector **Automático / Manual** con menú **«Nota objetivo»** por **Nota + Octava** (`A0–B5`) y accesos rápidos de 1 clic para Guitarra y Bajo ([`docs/specs/001-modo-manual-y-consola-desktop.md`](./docs/specs/001-modo-manual-y-consola-desktop.md)).
- Ventana DSP asimétrica en modo Manual (**`-11.5` a `+5` semitonos**, `clarityThreshold: 0.92`) para detectar cuerdas muy flojas sin saltos al 2º armónico, acompañada de sensibilidad mejorada en Automático (`minRms: 0.0035`, `minClarity: 0.72`).
- Escala visual auto-rango en el medidor (**`±6 semitonos ↔ ±50 cents`**) con aviso en semitonos cuando estás lejos del tono.
- Consola horizontal en **2 columnas** para pantallas de escritorio (`>= 900px`) con atajo de teclado **`Espacio`**, preservando intacta la vista móvil.
- Workflow de CI [`.github/workflows/tests.yml`](./.github/workflows/tests.yml) (chequeo de tipos + Vitest en cada `push`/PR) e insignias de estado en el `README.md`.
- Adopción formal de flujo por especificaciones (`docs/specs/`) y reglas de desarrollo para agentes (`GEMINI.md` / `CLAUDE.md`).

### Fase 5 — Catálogo de Afinaciones (`Spec 002`)
- Catálogo de **34 afinaciones** para **guitarra de 6, 7 y 8 cuerdas** y **bajo de 4, 5 y 6 cuerdas** (estándar, bajadas, *Drop*, abiertas, DADGAD, BEAD, EADGC), con selector **Instrumento + Afinación**, un botón por cuerda y avisos de tensión ([`docs/specs/002-afinaciones.md`](./docs/specs/002-afinaciones.md)).
- Nuevo modelo de notas con **ortografía enarmónica** (`src/core/music/spelling.ts`): el visor muestra `E♭2` en las afinaciones bajadas (indicador `♭`). Es la base de los specs de acordes.
- Persistencia del modo Automático/Manual, del instrumento y de la afinación (al crearse, el motor recibe la configuración Manual vigente).

### Fase 6 — Navegación por Secciones (`Spec 006`)
- Barra **Afinador · Acordes · Metrónomo** con rutas por *hash* (compatibles con GitHub Pages y Capacitor, y con el botón «Atrás») y carga diferida de las secciones nuevas ([`docs/specs/006-navegacion-por-secciones.md`](./docs/specs/006-navegacion-por-secciones.md)).
- Motor de audio con estados explícitos (`idle → starting → running → stopping`): un doble toque ya no crea dos motores, una falla al arrancar libera micrófono y `AudioContext`, y salir del Afinador siempre apaga el micrófono. Corrige también una carrera del *Wake Lock*.
- Atajo `Espacio` contextual por sección; tras un clic de mouse, el botón pierde el foco y el atajo ya no repite su acción.

### Fase 7 — Metrónomo (`Spec 004`)
- Compases simples, compuestos e irregulares con la figura de pulso correcta en cada caso (`♩`, `♩.`, `♪`), agrupaciones de amalgama, acento opcional y subdivisión ([`docs/specs/004-metrónomo.md`](./docs/specs/004-metrónomo.md)).
- Programación con *look-ahead* sobre el reloj de audio, temporizador en *Web Worker* y línea de tiempo sin deriva (`src/core/rhythm/meters.ts`, verificada con 1000 clics exactos).
- Exclusión mutua con el micrófono del afinador.

### Fase 8 — Diccionario de Acordes (`Spec 003`)
- Motor de intervalos y acordes con ortografía correcta (`src/core/music/intervals.ts`, `chords.ts`): 17 raíces × 20 tipos, 46 combinaciones con dobles alteraciones verificadas ([`docs/specs/003-acordes.md`](./docs/specs/003-acordes.md)).
- Generador de digitaciones (`voicings.ts`) validado en las 340 combinaciones y contra 23 formas de referencia; diagramas SVG accesibles.

### Fase 9 — Identificador de Acordes (`Spec 005`)
- Mástil interactivo para todos los instrumentos y afinaciones del catálogo; motor `chord-identify.ts` que lista todas las lecturas válidas (inversiones, quinta omitida y acordes simétricos) con ortografía de mínimas alteraciones ([`docs/specs/005-identificador-de-acordes.md`](./docs/specs/005-identificador-de-acordes.md)).

### Fase 10 — Identidad Visual *Endurend Musical Gadgets* (`Spec 007`)
- Nuevo nombre visible (*Endurend*, sin cambiar identificadores técnicos), logo en el encabezado, gabinete ocre con sol psicodélico, placas y visor violeta y *footswitch* metálico con LED tipo joya ([`docs/specs/007-identidad-visual-endurend.md`](./docs/specs/007-identidad-visual-endurend.md)).
- Íconos PNG de la PWA (192, 512 y *maskable*), íconos y splash de Android regenerados con la marca (reemplazan el logo por defecto de Capacitor) y paleta en variables CSS con contraste ≥ 4.5:1.

### Fase 11 — Motor Base de Tablaturas, Modelo Canónico y Favicon RGBA (`Spec 008`)
- Corrección de favicon (`32×32` y `64×64`) e íconos estándar/Android en `RGBA` real (`colorType 6`) sin halo ni esquinas negras (`src/icons.test.ts`).
- Modelo canónico puro `ScoreDocument` (`src/core/tabs/model.ts`) con aritmética exacta `PPQ = 960` + racionales irreducibles (`rhythm.ts`), puente bidireccional `alphatab-bridge.ts` y soporte de `.gp`/`.musicxml`/`.mxl`/`.mid`/`.alphatex` ([`docs/specs/008-motor-tablaturas-y-modelo-canonico.md`](./docs/specs/008-motor-tablaturas-y-modelo-canonico.md)).
- Empaquetado local *offline* de `@coderline/alphatab` (`MPL-2.0`), fuente `Bravura` (`OFL-1.1`), `sonivox.sf2` (`Apache-2.0`) y `fflate` (`MIT`) sin `SharedArrayBuffer` ni CDNs, con trabajadores IIFE dedicados cargados bajo demanda (`#/tablaturas/*`).
- Coordinador `AudioArbitrator` (`src/shell/audio-arbitrator.ts`) asegurando exclusión mutua entre micrófono crudo, metrónomo, reproductor de tablaturas y tonos guía.

### Fase 12 — Biblioteca BYOT, Modo Práctica y Gimnasio de Escalas (`Specs 009 y 010`)
- Biblioteca local `IndexedDB` (`src/storage/tabs-db.ts`) con carga automática de **16 ejemplos curados de fábrica**, importación individual/lotes/`.zip`, detección de duplicados SHA-256, favoritos, setlists portables `.zip`, historial reciente y backup total ([`docs/specs/009-reproductor-practica-y-biblioteca-byot.md`](./docs/specs/009-reproductor-practica-y-biblioteca-byot.md)).
- Reproductor Práctica en 3 zonas (`PracticePlayer.tsx`) con cambio de pista sin cortar audio, bucle A–B + bucles guardados, *Speed Trainer* (`15%–150%`), *count-in*, metrónomo, transposición `-12..+12 st`, mezclador multipista, carga de `.sf2` propio y *Screen Wake Lock*.
- Catálogo teórico de 42 escalas/modos/arpegios (`src/core/music/scales.ts`), 5 sistemas de digitación (`3nps`, `caged`, 2 octavas, 1 cuerda y *sweep picking*), generación rítmica exacta `PPQ = 960` con batería/drone modal y consola interactiva `ScaleGym` ([`docs/specs/010-generador-escalas-modos-arpegios.md`](./docs/specs/010-generador-escalas-modos-arpegios.md)).

### Fase 13 — Catálogos Externos Enchufables y Filtros Persistentes (`Spec 011`)
- Validador estricto `CatalogManifestV1` (`src/core/tabs/catalog-manifest.ts`) contra XSS y rutas/esquemas inseguros, importador/exportador portátil `.zip` (`catalog-export.ts`) y gestión manual HTTPS/`offline` sin conexiones automáticas ([`docs/specs/011-catalogos-externos-json.md`](./docs/specs/011-catalogos-externos-json.md)).
- Selector rápido persistente de instrumento con selección automática de pista y filtros secundarios combinados (`library-filters.ts`, `TabsLibrary.tsx`, `CatalogsManager.tsx`).

### Fase 14 — Herramientas de Práctica Integradas y Tonos de Referencia (`Spec 012`)
- Diapasón interactivo en tiempo real (`LiveFretboard.tsx`) con colores por grado modal y teclado virtual (`VirtualKeyboard.tsx`) sincronizados al cursor de audio ([`docs/specs/012-herramientas-practica-integradas.md`](./docs/specs/012-herramientas-practica-integradas.md)).
- Parser/visor `ChordPro` (`chordpro.ts`, `ChordProView.tsx`) con diagramas `< 1 / N >` reutilizando Spec 003 y cálculo de cejilla `Capo 0–12` (`capo.ts`), más hoja de impresión vectorial (`@media print`).
- Puente de **Afinador Guiado por Pista** (`guided-tuning.ts`) conectado al motor `MPMDetector + QIFFT` real sin sobrescribir preferencias de Spec 002, y síntesis Web Audio de **Tonos de Referencia Audibles** (`reference-tone.ts`) arbitrada contra el micrófono.

### Fase 15 — Modo Edición Estilo Guitar Pro (`Spec 013`)
- Arquitectura estricta sobre **Command Bus** reversible (`commands.ts`, `history.ts`) con `Undo/Redo`, `BatchCommand` y protección *copy-on-write* al editar orígenes de fábrica o catálogos ([`docs/specs/013-editor-tablaturas-nucleo.md`](./docs/specs/013-editor-tablaturas-nucleo.md)).
- Cursor rápido `< 16 ms` (`ScoreEditor.tsx`) desacoplado del Worker de render, buffer numérico `400 ms` (`fret-input-buffer.ts`), semáforo rítmico + completado exacto de silencios en `PPQ = 960` (`rest-completion.ts`, `RhythmTrafficLight.tsx`), desplazamiento entre cuerdas conservando MIDI (`Alt+↑/↓`, `string-shift.ts`), inspector multipista (`TrackInspector.tsx`), feedback sonoro y entrada opcional Web MIDI.

### Fase 16 — Edición Avanzada, Exportadores Universales, Beat-Mapper y Revisiones A/B (`Spec 014`)
- Editor vectorial de curvas *Bend/Whammy* (`bend-curve.ts`, `BendEditorModal.tsx`) con presets (`1/2`, `Full`, `Release`, `Pre-bend`, `Hold`), polifonía real `Voz 1 / Voz 2` (`Ctrl/Cmd+1/2`), paleta GM de batería (`DrumPalette.tsx`) y editor dividido de `ChordPro` ([`docs/specs/014-edicion-avanzada-exportacion-y-beat-mapper.md`](./docs/specs/014-edicion-avanzada-exportacion-y-beat-mapper.md)).
- Exportadores puros 100% *offline* sin marcas de agua (`ExportScorePanel.tsx`, `src/core/tabs/exporters/*`) hacia `.gp`, `.musicxml`, `.mxl`, `.alphatex`, `.mid` y `.cho` validados con *round-trip*.
- Sincronizador manual *Beat-Mapper* (`beat-sync.ts`, `BeatMapperView.tsx`) con forma de onda en `<canvas>`, *Tap-Sync* (`B`), interpolación lineal monótona, exportación `.sync.json` y estiramiento temporal *WSOLA* (`15%–150%`) en `AudioWorklet` sin `SharedArrayBuffer` (`wsola.ts`, `wsola.worklet.ts`, `sync-audio-player.ts`).
- Historial de revisiones locales en `IndexedDB` (`ScoreRevisionRecord`) y comparador visual/auditivo `Diff A/B` (`score-diff.ts`, `DiffViewer.tsx`) con restauración reversible en un clic.

---

## 📋 Próximos Hitos y Backlog

- [ ] **Lanzamiento `v0.1.0` en GitHub Releases con firma propia:** generar `release.jks`, configurar los *Secrets* en GitHub y crear el tag `v0.1.0` para publicar el primer `.apk` oficial firmado.
- [ ] **Verificación en dispositivo Android (APK):** pruebas que el CI y Chromium de escritorio no pueden cubrir:
  - costo real del análisis en el `AudioWorklet` en un teléfono de gama media (con `npm run bench` como referencia de escritorio: ~1.3 ms por cuadro) y, si hubiera cortes, evaluar `latencyHint: 'playback'` (la salida del afinador es silenciosa);
  - botón «Atrás» de Android con las rutas por *hash* (sin el plugin `@capacitor/app`);
  - metrónomo con la pantalla bloqueada o la app en segundo plano;
  - si la WebView soporta la *Screen Wake Lock API*: en ese caso, reemplazar `FLAG_KEEP_SCREEN_ON` (hoy mantiene la pantalla encendida aunque el afinador esté detenido) por el bloqueo que ya usa la web;
  - si la app funciona sin el permiso `INTERNET` (es 100% offline): quitarlo haría cumplir esa promesa a nivel del sistema operativo.
- [ ] **Publicación en F-Droid:** preparar metadatos Fastlane (ícono, capturas y descripción en español/inglés) y abrir solicitud en el repositorio de F-Droid.
- [ ] **Spec futuro — Monitor de Estabilidad Temporal (Octavación / Quintaje):** pequeño gráfico histórico de cents para verificar la caída de afinación del ataque al *sustain* al calibrar puentes y cejillas.

### Módulo de Tablaturas, Práctica y Composición (Specs 008–014 — Implementados)

Plan secuencial traducido desde [`docs/informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](./docs/informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md) y [`docs/anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md`](./docs/anexo_t_cnico_generador_de_escalas_modos_arpegios_y_ejemplos_de_f_brica.md) para implementarse fase por fase manteniendo el núcleo DSP y las reglas de Software Libre / *Zero-AI* / *offline*:

- [x] **[Spec 008](./docs/specs/008-motor-tablaturas-y-modelo-canonico.md) — Motor Base, Activos Estáticos y Modelo Canónico (`PPQ = 960`):** 4ª sección `Tablaturas` con carga diferida, `ScoreDocument`, aritmética racional sin punto flotante, empaquetado local de `alphaTab` + `Bravura` + `sonivox.sf2` + `fflate` (sin `SharedArrayBuffer`) y `AudioArbitrator` central.
- [x] **[Spec 009](./docs/specs/009-reproductor-practica-y-biblioteca-byot.md) — Modo Práctica estilo Songsterr y Biblioteca BYOT (`IndexedDB`):** importación por arrastrar/soltar individual, lotes y `.zip`, Favoritos, Setlists portables, *Backup*, reproducción en 3 zonas, bucles A–B, *Speed Trainer* determinístico y mezclador multipista.
- [x] **[Spec 010](./docs/specs/010-generador-escalas-modos-arpegios.md) — Gimnasio de Escalas, Modos, Arpegios y Ejemplos de Fábrica:** 3NPS, cajas CAGED, 2 octavas, 1 cuerda y *Sweep Picking*, patrones rítmicos exactos, batería/drone opcional y **16 ejemplos curados de fábrica** listos desde el primer arranque.
- [x] **[Spec 011](./docs/specs/011-catalogos-externos-json.md) — Catálogos Externos JSON (`CatalogManifestV1`) y Filtro Persistente de Instrumento:** conexiones manuales bajo demanda (`https://` o `.zip` *offline*, cero tráfico automático en segundo plano), caché local, exportador de catálogo propio y selección automática de pista.
- [x] **[Spec 012](./docs/specs/012-herramientas-practica-integradas.md) — Diapasón/Teclado en Vivo, `ChordPro` + `Capo`, Afinador Guiado con Tonos de Referencia e Impresión Limpia:** enlace directo desde las pistas al afinador de 64 bits (`MPMDetector` + `QIFFT`), coloreado por grados, cejilla matemática e integra el ítem anterior de *Tono de Referencia Audible*.
- [x] **[Spec 013](./docs/specs/013-editor-tablaturas-nucleo.md) — Modo Edición estilo Guitar Pro:** cambio modal `Práctica ↔ Edición` (`E`) con *copy-on-write*, *Command Bus* (`Undo/Redo`), *Caret* `< 16 ms`, buffer de trastes (`400 ms`), semáforo rítmico, completado exacto de silencios, técnicas e inspector multipista.
- [x] **[Spec 014](./docs/specs/014-edicion-avanzada-exportacion-y-beat-mapper.md) — Edición Avanzada, Exportadores Universales, *Beat-Mapper* Manual y Revisiones Diff A/B:** editor de curvas *Bend/Whammy*, `Voz 1/2`, kit de batería, exportadores `.gp`/`.musicxml`/`.mxl`/`.alphatex`/`.mid`/`.cho`, *Tap-Sync* + *WSOLA* sin `SharedArrayBuffer` y comparador A/B de revisiones.
