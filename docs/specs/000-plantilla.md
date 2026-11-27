# Spec NNN — [Título corto de la funcionalidad]

- **ID:** `NNN`
- **Estado:** `Borrador` <!-- Borrador | Aprobado | En progreso | Implementado -->
- **Fecha:** `YYYY-MM-DD`
- **Áreas afectadas:** <!-- ej. DSP, AudioWorklet, UI Móvil/PC, Capacitor/Android, PWA -->

---

## 1. Problema / Motivación

Describí qué necesidad real resuelve esta mejora para quien afina guitarra o bajo.

## 2. Propuesta Funcional y UX (Móvil y PC)

- **Comportamiento en celular (`< 900px`):**
- **Comportamiento en escritorio (`>= 900px`):**
- **Persistencia / Estado:** (¿Se guarda en `localStorage`? ¿Tiene valores por defecto?)

## 3. Impacto Técnico (DSP / Audio / UI)

- Cambios necesarios en `src/core/dsp/`, `src/core/music/`, `src/audio/` o `src/components/`.
- Riesgos acústicos, de latencia o de memoria en tiempo real a tener en cuenta.

## 4. Fuera de Alcance

Qué cosas explícitamente **no** se van a incluir en esta iteración para mantener el código simple.

## 5. Criterios de Aceptación y Tests

- [ ] Test unitario en Vitest cubriendo la lógica matemática/musical nueva.
- [ ] Verificación visual en móvil y desktop (si cambia la interfaz).
- [ ] Actualización de `README.md`, `ROADMAP.md` y cambio de estado de este spec a `Implementado`.
