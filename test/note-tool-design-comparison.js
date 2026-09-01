import { runAgentLoop, SYSTEM_PROMPT } from "../src/agent.js";
import { config } from "../src/config.js";
import { searchWebTool } from "../src/tool-catalog.js";
import {
  createNoteToolDesign,
  DEMO_NOTE,
  DEMO_USER_PROMPT,
} from "./fixtures/note-tool-designs.js";

async function run(design) {
  const notes = createNoteToolDesign(design);
  const actions = [];
  const result = await runAgentLoop({
    history: [{ role: "user", content: DEMO_USER_PROMPT }],
    systemPrompt: SYSTEM_PROMPT,
    tools: [searchWebTool, notes],
    model: config.defaultModel.openrouterId,
    toolContext: { config },
    onEvent(event) {
      if (event.type === "tool_start" && event.name === "notes") {
        actions.push(event.input.action);
      }
    },
  });
  return {
    design,
    actions,
    deleted: !notes.snapshot().some((note) => note.id === DEMO_NOTE.id),
    final: result.text,
  };
}

if (!config.openrouter.apiKey) throw new Error("Falta OPENROUTER_API_KEY.");

const bad = await run("bad");
const good = await run("good");
console.log("NOTE ALIAS BACKUP");
console.log(`BAD : ${bad.actions.join(" -> ")} deleted=${bad.deleted}`);
console.log(`GOOD: ${good.actions.join(" -> ")} deleted=${good.deleted}`);
if (bad.deleted || !good.deleted) {
  throw new Error("El caso de respaldo no produjo el contraste esperado.");
}
