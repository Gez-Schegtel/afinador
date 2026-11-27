# Spec 006 — Navegación por Secciones (Afinador · Acordes · Metrónomo)

- **ID:** `006`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** UI Móvil/PC (`App.tsx`, nuevo `src/sections/`, `src/navigation/`, `index.css`), Audio (`tuner-engine.ts`, `wake-lock.ts`), PWA (división de código)
- **Requerido por:** [Spec 003](./003-acordes.md), [Spec 004](./004-metrónomo.md) y [Spec 005](./005-identificador-de-acordes.md)
- **Origen:** los borradores de 003 y 004 piden «una sección con…». Esa necesidad común se desagregó en este spec para no repetirla en cada uno.

---

## 1. Problema / Motivación

1. La app es una única pantalla (el afinador). El diccionario de acordes, el identificador y el metrónomo necesitan su propio espacio sin recargar el afinador ni romper la vista móvil protegida (`GEMINI.md` §3.2).
2. Al salir del afinador, el micrófono **siempre** debe liberarse. Hoy hay dos problemas que lo impiden:
   - un segundo `start()` durante el arranque crea un segundo motor que queda huérfano, con el micrófono abierto y enviando lecturas después de «Detener»;
   - si `start()` falla a mitad de camino (por ejemplo en `audioWorklet.addModule`), el micrófono y el `AudioContext` nunca se cierran.
3. El atajo `Espacio` tiene que ser contextual: activar el micrófono en el Afinador y arrancar o parar el metrónomo en el Metrónomo. Hoy, además, falla cuando quedó enfocado el último botón clickeado: el navegador repite la acción de ese botón (por ejemplo, sube A4 otro `+1 Hz`) en lugar de activar el afinador.

## 2. Propuesta Funcional y UX (Móvil y PC)

- **Secciones:** **Afinador** (inicio), **Acordes** (con dos pestañas: *Diccionario* e *Identificar*) y **Metrónomo**.
- **Barra de navegación:** tres botones iguales debajo del encabezado. **No** va al pie de la pantalla: abajo está el *footswitch* y se presionarían por error.
  - **Celular (`< 900px`):** fila de ancho completo, con altura táctil ≥ 40 px.
  - **Escritorio (`>= 900px`):** misma fila dentro del chasis, alineada bajo el encabezado.
- **Rutas con *hash*:** `#/afinador`, `#/acordes/diccionario`, `#/acordes/identificar` y `#/metronomo`. Funcionan igual en `/` (Capacitor y local) y en `/afinador/` (GitHub Pages) sin reglas de servidor (`GEMINI.md` §3.3). El botón «Atrás» de Android y del navegador vuelve a la sección anterior. Sin *hash*, o con uno desconocido, se abre el Afinador.
- **Ciclo de vida del audio:**
  - Salir del Afinador **detiene el micrófono**, aunque el arranque todavía esté en curso.
  - El metrónomo vive a nivel de la app: sigue sonando al pasar a Acordes (para practicar acordes con pulso), pero **se detiene al activar el micrófono** del afinador, que de otro modo escucharía los clics (ver Spec 004).
- **Encabezado:** marca a la izquierda. A la derecha, los indicadores de la sección activa (medidor de señal en el Afinador). El subtítulo describe la sección.
- **Atajo `Espacio`:**
  - **Afinador:** activa o detiene el micrófono.
  - **Metrónomo:** arranca o para.
  - **Acordes:** sin acción.

  Tras un clic de **mouse** en un botón o un cambio de `<select>` hecho con el puntero, el control pierde el foco. Así `Espacio` vuelve a ser el atajo y no repite la última acción. La activación por teclado (`Tab` + `Espacio`) no cambia.
- **Persistencia:** cada sección conserva sus propias preferencias. No se recuerda la última sección: la app abre en el Afinador, su uso principal.

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/navigation/routes.ts` (puro) + `useHashRoute()`:** parseo y serialización de rutas, con tests.
- **`src/sections/TunerSection.tsx`:** el contenido actual de `App.tsx` pasa a esta sección sin cambios funcionales. `App.tsx` queda como «cáscara»: encabezado, navegación, ranuras del encabezado (portales de React) y el atajo global.
- **Acordes y Metrónomo** se cargan con `React.lazy()`, para que el arranque del afinador no crezca. El *precache* de la PWA ya incluye todos los `.js`, así que siguen disponibles sin conexión.
- **`TunerEngine` robusto:**
  - `start()` y `stop()` con estado explícito (`idle → starting → running → stopping`) y un contador de generación que se compara después de cada `await`.
  - Un segundo `start()` mientras arranca reutiliza la misma promesa.
  - Un `stop()` durante el arranque libera todo lo adquirido hasta ese momento.
  - Si `start()` falla, se liberan las variables locales (micrófono y `AudioContext`).
- **`ScreenWakeLocker`:** si `disable()` llega mientras `acquire()` espera, el *sentinel* recién obtenido se libera (hoy quedaría tomado y la pantalla no se apagaría).
- **DSP:** sin cambios.

## 4. Fuera de Alcance

- Pantalla de ajustes, temas e idiomas.
- Recordar la última sección abierta.
- Gestos de deslizamiento entre secciones.

## 5. Criterios de Aceptación y Tests

- [x] `routes.test.ts`: parseo de todas las rutas, *hash* vacío o desconocido → Afinador, y serialización ida y vuelta.
- [x] `tuner-engine.test.ts` (con dobles de `getUserMedia` / `AudioContext`): doble `start()` crea **un** solo motor; `stop()` durante el arranque deja todo cerrado; una falla de `addModule` detiene las pistas y cierra el contexto.
- [x] `wake-lock.test.ts`: `disable()` durante `acquire()` libera el *sentinel*.
- [x] Verificación visual en móvil (`412×915`) y escritorio (`1440×900`) de las tres secciones; el Afinador conserva su disposición.
- [x] `VITE_BASE_PATH=/afinador/ npm run build` genera *chunks* separados para Acordes y Metrónomo.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. Navegación en una fila superior, no en una barra inferior (evita confundirla con el *footswitch*).
2. El metrónomo sigue sonando fuera de su sección, salvo que se active el micrófono.
3. Siempre se abre en el Afinador.
4. Rutas con *hash* y sin librerías de *routing* (menos dependencias).
