import { createNoteToolDesign, DEMO_USER_PROMPT } from "./note-tool-designs.js";

export { DEMO_USER_PROMPT };

// DEMO EN VIVO: dejá una sola línea activa.
// export const ACTIVE_DESIGN = "bad";
export const ACTIVE_DESIGN = "good";

export const activeNoteTool = createNoteToolDesign(ACTIVE_DESIGN);

export function resetActiveNoteTool() {
  activeNoteTool.reset();
}
