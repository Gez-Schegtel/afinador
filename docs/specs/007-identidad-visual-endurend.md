# Spec 007 — Identidad Visual *Endurend Musical Gadgets* (Estética Stoner / Psicodélica)

- **ID:** `007`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** UI Móvil/PC (`index.css`, encabezado, todas las secciones), PWA (manifest, íconos, `index.html`), Android (nombre visible, íconos, splash), documentación
- **Depende de:** [Spec 006](./006-navegacion-por-secciones.md). Se implementa **al final**, después de los specs funcionales y de los arreglos técnicos pendientes.

> **Pedido original:** «Me gustaría agregar unas imágenes a la página, como un logo […] y que la app se llame Endurend Musical Gadgets. Me gustaría que la estética sea como un disco de stoner rock, psicodélico, y con lindos colores. Que el afinador parezca un pedal de fuzz típico de stoner.» Se autorizó recolorear y ajustar el logo.

---

## 1. Problema / Motivación

1. Con acordes y metrónomo, la app deja de ser solo un afinador: el nombre *Endurend Musical Gadgets* refleja mejor su alcance.
2. La estética actual es genérica. Se busca una identidad propia, inspirada en tapas de discos de stoner rock psicodélico y en los pedales de fuzz del género.
3. La versión Android todavía muestra el **splash y los íconos por defecto de Capacitor** (fondo blanco con el logo de Capacitor). El manifest de la PWA tiene un único ícono SVG `any maskable`.

## 2. Propuesta Funcional y UX (Móvil y PC)

- **Nombre:**
  - visible: **Endurend Musical Gadgets**;
  - corto (pantalla de inicio y lanzador de Android): **Endurend**.
  - **No cambian** el `applicationId` de Android (`org.gezschegtel.afinador`), la URL `/afinador/` ni el `id` del manifest: cambiarlos rompería las instalaciones y actualizaciones existentes.
- **Logos** (archivos del autor, recoloreables):
  - **Horizontal (`ENDUR∃ND`)** en el encabezado, sobre el chasis;
  - **Vertical (`END·UR·END`)** para el ícono de la app, el splash de Android y los íconos de la PWA.
- **Concepto «pedal de fuzz»:**
  - **gabinete pintado**: chasis ocre de desierto con un sol psicodélico de anillos ondulados (arena, naranja, magenta y violeta) asomando por la esquina;
  - **ventana del visor oscura**, como un display real, para que la aguja, los LEDs y el estroboscopio se lean en un escenario;
  - **placas de control** oscuras;
  - **footswitch metálico** con LED tipo joya.
- **Paleta:**
  - violeta del logo `#662482`;
  - ocre de desierto `#e0a83f` (gabinete) y arena `#f0d79a` (sol, íconos, splash);
  - naranja `#e8742a`;
  - mostaza `#e0a526`;
  - magenta `#c2387a`;
  - ciruela oscuro para fondos y visor.

  Los colores con significado no cambian de rol:
  - **verde = afinado**;
  - **ámbar = bajo**;
  - **rosado/rojo = alto**;
  - **cian = selección/referencia**.
- **Contraste medido:** el violeta del logo da **2.0:1** sobre el fondo casi negro anterior (ilegible), **4.6:1** sobre el ocre del gabinete y **7.0:1** sobre arena. El texto sobre el gabinete (`#3a1442`) da 7.2:1 y el de las placas, entre 5.7:1 y 13.9:1: todo cumple WCAG AA (≥ 4.5:1).
- **Tipografía:** fuentes del sistema para la interfaz y los números (legibilidad). El carácter psicodélico lo aportan el logo y el arte del chasis. **No** se cargan fuentes externas (regla de offline).
- **Diseño original**, inspirado en el género. **No** imita el aspecto de ningún pedal comercial concreto.
- **Celular y escritorio:** se conserva la disposición actual de cada sección. Solo cambian colores, texturas, encabezado y botones.

## 3. Impacto Técnico (DSP / Audio / UI)

- **Variables CSS** en `:root` (tokens de color): las secciones de los specs 003–006 ya se construyeron sobre ellas, así que el cambio es mayormente de tema.
- **Logo en el encabezado:** PNG optimizado y recoloreable con `mask-image`. El trazado vectorial automático no dio buenos resultados y los archivos fuente son PNG de 10 944 px.
- **Íconos PWA:** PNG de 192 y 512 px (`any`), un 512 `maskable` propio con margen de seguridad, `apple-touch-icon` PNG y favicon.
- **Android:**
  - `app_name` y `title_activity_main` = `Endurend`;
  - íconos de lanzador (PNG heredados y adaptativo) con el logo vertical;
  - splash con fondo arena y logo violeta en todas las densidades;
  - se eliminan los recursos de plantilla que quedan sin uso.
- **Aviso de atajo de teclado** solo con puntero fino (`@media (hover: hover) and (pointer: fine)`). En tablets táctiles no se muestra.
- **Rendimiento:** el arte del chasis es una imagen o degradado **estático**, sin filtros animados. El canvas del visor no cambia su lógica, solo sus colores.
- **Documentación:** título y nombre en `README.md`, `ROADMAP.md`, `index.html`, manifest y `capacitor.config.json` (`appName`).
- **DSP:** sin cambios.

## 4. Fuera de Alcance

- Tema claro u oscuro seleccionable.
- Animaciones psicodélicas en movimiento.
- Fuentes personalizadas.
- Cambiar el identificador de la app, la URL o el nombre del repositorio.

## 5. Criterios de Aceptación y Tests

- [x] Contraste ≥ 4.5:1 en todo el texto (medido) y logo sobre el ocre del gabinete (4.6:1).
- [x] Verificación visual de las tres secciones en móvil (`412×915`) y escritorio (`1440×900`).
- [x] Manifest con íconos PNG 192/512 y `maskable`; `index.html` con `apple-touch-icon` PNG.
- [x] Recursos Android regenerados (íconos y splash) y nombre visible `Endurend`.
- [x] Toda la suite, `npm run cap:sync` y `VITE_BASE_PATH=/afinador/ npm run build` en verde.
- [x] Actualización de `README.md` y `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

## 6. Decisiones Tomadas

1. Logo horizontal en el encabezado y vertical en ícono y splash.
2. Gabinete ocre con sol psicodélico y visor oscuro (el crema propuesto al principio se descartó por genérico).
3. Se mantienen los identificadores técnicos.
4. Sin fuentes externas.
