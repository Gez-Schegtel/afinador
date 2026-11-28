# Especificación Técnica y Funcional: Generador Procedimental de Escalas, Modos, Arpegios y Ejemplos de Fábrica

> **Propósito del módulo:**  
> Proveer contenido musical real, útil y 100% libre de restricciones legales desde el primer segundo en que se abre la aplicación. En lugar de almacenar cientos de archivos estáticos pesados, este módulo implementa un **motor determinístico de teoría musical y digitación (cero IA)** que genera instancias completas y válidas de `ScoreDocument` al instante, listas para practicarse en **Modo Práctica (Songsterr)** y personalizarse en **Modo Edición (Guitar Pro)**.

---

## 1. Integración en la Experiencia de Usuario

El módulo expone dos puntos de acceso complementarios:

1. **Ejemplos Curados de Fábrica (en la Biblioteca Principal):**
   * Al abrir la app por primera vez, la biblioteca ya muestra una colección inicial (15–18 ítems etiquetados como `Fábrica / Práctica`) que cubren modos griegos, menor armónica, menor melódica, arpegios, ritmos y estudios técnicos multipista (con pista de batería y acompañamiento de bajo/acorde).
   * Cualquier usuario hace clic en uno y prueba de inmediato todas las funciones de la app (reproductor, mezclador, bucle, Speed Trainer, diapasón coloreado por grados y edición).
2. **Sección «Gimnasio de Escalas y Arpegios» (Generador Interactivo):**
   * Panel limpio e intuitivo donde el músico elige **Categoría**, **Escala/Arpegio**, **Tonalidad**, **Instrumento/Afinación**, **Sistema de Digitación**, **Posición**, **Patrón/Secuencia**, **Figura Rítmica**, **Tempo (BPM)** y **Acompañamiento opcional**.
   * Muestra una **vista previa instantánea del diagrama del diapasón** coloreado por grados musicales y la fórmula de intervalos (ej. `1 - 2 - b3 - 4 - 5 - 6 - b7`), junto a dos botones:
     * **«Practicar ahora»:** Genera el `ScoreDocument` en memoria y lo abre directamente en **Modo Práctica** (con bucle automático opcional del ejercicio completo).
     * **«Guardar en Mi Biblioteca» / «Abrir en Editor»:** Guarda el ejercicio generado en `IndexedDB` (permitiendo armar rutinas de práctica en Setlists) o lo abre en **Modo Edición** para transformarlo en un *lick* o estudio propio.

---

## 2. Catálogo Teórico Incluido por Defecto (Fórmulas Exactas en Semitonos)

Cada escala o arpegio se define matemáticamente mediante su vector de intervalos en semitonos desde la tónica (`0`), sus etiquetas de grado (para coloreado y teoría) y su **grado característico** (resaltado visualmente en los modos).

### 2.1 Escalas Diatónicas — Los 7 Modos Griegos
| Nombre | Intervalos (semitonos) | Fórmula de grados | Nota(s) característica(s) |
|---|---|---|---|
| **Jónico (Mayor)** | `[0, 2, 4, 5, 7, 9, 11]` | `1, 2, 3, 4, 5, 6, 7` | `4`, `7` |
| **Dórico** | `[0, 2, 3, 5, 7, 9, 10]` | `1, 2, b3, 4, 5, 6, b7` | `6` (sexta mayor) |
| **Frigio** | `[0, 1, 3, 5, 7, 8, 10]` | `1, b2, b3, 4, 5, b6, b7` | `b2` (segunda menor) |
| **Lidio** | `[0, 2, 4, 6, 7, 9, 11]` | `1, 2, 3, #4, 5, 6, 7` | `#4` (cuarta aumentada) |
| **Mixolidio** | `[0, 2, 4, 5, 7, 9, 10]` | `1, 2, 3, 4, 5, 6, b7` | `b7` (séptima menor) |
| **Eólico (Menor Natural)** | `[0, 2, 3, 5, 7, 8, 10]` | `1, 2, b3, 4, 5, b6, b7` | `b6` (sexta menor) |
| **Locrio** | `[0, 1, 3, 5, 6, 8, 10]` | `1, b2, b3, 4, b5, b6, b7` | `b2`, `b5` |

### 2.2 Escala Menor Armónica y Modos Clave
| Nombre | Intervalos (semitonos) | Fórmula de grados | Uso principal |
|---|---|---|---|
| **Menor Armónica** | `[0, 2, 3, 5, 7, 8, 11]` | `1, 2, b3, 4, 5, b6, 7` | Neoclásico, menor dramático |
| **Frigio Dominante (5.º modo)** | `[0, 1, 4, 5, 7, 8, 10]` | `1, b2, 3, 4, 5, b6, b7` | Flamenco, metal, dominante V7b9 |
| **Lidio #2 (6.º modo)** | `[0, 3, 4, 6, 7, 9, 11]` | `1, #2, 3, #4, 5, 6, 7` | Color sobre acordes Maj7 |
| **Superlocrio bb7 / Alterada Armónica (7.º modo)** | `[0, 1, 3, 4, 6, 8, 9]` | `1, b2, b3, b4, b5, b6, bb7` | Acordes disminuidos `dim7` |

### 2.3 Escala Menor Melódica (Jazz / Ascendente) y Modos Clave
| Nombre | Intervalos (semitonos) | Fórmula de grados | Uso principal |
|---|---|---|---|
| **Menor Melódica** | `[0, 2, 3, 5, 7, 9, 11]` | `1, 2, b3, 4, 5, 6, 7` | Jazz, fusión, `mMaj7` |
| **Dórico b2 (2.º modo)** | `[0, 1, 3, 5, 7, 9, 10]` | `1, b2, b3, 4, 5, 6, b7` | `susb9` |
| **Lidio Aumentado (3.º modo)** | `[0, 2, 4, 6, 8, 9, 11]` | `1, 2, 3, #4, #5, 6, 7` | `Maj7#5` |
| **Lidio Dominante (4.º modo)** | `[0, 2, 4, 6, 7, 9, 10]` | `1, 2, 3, #4, 5, 6, b7` | `7#11`, fusión |
| **Mixolidio b6 (5.º modo)** | `[0, 2, 4, 5, 7, 8, 10]` | `1, 2, 3, 4, 5, b6, b7` | `7b13` |
| **Locrio ♮2 / Semidisminuida (6.º modo)** | `[0, 2, 3, 5, 6, 8, 10]` | `1, 2, b3, 4, b5, b6, b7` | `m7b5` |
| **Superlocrio / Escala Alterada (7.º modo)** | `[0, 1, 3, 4, 6, 8, 10]` | `1, b2, #2, 3, b5, #5, b7` | `7alt` |

### 2.4 Pentatónicas, Blues, Exóticas y Simétricas
| Nombre | Intervalos (semitonos) | Fórmula de grados |
|---|---|---|
| **Pentatónica Mayor** | `[0, 2, 4, 7, 9]` | `1, 2, 3, 5, 6` |
| **Pentatónica Menor** | `[0, 3, 5, 7, 10]` | `1, b3, 4, 5, b7` |
| **Escala de Blues Menor** | `[0, 3, 5, 6, 7, 10]` | `1, b3, 4, b5, 5, b7` |
| **Escala de Blues Mayor** | `[0, 2, 3, 4, 7, 9]` | `1, 2, b3, 3, 5, 6` |
| **Tonos Enteros (Whole Tone)** | `[0, 2, 4, 6, 8, 10]` | `1, 2, 3, #4, #5, b7` |
| **Disminuida (Tono–Semitono)** | `[0, 2, 3, 5, 6, 8, 9, 11]` | `1, 2, b3, 4, b5, b6, 6, 7` |
| **Disminuida (Semitono–Tono)** | `[0, 1, 3, 4, 6, 7, 9, 10]` | `1, b2, #2, 3, #4, 5, 6, b7` |
| **Hirajoshi / Japonesa** | `[0, 2, 3, 7, 8]` | `1, 2, b3, 5, b6` |
| **Doble Armónica Mayor (Bizantina)** | `[0, 1, 4, 5, 7, 8, 11]` | `1, b2, 3, 4, 5, b6, 7` |

### 2.5 Arpegios (Tríadas y Cuatríadas)
| Categoría | Nombre | Intervalos (semitonos) | Fórmula |
|---|---|---|---|
| **Tríadas** | Mayor (`Maj`) | `[0, 4, 7]` | `1, 3, 5` |
| **Tríadas** | Menor (`m`) | `[0, 3, 7]` | `1, b3, 5` |
| **Tríadas** | Aumentada (`aug`) | `[0, 4, 8]` | `1, 3, #5` |
| **Tríadas** | Disminuida (`dim`) | `[0, 3, 6]` | `1, b3, b5` |
| **Tríadas** | Suspendida 2 (`sus2`) | `[0, 2, 7]` | `1, 2, 5` |
| **Tríadas** | Suspendida 4 (`sus4`) | `[0, 5, 7]` | `1, 4, 5` |
| **Cuatríadas** | Mayor 7 (`Maj7`) | `[0, 4, 7, 11]` | `1, 3, 5, 7` |
| **Cuatríadas** | Menor 7 (`m7`) | `[0, 3, 7, 10]` | `1, b3, 5, b7` |
| **Cuatríadas** | Dominante 7 (`7`) | `[0, 4, 7, 10]` | `1, 3, 5, b7` |
| **Cuatríadas** | Semidisminuido (`m7b5`) | `[0, 3, 6, 10]` | `1, b3, b5, b7` |
| **Cuatríadas** | Disminuido 7 (`dim7`) | `[0, 3, 6, 9]` | `1, b3, b5, bb7` |
| **Cuatríadas** | Menor Mayor 7 (`mMaj7`) | `[0, 3, 7, 11]` | `1, b3, 5, 7` |
| **Cuatríadas** | Aumentado Maj7 (`Maj7#5`) | `[0, 4, 8, 11]` | `1, 3, #5, 7` |
| **Cuatríadas** | Dominante 9 (`9`) | `[0, 2, 4, 7, 10]` | `1, 2, 3, 5, b7` |

---

## 3. Algoritmos Determinísticos de Digitación en el Diapasón

El generador recibe cualquier configuración de instrumento y afinación (`tuningMidi: number[]`, ej. Guitarra 6 cuerdas estándar `[40, 45, 50, 55, 59, 64]`, `Drop D`, `Eb`, 7 cuerdas o Bajo 4/5 cuerdas) y calcula digitaciones ergonómicas reales sin tablas codificadas a mano por afinación:

### 3.1 Sistemas de Digitación Soportados
1. **3 Notas por Cuerda (3NPS — *Three Notes Per String*):**
   * Para escalas de 7 notas, asigna exactamente 3 notas consecutivas por cuerda empezando desde la posición elegida (`Posición 1` a `7`), validando que la apertura máxima por cuerda no exceda un rango ergonómico configurable (normalmente `4–5` trastes; si excede en trastes bajos, sugiere posición superior o ajusta). Ideal para *legato* y *alternate picking*.
2. **Cajas / Posición Fija (estilo CAGED / 4–5 trastes de ventana):**
   * Define una ventana de trastes `[minFret, minFret + 4]` (permitiendo extensión de 1 traste en notas límite para evitar saltos antinaturales) y selecciona la secuencia ascendente completa de notas de la escala dentro de la caja. Soporta `Posición 1` a `5` cubriendo todo el mástil (excelente para pentatónicas, blues, modos y arpegios en caja).
3. **2 Octavas desde Tónica:**
   * Encuentra la tónica más grave disponible en las cuerdas 6 o 5 dentro de la posición elegida y construye un recorrido limpio de 2 octavas completas priorizando cercanía de mano izquierda (minimización de costo por distancia de trastes).
4. **Horizontal en Una Sola Cuerda:**
   * Genera la escala o arpegio a lo largo de una cuerda seleccionada (trastes `0–22`) para entrenar visualización de intervalos y oído relativo.
5. **Sweep Picking / Arpegios de 3, 4 y 5 Cuerdas:**
   * Para arpegios, optimiza patrones con **1 nota por cuerda** en las cuerdas internas y `2` notas (con *hammer-on/pull-off*) en la cuerda más aguda/grave, aplicando automáticamente marcas de dirección de púa o ligados según el modo elegido.

---

## 4. Patrones Melódicos, Rítmica y Pistas de Acompañamiento Automático

### 4.1 Patrones / Secuencias Melódicas
Dado el arreglo ordenado de notas digitadas `N = [n_0, n_1, ..., n_{k-1}]`:
* **Ascendente y Descendente:** `0, 1, 2, ..., k-1, k-2, ..., 0`.
* **Solo Ascendente / Solo Descendente** (ideal para bucles continuos).
* **Por Terceras (Intervalos diatónicos):** `(0, 2), (1, 3), (2, 4), ...` y su inversión descendente.
* **Grupos de 3 notas (Tresillos / Secuencia 1-2-3, 2-3-4):** `(0, 1, 2), (1, 2, 3), (2, 3, 4), ...`.
* **Grupos de 4 notas (Secuencia 1-2-3-4, 2-3-4-5):** `(0, 1, 2, 3), (1, 2, 3, 4), ...`.
* **Pedal Tone (Nota pivote):** Alterna cada nota de la escala contra la tónica o la quinta (ej. estilo neoclásico/metal).
* **String Skipping (Salto de cuerda):** Recorre el patrón saltando una cuerda intermedia en pares.
* **Sweep Picking (solo Arpegios):** Subida y bajada fluida en ciclo cerrado listo para loop infinito.

### 4.2 Opciones Rítmicas y Cierre Exacto de Compás
* Figuras seleccionables: **Negras (`1/4`)**, **Corcheas (`1/8`)**, **Tresillos de corchea (`1/8` en tuplet `3`)** y **Semicorcheas (`1/16`)**.
* **Cierre matemático de compás (`PPQ = 960`):** Si el patrón melódico no termina exactamente en el límite del último compás, el generador cierra automáticamente el último compás con una nota final de tónica más larga o silencios exactos para que el ejercicio sea **100% válido y listo para bucle infinito sin saltos rítmicos**.
* Opción de **Articulación automática**: *Púa alterna* (sin ligados), *Legato* (añade *hammer-ons* al subir y *pull-offs* al bajar en notas de la misma cuerda) o *Palm Mute*.

### 4.3 Pistas de Acompañamiento Determinístico (Opcional en 1 Clic)
Para que practicar escalas sea musical y entrene el oído modal (no solo la mecánica de los dedos), el generador permite activar dos pistas extra generadas al vuelo:
1. **Pista de Batería Básica:** Patrón rítmico limpio en pista de percusión (`Rock 4/4`, `Balada / 8th`, `Tresillo / Shuffle` o `Clic de Hi-Hat`) sincronizado al número exacto de compases generados.
2. **Pista de Acorde Pedal (*Modal Drone / Pad*) + Bajo:** Sostiene un acorde característico de la escala elegida (por ejemplo, `m7` con 6ta para Dórico, `Maj7#11` para Lidio, `7` para Mixolidio, `7b9` para Frigio Dominante, `m7b5` para Locrio) para escuchar de inmediato el color real de cada modo. Todas las pistas se controlan independientemente desde el **Mezclador** (Solo/Mute/Volumen).

---

## 5. Coloreado por Grados en el Diapasón Interactivo

Cuando el `ScoreDocument` incluye metadatos opcionales `scaleContext` (`rootMidi`, `intervals`, `degreeLabels`, `characteristicDegrees`):
* El **Visualizador de Diapasón** muestra un interruptor **«Mostrar mapa de escala / Colores por grado»**:
  * **Tónica (`1`):** Color destacado primario (ej. rojo/coral o acento principal).
  * **Notas del acorde base (`3`/`b3`, `5`, `7`/`b7`):** Color secundario bien diferenciado.
  * **Nota característica del modo (ej. `6` en Dórico, `#4` en Lidio, `b2` en Frigio):** Borde o color distintivo propio.
  * **Resto de grados de la escala:** Color neutro suave como guía visual de fondo mientras la nota actualmente reproducida se ilumina con máximo contraste.

---

## 6. Paquete Curado de Fábrica (15 Ejercicios Precargados)

Estos 15 presets se generan automáticamente desde la definición declarativa del módulo (ocupando menos de 5 KB en el bundle) y aparecen disponibles desde el primer arranque en la Biblioteca:

1. **Calentamiento Cromático 1-2-3-4 (Alterna + Batería)** — `4/4 · 90 BPM · Principiante`.
2. **Pentatónica Menor de La (Caja 1 + Backing Rock)** — `4/4 · 100 BPM · Principiante`.
3. **Escala de Blues de Mi Menor (Con Bends y Slides)** — `4/4 · 95 BPM · Principiante`.
4. **Modo Jónico (Do Mayor) — 3 Notas por Cuerda** — `4/4 · 110 BPM · Principiante`.
5. **Modo Dórico en Re (Grupos de 3 notas + Vamp Dm7)** — `4/4 · 105 BPM · Intermedio`.
6. **Modo Frigio en Mi (Patrón por terceras + Drone Em)** — `4/4 · 110 BPM · Intermedio`.
7. **Modo Lidio en Fa (Ascendente/Descendente + Drone Fmaj7#11)** — `4/4 · 100 BPM · Intermedio`.
8. **Modo Mixolidio en Sol (Grupos de 4 notas + Vamp G7)** — `4/4 · 115 BPM · Intermedio`.
9. **Modo Eólico en La Menor (Legato 3NPS)** — `4/4 · 120 BPM · Intermedio`.
10. **Modo Locrio en Si (Posición fija + Drone Bm7b5)** — `4/4 · 95 BPM · Avanzado`.
11. **Menor Armónica en La (Secuencia Neoclásica Pedal Tone)** — `4/4 · 125 BPM · Avanzado`.
12. **Frigio Dominante en Mi (Estudio Flamenco / Metal)** — `4/4 · 115 BPM · Intermedio`.
13. **Menor Melódica en Do (Estudio Jazz Corcheas)** — `4/4 · 110 BPM · Avanzado`.
14. **Arpegios de Tríadas Mayor/Menor (Sweep Picking 3 y 5 cuerdas)** — `4/4 · 100 BPM · Avanzado`.
15. **Progresión de Arpegios Cuatríadas II–V–I (`Dm7 → G7 → Cmaj7`)** — `4/4 · 100 BPM · Intermedio`.
16. *(Extra Bajo)* **Groove Dórico y Arpegios en Bajo de 4 Cuerdas** — `4/4 · 100 BPM · Intermedio` (para probar el filtro persistente de instrumento *Bajo* desde el día uno).