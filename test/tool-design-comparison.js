import { runAgentLoop, SYSTEM_PROMPT } from "../src/agent.js";
import { config } from "../src/config.js";
import { ACTIVE_MODE } from "../src/demo/active-mode.js";
import { notesTool } from "../src/tool-catalog.js";
import {
  createSearchWebToolDesign,
  SEARCH_DEMO_USER_PROMPT,
  SEARCH_MAX_RESULTS,
} from "./fixtures/search-web-tool-designs.js";

const DEFAULT_MODE = "both";

function modeFromCli() {
  const explicit = process.argv
    .slice(2)
    .find((value) => ["bad", "good", "both", "active"].includes(value));
  return explicit || process.env.TOOL_DESIGN_MODE || DEFAULT_MODE;
}

function parseResult(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function runVariant(design) {
  const search = createSearchWebToolDesign(design);
  const events = [];
  const result = await runAgentLoop({
    history: [{ role: "user", content: SEARCH_DEMO_USER_PROMPT }],
    systemPrompt: SYSTEM_PROMPT,
    tools: [search, notesTool],
    model: config.defaultModel.openrouterId,
    toolContext: { config },
    onEvent(event) {
      if (event.type === "tool_start") {
        events.push({ phase: "agent_to_tool", tool: event.name, input: event.input });
      }
      if (event.type === "tool_result") {
        events.push({
          phase: "tool_to_agent",
          tool: event.name,
          status: event.status,
          output: parseResult(event.result),
        });
      }
    },
  });

  const calls = events.filter(
    (event) => event.phase === "agent_to_tool" && event.tool === "search_web"
  );
  const results = events.filter(
    (event) => event.phase === "tool_to_agent" && event.tool === "search_web"
  );
  return {
    design,
    user: SEARCH_DEMO_USER_PROMPT,
    events,
    final_answer: result.text,
    tool_calls: calls.length,
    requested_limits: calls.map((event) => event.input.max_results),
    failed_calls: results.filter((event) => event.status === "error").length,
    search_completed: results.some((event) => event.status === "success"),
  };
}

function printVariant(run) {
  console.log(`\n=== ${run.design.toUpperCase()} DESIGN ===`);
  console.log(`USER: ${run.user}`);
  let step = 0;
  for (const event of run.events) {
    if (event.phase === "agent_to_tool") {
      step += 1;
      console.log(`${step}. AGENT -> ${event.tool} ${JSON.stringify(event.input)}`);
    } else {
      console.log(`   TOOL  -> ${JSON.stringify(event.output)}`);
    }
  }
  console.log(`FINAL: ${run.final_answer}`);
  console.log(
    `METRICS: tool_calls=${run.tool_calls} failed_calls=${run.failed_calls} ` +
      `limits=${run.requested_limits.join(" -> ")} search_completed=${run.search_completed}`
  );
}

function assertContrast(bad, good) {
  const goodRecoveredExactly =
    good.search_completed &&
    good.tool_calls === 2 &&
    good.failed_calls === 1 &&
    good.requested_limits.at(0) > SEARCH_MAX_RESULTS &&
    good.requested_limits.at(-1) === SEARCH_MAX_RESULTS;
  const badWasWorse =
    !bad.search_completed ||
    bad.tool_calls > good.tool_calls ||
    bad.requested_limits.at(-1) !== SEARCH_MAX_RESULTS;

  console.log("\n=== OBSERVABLE DIFFERENCE ===");
  console.log(
    `BAD : ${bad.tool_calls} call(s), ${bad.failed_calls} fallida(s), ` +
      `search_completed=${bad.search_completed}.`
  );
  console.log(
    `GOOD: ${good.tool_calls} calls (${good.requested_limits.join(" -> ")}), ` +
      `search_completed=${good.search_completed}.`
  );
  if (!goodRecoveredExactly || !badWasWorse) {
    throw new Error("La corrida no produjo un contraste de límite defendible.");
  }
  console.log(
    "PASS: el retorno accionable convirtió la adivinanza en un único reintento exacto."
  );
}

if (!config.openrouter.apiKey) {
  throw new Error("Falta OPENROUTER_API_KEY para ejecutar la comparación real.");
}

const mode = modeFromCli();
if (mode === "active") {
  console.log(`ACTIVE_MODE=${ACTIVE_MODE}`);
  printVariant(await runVariant(ACTIVE_MODE));
  process.exit(0);
}
if (mode === "bad" || mode === "good") {
  printVariant(await runVariant(mode));
} else {
  const bad = await runVariant("bad");
  const good = await runVariant("good");
  printVariant(bad);
  printVariant(good);
  assertContrast(bad, good);
}
