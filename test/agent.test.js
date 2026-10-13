import assert from "node:assert/strict";
import test from "node:test";
import { runAgentLoop } from "../src/agent.js";
import { TOOLS } from "../src/agent.js";
import { RESEARCH_TOOLS, runSubagent, runSubagentTool } from "../src/subagent.js";
import { searchWebTool } from "../src/tool-catalog.js";
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

test("el padre delega, el hijo busca y sólo su informe vuelve al padre", async (context) => {
  const originalSearch = searchWebTool.execute;
  context.after(() => { searchWebTool.execute = originalSearch; });
  searchWebTool.execute = async () => ({ ok: true, results: [{ snippet: "CHILD_ONLY_RAW_RESULT" }] });
  const history = [{ role: "user", content: "PARENT_ONLY_CONTEXT. Delegá una investigación." }];
  const events = [];
  let parentCalls = 0;
  let childCalls = 0;
  let childHistory;
  const result = await runAgentLoop({
    history,
    systemPrompt: "parent",
    tools: TOOLS,
    model: "selected-model",
    provider: {},
    onEvent: (event) => events.push(event),
    callModel: async (request) => {
      assert.equal(request.model, "selected-model");
      if (request.systemPrompt === "parent") {
        parentCalls += 1;
        if (parentCalls === 1) return {
          content: [{ type: "tool_use", id: "parent-call", name: "run_subagent", input: { agent: "researcher", task: "Investigá energía nuclear." } }],
          stop_reason: "tool_use",
        };
        assert.equal(request.history.at(-1).content[0].content, "Informe breve con fuentes.");
        assert.doesNotMatch(JSON.stringify(request.history), /CHILD_ONLY_RAW_RESULT/);
        request.onText("Respuesta del padre.");
        return { content: [{ type: "text", text: "Respuesta del padre." }], stop_reason: "end_turn" };
      }
      childCalls += 1;
      assert.deepEqual(request.toolDefinitions.map((tool) => tool.name), ["search_web"]);
      assert.doesNotMatch(JSON.stringify(request.history), /PARENT_ONLY_CONTEXT/);
      assert.notEqual(request.history, history);
      childHistory = request.history;
      if (childCalls === 1) {
        assert.deepEqual(request.history, [{ role: "user", content: "Investigá energía nuclear." }]);
        request.onText("Texto intermedio del hijo.");
        return { content: [{ type: "tool_use", id: "child-call", name: "search_web", input: { query: "nuclear" } }], stop_reason: "tool_use" };
      }
      assert.match(JSON.stringify(request.history), /CHILD_ONLY_RAW_RESULT/);
      return { content: [{ type: "text", text: "Informe breve con fuentes." }], stop_reason: "end_turn" };
    },
  });
  assert.equal(result.text, "Respuesta del padre.");
  assert.equal(parentCalls, 2);
  assert.equal(childCalls, 2);
  assert.notEqual(result.history, childHistory);
  assert.deepEqual(events.filter((event) => event.type === "assistant_delta").map((event) => event.text), ["Respuesta del padre."]);
  const childEvents = events.filter((event) => event.type === "subagent_event");
  assert.deepEqual(childEvents.map((event) => event.event.type), ["tool_start", "tool_result"]);
  assert.ok(childEvents.every((event) => event.parentId === "parent-call" && event.agent === "researcher"));
});

test("el contrato valida el tipo y la tarea antes de llamar al modelo", async () => {
  assert.deepEqual(runSubagentTool.definition.input_schema.required, ["agent", "task"]);
  assert.deepEqual(runSubagentTool.definition.input_schema.properties.agent.enum, ["researcher"]);
  assert.deepEqual(RESEARCH_TOOLS.map((tool) => tool.definition.name), ["search_web"]);
  const context = { callModel: () => assert.fail("must not call the model") };
  await assert.rejects(runSubagent({ agent: "unknown", task: "hello" }, context), /Use agent='researcher'/);
  await assert.rejects(runSubagent({ agent: "researcher", task: " " }, context), /non-empty/);
  await assert.rejects(runSubagent({ agent: "researcher", task: "a".repeat(6001) }, context), /6000/);
});

test("el hijo no puede delegar ni ejecutar notes y corta tras ocho llamadas", async () => {
  let calls = 0;
  await assert.rejects(runSubagent({ agent: "researcher", task: "Investigá." }, {
    model: "test",
    provider: {},
    callModel: async ({ history }) => {
      if (calls > 0) {
        const result = history.at(-1).content[0];
        assert.equal(result.is_error, true);
        assert.deepEqual(JSON.parse(result.content).available_options, ["search_web"]);
      }
      calls += 1;
      return { content: [{ type: "tool_use", id: `call-${calls}`, name: calls % 2 ? "run_subagent" : "notes", input: {} }], stop_reason: "tool_use" };
    },
  }), /limit of 8 model calls/);
  assert.equal(calls, 8);
});

test("cada delegación empieza una conversación nueva", async () => {
  const histories = [];
  const context = { model: "test", provider: {}, callModel: async ({ history }) => {
    assert.equal(history.length, 1);
    histories.push(history);
    return { content: [{ type: "text", text: "informe" }], stop_reason: "end_turn" };
  } };
  await runSubagent({ agent: "researcher", task: "uno" }, context);
  await runSubagent({ agent: "researcher", task: "dos" }, context);
  assert.notEqual(histories[0], histories[1]);
});

test("un fallo del hijo vuelve al padre como error de tool accionable", async () => {
  let calls = 0;
  const result = await runAgentLoop({
    history: [{ role: "user", content: "Delegá." }], systemPrompt: "parent",
    tools: [runSubagentTool], model: "test", provider: {},
    callModel: async ({ systemPrompt, history }) => {
      if (systemPrompt !== "parent") throw new Error("Provider unavailable");
      calls += 1;
      if (calls === 1) return { content: [{ type: "tool_use", id: "delegate", name: "run_subagent", input: { agent: "researcher", task: "Investigá." } }], stop_reason: "tool_use" };
      const result = history.at(-1).content[0];
      assert.equal(result.is_error, true);
      assert.match(JSON.parse(result.content).why, /Provider unavailable/);
      return { content: [{ type: "text", text: "No pude investigar." }], stop_reason: "end_turn" };
    },
  });
  assert.equal(result.text, "No pude investigar.");
});
