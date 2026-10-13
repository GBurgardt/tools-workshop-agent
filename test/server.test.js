import assert from "node:assert/strict";
import test from "node:test";
import { server } from "../src/server.js";

test("health expone sólo el catálogo esperado y sirve el chat", async (context) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${origin}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.tool_count, 5);
  assert.deepEqual(health.tools, ["search_web", "notes", "load_skill", "read_skill_file", "run_subagent"]);
  assert.equal(health.default_model, "deepseek-flash");
  assert.deepEqual(
    health.models.map((model) => model.id),
    ["deepseek-flash", "claude-sonnet"]
  );
  assert.equal(typeof health.credentials.perplexity, "boolean");

  const pageResponse = await fetch(origin);
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get("cache-control"), "no-store");
  const page = await pageResponse.text();
  assert.match(page, />race</);
  assert.match(page, /CloudX Agent/);
  assert.match(page, /model-select/);
  assert.match(page, /Ask the agent anything/);
  assert.doesNotMatch(page, /4 tools|2 skills|skills workshop/i);
  assert.doesNotMatch(page, />\s*MODEL\s*</);
  assert.doesNotMatch(page, /trace-count|connection-label|TRAZA DEL TURNO/);
  assert.match(page, /activity-indicator/);

  const stylesResponse = await fetch(`${origin}/styles.css`);
  assert.equal(stylesResponse.status, 200);
  const styles = await stylesResponse.text();
  assert.match(styles, /--purple: #70285f/);
  assert.match(styles, /--magenta: #b52c78/);
  assert.match(styles, /--orange: #f05a28/);
  assert.match(styles, /background: #512646/);
  assert.match(styles, /\.app-shell \{[\s\S]*?width: 100%/);
  assert.doesNotMatch(styles, /linear-gradient/);
  assert.match(styles, /@keyframes spin/);
  assert.match(styles, /result-summary/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.model-picker \{[\s\S]*?border-radius: 6px/);
  assert.match(styles, /\.send-button \{[^}]*border-radius: 5px/);
  assert.doesNotMatch(styles, /999px/);

  const clientResponse = await fetch(`${origin}/app.js`);
  assert.equal(clientResponse.status, 200);
  const client = await clientResponse.text();
  assert.match(client, /<details>/);
  assert.doesNotMatch(client, /<details open>/);
  assert.match(client, /event\.type === "tool_start"/);
  assert.match(client, /event\.type === "tool_result"/);
  assert.match(client, /health\.credentials\?\.openrouter/);
  assert.doesNotMatch(client, /traceCount|connectionLabel/);
  assert.match(client, /model: modelSelect\.value/);
  assert.match(client, /structuredToolResult/);
  assert.match(client, /setActivity/);

  const resetResponse = await fetch(`${origin}/api/session/test-session`, { method: "DELETE" });
  assert.equal(resetResponse.status, 200);
  assert.deepEqual(await resetResponse.json(), {
    status: "success",
    scenario_reset: true,
  });
});
