import assert from "node:assert/strict";
import test from "node:test";
import {
  createNoteToolDesign,
  DEMO_NOTES,
  DEMO_NOTE,
  DEMO_STALE_ID,
} from "./fixtures/note-tool-designs.js";
import {
  createSearchWebToolDesign,
  SEARCH_MAX_RESULTS,
} from "./fixtures/search-web-tool-designs.js";
import {
  DEMO_MAX_RESULTS,
  executeDemoSearchWeb,
} from "../src/demo/search-web.js";
import { DEMO_USER_PROMPT } from "../src/demo/demo-message.js";

const DEMO_SEARCH_DEFINITION = createSearchWebToolDesign("good").definition;

function createDemoSearchWebTool(mode) {
  return {
    definition: DEMO_SEARCH_DEFINITION,
    execute: (input) => executeDemoSearchWeb(input, mode),
  };
}

test("la demo rápida contrasta error opaco y recuperación exacta", async () => {
  const input = { query: "diseño de tools", max_results: 10 };
  const badTool = createDemoSearchWebTool("bad");
  const goodTool = createDemoSearchWebTool("good");

  assert.strictEqual(badTool.definition, goodTool.definition);
  assert.match(DEMO_USER_PROMPT, /^Buscá 10 fuentes/);

  assert.deepEqual(await badTool.execute(input), { error: "failed" });

  const failure = await goodTool.execute(input);
  assert.equal(failure.status, "error");
  assert.equal(failure.error_code, "limit_exceeded");
  assert.equal(failure.constraint.maximum, DEMO_MAX_RESULTS);

  const successInput = failure.accepted_input;
  const success = await goodTool.execute(successInput);
  assert.equal(success.status, "success");
  assert.equal(success.count, 3);
});

test("las variantes web sólo difieren en el retorno del límite excedido", async () => {
  const input = { query: "OpenAI Anthropic tool design", max_results: 25 };
  const badTool = createSearchWebToolDesign("bad");
  const goodTool = createSearchWebToolDesign("good");

  assert.strictEqual(badTool.definition, goodTool.definition);
  assert.deepEqual(await badTool.execute(input), { error: "failed" });

  const good = await goodTool.execute(input);
  assert.equal(good.status, "error");
  assert.equal(good.error_code, "limit_exceeded");
  assert.equal(good.constraint.received, 25);
  assert.equal(good.constraint.maximum, SEARCH_MAX_RESULTS);
  assert.deepEqual(good.accepted_input, {
    query: input.query,
    max_results: SEARCH_MAX_RESULTS,
  });
});

test("las variantes web producen el mismo éxito dentro del límite", async () => {
  const input = {
    query: "OpenAI Anthropic tool design",
    max_results: SEARCH_MAX_RESULTS,
  };
  const bad = createSearchWebToolDesign("bad");
  const good = createSearchWebToolDesign("good");
  assert.deepEqual(await bad.execute(input), await good.execute(input));
});

test("las variantes sólo difieren en la calidad del error por id vencido", async () => {
  const input = { action: "delete", note_id: DEMO_STALE_ID };
  const badTool = createNoteToolDesign("bad");
  const goodTool = createNoteToolDesign("good");

  // Misma definición/schema y mismo estado inicial: el experimento sólo cambia
  // el retorno de la llamada fallida que se compara abajo.
  assert.strictEqual(badTool.definition, goodTool.definition);
  assert.deepEqual(badTool.snapshot(), goodTool.snapshot());

  const bad = await badTool.execute(input);
  const good = await goodTool.execute(input);

  assert.deepEqual(bad, { error: "failed" });
  assert.equal(good.status, "error");
  assert.match(good.why, /venci/i);
  assert.match(good.hint, /action='search'/i);
  assert.deepEqual(good.suggested_call.input, { action: "search", query: "ensayo" });
});

test("las variantes responden igual fuera del error deliberadamente contrastado", async () => {
  const bad = createNoteToolDesign("bad");
  const good = createNoteToolDesign("good");

  assert.deepEqual(
    await bad.execute({ action: "search", query: "ensayo" }),
    await good.execute({ action: "search", query: "ensayo" })
  );
  assert.deepEqual(
    await bad.execute({ action: "delete", note_id: DEMO_NOTE.id }),
    await good.execute({ action: "delete", note_id: DEMO_NOTE.id })
  );
  assert.deepEqual(bad.snapshot(), good.snapshot());
});

test("la variante buena habilita search y el delete reparado", async () => {
  const notes = createNoteToolDesign("good");
  const found = await notes.execute({ action: "search", query: "ensayo" });
  assert.equal(found.count, 1);
  assert.equal(found.notes[0].id, DEMO_NOTE.id);

  const deleted = await notes.execute({ action: "delete", note_id: DEMO_NOTE.id });
  assert.equal(deleted.status, "success");
  assert.equal(notes.snapshot().length, DEMO_NOTES.length - 1);
  assert.equal(notes.snapshot().some((note) => note.id === DEMO_NOTE.id), false);
});
