# Afinador — Guitarra y Bajo

👉 **[Abrir e instalar la aplicación web (PWA): https://gez-schegtel.github.io/afinador/](https://gez-schegtel.github.io/afinador/)**

Afinador cromático estilo pedal de escenario con **precisión estroboscópica (`< 0.05 cents`)** para **guitarra** y **bajo**, desarrollado como **Software Libre (`GNU GPL v3`)**.

Funciona como aplicación web progresiva (**PWA**) instalable **100% sin internet** en Android y escritorio, procesando todo el audio localmente en el dispositivo (cero servidores externos, cero telemetría). Se despliega automáticamente en **[GitHub Pages](https://gez-schegtel.github.io/afinador/)** y cuenta con estructura preparada para distribuirse como paquete libre `.apk` en **GitHub Releases** y **F-Droid** mediante **Capacitor**.

---

## 1. Especificaciones Técnicas

| Parámetro | Especificación |
| :--- | :--- |
| **Modo de operación** | **Cromático puro estilo pedal** (detecta automáticamente las 12 notas `C..B` en cualquier afinación sin selectores previos) |
| **Rango de frecuencias** | **`27.5 Hz` (`A0`) a `2000 Hz`** — cubre bajo de 4, 5 y 6 cuerdas (`B0 = 30.87 Hz`, `E1 = 41.20 Hz`, *Drop A*) y guitarra de 6, 7 y 8 cuerdas en todo el diapasón |
| **Precisión algorítmica** | **`< 0.03 cents`** en señales periódicas limpias y **`< 0.05 cents`** con fundamental atenuada (*verificado por suite automatizada*) |
| **Tolerancia de centro exacto** | **`±1.0 cent`** para encendido del indicador verde central (`±1 ct EXACTO`), acompañado de visor estroboscópico continuo sensible a `< 0.1 cents` |
| **Calibración de referencia (`A4`)** | Ajustable entre **`415.0 Hz` y `466.0 Hz`** en pasos de `0.1` / `0.5` / `1 Hz` (con accesos directos a `430`, `432`, `440`, `442` y `444 Hz`), persistida en `localStorage` |
| **Ventana y tasa de análisis** | Ventana deslizante de **`8192` muestras** (~`170.7 ms` a `48 kHz`) con avance (*hop*) de **`1024` muestras** (~`21.3 ms` = **~46.9 lecturas/segundo**) en hilo dedicado `AudioWorklet` |
| **Precisión numérica interna** | Coma flotante IEEE-754 de **64 bits (`Float64Array`)** sin asignaciones dinámicas en tiempo real |

---

## 2. Arquitectura del Motor DSP (Por qué es tan preciso)

Los afinadores convencionales suelen emplear una FFT simple o autocorrelación de 32 bits con interpolación parabólica sobre ventanas cortas, lo que provoca tres fallas habituales: saltos de octava cuando los armónicos superan a la nota fundamental, falta de ciclos suficientes en cuerdas graves de bajo (`B0` / `E1`) y un sesgo matemático de `0.3–1.2 cents` en notas agudas.

Este programa resuelve los tres problemas mediante un **motor híbrido de dos etapas** (`src/core/dsp/`):

1. **Etapa 1 — `Float64` FFT-MPM (`McLeod Pitch Method` acelerado por Wiener–Khinchin):**
   * Elimina el *offset* DC y aplica una puerta de ruido **RMS** (`minRms = 0.006`).
   * Calcula la autocorrelación lineal exacta en $O(N \log N)$ usando una **FFT Radix-2 propia de `16384` puntos** (`src/core/dsp/fft.ts`) combinada con la recurrencia exacta de energía de McLeod & Wyvill para obtener la **NSDF (*Normalized Square Difference Function*)**.
   * Extrae el primer *key maximum* que alcanza el `90%` del pico global de claridad. Esto garantiza identificar el período fundamental real incluso cuando el micrófono de un teléfono atenúa subgraves y el 2º o 3º armónico entra con mucha mayor amplitud.
2. **Etapa 2 — Refinamiento Estroboscópico por Diferencia de Fase (`Phase Vocoder` con ventana Blackman–Harris de 4 términos):**
   * Divide la ventana actual de `8192` muestras en dos sub-ventanas *Blackman–Harris* de `7168` muestras desplazadas exactamente $\Delta N = 1024$ muestras (rechazo de lóbulos laterales **> 92 dB** desde `27.5 Hz` hacia arriba).
   * Mide el avance de fase instantáneo exacto sobre la frecuencia fundamental $f_0$ (evitando que la *inarmonicidad física* de los armónicos altos de cuerdas metálicas desvíe la lectura hacia arriba) o sobre el 2º armónico cuando la fundamental es casi inexistente en micrófonos pequeños.
3. **Estabilización sin arrastre (`src/core/dsp/smoother.ts`):**
   * Un **filtro de mediana de 5 muestras** en escala logarítmica descarta por completo el ruido transitorio del golpe inicial de la púa o los dedos.
   * Un suavizador adaptativo ponderado por `claridad²` estabiliza las centésimas de cent al sostener una nota y acelera la respuesta automáticamente al girar la clavija.

---

## 3. Cómo leer la pantalla del pedal

* **Visor Estroboscópico Superior:** las bandas luminosas se desplazan hacia la **izquierda** cuando la nota está baja (*flat*), hacia la **derecha** cuando está alta (*sharp*), y **se detienen por completo** cuando el error tiende a **`0.00 cents`**. Es la referencia más fina para calibrar quintaje/octavación o afinar al límite físico del instrumento.
* **Arco LED y Flechas Centrales (`▶` / `◀`):** cubre de `-50` a `+50 cents`. Ambas flechas y el LED central se encienden en **verde esmeralda** únicamente dentro de **`±1.0 cent`**.
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
* `Node.js >= 20` y `npm`.
* Opcional para depuración por cable en Android: `adb` (*Android Debug Bridge*).

### Comandos principales

```bash
# Instalar dependencias
npm install

# Ejecutar la suite automatizada de tests DSP y musicales
npm test -- --run

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
* **Firma criptográfica propia (recomendada para versiones definitivas):**
  Si configurás los *Secrets* del repositorio (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), el CI firmará automáticamente el `.apk` con tu llave privada; si aún no están definidos, utiliza una firma de respaldo instalable para que puedas probar el `.apk` de inmediato.
  Para generar tu propio keystore una sola vez en Linux:
  ```bash
  keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias afinador
  base64 -w 0 release.jks   # Copiar salida en Secret ANDROID_KEYSTORE_BASE64
  ```

---

## Licencia

Este proyecto es **Software Libre** distribuido bajo los términos de la licencia **GNU General Public License v3.0 o posterior (`GPL-3.0-or-later`)**. Consultá el archivo [LICENSE](./LICENSE) para el texto completo.
