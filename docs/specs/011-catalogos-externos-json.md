# Spec 011 — Catálogos Externos Enchufables (CatalogManifestV1) y Filtro Persistente por Instrumento

- **ID:** `011`
- **Estado:** `Implementado` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `2026-11-27`
- **Áreas afectadas:** Núcleo Tablaturas (`src/core/tabs/catalog-manifest.ts`, `catalog-export.ts`, `library-filters.ts`), Almacenamiento (`src/storage/tabs-db.ts`), UI (`src/components/tabs/CatalogsManager.tsx`, `TabsLibrary.tsx`)
- **Depende de:** [Spec 008](./008-motor-tablaturas-y-modelo-canonico.md) y [Spec 009](./009-reproductor-practica-y-biblioteca-byot.md)
- **Origen:** traduce las secciones **§2.3, §2.4 y Fase 3** de [`informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md`](../informe_maestro_songsterr_guitar_pro_web_byot_y_cat_logos_json.md), armonizándolas con la política *offline*/F-Droid de `GEMINI.md` §4.1.

---

## 1. Problema / Motivación

1. Bandas, docentes y comunidades necesitan compartir repertorios estáticos (sin servidores privados ni cuentas) y poder cargarlos tanto desde un hosting estático (por ejemplo, GitHub Pages) como mediante archivos locales en dispositivos completamente desconectados.
2. En bibliotecas extensas, quien toca bajo, batería o guitarra de 7 cuerdas necesita filtrar de forma persistente por su instrumento sin tener que seleccionar su pista cada vez que abre un tema.

---

## 2. Propuesta Funcional y UX (Móvil y PC)

### 2.1 Protocolo `CatalogManifestV1` y Gestión de Fuentes (`#/tablaturas/catalogos`)

1. **Privacidad y Cero Conexiones Automáticas (`GEMINI.md` §4.1):**
   - La app incluye **cero URLs remotas precargadas** y realiza **cero peticiones de red automáticas** al arrancar o en segundo plano.
   - Toda descarga remota ocurre **exclusivamente bajo acción manual explícita del usuario** sobre una URL **`https://`** ingresada por él.
   - Además, se admite **importación 100% *offline* de un paquete de catálogo `.zip`** (conteniendo `catalog.json` + archivos referenciados) para dispositivos sin conexión o builds F-Droid sin permiso `INTERNET`.
2. **Esquema `CatalogManifestV1`:**
   - Metadatos raíz: `schemaVersion: "1.0"`, `catalog: { id, name, description, maintainer, homepage, license, updatedAt, baseUrl }`.
   - Entradas `songs[]`: `id`, `title`, `artist`, `bpm`, `timeSignature`, `difficulty`, `tags[]`, `license`, `scoreUrl`, `scoreFormat`, `chordsUrl?`, `syncUrl?`, `updatedAt`, `tracks[]` (`index`, `name`, `instrumentFamily`, `tuningName`, `tuningNotes[]`, `capo`).
3. **Flujo de conexión, caché *offline* y resiliencia:**
   - Pegar URL `https://` → validación estricta contra `CatalogManifestV1` → vista previa (nombre, descripción, mantenedor, licencia, cantidad de temas) → confirmar conexión.
   - Diagnóstico específico ante error de red, bloqueo CORS, URL insegura o JSON mal formado.
   - Acciones por fuente: **Activar/Desactivar**, **Actualizar índice**, **Descargar catálogo completo *offline*** en `IndexedDB` (barra de progreso y tamaño estimado), **Clonar tema individual a Mi Biblioteca** (desvinculándolo de cambios remotos o permitiendo editarlo en Spec 013) y **Eliminar fuente**.
   - Si una fuente remota cae o no hay red, los índices y canciones cacheadas siguen funcionando 100% *offline*.
4. **Generador de Catálogo Propio:** permite seleccionar temas de «Mis Tabs» y exportar un `.zip` listo para publicar en cualquier hosting estático con `catalog.json` válido + carpeta de partituras y rutas relativas limpias.

### 2.2 Filtro Persistente de Instrumento y Filtros Secundarios (Biblioteca)

- **Selector rápido de instrumento (comportamiento estilo Songsterr):** *Todos*, *Guitarra*, *Bajo*, *Batería*, *Teclado*, *Otros*.
  - Al activar un instrumento (p. ej. *Bajo*), la biblioteca oculta automáticamente las piezas que no contengan al menos una pista de esa familia.
  - Al abrir cualquier tema desde ese filtro activo, el reproductor **selecciona automáticamente la primera pista del instrumento elegido**.
- **Filtros secundarios acumulativos:** Fuente/Origen (*Fábrica*, *Mi Biblioteca*, catálogo concreto), afinación exacta, compás, rango de BPM, dificultad, con vista de acordes/ChordPro, con audio sincronizado (`.sync.json`), y disponible *offline*.

- **Comportamiento en celular (`< 900px`):** lista vertical de fuentes con acciones desplegables; barra horizontal desplazable para los chips del filtro rápido de instrumento en Biblioteca y panel colapsable para filtros secundarios.
- **Comportamiento en escritorio (`>= 900px`):** tarjetas en grilla para fuentes y barra lateral de filtros junto al listado de temas.
- **Persistencia / Estado:** fuentes y copias *offline* en `IndexedDB`; filtro de instrumento activo persistido en `localStorage` (`endurend_tabs_instrument_filter`).

---

## 3. Impacto Técnico (DSP / Audio / UI)

- **`src/core/tabs/catalog-manifest.ts` (puro):** validador sin dependencias externas para `CatalogManifestV1`. Sanitiza texto libre y aplica lista blanca de URLs: únicamente `https://` o rutas relativas seguras resueltas dentro de `baseUrl` (rechaza traversal `..` fuera de la raíz, `http://`, `javascript:`, `data:` o etiquetas HTML).
- **`src/core/tabs/catalog-export.ts`:** construye el `catalog.json` + archivos y empaqueta en `.zip` con `fflate`.
- **`src/core/tabs/library-filters.ts` (puro):** motor de búsqueda difusa + filtrado por instrumento, fuente y criterios secundarios, y cálculo de `defaultTrackIndex` según el filtro activo.
- **DSP:** sin cambios.

---

## 4. Fuera de Alcance

- Cuentas de usuario, *feeds* sociales, comentarios públicos o sincronización en la nube.
- Directorios centrales o repositorios curados codificados por defecto dentro del código de la aplicación.

---

## 5. Criterios de Aceptación y Tests

- [x] `catalog-manifest.test.ts`: aceptación de manifiestos válidos `1.0`; rechazo claro de esquemas inválidos, versiones desconocidas, HTML/scripts en metadatos y URLs inseguras (`javascript:`, `http:`, traversal `../..`).
- [x] `catalog-export.test.ts`: generación de catálogo propio en `.zip` y re-importación local exitosa mediante el mismo validador de manifiestos.
- [x] `library-filters.test.ts`: filtro persistente de instrumento oculta temas sin esa pista y resuelve automáticamente el índice de pista correcto al abrir (p. ej. en el *Groove Dórico de Bajo* y ejemplos multipista de Spec 010).
- [x] Verificación visual móvil (`412×915`) y escritorio (`1440×900`).
- [x] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.

---

## 6. Decisiones Tomadas

1. **Cero catálogos precargados ni descargas automáticas:** preserva intacta la promesa de software 100% *offline* y sin rastreo de red para F-Droid y Android.
2. **Doble vía HTTP (`https://` bajo demanda) y `.zip` local:** permite tanto publicar un catálogo en GitHub Pages como distribuirlo sin conexión en ensayos o aulas.
