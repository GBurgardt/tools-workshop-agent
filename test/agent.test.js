import assert from "node:assert/strict";
import test from "node:test";
import { runAgentLoop } from "../src/agent.js";
import {
  discover_skills,
  load_skill,
  read_skill_file,
  render_index,
} from "../src/skills-runtime.js";

test("el agent loop devuelve el tool_result al modelo", async () => {
  let calls = 0;
  const events = [];
  const result = await runAgentLoop({
    history: [{ role: "user", content: "Repetí hola" }],
    systemPrompt: "",
    tools: [{
      definition: { name: "echo", description: "", input_schema: { type: "object" } },
      execute: ({ text }) => ({ status: "success", text }),
    }],
    model: "test",
    provider: {},
    onEvent: (event) => events.push(event.type),
    callModel: async ({ history }) => {
      calls += 1;
      if (calls === 1) {
        return {
          content: [{ type: "tool_use", id: "call-1", name: "echo", input: { text: "hola" } }],
          stop_reason: "tool_use",
          model: "test",
        };
      }
      const toolResult = history.at(-1).content[0];
      assert.equal(toolResult.tool_use_id, "call-1");
      assert.deepEqual(JSON.parse(toolResult.content), { status: "success", text: "hola" });
      return {
        content: [{ type: "text", text: "hola" }],
        stop_reason: "end_turn",
        model: "test",
      };
    },
  });

  assert.equal(result.text, "hola");
  assert.equal(calls, 2);
  assert.deepEqual(events, ["tool_start", "tool_result"]);
});

test("skills revelan índice, instrucciones y archivos por separado", () => {
  const skills = discover_skills();
  const index = render_index(skills);
  assert.match(index, /`patos`/);
  assert.doesNotMatch(index, /CUAC|AZUL-42/);

  const loaded = new Set();
  const instructions = load_skill(skills, "patos", loaded);
  assert.match(instructions, /CUAC/);
  assert.doesNotMatch(instructions, /AZUL-42/);
  assert.match(load_skill(skills, "patos", loaded), /already loaded/);
  assert.match(read_skill_file(skills, "patos", "references/patos-azules.md"), /AZUL-42/);
  assert.match(read_skill_file(skills, "patos", "../../../etc/passwd"), /must stay inside/);
});
