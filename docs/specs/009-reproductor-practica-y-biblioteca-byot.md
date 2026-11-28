# Spec 009 — Modo Práctica Estilo Songsterr y Biblioteca Local BYOT (IndexedDB)

- **ID:** `009`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Almacenamiento (`src/storage/tabs-db.ts`), Núcleo Tablaturas (`src/core/tabs/practice-state.ts`, `speed-trainer.ts`), Audio (`src/audio/tab-audio-engine.ts`), UI Móvil/PC (`src/sections/TabsSection.tsx`, `src/components/tabs/`), PWA (`index.css`)
- **Depende de:** [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md) (`ScoreDocument`, `alphaTab`, `fflate`, `AudioArbitrator`)
- **Origen:** traduce las secciones **§2.1, §2.4 y §3** (más **Fase 1**) de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md).

---

## 1. Problema / Motivación

1. Quienes practican canciones o arreglos propios en formato Guitar Pro, TuxGuitar, MusicXML, MIDI, ChordPro o `alphaTex` hoy no tienen un espacio libre, *offline* y sin suscripciones donde organizar su biblioteca local (*BYOT — Bring Your Own Tabs*) y ensayar con fluidez en móvil o escritorio.
2. Las herramientas comerciales bloquean funciones básicas de estudio (bucle A–B, *Speed Trainer* progresivo, transposición, mezcla multipista o *count-in*) detrás de cuentas o muros de pago.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Biblioteca Local del Usuario (`#/tablaturas`)

1. ***Instant Drop* global (arrastrar y soltar o selector de archivos):**
   - Formatos admitidos: `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp`, `.tg`, `.musicxml`, `.xml`, `.mxl`, `.mid`, `.midi`, `.alphatex`, `.cho` y `.zip`.
   - **Un archivo:** ofrece **«Abrir y tocar ahora»** (apertura inmediata sin ocupar almacenamiento persistente, con botón para conservar) o **«Importar a Mi Biblioteca»** con vista previa de metadatos extraídos automáticamente (título, artista, pistas, afinaciones, BPM y compás).
   - **Múltiples archivos o `.zip`:** importación por lotes con barra de progreso, **detección de duplicados** (hash SHA-256 del binario/modelo o `artista + título`), extracción de metadatos y reporte claro de archivos con error sin detener el lote.
2. **Almacenamiento estructurado (`IndexedDB`):** separa índices livianos de metadatos (para búsqueda difusa instantánea sobre miles de piezas) de los modelos/binarios completos cargados bajo demanda. Permite editar título, artista, álbum, dificultad y etiquetas en archivos mal nombrados.
3. **Sección «Mis Tabs» y organización:**
   - **Buscador difuso en tiempo real:** por título, artista, álbum, afinación, etiquetas y origen.
   - **Favoritos** (estrella).
   - **Setlists / Listas de Ensayo:** crear, reordenar elementos, agregar notas de ensayo por tema, navegar **Anterior / Siguiente** directo dentro del reproductor y exportar/importar un setlist completo como **Paquete Portable de Ensayo (`.zip` con partituras + acordes + sincronizaciones + bucles guardados + orden)**.
   - **Historial reciente:** recuerda última pista activa, velocidad y último compás practicado para retomar exactamente donde se dejó.
   - **Mis Creaciones y Borradores:** filtro directo a piezas creadas o editadas en Modo Edición ([Spec 013](./013-editor-tablaturas-nucleo.md)).
   - **Respaldo total (*Backup Portable*):** exportar e importar en un solo archivo `.zip`/JSON toda la biblioteca local, favoritos, setlists, historial, fuentes configuradas y preferencias.

### 2.2 Modo Práctica estilo Songsterr (`#/tablaturas/practica`)

Consumidor de **solo lectura** de `ScoreDocument` organizado en **3 zonas fijas ergonómicas**:

1. **Zona 1 — Barra Superior:**
   - Izquierda: botón **Volver a Biblioteca** (+ flechas **Anterior / Siguiente** si se abrió desde un Setlist), título, artista (clic filtra por artista) e insignia de origen.
   - Centro-izquierda: **Selector de Pista desplegable (*Track Switcher*)** con ícono de instrumento, nombre, afinación y botones rápidos de `Mute` / `Solo`. **Invariante:** cambiar de pista **nunca detiene la reproducción ni pierde el compás actual**. Junto a él, **Insignia de Afinación** (`DADGBe · Drop D`, `Capo N`) que enlaza al afinador en [Spec 012](./012-herramientas-practica-integradas.md).
   - Derecha: botón destacado **«Editar» (`E`)** ([Spec 013](./013-editor-tablaturas-nucleo.md)), **Selector de Notación** (*Solo Tablatura*, *Tablatura + Pentagrama clásico*, *Solo Pentagrama*), tema de partitura (*Oscuro Endurend*, *Papel cálido*, *Claro alto contraste*) y accesos a *Acordes*, *Diapasón/Teclado*, *Imprimir/Exportar*, *Revisiones*, *Favorito* y *Agregar a Setlist*.
2. **Zona 2 — Lienzo Central Interactivo:**
   - Renderizado en *Web Worker* (`alphaTab`): tablatura vertical continua multipágina u opción horizontal, números de compás, etiquetas de sección y **barra rápida de secciones** clicable.
   - Seguimiento sincronizado al reloj de audio (`requestAnimationFrame` leyendo posición del sintetizador sin disparar re-renders de React en cada sub-pulso): resaltado del compás activo, cursor vertical nota por nota y **auto-scroll inteligente** (si el usuario desplaza manualmente, se pausa y muestra botón flotante **«Volver al cursor»**).
   - **Gestos directos:** clic/toque simple en cualquier compás o nota mueve el cabezal sin cortes; clic y arrastre (o pulsación larga + arrastre en pantalla táctil) sombrea compases y activa el **Bucle (Loop A–B)** con tiradores laterales y **Bucles Favoritos Guardados** con nombre por canción.
3. **Zona 3 — Consola de Práctica:**
   - **Transporte:** Reproducir/Pausar (`Espacio`), Compás anterior/siguiente (`←`/`→`), Inicio (`Home`), contador `mm:ss / mm:ss · Compás X/Y` y barra de progreso con marcadores de sección.
   - **Velocidad (`15%`–`150%`) + *Speed Trainer*:** presets (`25%`, `50%`, `75%`, `85%`, `100%`) y ajuste fino (`1%`/`5%`) mostrando el BPM efectivo, preservando la altura tonal. *Speed Trainer* determinístico sobre el bucle activo (*Velocidad inicial*, *objetivo*, *incremento p. ej. +5%* y *vueltas por etapa*, mostrando `Etapa X/Y · Z% · Vuelta V/N`).
   - **Conteo previo (*Count-in*):** `1` o `2` compases de cuenta regresiva sonora/visual adaptada al compás real del punto de arranque (solo al iniciar o antes de cada vuelta de bucle).
   - **Metrónomo integrado:** sigue los cambios de compás y tempo de la partitura, con volumen independiente, acento del primer tiempo y subdivisiones.
   - **Transposición (`−12` a `+12` semitonos):** cambia el tono del sintetizador y muestra la afinación resultante (`Sonando en E♭ (+1 st)`).
   - **Solo (`S`) y Silenciar mi pista (`Shift+M`)** (*backing track* instantáneo).
   - **Mezclador multipista (*Mixer*):** volumen maestro, volumen del metrónomo de partitura, fila por pista (`0–150%`, paneo `L–C–R`, `Solo`, `Mute`, *Restablecer mezcla*), interruptor de **Marcadores Manuales de Cambio de Pista** y selector de **SoundFont `.sf2` local del usuario** (por encima del `sonivox.sf2` integrado).
   - **Ajustes rápidos:** Zoom (`50%–200%`), **Modo para zurdos**, Tema de partitura, Orientación y Guía de atajos (oculta en dispositivos únicamente táctiles).

- **Comportamiento en celular (`< 900px`):** barra superior y barra inferior condensadas al estilo pedal para maximizar el área del lienzo; Mezclador, *Speed Trainer*, Transposición y Selector de Pistas se abren en hojas/paneles deslizables táctiles (`bottom sheet`) sin tapar los controles de transporte.
- **Comportamiento en escritorio (`>= 900px`):** se aprovecha el ancho de `1380px` para mostrar las 3 zonas completas con lectura multipágina, atajos de teclado de Práctica (`Espacio`, `←/→`, `Home`, `L`, `M`, `C`, `[`/`]`, `S`, `Shift+M`, `E`, `Esc`), pausados automáticamente cuando el foco está en `<input>`, `<textarea>` o `<select>`.
- **Persistencia / Estado:** `IndexedDB` (`endurend_tabs_db`) para partituras, favoritos, setlists, historial, bucles guardados, Revisiones y `.sf2` locales del usuario; `localStorage` (`endurend_practice_prefs`) para zoom, tema de partitura, modo zurdo y velocidad por defecto.

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/storage/tabs-db.ts`:** capa pura/asíncrona sobre `IndexedDB` con interfaz inyectable para correr íntegra en Vitest con un backend en memoria.
- **`src/core/tabs/practice-state.ts` y `speed-trainer.ts`:** máquinas de estado 100% puras (transposición, avance de etapas del *Speed Trainer* en bordes de bucle, resolución de bucles A–B y navegación de Setlists).
- **`src/audio/tab-audio-engine.ts`:** coordina el sintetizador de `alphaTab` con `AudioArbitrator` (Spec 008), reporta `setAudioBusy('tabs', playing)` e incorpora **Screen Wake Lock** mientras reproduce.
- **DSP:** sin cambios. Al activar el micrófono del Afinador, `TabAudioEngine` se pausa automáticamente.

---

## 4. Fuera de Alcance

- Edición de notas y Command Bus ([Spec 013](./013-editor-tablaturas-nucleo.md)).
- Generador de escalas ([Spec 010](./010-generador-escalas-modos-arpegios.md)) y catálogos externos ([Spec 011](./011-catalogos-externos-json.md)).
- Sincronizador manual con audio local (Beat-Mapper) y Revisiones Diff A/B ([Spec 014](./014-edicion-avanzada-exportacion-y-beat-mapper.md)).

---

## 5. Criterios de Aceptación y Tests

- [x] `tabs-db.test.ts`: importación individual, por lotes y desde `.zip` (con un archivo corrupto en medio sin abortar el resto); detección de duplicados; edición de metadatos; Setlist portable (exportar `.zip` → reimportar idéntico) y Backup portable completo.
- [x] `speed-trainer.test.ts`: máquina de estados pura validando incrementos (`25% → 100%` en pasos de `+5%` cada `N` vueltas), tope en velocidad objetivo, reinicio al desactivar bucle y preservación de límites `15%–150%`.
- [x] `practice-state.test.ts`: transposición `−12..+12`, cálculo de afinación resultante usando `spelling.ts`, cambio de pista conservando tick/compás y límites válidos de bucle A–B.
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`) de Biblioteca y Modo Práctica.
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Separación índice / binario en `IndexedDB`:** permite filtrar y buscar miles de temas en milisegundos sin deserializar binarios ni árboles de notas hasta abrir la canción.
2. **Solo lectura estricta en Modo Práctica:** evita mutaciones accidentales al usar atajos rápidos o gestos de bucle sobre el lienzo.
3. **Estilos del chasis en Spec 007 + tema seleccionable en el visor de partitura:** mantiene la identidad Endurend en los controles y permite lectura *Oscuro*, *Papel cálido* o *Claro* donde el músico lee notas densas.
