# Informe Maestro de Producto y Arquitectura: Módulo Web de Tablaturas y Composición (Modo Práctica estilo Songsterr + Modo Edición estilo Guitar Pro)

> **Instrucción directa para Antigravity (AGY):**  
> Este documento (junto con su anexo `02_SPEC_SCALES_ARPEGGIOS_GENERATOR.md`) constituye la **fuente de verdad funcional y arquitectónica** para derivar las especificaciones técnicas (*specs*) siguiendo la convención actual de este repositorio e implementar el sistema por fases verificables.  
> **Reglas globales innegociables:**
> 1. **100% Software Libre (licencia GNU) y sin restricciones:** Todas las funcionalidades están habilitadas por igual para todos los usuarios. Cero suscripciones, cero muros de pago, cero anuncios, cero cuentas obligatorias.
> 2. **Cero Inteligencia Artificial (Zero-AI):** Queda estrictamente prohibida cualquier función basada en IA o Machine Learning. Toda transcripción, edición, validación rítmica, afinación, estiramiento temporal, generación de escalas y sincronización de audio debe ser 100% humana y/o matemática determinística.
> 3. **Cero servicios privativos:** Prohibido YouTube IFrame API, SDKs de Google/Apple, Firebase, telemetría o dependencias obligatorias de CDNs externos para activos críticos.
> 4. **Compatibilidad total con hosting estático (GitHub Pages) y Local-First:** Ejecución 100% del lado del cliente sin backend obligatorio, sin dependencia de `SharedArrayBuffer`, con resolución segura de rutas relativas al `BASE_URL` del repositorio y funcionamiento completo sin conexión (*offline*).

---

## 1. Arquitectura Conceptual: Un Solo Espacio de Trabajo con Dos Modos Explícitos

Para evitar conflictos de atajos/gestos, ediciones accidentales mientras se toca y saturación visual —pero permitiendo corregir cualquier compás en segundos sin salir de la canción—, el sistema utiliza **un único motor de partitura y audio** bajo una **arquitectura modal estricta**:

### 1.1 Dos Entradas Claras en la Navegación de la WebApp
1. **«Biblioteca / Practicar»:** Abre la biblioteca unificada (archivos importados, ejercicios de fábrica, generador de escalas/arpegios y catálogos externos). Al abrir cualquier pieza, entra siempre en **Modo Práctica (solo lectura segura)**.
2. **«Estudio / Crear Tablatura»:** Abre una nueva partitura (o el último borrador editado) directamente en **Modo Edición**, ofreciendo la experiencia de un Guitar Pro / TuxGuitar web moderno.

### 1.2 Cambio Instantáneo Entre Modos
* Desde cualquier canción en **Modo Práctica**, el botón **«Editar»** (atajo `E`) cambia instantáneamente a **Modo Edición** conservando exactamente la **misma pista, compás y posición de desplazamiento**.
* Si la canción proviene de un catálogo externo, del paquete demo o del generador de escalas, al realizar la primera modificación se crea automáticamente una **copia editable local** vinculada a su origen.
* Al pulsar **«Volver a Práctica»**, se ocultan las paletas de edición, se desactivan los atajos de escritura y el usuario practica de inmediato sus cambios.

### 1.3 Frontera de Responsabilidades en Código
* **Modo Práctica:** Consumidor de solo lectura de `ScoreDocument`. Controla transporte, bucle, velocidad, metrónomo, conteo previo, transposición, mezclador y vistas auxiliares.
* **Modo Edición:** Única capa autorizada a mutar `ScoreDocument`, estrictamente a través de un **Command Bus reversible** (`execute`, `undo`, `redo`) para garantizar integridad rítmica y trazabilidad.

---

## 2. Modelo de Contenido: BYOT + Catálogos Externos Enchufables + Escalas/Ejemplos + Paquetes de Ensayo

El módulo unifica cuatro fuentes de contenido dentro de una única interfaz de Biblioteca:

### 2.1 Biblioteca Local del Usuario (BYOT — *Bring Your Own Tabs*)
* **Arrastrar y soltar global (*Instant Drop*):**
  * Formatos admitidos: `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp` (Guitar Pro 3–8), `.tg` (TuxGuitar), `.musicxml`, `.xml`, `.mxl`, `.mid`, `.midi`, `.alphatex`, `.cho` (ChordPro) y archivos `.zip` con colecciones.
  * **1 archivo:** Ofrece **«Abrir y tocar ahora»** (apertura inmediata sin guardar, con botón opcional para conservar) o **«Importar a Mi Biblioteca»** con vista previa de metadatos extraídos automáticamente.
  * **Múltiples archivos o `.zip`:** Importación por lotes con barra de progreso, detección de duplicados (hash o `Artista + Título`), extracción automática de título, artista, pistas, afinaciones, BPM y compás, y reporte de archivos con error sin detener el lote.
* **Persistencia local (`IndexedDB`):** Separa índices livianos de metadatos (búsqueda instantánea sobre cientos/miles de temas) de los binarios/modelos completos (cargados bajo demanda).
* **Metadatos editables:** Permite corregir título, artista, álbum, dificultad y etiquetas en archivos importados mal nombrados.

### 2.2 Escalas, Modos, Arpegios y Ejemplos Curados de Fábrica
* Se integra con el módulo especificado en `02_SPEC_SCALES_ARPEGGIOS_GENERATOR.md`, proporcionando:
  * **15+ ejercicios y piezas curadas de fábrica** precargadas en la biblioteca inicial (multipista con batería/bajo/guitarra) listas en 1 clic.
  * **Pestaña/Sección «Gimnasio de Escalas y Arpegios»** que genera `ScoreDocument` válidos al vuelo (modos griegos, menor armónica, menor melódica, pentatónicas, blues, simétricas y arpegios) reproducibles en Modo Práctica y editables en Modo Edición.

### 2.3 Catálogos Externos Enchufables (Protocolo JSON Estándar)
* Desde **«Catálogos / Fuentes»**, cualquier usuario, banda, docente o comunidad puede conectar una o más URLs externas que apunten a un archivo estático `catalog.json`.
* **Flujo y gestión:**
  * Pegar URL → validación estricta contra `CatalogManifestV1` → vista previa (nombre, descripción, mantenedor, licencia, cantidad de temas) → confirmar conexión.
  * Diagnóstico claro si falla red, CORS o formato JSON.
  * Acciones por fuente: **Activar/Desactivar**, **Actualizar índice**, **Descargar catálogo completo offline** (con barra de progreso y espacio estimado), **Clonar tema individual a Mi Biblioteca** y **Eliminar fuente**.
  * **Resiliencia y seguridad:** Si una fuente remota cae, la app sigue operando al 100% con su caché local. Todos los campos de texto se sanitizan y las URLs se restringen a rutas relativas seguras o `https://`.
* **Esquema `CatalogManifestV1`:**
```json
{
  "schemaVersion": "1.0",
  "catalog": {
    "id": "repertorio-abierto",
    "name": "Repertorio Abierto de Práctica",
    "description": "Obras de dominio público, ejercicios y arreglos abiertos.",
    "maintainer": "Comunidad",
    "homepage": "https://ejemplo.org/tabs",
    "license": "CC-BY-SA-4.0",
    "updatedAt": "2026-11-27T10:00:00Z",
    "baseUrl": "./"
  },
  "songs": [
    {
      "id": "bach-bourree-em",
      "title": "Bourrée in E minor (BWV 996)",
      "artist": "Johann Sebastian Bach",
      "bpm": 120,
      "timeSignature": "2/2",
      "difficulty": "intermediate",
      "tags": ["classical", "fingerstyle"],
      "license": "Public-Domain",
      "scoreUrl": "songs/bach-bourree-em/score.gp",
      "scoreFormat": "gp",
      "chordsUrl": "songs/bach-bourree-em/chords.cho",
      "syncUrl": "songs/bach-bourree-em/sync.json",
      "updatedAt": "2026-11-20T10:00:00Z",
      "tracks": [
        {
          "index": 0,
          "name": "Acoustic Guitar (nylon)",
          "instrumentFamily": "guitar",
          "tuningName": "Standard",
          "tuningNotes": ["E2", "A2", "D3", "G3", "B3", "E4"],
          "capo": 0
        }
      ]
    }
  ]
}
```
* **Generador de Catálogo Propio:** Permite seleccionar canciones locales y exportar un `.zip` con `catalog.json` + archivos de partitura listo para publicar en cualquier hosting estático.

### 2.4 Buscador Unificado, Filtros y «Mis Tabs»
* **Buscador difuso en tiempo real:** Busca por título, artista, álbum, afinación, etiquetas y fuente.
* **Filtro persistente de instrumento (comportamiento Songsterr):** Selector rápido (*Todos*, *Guitarra*, *Bajo*, *Batería*, *Teclado*, *Otros*). Al activar un instrumento (ej. *Bajo*), se ocultan canciones sin esa pista y, al abrir cualquier tema, el reproductor **selecciona automáticamente esa pista**.
* **Filtros secundarios:** Origen/Fuente, afinación exacta, compás, rango de BPM, dificultad, con vista de acordes, con audio sincronizado, disponible offline.
* **Sección «Mis Tabs»:**
  * **Favoritos** (estrella).
  * **Setlists / Listas de Ensayo:** Crear, reordenar arrastrando, agregar notas de ensayo por canción, navegar anterior/siguiente desde el reproductor y **exportar/importar el setlist completo como Paquete Portable de Ensayo** (partituras + acordes + syncs manuales + bucles guardados + orden).
  * **Historial reciente:** Guarda última pista, velocidad y compás practicado para retomar exactamente donde se dejó.
  * **Mis Creaciones y Borradores:** Canciones creadas desde cero o editadas localmente.
  * **Respaldo total (Backup Portable):** Exportar e importar toda la biblioteca local, favoritos, setlists, historial, fuentes conectadas y preferencias en un único archivo.

---

## 3. Modo Práctica: Experiencia Completa Estilo Songsterr

El reproductor se organiza en **3 zonas fijas ergonómicas**:

### 3.1 Zona 1: Barra Superior Fija
* **Izquierda:** Volver a Biblioteca (+ flechas Anterior/Siguiente si proviene de un Setlist), Título, Artista (clic filtra por artista) e insignia de origen.
* **Centro-Izquierda (Pista y Afinación):**
  * **Selector de Pista desplegable (Track Switcher):** Muestra icono de instrumento y nombre. Lista todas las pistas con afinación y botones rápidos de `Mute` y `Solo`. **Regla crítica:** cambiar de pista nunca detiene la reproducción ni pierde el compás actual.
  * **Insignia de Afinación (Tuning Badge):** Muestra la afinación exacta (ej. `DADGBe · Drop D` y `Capo N` si aplica). Hacer clic abre el **Afinador Cromático** preconfigurado en esa afinación.
* **Derecha (Modos y Acciones):**
  * Botón destacado **«Editar»** (`E`) para pasar al Modo Edición en el mismo compás.
  * **Selector de Notación:** *Solo Tablatura*, *Tablatura + Pentagrama clásico* o *Solo Pentagrama*.
  * **Botón «Acordes»**, **«Diapasón / Teclado»**, **«Imprimir / Exportar»**, **«Revisiones»**, **«Favorito»**, **«Agregar a Setlist»** y **«Compartir»**.

### 3.2 Zona 2: Lienzo Central Interactivo
* **Renderizado:** Tablatura vertical continua multipágina (con opción horizontal), números de compás, etiquetas de sección (`Intro`, `Verse`, `Chorus`, `Solo`, `Outro`) y **barra rápida de secciones** clicable.
* **Seguimiento en tiempo real:** Resaltado del compás activo, cursor vertical preciso nota por nota y **auto-scroll inteligente** (si el usuario hace scroll manual, se pausa y muestra botón flotante **«Volver al cursor»**).
* **Gestos directos (idénticos a Songsterr):**
  * **Clic / toque simple en cualquier compás o nota:** Mueve el cabezal exactamente a ese pulso (incluso reproduciendo, sin cortes).
  * **Clic y arrastre (o pulsación larga + arrastre en móvil):** Sombrea los compases y **activa automáticamente el Bucle (Loop A-B)** con tiradores laterales para ajustar bordes.

### 3.3 Zona 3: Barra Inferior Fija (Consola de Práctica)
1. **Transporte:** **Reproducir / Pausar** (`Espacio`), Compás anterior/siguiente (`←`/`→`), Inicio (`Home`), contador de tiempo y compás (`01:24 / 04:15 · Compás 34/118`) y barra de progreso con marcas de secciones.
2. **Velocidad (`15%` a `150%`) + Speed Trainer:**
   * Presets (`25%`, `50%`, `75%`, `85%`, `100%`) y control fino (`1%`/`5%`) mostrando BPM efectivo.
   * **Preservación de tono (*Pitch-Preserving*)** tanto en sintetizador como en audio local.
   * **Entrenador Progresivo de Velocidad (Speed Trainer):** Rutina determinística sobre el bucle activo configurando *Velocidad inicial*, *Velocidad objetivo*, *Incremento* (`+5%`) y *Vueltas por etapa*, con progreso en vivo (`Etapa 3/9 · 70% · Vuelta 1/2`).
3. **Bucle (Loop A-B) y Bucles Guardados:** Activar/desactivar (`L`), entrada numérica `inicio–fin` y guardado de **Bucles Favoritos con nombre** por canción.
4. **Conteo Previo (Count-in):** `1` o `2` compases de cuenta regresiva sonora y visual adaptada a la métrica real del punto de arranque; configurable solo al inicio o también antes de cada vuelta del bucle.
5. **Metrónomo Integrado:** Sigue cambios de compás y tempo; volumen propio, acento en primer tiempo y subdivisiones (negras, corcheas, tresillos, semicorcheas).
6. **Transposición (`-12` a `+12` semitonos):** Cambia el tono de reproducción mostrando la afinación resultante (ej. tema en `Eb` con `+1` indica `Sonando en: EADGBe (+1 st)`).
7. **Solo (`S`) y Silenciar mi Pista (`Shift+M`):** Aísla la pista o la silencia como *Backing Track*.
8. **Mezclador Multipista (Mixer):** Volumen maestro, volumen metrónomo y fila por pista con fader (`0–150%`), paneo estéreo (`L–C–R`), `Solo`, `Mute`, *Restablecer mezcla* e interruptor opcional para **Marcadores Manuales de Cambio de Pista** (sin IA).
9. **Fuente de Audio:**
   * **Sintetizador SoundFont libre** integrado + opción de cargar cualquier `.sf2` local del usuario.
   * **Audio de Referencia Local Sincronizado** (`.mp3`, `.flac`, `.ogg`, `.wav`) con control de balance entre audio real y sintetizador.
10. **Ajustes Rápidos:** Zoom (`50%–200%`), **Modo para zurdos**, Tema (Claro / Oscuro / Papel), orientación y guía de atajos.

---

## 4. Herramientas Musicales Complementarias

### 4.1 Visualizador de Diapasón y Teclado en Tiempo Real
* Se adapta automáticamente a `4–8` cuerdas (`0–24` trastes, marcadores, línea de cejilla y afinación) o piano virtual.
* En **Modo Práctica** ilumina en tiempo real las notas sonando; cuando se practica una escala/arpegio del generador, soporta **coloreado por grados musicales** (tónica, tercera, quinta, séptima y nota característica modal).
* En **Modo Edición** permite hacer clic en cualquier traste/tecla para escribir la nota en el cursor activo. Respeta **Modo para Zurdos** y se oculta en batería.

### 4.2 Vista de Acordes, Letras y Cejilla (Capo)
* Letra por secciones con acordes alineados sobre la sílaba exacta (formato **ChordPro** o extraídos de la partitura).
* **Diagramas de acordes interactivos:** Cuerdas al aire (`O`), silenciadas (`X`), cejillas, traste inicial, digitación (`1–4`) y selector **`< 1 / N >`** de múltiples posiciones.
* **Cejilla (Capo) dinámica (`0–12`):** Recalcula matemáticamente acordes y diagramas al instante (ej. `Sonando en Bb · Formas con Capo 1`).
* Transposición (`#`/`b`), auto-scroll regulable, 1/2 columnas y **Modo para Zurdos**.

### 4.3 Afinador Cromático Integrado (100% Matemático, sin IA)
* Captura señal pura del micrófono/interfaz (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`).
* Detección de frecuencia fundamental $f$ en tiempo real mediante algoritmo **YIN** (o autocorrelación normalizada).
* Cálculo exacto de desviación en centésimas respecto a $f_{\text{ref}}(n) = f_{A4} \cdot 2^{(n - 69)/12}$ ($f_{A4}$ calibrable entre $430\text{ Hz}$ y $450\text{ Hz}$, por defecto $440\text{ Hz}$):
  $$\Delta c = 1200 \cdot \log_2\left(\frac{f}{f_{\text{ref}}}\right)$$
* **Modo Guiado por Canción** (carga automáticamente las cuerdas de la pista activa y marca en verde al estabilizar dentro de $\pm 3$ cents), **Modo Cromático Libre** y **Tonos de referencia audibles** por cuerda.

---

## 5. Modo Edición: Editor Moderno Estilo Guitar Pro / TuxGuitar

Diseñado bajo una premisa central: **escritura musical completa al 100% desde el teclado, sin depender del ratón**.

### 5.1 Disposición de Pantalla en Modo Edición
1. **Barra Superior de Documento:** Título editable, botón **«Volver a Práctica»**, estado de guardado + botón **Guardar Revisión**, **Deshacer (`Ctrl+Z`)** / **Rehacer (`Ctrl+Y`)**, **Play desde cursor (`Espacio`)**, botón de **Feedback sonoro al escribir**, indicador clicable del **Validador de Compases** y botón **Exportar**.
2. **Panel Izquierdo Compacto (Paleta Contextual):** Se adapta a Cuerdas / Batería / Teclado:
   * **Ritmo:** Redonda a semifusa, puntillo, doble puntillo, silencio, ligadura (*tie*), grupos irregulares (`3`, `5`, `6`, `7`).
   * **Técnicas:** *Hammer/Pull*, *Slide* (legato, shift, in/out), *Bend* (con editor visual de curva), *Vibrato*, *Wide Vibrato*, *Whammy*, *Palm Mute*, *Let Ring*, *Dead Note*, *Ghost Note*, *Armónicos* (Natural, Artificial, Pinch, Tap), *Tapping*, *Slap/Pop*, *Grace Note*, *Staccato*, *Acento*, *Marcato*, *Dirección de púa*, *Brush/Arpeggio*, *Tremolo Picking*, *Trino* y *Dinámicas (`ppp`–`fff`, crescendo/decrescendo)*.
   * **Estructura:** Cifra de compás, tempo (BPM), armadura de clave, repeticiones (`xN`), casillas (`1.`, `2.`), *D.C./D.S./Coda*, etiqueta de sección, diagrama de acorde sobre pulso, letra bajo pulso y **Marcador manual de cambio de pista**.
3. **Lienzo Central Editable:**
   * **Cursor de Edición (Caret)** claro sobre pista, compás, voz, pulso y cuerda activos.
   * **Semáforo rítmico por compás:** Neutro/verde (completo), ámbar (incompleto) o rojo (excedido).
   * **Selección por ratón o `Shift + Flechas`:** Para cortar, copiar, pegar, duplicar, borrar, aplicar técnicas en bloque o transponer.
4. **Panel Inferior / Lateral de Pistas e Inspector:**
   * **Gestor Multipista:** Agregar, duplicar, reordenar, eliminar pistas; sonido General MIDI, modo percusión, `4–8` cuerdas, afinación cuerda por cuerda (con presets populares) y cejilla.
   * **Selector de Voz (`Voz 1` / `Voz 2`):** Polifonía real atenuando visualmente la voz inactiva.
   * **Pestaña «Acordes / Letra (ChordPro)»:** Editor dividido con previsualización en vivo.

### 5.2 Reglas Rítmicas y Ergonomía de Escritura
1. **Duración persistente (*Sticky Duration*):** Las notas nuevas heredan la última duración activa hasta cambiarla con `+`/`-`.
2. **Buffer numérico de 2 dígitos (`400 ms`):** Pulsar `1` y luego `5` en menos de `400 ms` escribe traste `15`; esperar o pulsar `→` confirma `1`. Valida rango contra el mástil (`0–24`, ampliable a `30`).
3. **Avance y creación fluida:** `→` al final del último compás lleno crea un nuevo compás automáticamente; `Insert` inserta un pulso antes del cursor; escribir en otra cuerda del mismo pulso agrega notas simultáneas (acorde).
4. **Aritmética racional exacta:** Todas las duraciones internas usan **ticks enteros de alta resolución (`PPQ = 960` por negra, divisible por 2, 3, 4, 5, 6, 7, 8, 12, 16, 32) o fracciones exactas `num/den`** —**NUNCA** punto flotante— evitando errores de redondeo en tresillos, quintillos o septillos.
5. **Completado determinístico opcional:** Botón/atajo para rellenar huecos finales de un compás incompleto con la combinación mínima exacta de silencios.
6. **Movimiento inteligente entre cuerdas (`Alt + ↑ / ↓`):** Desplaza la nota seleccionada a la cuerda adyacente recalculando el traste para conservar exactamente la misma altura MIDI.
7. **Editores especializados:**
   * **Editor visual de Curva de Bend/Whammy:** Grilla temporal (`0–100%`) vs cuartos de tono (`-4` a `+4`), presets (`1/2`, `Full`, `Release`, `Pre-bend`, `Hold`) y nodos arrastrables.
   * **Editor de Batería:** Paleta con piezas estándar del kit (Bombo, Caja, Rimshot, Sidestick, Hi-Hat cerrado/abierto/pedal, Toms, Crash, Ride, Bell, China, Splash) y etiqueta flotante al moverse con `↑`/`↓`.

### 5.3 Modelo Mutable, Command Bus y Rendimiento en Vivo
* **Modelo Canónico (`ScoreDocument`):** Árbol limpio TypeScript/JSON (`tracks[]`, `masterBars[]` → `bars[]` → `voices[]` → `beats[]` → `notes[]`).
* **Command Pattern (`HistoryManager`):** Toda edición pasa por un objeto `Command` con `execute()` y `undo()`, soportando transacciones agrupadas (*batch*) para que `Ctrl+Z` deshaga operaciones masivas en un paso. Autoguardado debounced (`1.5 s`) en `IndexedDB`.
* **Renderizado sin lag:** Capa ligera inmediata (`< 16 ms`) para el Caret y el número tecleado + sincronización en memoria hacia el renderizador (`alphaTab`) en Web Worker sin reiniciar el motor de audio ni perder el foco del teclado.

---

## 6. Sincronizador Manual de Audio (Beat-Mapper), Revisiones (Diff) y Exportación

### 6.1 Sincronizador Manual de Audio Local (Sin IA)
* Carga archivo de audio local (`.mp3`, `.flac`, `.ogg`, `.wav`) en memoria y dibuja la **forma de onda (waveform)** con zoom.
* **Tap-Sync en vivo:** Pulsar **`B`** en cada primer tiempo (*downbeat*) planta líneas numeradas de compás.
* **Ajuste fino:** Arrastrar líneas sobre la forma de onda, micro-ajustes de $\pm 10\text{ ms}$ o marcado cada `4`/`8` compases con **interpolación lineal** de intermedios.
* **Prueba inmediata** en pantalla dividida con time-stretching determinístico (WASM single-thread / DSP sin `SharedArrayBuffer`).
* Guarda y exporta `.sync.json` (`[compás, segundos]` + hash SHA-256 opcional para auto-emparejamiento).

### 6.2 Historial de Revisiones Local y Comparador A/B (Diff)
* Permite guardar snapshots nombrados (*«Corregido solo compases 45-52»*).
* **Comparador A/B:** Lista cambios globales, marca los **compases exactos modificados**, resalta diferencias visuales y permite **escuchar Versión A vs. Versión B** compás a compás o restaurar una revisión anterior.

### 6.3 Exportación Universal e Impresión Limpia
1. **Guitar Pro moderno (`.gp` — GP7/GP8):** Contenedor `.zip` estándar con `Content/score.gpif` (XML compatible con Guitar Pro 7/8, TuxGuitar y MuseScore).
2. **`MusicXML` (`.musicxml`/`.mxl`)**, **`alphaTex` (`.alphatex`)**, **`MIDI` (`.mid`)**, **`ChordPro` (`.cho`)** y **`.sync.json`**.
3. **Impresión limpia / `PDF` (`@media print`):** Alto contraste vectorial negro sobre blanco, sin interfaz, sin cortar sistemas entre páginas, configurable por pistas y modo (Tablatura, Pentagrama o Acordes).

---

## 7. Mapa Maestro de Atajos de Teclado

*(Pausados automáticamente cuando el foco está en `<input>` o `<textarea>`).*

| Modo | Atajo | Acción |
|---|---|---|
| **Global** | `E` | Alternar **Modo Práctica ↔ Modo Edición** en el mismo compás |
| **Global** | `Espacio` | Reproducir / Pausar (en Edición reproduce desde el cursor) |
| **Global** | `T` / `F` | Abrir Afinador cromático / Mostrar u ocultar Diapasón interactivo |
| **Práctica** | `←` / `→` / `Home` | Compás anterior / siguiente / compás 1 |
| **Práctica** | `L` / `Esc` | Alternar Bucle / limpiar bucle o cerrar modal |
| **Práctica** | `M` / `C` | Metrónomo / Conteo previo (Count-in) |
| **Práctica** | `[` / `]` | Velocidad `-5%` / `+5%` |
| **Práctica** | `S` / `Shift + M` | Solo / Silenciar pista activa |
| **Edición** | `0`–`9` | Escribir traste (buffer `400 ms` para trastes `10–24`) |
| **Edición** | `↑` `↓` `←` `→` / `Tab` | Mover cursor por cuerdas, pulsos y compases |
| **Edición** | `Alt + ↑` / `Alt + ↓` | Mover nota a cuerda adyacente conservando altura tonal |
| **Edición** | `+` / `-` / `.` / `R` / `L` | Duración / puntillo / silencio / ligadura (*Tie*) |
| **Edición** | `Supr` / `Insert` | Borrar nota o pulso / Insertar pulso antes del cursor |
| **Edición** | `H`, `S`, `B`, `V`, `P`, `X`, `N`, `G`, `A` | Hammer-Pull, Slide, Bend, Vibrato, Palm Mute, Dead, Natural Harmonic, Ghost, Acorde |
| **Edición** | `Ctrl/Cmd + 1 / 2` | Cambiar entre **Voz 1** y **Voz 2** |
| **Edición** | `Ctrl/Cmd + C/X/V/Z/Y/S` | Copiar, Cortar, Pegar, Deshacer, Rehacer, Guardar Revisión |
| **Beat-Mapper** | `B` | Marcar inicio de compás (*downbeat*) sobre audio en vivo |

---

## 8. Plan Maestro de Fases (Para Traducir a Specs del Repositorio)

Antigravity debe mapear estas fases a la estructura de *specs* existente en el repositorio y ejecutarlas de forma secuencial y verificable:

* **Fase 0 — Auditoría, Activos Estáticos y Modelo Canónico:** Inspección de la webapp anfitriona, empaquetado local de `alphaTab` (sin `SharedArrayBuffer`), fuente SMuFL y SoundFont libre con resolución segura de `BASE_URL`, más definición de `ScoreDocument` (`PPQ = 960`) y puente bidireccional con `alphaTab`.
* **Fase 1 — Reproductor Completo (Modo Práctica Songsterr) + BYOT Local:** Layout de 3 zonas, transporte, selección de bucle por arrastre, velocidad (`15–150%`), Speed Trainer, count-in, metrónomo, transposición, solo/mute, mezclador, `IndexedDB`, importador *Drag & Drop* individual/lotes/`.zip`, Favoritos, Setlists, Historial, Bucles guardados y Backup portable.
* **Fase 2 — Generador Procedimental de Escalas, Modos, Arpegios y Ejemplos de Fábrica:** Implementación completa de `02_SPEC_SCALES_ARPEGGIOS_GENERATOR.md` (teoría musical determinística, algoritmos de digitación, pista opcional de batería/drone, 15+ ejemplos curados y coloreado por grados en el diapasón).
* **Fase 3 — Catálogos Externos Enchufables (JSON) y Paquetes de Ensayo:** Gestor de fuentes `CatalogManifestV1`, caché offline, clonado local, filtro persistente por instrumento, exportación de Setlist portable y generador de carpeta de catálogo propio.
* **Fase 4 — Utilidades Musicales:** Vista de Acordes + ChordPro + Capo matemático, Afinador Cromático YIN (guiado + libre + tonos de referencia), Visualizador de Diapasón/Teclado en vivo y vista de Impresión / PDF limpia.
* **Fase 5 — Modo Edición Pragmático (Núcleo Guitar Pro / TuxGuitar Web):** Switch modal `Práctica ↔ Edición`, `HistoryManager` (Command Bus `Undo/Redo`), Caret y escritura 100% teclado, feedback sonoro, semáforo rítmico, gestor multipista, técnicas esenciales, entrada por diapasón/Web MIDI y autoguardado.
* **Fase 6 — Edición Avanzada, Exportadores Universales, Beat-Mapper y Revisiones Diff:** Editor visual de curvas Bend/Whammy, Voces múltiples (`Voz 1/2`), editor de kit de batería, editor ChordPro dividido, exportadores `.gp` (ZIP + `score.gpif`), `MusicXML`, `alphaTex`, `MIDI`, Beat-Mapper manual con forma de onda y Comparador visual/auditivo de revisiones (Diff A/B).