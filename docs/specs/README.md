# Especificaciones Funcionales y Técnicas (`docs/specs/`)

Este directorio centraliza el diseño de nuevas funcionalidades y mejoras del proyecto antes de escribir código (**Spec-Driven Development**), asegurando que cada cambio mantenga la precisión del motor DSP, la calidad de la interfaz y la documentación al día.

---

## Convención de Nombres y Ciclo de Vida

1. **Numeración secuencial:** cada especificación se crea como `docs/specs/NNN-nombre-corto.md` (por ejemplo, `002-tono-de-referencia.md`).
2. **Estados posibles:**
   - `Borrador` — Idea inicial o propuesta en discusión.
   - `Aprobado` — Diseño validado y listo para implementar.
   - `En progreso` — En desarrollo y pruebas.
   - `Implementado` — Completado, verificado por tests/build y reflejado en `README.md` y `ROADMAP.md`.

---

## Cómo Proponer una Nueva Funcionalidad

1. Copiá [`000-plantilla.md`](./000-plantilla.md) con el siguiente número correlativo (o pedile a Antigravity / Claude Code: *«Creá el spec 002 para [tu idea]»*).
2. Completá especialmente el **problema que resuelve**, cómo debe verse tanto en **celular** como en **PC**, y las **restricciones de audio/precisión** si aplica.
3. Una vez que el spec pasa a `Aprobado`, se implementa siguiendo sus criterios de aceptación.
4. Al finalizar la implementación:
   - Se marca el spec como `Estado: Implementado`.
   - Se agregan/actualizan los tests en `src/core/` y el build (`npm test -- --run && VITE_BASE_PATH=/afinador/ npm run build && npm run cap:sync`).
   - Se actualizan [`ROADMAP.md`](../../ROADMAP.md) y [`README.md`](../../README.md).
