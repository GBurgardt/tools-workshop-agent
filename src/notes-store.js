import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function loadNotes(path) {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(data?.notes) ? data.notes : [];
}

async function saveNotes(path, notes) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({ version: 1, notes }, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export async function executeNotes(input, context = {}) {
  const path = context.notesPath ?? context.config?.notesPath;
  const action = String(input?.action || "").trim();
  const notes = loadNotes(path);

  if (action === "save") {
    const content = String(input?.content || "").trim();
    if (!content || content.length > 2_000) {
      return {
        status: "error",
        error: "notes could not save the note.",
        why: content ? "The content exceeds 2000 characters." : "content is missing or empty.",
        hint: "Retry with content between 1 and 2000 characters.",
        available_options: ["shorten content", "add content"],
      };
    }
    const note = { id: `n-${randomUUID()}`, content, created_at: new Date().toISOString() };
    notes.push(note);
    await saveNotes(path, notes);
    return { status: "success", action, note };
  }

  if (action === "list" || action === "search") {
    const query = String(input?.query || "").trim().toLocaleLowerCase("es");
    if (action === "search" && !query) {
      return {
        status: "error",
        error: "notes needs a query to search.",
        why: "action='search' needs text to filter notes.",
        hint: "Add query or use action='list'.",
        available_options: ["add query", "use list"],
      };
    }
    const limit = Math.max(1, Math.min(50, Number(input?.limit) || 20));
    const matches = notes
      .filter((note) => !query || note.content.toLocaleLowerCase("es").includes(query))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    return matches.length
      ? { status: "success", action, count: matches.length, notes: matches }
      : {
          status: "no_results",
          error: query ? `No notes match '${input.query}'.` : "There are no notes yet.",
          why: "The local store has no matching note.",
          hint: "Try a broader query or use search_web for public information.",
          available_options: ["broaden query", "list notes", "use search_web"],
          searched_query: input?.query || null,
        };
  }

  if (action === "delete") {
    const noteId = String(input?.note_id || "").trim();
    const index = notes.findIndex((note) => note.id === noteId);
    if (index < 0) {
      return {
        status: "error",
        error: `notes could not find '${noteId || "(empty)"}'.`,
        why: "note_id is missing or does not match an existing note.",
        hint: "Call notes with action='list', copy the exact id, then retry delete.",
        available_options: ["list notes", "check note_id"],
      };
    }
    notes.splice(index, 1);
    await saveNotes(path, notes);
    return { status: "success", action, note_id: noteId };
  }

  return {
    status: "error",
    error: `Unknown notes action: '${action || "(empty)"}'.`,
    why: "The action is not part of the tool contract.",
    hint: "Use save, list, search, or delete.",
    available_options: ["save", "list", "search", "delete"],
  };
}
