import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  notesTool,
  TOOL_DEFINITIONS,
} from "../src/tool-catalog.js";
import { searchWeb } from "../src/web-search.js";

test("el catálogo tiene las cuatro tools del agente", () => {
  assert.equal(TOOL_DEFINITIONS.length, 4);
  assert.deepEqual(
    TOOL_DEFINITIONS.map((tool) => tool.name),
    ["search_web", "notes", "load_skill", "read_skill_file"]
  );
});

test("search_web pide una query concreta", () => {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === "search_web");
  assert.deepEqual(definition.input_schema.required, ["query"]);
  assert.match(definition.description, /Perplexity/i);
  assert.doesNotMatch(definition.description, /bad|good|modo/i);
});

test("search_web valida una query inválida antes de llamar al proveedor", async () => {
  let called = false;
  const result = await searchWeb("x", {
    fetchImpl: async () => {
      called = true;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "search_query_too_short");
  assert.equal(called, false);
});

test("search_web usa el contrato de Perplexity y devuelve sólo campos públicos", async () => {
  let request;
  const result = await searchWeb("  CloudX\n workshop  ", {
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      request = options;
      return new Response(
        JSON.stringify({
          results: [{
            title: " CloudX ",
            url: "https://cloudx.com",
            snippet: " Workshop ",
            date: "2026-08-30",
            last_updated: "2026-08-30T12:00:00Z",
            private_field: "ignored",
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
  });

  assert.deepEqual(JSON.parse(request.body), {
    query: "CloudX workshop",
    max_results: 6,
    max_tokens_per_page: 1_024,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.results, [{
    title: "CloudX",
    snippet: "Workshop",
    url: "https://cloudx.com",
    date: "2026-08-30",
    last_updated: "2026-08-30T12:00:00Z",
  }]);
});

test("notes guarda, busca y borra de forma persistente", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tools-workshop-notes-"));
  const notesPath = join(directory, "notes.json");
  const saved = await notesTool.execute(
    { action: "save", content: "El prototipo se llama Resorte Azul" },
    { notesPath }
  );
  assert.equal(saved.status, "success");

  const found = await notesTool.execute(
    { action: "search", query: "resorte" },
    { notesPath }
  );
  assert.equal(found.count, 1);
  assert.equal(found.notes[0].id, saved.note.id);

  const removed = await notesTool.execute(
    { action: "delete", note_id: saved.note.id },
    { notesPath }
  );
  assert.equal(removed.status, "success");
});

test("notes explica cómo recuperarse de un id inexistente", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tools-workshop-notes-"));
  const result = await notesTool.execute(
    { action: "delete", note_id: "n-a71c9e" },
    { notesPath: join(directory, "notes.json") }
  );
  assert.equal(result.status, "error");
  assert.match(result.why, /does not match/i);
  assert.match(result.hint, /action='list'/i);
  assert.ok(result.available_options.includes("list notes"));
});
