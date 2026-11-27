# Afinador — Guitarra y Bajo

[![Tests](https://github.com/Gez-Schegtel/afinador/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Gez-Schegtel/afinador/actions/workflows/tests.yml)
[![Deploy PWA to GitHub Pages](https://github.com/Gez-Schegtel/afinador/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://github.com/Gez-Schegtel/afinador/actions/workflows/deploy-pages.yml)
[![Build Android APK](https://github.com/Gez-Schegtel/afinador/actions/workflows/build-apk.yml/badge.svg?branch=main)](https://github.com/Gez-Schegtel/afinador/actions/workflows/build-apk.yml)

👉 **[Abrir e instalar la aplicación web (PWA): https://gez-schegtel.github.io/afinador/](https://gez-schegtel.github.io/afinador/)**

Afinador cromático estilo pedal de escenario con **precisión estroboscópica (`< 0.05 cents`)** para **guitarra** y **bajo**, desarrollado como **Software Libre (`GNU GPL v3`)**.

Funciona como aplicación web progresiva (**PWA**) instalable **100% sin internet** en Android y escritorio, procesando todo el audio localmente en el dispositivo (cero servidores externos, cero telemetría). Se despliega automáticamente en **[GitHub Pages](https://gez-schegtel.github.io/afinador/)** y cuenta con estructura preparada para distribuirse como paquete libre `.apk` en **GitHub Releases** y **F-Droid** mediante **Capacitor**.

---

## 1. Especificaciones Técnicas

| Parámetro | Especificación |
| :--- | :--- |
| **Modos de operación** | **Automático** (detección cromática libre de las 12 notas `C..B`) y **Manual** con **«Nota objetivo»** por **Nota + Octava** (`A0–B5`) o por **cuerda de una afinación del catálogo** (restringe el DSP entre `-11.5` y `+5` semitonos alrededor de la nota) |
| **Catálogo de afinaciones (Manual)** | **34 afinaciones** para guitarra de 6, 7 y 8 cuerdas y bajo de 4, 5 y 6 cuerdas: estándar, bajadas (medio tono a dos tonos), *Drop* (D, C♯, C, B, A, E, Doble Drop D), abiertas (Open D, D menor, G, C, E, A), DADGAD, BEAD y EADGC. Cada afinación se guarda con nombres escritos (`E♭2`, no `D♯2`) y el visor muestra `♭` cuando corresponde ([Spec 002](./docs/specs/002-afinaciones.md)) |
| **Metrónomo** | Compases **simples** (2/4, 3/4, 4/4, 5/4; BPM de negra `♩`), **compuestos** (6/8, 9/8, 12/8; BPM de negra con puntillo `♩.` con subdivisión en corcheas) e **irregulares** (5/8 y 7/8 con agrupaciones 2+3, 3+2, 2+2+3, 2+3+2 y 3+2+2; BPM de corchea `♪`), `30–300 BPM` y acento opcional del primer tiempo. Clics sintetizados y programados con el reloj de audio (sin deriva) desde un *Web Worker* ([Spec 004](./docs/specs/004-metrónomo.md)) |
| **Diccionario de acordes** | **17 raíces × 20 tipos** (tríadas, sus, quinta, sextas, séptimas y novenas) con ortografía calculada por intervalos (`C°7 = C E♭ G♭ B𝄫`) y hasta **12 digitaciones** generadas para guitarra de 6, 7 y 8 cuerdas en cualquier afinación del catálogo, verificadas por tests (toda nota pertenece al acorde, raíz en el bajo, ≤ 4 trastes y ≤ 4 dedos) ([Spec 003](./docs/specs/003-acordes.md)) |
| **Identificador de acordes** | Marcá una forma sobre el mástil (guitarra de 6, 7 y 8, bajo de 4, 5 y 6, en cualquier afinación del catálogo) y obtené **todas las lecturas válidas ordenadas** (p. ej. `Am7` y `C6/A`), con inversiones (`Am/C`, 1ª inversión), ortografía de mínimas alteraciones e intervalos para dos notas ([Spec 005](./docs/specs/005-identificador-de-acordes.md)) |
| **Rango de frecuencias** | **`25 Hz` a `2000 Hz`** — detecta un `A0` (`27.5 Hz`) hasta ~165 cents bajo de tono, así que cubre bajo de 4, 5 y 6 cuerdas (`B0 = 30.87 Hz`, `E1 = 41.20 Hz`, *Drop A*) y guitarra de 6, 7 y 8 cuerdas en todo el diapasón |
| **Precisión algorítmica** | **`< 0.03 cents`** de `A0` a `B6` con señales armónicas sin ruido a 44.1/48 kHz, **`< 0.05 cents`** con el pipeline completo (filtros + decimación) a 44.1, 48, 88.2, 96 y 192 kHz, **`< 0.08 cents`** con fundamental atenuada y error RMS **`< 0.5 cents`** con ruido blanco a ~26 dB de SNR (*verificado por la suite automatizada*). En cuerdas reales, la inarmonicidad hace que el 2º armónico suene apenas agudo: cuando la fundamental es muy débil y se refina sobre él, la lectura puede quedar ~0.3 cents (guitarra) a ~1.5 cents (bajo grave) alta |
| **Sensibilidad de entrada** | Puerta RMS base **`0.0035`** en Automático (claridad mínima `0.72`; para enganchar una nota desde silencio, `0.75`) y **`0.0025`** (claridad `0.58`, rango `-11.5 / +5 st`) en modo Manual para cuerdas suaves o muy flojas |
| **Escala auto-rango (Manual)** | Cambia automáticamente entre **Escala Amplia (`±6 semitonos`)** cuando la cuerda está lejos (`> ±55 ct`) y **Escala Fina (`±50 cents`)** al acercarse (`< ±46 ct`) |
| **Bloqueo `✓ AFINADO` (Schmitt trigger)** | Entrada en **`±2.5 cents`** con histéresis de retención hasta **`±4.0 cents`** (evita parpadeos de color), acompañado de visor estroboscópico continuo con zona muerta fina en `±0.35 cents` |
| **Calibración de referencia (`A4`)** | Ajustable entre **`415.0 Hz` y `466.0 Hz`** en pasos de `0.1` / `0.5` / `1 Hz` (con accesos directos a `430`, `432`, `440`, `442` y `444 Hz`), persistida en `localStorage` |
| **Ventana y tasa de análisis** | Ventana deslizante de **`8192` muestras** (~`170.7 ms` a `48 kHz`) con avance (*hop*) de **`1024` muestras** (~`21.3 ms` = **~46.9 lecturas/segundo**) en hilo dedicado `AudioWorklet`. A 88.2, 96 o 192 kHz la señal se **decima** (×2 o ×4) después del pasa-bajos, así que el análisis siempre corre a 44.1/48 kHz |
| **Precisión numérica interna** | Coma flotante IEEE-754 de **64 bits (`Float64Array`)** desde el filtrado hasta el refinamiento, sin asignaciones grandes en tiempo real. Costo medido de un análisis: **~1.3 ms** en una PC de escritorio (`npm run bench`) |

---

## 2. Arquitectura del Motor DSP (Precisión + Estabilidad de Pedal)

Los afinadores convencionales suelen emplear una FFT simple o autocorrelación de 32 bits con interpolación parabólica sobre ventanas cortas, lo que provoca saltos de octava, falta de ciclos en graves de bajo (`B0` / `E1`), sesgo en agudos o una aguja nerviosa imposible de clavar en salas reales con micrófono.

Este programa resuelve ambos frentes (máxima precisión e inmunidad acústica) mediante una cadena DSP de 4 etapas (`src/audio/pitch-worklet.ts` y `src/core/dsp/`):

1. **Pre-filtrado Pasa-Banda Butterworth (`24 Hz – 1800 Hz`):**
   * Dos filtros *Biquad* de 2º orden en cascada eliminan golpes graves sub-audibles (mesa/viento) y ruido agudo (soplido/ventiladores/trastes) antes de analizar el período. A tasas de muestreo altas, la señal filtrada se decima a ~44.1/48 kHz (`src/core/dsp/frontend.ts`).
2. **`Float64` FFT-MPM (`McLeod Pitch Method` acelerado por Wiener–Khinchin):**
   * Elimina el *offset* DC y aplica una puerta de ruido **RMS** (`minRms = 0.0035` en Automático; `0.0025` en Manual).
   * Calcula la autocorrelación lineal exacta en $O(N \log N)$ con una **FFT Radix-2 propia** (`src/core/dsp/fft.ts`) sobre `16384` puntos lógicos, empaquetando la señal real en una FFT compleja de `8192` puntos (la mitad del costo), combinada con la recurrencia exacta de energía de McLeod & Wyvill para obtener la **NSDF (*Normalized Square Difference Function*)**. Al basarse solo en la energía periódica, es inmune a ecos y desfases acústicos de sala.
   * En **modo Manual**, restringe la búsqueda de períodos entre **`-11.5` y `+5` semitonos** alrededor de la **Nota objetivo** (con `clarityThreshold = 0.92`), permitiendo afinar cuerdas muy flojas o recién colocadas sin quedarse mudo ni saltar al 2º armónico. En **modo Automático**, extrae el primer *key maximum* que alcanza el `90%` del pico global para evitar saltos de octava.
3. **Refinamiento Espectral de Log-Magnitud QIFFT con Ventana Blackman–Harris de 4 términos:**
   * Opera únicamente sobre la magnitud `|X(ω)|` de las `8192` muestras completas (sin derivadas de fase sensibles a ecos de sala) mediante interpolación cuadrática de 0.25 bin alrededor de la fundamental —o del 2º armónico cuando la fundamental es muy débil—, logrando rechazo lateral **> 92 dB** y precisión **`< 0.03 cents`** (medida en toda la suite). El paso entre fundamental y 2º armónico tiene **histéresis** (entra con la fundamental bajo el 40% del armónico y sale sobre el 50%), así la lectura no salta durante el *sustain*.
4. **Estabilizador y Bloqueo Tipo Pedal (`src/core/dsp/smoother.ts` y `src/core/music/notes.ts`):**
   * **Supresión de ataque (*attack blanking*):** ignora transitorios bruscos al volver a golpear con la púa una nota que todavía suena (`~45 ms`). El primer golpe desde silencio no se suprime, para no demorar la primera lectura: el promedio recortado y el EMA absorben ese ataque en ~0.5 s.
   * **Media recortada intercuartil de 12 cuadros (`~255 ms`):** ordena las últimas lecturas, descarta el 25% superior e inferior de batidos acústicos y promedia el núcleo central, seguido de un EMA de doble velocidad (`0.085` en reposo para clavar la aguja, `0.30` al girar la clavija).
   * **Histéresis *Schmitt trigger*:** sostiene el nombre de la nota hasta `±56 cents` entre semitonos y el estado `✓ AFINADO` entre `±2.5 cents` (entrada) y `±4.0 cents` (salida).

---

## 3. Cómo leer la pantalla del pedal

* **Visor Estroboscópico Superior:** las bandas luminosas se desplazan hacia la **izquierda** cuando la nota está baja (*flat*), hacia la **derecha** cuando está alta (*sharp*), y **se detienen por completo** dentro de **`±0.35 cents`**. Es la referencia más fina para calibrar quintaje/octavación.
* **Arco LED Auto-Rango, Aguja Amortiguada y Flechas (`▶` / `◀`):** en Automático y ajuste fino cubre de `-50` a `+50 cents`, encendiendo el verde esmeralda **`✓ AFINADO`** en **`±2.5 cents`** (retenido hasta `±4.0 cents`). En modo Manual, si la cuerda está a más de `±55 cents`, el arco pasa a **Escala Amplia (`±6 semitonos`)** para seguir el movimiento de la aguja desde lejos hasta volver a `±46 cents`.
* **Selector `MODO DE AFINACIÓN` (`AUTOMÁTICO` / `MANUAL`):** en **Automático** identifica libremente cualquier nota. En **Manual**, elegí **Instrumento** y **Afinación**: verás las notas de cada cuerda (de grave a agudo), qué cuerdas cambian respecto de la estándar (p. ej. `6ª: E2 → D2 (−2 st)`) y avisos como **«Sube la tensión»** (Open C, E y A). Tocá el botón de una cuerda para fijarla como objetivo, o elegí libremente **Nota + Octava** (`A0`–`B5`). En ambos casos el DSP se acota entre `-11.5` y `+5` semitonos. El modo, el instrumento, la afinación y la nota objetivo quedan guardados en `localStorage`.
* **Secciones (`AFINADOR` / `ACORDES` / `METRÓNOMO`):** la barra superior cambia de sección. Cada una tiene su dirección (`#/afinador`, `#/acordes/diccionario`, `#/acordes/identificar`, `#/metronomo`), así que el botón «Atrás» del navegador o de Android vuelve a la anterior. Salir del Afinador **apaga el micrófono** ([Spec 006](./docs/specs/006-navegacion-por-secciones.md)).
* **Atajo en escritorio (`PC`):** la barra **Espaciadora** activa o detiene el micrófono en el Afinador (y arranca o para el metrónomo en su sección) sin soltar el instrumento. Después de hacer clic con el mouse en un botón, `Espacio` sigue funcionando como atajo y no repite ese botón. Diseño responsivo en consola de 2 columnas en pantallas `>= 900px` y vertical de 1 columna en móviles.
* **Acordes → Diccionario:** elegí afinación, raíz y tipo. La ficha muestra el cifrado, el nombre en español, la fórmula (`1 ♭3 5 ♭7`) y las notas escritas. Los diagramas van de la cejuela hacia el agudo, con `×`/`○`, cejilla, cifrado tipo tablatura (`x32010`) y puntos rotulados con el grado o la nota (la raíz en ámbar).
* **Acordes → Identificar:** tocá un traste por cuerda (la fila `○` es la cuerda al aire; tocá de nuevo para borrar). Arriba aparece la mejor lectura con sus notas y grados, hasta 3 lecturas alternativas y un botón para abrirla en el diccionario.
* **Metrónomo:** elegí el compás, el tempo (con su figura de pulso: `♩ = 120`, `♩. = 80`, `♪ = 210`), la agrupación en los irregulares, el acento del primer tiempo y la subdivisión. Los LEDs marcan cada pulso (con puntos chicos para las corcheas). Sigue sonando si pasás a Acordes, pero **se detiene al activar el micrófono** del afinador, que captura audio crudo y escucharía los clics.
* **Ajuste `PITCH / CALIBRACIÓN` (`A4`):** cambiar `A4` (por ejemplo a **`430 Hz`**) recalcula instantáneamente las frecuencias objetivo de las 12 notas en todas las octavas (`f = A4 · 2^((midi - 69) / 12)`).

---

## 4. Aspectos Importantes para su Funcionamiento Correcto

### A. Requisito de Contexto Seguro (`HTTPS` o `localhost`)
Por seguridad estándar de los navegadores modernos (Chrome en Android, Firefox, Safari), el acceso al micrófono (`navigator.mediaDevices.getUserMedia`) y el bloqueo de pantalla activa (`Screen Wake Lock`) **solo se habilitan bajo `https://` o `http://localhost`**.
* Si abrís la app por una IP de red local sin cifrar (como `http://192.168.1.x:5173`) en Android, el navegador bloqueará el micrófono.
* **Solución en desarrollo local por USB:** usá el comando `npm run android:usb` (`adb reverse`), que expone `http://localhost:5173` directamente dentro del teléfono Android como origen seguro.
* **Solución al desplegar:** alojándola en **GitHub Pages** o cualquier servidor con HTTPS, o compilándola como `.apk` con Capacitor (`androidScheme: "https"`).

### B. Captura de Audio Crudo y Muestreo Nativo
* La aplicación desactiva explícitamente los filtros telefónicos del sistema (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`). Sin esto, el procesador de voz del celular cortaría el *sustain* de la cuerda tras medio segundo.
* El motor lee dinámicamente `AudioContext.sampleRate` (`48000 Hz` en la mayoría de dispositivos Android, `44100 Hz` en algunas interfaces de PC) para evitar cualquier error sistemático de afinación.

### C. Recomendaciones Acústicas para Máxima Precisión (Guitarra y Bajo)
1. **Muteá las cuerdas que no estés afinando:** la vibración por simpatía de cuerdas al aire cercanas puede introducir batidos acústicos reales.
2. **Afiná siempre subiendo hacia la nota:** si te pasaste de agudo, aflojá un poco por debajo de la nota y subí tensando hasta detener el estroboscopio; así el engranaje de la clavija queda trabado sin juego mecánico.
3. **Ataque suave y lectura en el *sustain*:** al golpear fuerte una cuerda con púa, la tensión extra del desplazamiento inicial sube momentáneamente la nota entre `5` y `15 cents` (fenómeno físico real de cualquier cuerda); la nota verdadera de afinación es la que se estabiliza medio segundo después del ataque.
4. **Bajo eléctrico desenchufado vs. amplificado:** un cuerpo sólido desenchufado irradia muy poca energía acústica en `B0 (30.9 Hz)` o `E1 (41.2 Hz)`. Si afinás con el micrófono interno del celular sin amplificador, apoyá o acercá el teléfono al puente/pala o tocá el armónico natural del traste 12; con amplificador o interfaz de audio funciona directo en todo el registro.

---

## 5. Instalación, Desarrollo y Pruebas

### Requisitos
* `Node.js >= 22` (lo exige `@capacitor/cli` 8; el CI usa Node 24) y `npm`.
* Opcional para depuración por cable en Android: `adb` (*Android Debug Bridge*).

### Comandos principales

```bash
# Instalar dependencias
npm install

# Ejecutar la suite automatizada de tests DSP y musicales
npm test -- --run

# Medir el costo de un análisis del detector (referencia, no bloqueante)
npm run bench

# Iniciar servidor de desarrollo
npm run dev

# Reenviar puerto seguro por USB a un teléfono Android conectado con Depuración USB
npm run android:usb

# Verificar tipos TypeScript y compilar versión de producción PWA offline en dist/
npm run build
```

Para instalarla **sin conexión** en Android: abrí la app en Chrome (`localhost:5173` por USB o tu URL HTTPS), tocá el menú `⋮` → **«Instalar aplicación» / «Agregar a la pantalla principal»**. El *Service Worker* guardará todo el motor DSP localmente.

---

## 6. Despliegue en GitHub Pages y Empaquetado Libre (`.apk` para F-Droid / GitHub Releases)

### A. Publicación Web PWA en GitHub Pages (automática)
El repositorio incluye el flujo [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml):
1. En GitHub, abrí **Settings → Pages** y en **Build and deployment → Source** seleccioná **GitHub Actions**.
2. Cada `push` a `main` ejecuta la suite completa de tests de precisión, compila la PWA ajustando automáticamente `VITE_BASE_PATH=/afinador/` y la publica con **HTTPS** en **[https://gez-schegtel.github.io/afinador/](https://gez-schegtel.github.io/afinador/)**.
3. Desde Android, abrí esa URL en Chrome/Firefox/Brave y seleccioná **«Instalar aplicación»** para tenerla con ícono propio y uso **100% sin conexión**.

### B. Compilación Automática del `.apk` Libre en CI/CD (GitHub Actions + F-Droid)
El proyecto incluye la capa nativa `android/` (libre del plugin propietario `google-services` y sin bloques cifrados `dependenciesInfo`, cumpliendo los requisitos de **F-Droid**) junto con el pipeline [`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml):

* **En cada `push` a `main` (o manualmente desde Actions):** GitHub Actions ejecuta los tests de precisión, sincroniza Capacitor y compila un `.apk` instalable (disponible como artefacto descargable `afinador-apk` dentro de la pestaña **Actions** junto con su hash `.sha256`).
* **Publicación automática en GitHub Releases:** al crear y subir una etiqueta de versión:
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```
  el workflow compila el `.apk` y crea automáticamente el *Release* público en GitHub adjuntando `afinador-v0.1.0.apk` y `afinador-v0.1.0.apk.sha256`.
* **Checklist para publicar una versión `vX.Y.Z`:**
  1. Actualizar `version` en `package.json` y, en `android/app/build.gradle`, `versionName "X.Y.Z"` y `versionCode` = `X·10000 + Y·100 + Z` (F-Droid exige que sea creciente). El test `src/version.test.ts` falla si no coinciden.
  2. Configurar los *Secrets* de firma (ver abajo): **los tags `v*` fallan a propósito sin ellos**, para no publicar un `.apk` con una firma debug irrepetible que impediría actualizar.
  3. Crear y subir el tag (`git tag vX.Y.Z && git push origin vX.Y.Z`).
* **Firma criptográfica propia (obligatoria para versiones publicadas):**
  Si configurás los *Secrets* del repositorio (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), el CI firmará automáticamente el `.apk` con tu llave privada. Sin ellos, los builds de `main` usan una firma de respaldo para probar el `.apk` de inmediato (cada build tiene una firma distinta, así que no se actualizan entre sí); los tags de versión, en cambio, se detienen con un error.
  Para generar tu propio keystore una sola vez en Linux:
  ```bash
  keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias afinador
  base64 -w 0 release.jks   # Copiar salida en Secret ANDROID_KEYSTORE_BASE64
  ```

---

## 7. Hoja de Ruta y Desarrollo Basado en Especificaciones (Specs)

- **Hoja de ruta y avance del proyecto:** revisá [`ROADMAP.md`](./ROADMAP.md) para ver todo lo completado hasta el momento y los próximos hitos planificados.
- **Especificaciones de nuevas funcionalidades (`Specs`):** cada nueva idea o mejora se diseña primero en [`docs/specs/`](./docs/specs/README.md) usando la plantilla [`docs/specs/000-plantilla.md`](./docs/specs/000-plantilla.md).
- **Reglas de arquitectura y calidad para asistentes IA:** las invariantes de DSP, UI, pruebas y publicación libre están asentadas en [`GEMINI.md`](./GEMINI.md) y enlazadas en [`CLAUDE.md`](./CLAUDE.md).

---

## Licencia

Este proyecto es **Software Libre** distribuido bajo los términos de la licencia **GNU General Public License v3.0 o posterior (`GPL-3.0-or-later`)**. Consultá el archivo [LICENSE](./LICENSE) para el texto completo.
