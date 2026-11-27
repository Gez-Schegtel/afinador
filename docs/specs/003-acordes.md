# Spec 003 — Diccionario de Acordes con Diagramas y Variantes de Posición

- **ID:** `003`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Música (nuevos `src/core/music/intervals.ts`, `chords.ts` y `voicings.ts`), UI (nueva sección Acordes), PWA (división de código)
- **Depende de:** [Spec 002](./002-afinaciones.md) (ortografía `spelling.ts`, afinaciones y `TuningPicker`) y [Spec 006](./006-navegacion-por-secciones.md) (sección propia)
- **Relacionado:** [Spec 005](./005-identificador-de-acordes.md), que comparte el motor de acordes

> **Pedido original:** «Quiero que tenga una sección con una amplia galería de acordes. Una tablatura que te muestre cómo hacer el acorde y variaciones de posiciones del mismo acorde. […] Todo lo que hagas tiene que estar respaldado con teoría musical. Es inadmisible que haya errores de esa índole.»
>
> La segunda parte del borrador (nombrar un acorde marcado sobre el mástil) se desagregó en [Spec 005](./005-identificador-de-acordes.md).

---

## 1. Problema / Motivación

Consultar cómo se toca un acorde y sus alternativas a lo largo del mástil, sin conexión y sin publicidad. Las tablas de acordes armadas a mano suelen tener errores (notas mal escritas, digitaciones que no corresponden al acorde). Acá **todo se deriva por cálculo** desde fórmulas de intervalos y se verifica con tests.

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Flujo

1. Sección **Acordes → Diccionario**.
2. Selectores de **Afinación** (guitarras de 6, 7 y 8 cuerdas del catálogo del Spec 002; por defecto, Guitarra de 6 · Estándar), **Raíz** (17 nombres) y **Tipo** (20 calidades agrupadas).
3. **Ficha del acorde:**
   - símbolo (`Cm7`);
   - nombre en español (`Do menor séptima`);
   - fórmula (`1 ♭3 5 ♭7`);
   - notas escritas (`C E♭ G B♭`);
   - el equivalente enarmónico más usual, cuando la raíz elegida obliga a dobles alteraciones (`D♯` → «más usual: `E♭`»).
4. **Variantes (digitaciones):** diagramas ordenados por posición en el mástil, de la cejuela hacia el agudo. Cada diagrama incluye:
   - cuerdas verticales de grave (izquierda) a aguda (derecha);
   - cejuela o número del traste inicial;
   - `×` (cuerda que no suena) y `○` (al aire);
   - cejilla dibujada como barra;
   - puntos con el **grado** (`1`, `♭3`, `5`, `♭7`) o la **nota**, según un conmutador;
   - el **cifrado tipo tablatura** debajo, de grave a agudo (`x32010`; con trastes ≥ 10 se separan con guiones: `x-10-12-12-11-10`).

- **Comportamiento en celular (`< 900px`):** selectores apilados, ficha y grilla de diagramas de 2 columnas.
- **Comportamiento en escritorio (`>= 900px`):** selectores y ficha en una columna lateral y grilla de diagramas de 3–4 columnas.
- **Persistencia / Estado:** `afinador_chords_dictionary` en `localStorage` (afinación, raíz, tipo y conmutador grado/nota). Valores por defecto: Guitarra de 6 · Estándar, `C` mayor y grados.

### 2.2 Base teórica

**Ortografía por intervalos.** Cada intervalo es un par (número genérico, semitonos). Una nota del acorde se obtiene **avanzando letras** (`número − 1` pasos desde la raíz) y ajustando la alteración para que dé los semitonos pedidos. Así la ortografía siempre es correcta:

- `C°7 = C E♭ G♭ B𝄫` (y **no** `C D♯ F♯ A`);
- `E+ = E G♯ B♯`;
- `D♯ = D♯ F𝄪 A♯`.

**Raíces (17):** `C C♯ D♭ D D♯ E♭ E F F♯ G♭ G G♯ A♭ A A♯ B♭ B`. Combinadas con los 20 tipos, 46 de las 340 combinaciones requieren dobles alteraciones (por ejemplo `D♯`, `G♭m`, `C°7`). Es correcto en teoría y se muestra así, acompañado del equivalente enarmónico más usual cuando lo hay.

**Tipos de acorde (20).** Semitonos desde la raíz; la 9ª se mide como 14 semitonos:

| Grupo | Tipo | Símbolo (alternativas) | Fórmula | Semitonos | Nombre (ej. en Do) | En C |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Tríadas | Mayor | `C` | 1 3 5 | 0 4 7 | Do mayor | C E G |
| Tríadas | Menor | `Cm` (`C−`, `Cmin`) | 1 ♭3 5 | 0 3 7 | Do menor | C E♭ G |
| Tríadas | Disminuido | `C°` (`Cdim`) | 1 ♭3 ♭5 | 0 3 6 | Do disminuido | C E♭ G♭ |
| Tríadas | Aumentado | `C+` (`Caug`) | 1 3 ♯5 | 0 4 8 | Do aumentado | C E G♯ |
| Suspendidos y quinta | Suspendido 2ª | `Csus2` | 1 2 5 | 0 2 7 | Do suspendido segunda | C D G |
| Suspendidos y quinta | Suspendido 4ª | `Csus4` | 1 4 5 | 0 5 7 | Do suspendido cuarta | C F G |
| Suspendidos y quinta | Quinta | `C5` | 1 5 | 0 7 | Do quinta (*power chord*) | C G |
| Sextas | Sexta | `C6` | 1 3 5 6 | 0 4 7 9 | Do sexta | C E G A |
| Sextas | Menor sexta | `Cm6` | 1 ♭3 5 6 | 0 3 7 9 | Do menor sexta | C E♭ G A |
| Séptimas | Séptima (dominante) | `C7` | 1 3 5 ♭7 | 0 4 7 10 | Do séptima | C E G B♭ |
| Séptimas | Séptima mayor | `Cmaj7` (`CΔ7`, `C7M`) | 1 3 5 7 | 0 4 7 11 | Do séptima mayor | C E G B |
| Séptimas | Menor séptima | `Cm7` (`C−7`) | 1 ♭3 5 ♭7 | 0 3 7 10 | Do menor séptima | C E♭ G B♭ |
| Séptimas | Menor con séptima mayor | `Cm(maj7)` (`CmΔ7`) | 1 ♭3 5 7 | 0 3 7 11 | Do menor con séptima mayor | C E♭ G B |
| Séptimas | Semidisminuido | `Cm7♭5` (`Cø7`) | 1 ♭3 ♭5 ♭7 | 0 3 6 10 | Do semidisminuido | C E♭ G♭ B♭ |
| Séptimas | Séptima disminuida | `C°7` (`Cdim7`) | 1 ♭3 ♭5 𝄫7 | 0 3 6 9 | Do séptima disminuida | C E♭ G♭ B𝄫 |
| Séptimas | Séptima con 4ª suspendida | `C7sus4` | 1 4 5 ♭7 | 0 5 7 10 | Do séptima sus4 | C F G B♭ |
| Novenas | Novena añadida | `Cadd9` | 1 3 5 9 | 0 4 7 14 | Do con novena añadida | C E G D |
| Novenas | Novena (dominante) | `C9` | 1 3 5 ♭7 9 | 0 4 7 10 14 | Do novena | C E G B♭ D |
| Novenas | Séptima mayor con novena | `Cmaj9` | 1 3 5 7 9 | 0 4 7 11 14 | Do séptima mayor con novena | C E G B D |
| Novenas | Menor novena | `Cm9` | 1 ♭3 5 ♭7 9 | 0 3 7 10 14 | Do menor novena | C E♭ G B♭ D |

### 2.3 Reglas de las digitaciones (verificadas por tests)

1. Toda nota que suena pertenece al acorde.
2. Están presentes todas las notas del acorde, salvo la **quinta justa**, que puede omitirse solo en acordes de **4 o más notas** (práctica habitual). Las quintas alteradas (`♭5`, `♯5`) nunca se omiten porque definen el tipo.
3. **Posición fundamental:** la nota más grave es la raíz. Las inversiones quedan fuera de alcance.
4. **Tocabilidad:**
   - los trastes pisados entran en una ventana de **4 trastes**;
   - las cuerdas al aire solo se combinan con la primera posición (trastes 1–4);
   - como máximo **4 dedos**, contando una cejilla (un dedo que pisa en el traste más bajo todas las cuerdas entre la primera y la última pisadas en ese traste, sin cuerdas al aire ni mudas en el medio);
   - como máximo **una** cuerda muda entre la más grave y la más aguda que suenan;
   - suenan al menos **4 cuerdas** (2 en el acorde de quinta);
   - trastes 0 a 15.
5. **Orden y selección:** por posición (traste pisado más bajo; la primera posición incluye las cuerdas al aire), con hasta 2 variantes por posición y 12 en total. Dentro de una posición se prefieren, en este orden:
   - menos cuerdas mudas (y menos mudas internas);
   - sin quinta omitida;
   - menos dedos;
   - menor suma de trastes.

**Formas de referencia** que el generador debe producir en la primera posición de la guitarra estándar:

| Acorde | Forma | Acorde | Forma |
| :--- | :--- | :--- | :--- |
| C | `x32010` | C7 | `x32310` |
| A | `x02220` | G7 | `320001` |
| G | `320003` | A7 | `x02020` |
| E | `022100` | D7 | `xx0212` |
| D | `xx0232` | E7 | `020100` |
| Am | `x02210` | Am7 | `x02010` |
| Em | `022000` | Em7 | `020000` |
| Dm | `xx0231` | Dm7 | `xx0211` |
| F | `133211` | Cmaj7 | `x32000` |
| Bm | `x24432` | Dsus4 / Dsus2 | `xx0233` / `xx0230` |
| | | Asus4 / Asus2 | `x02230` / `x02200` |

(Notas verificadas por script; por ejemplo, `x32010` = C3 E3 G3 C4 E4.)

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/music/intervals.ts`:** intervalos, transposición con ortografía y etiquetas de grado.
- **`src/core/music/chords.ts`:** catálogo de tipos, raíces, ortografía, símbolo, nombre en español y equivalente enarmónico.
- **`src/core/music/voicings.ts`:** generador de digitaciones con reglas puras.
- Todo puro y testeado.
- **Rendimiento:** la búsqueda descarta temprano las notas que no pertenecen al acorde (en cada cuerda solo se prueban trastes que dan notas del acorde), así que cada consulta tarda milisegundos. Corre en el hilo principal, nunca en el de audio. Los resultados se memorizan por (afinación, raíz, tipo).
- **UI:** `src/sections/ChordsSection.tsx` (pestañas Diccionario / Identificar), `ChordDictionary.tsx` y `ChordDiagram.tsx`. Los diagramas son **SVG estático y accesible**: cada uno lleva un `aria-label` con su cifrado. Los estilos usan variables CSS.

## 4. Fuera de Alcance

- Inversiones y acordes con bajo (`C/E`) en el diccionario.
- Acordes alterados y extensiones superiores (`7♭9`, `7♯9`, `11`, `13`, etc.).
- Digitación sugerida (número de dedo).
- Escuchar el acorde.
- Pentagrama.
- Diagramas para zurdos.
- Bajos (el identificador del Spec 005 sí admite bajo).

## 5. Criterios de Aceptación y Tests

- [x] `intervals.test.ts` y `chords.test.ts`:
  - ortografías de referencia: `C°7`, `D♭`, `F♯`, `B°`, `E+`, `G7`, `Bm7♭5`, `A♭maj7`, `E♭m`, `Gsus4`, `D6`, `D♯` (con `F𝄪`), `G♭m` (con `B𝄫`), `C♯°7`, `Fm9`, `Aadd9`, `B♭7sus4` y `Em(maj7)`;
  - barrido completo de 17 raíces × 20 tipos: las letras avanzan según el número del intervalo, la clase de altura coincide con los semitonos y no hay más de doble alteración;
  - exactamente 46 combinaciones con dobles alteraciones.
- [x] `voicings.test.ts`:
  - propiedades de §2.3 en todas las digitaciones generadas (17 raíces × 20 tipos en la guitarra estándar);
  - presencia de todas las formas de referencia;
  - una prueba en la guitarra de 7 cuerdas.
- [x] Verificación visual en móvil y escritorio.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. Los 20 tipos de §2.2 y las 17 raíces.
2. **Símbolos:** `maj7`, `°`, `+` y `m7♭5`, con las alternativas listadas en la ficha.
3. **Nombres en español** según la tabla de §2.2. Es un glosario revisable: la terminología varía entre países.
4. Solo guitarras en el diccionario; las digitaciones de bajo quedan fuera.
