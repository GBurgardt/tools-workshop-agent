---
name: informe-de-incidente
description: Formato del informe de incidente del equipo (línea de tiempo, impacto, causa
  raíz, acciones). Usar cuando el usuario pida escribir un postmortem, un informe de
  incidente, un RCA, o cuando cuente que algo se cayó y haya que documentarlo.
---

# Informe de incidente

Usá exactamente estas secciones, en este orden:

1. **Resumen** — dos oraciones. Qué se rompió y a quién le pegó.
2. **Impacto** — usuarios afectados, minutos de degradación, plata si se puede estimar.
3. **Línea de tiempo** — hora en UTC, una línea por evento. Incluí la detección.
4. **Causa raíz** — el mecanismo técnico. No "error humano": qué permitió el error humano.
5. **Acciones** — cada una con dueño y fecha. Si no tiene dueño, no es una acción.

Sin culpables. El nombre de las personas no aparece; los sistemas y las decisiones sí.
Si falta información para una sección, escribí `pendiente:` y qué hace falta para cerrarla.
