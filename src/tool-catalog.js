import { executeNotes } from "./notes-store.js";
import { discover_skills, load_skill, read_skill_file } from "./skills-runtime.js";
import { searchWeb, SEARCH_WEB_INPUT_SCHEMA } from "./web-search.js";

export const SKILLS = discover_skills();

export const searchWebTool = {
  definition: {
    name: "search_web",
    description:
      "Search current public information with Perplexity and return titles, summaries, URLs, and dates. Use it for web research, news, or facts that may have changed.",
    input_schema: SEARCH_WEB_INPUT_SCHEMA,
  },
  execute(input) {
    return searchWeb(input.query);
  },
};

export const notesTool = {
  definition: {
    name: "notes",
    description: "Save, list, search, or delete local notes.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save", "list", "search", "delete"] },
        content: { type: "string", description: "Text to save." },
        query: { type: "string", description: "Text to search." },
        note_id: { type: "string", description: "Exact note id to delete." },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  execute(input, context) {
    return executeNotes(input, context);
  },
};

export const loadSkillTool = {
  definition: {
    name: "load_skill",
    description:
      "Load a skill's full instructions. Use it before answering when the task matches a skill in the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        skill_name: { type: "string", description: "Exact skill name from the system prompt." },
      },
      required: ["skill_name"],
      additionalProperties: false,
    },
  },
  execute(input, { loadedSkills = new Set() } = {}) {
    const skillName = input.skill_name || "";
    const result = load_skill(SKILLS, skillName, loadedSkills);
    console.log(`  [skill] load_skill(${skillName})  ->  ${result.length} chars added to context`);
    return result;
  },
};

export const readSkillFileTool = {
  definition: {
    name: "read_skill_file",
    description: "Read one file from a loaded skill when its instructions point to that file.",
    input_schema: {
      type: "object",
      properties: {
        skill_name: { type: "string", description: "Exact skill name." },
        file_path: { type: "string", description: "Path relative to the skill folder." },
      },
      required: ["skill_name", "file_path"],
      additionalProperties: false,
    },
  },
  execute(input) {
    const skillName = input.skill_name || "";
    const filePath = input.file_path || "";
    const result = read_skill_file(SKILLS, skillName, filePath);
    console.log(
      `  [skill] read_skill_file(${skillName}, ${filePath})  ->  ${result.length} chars added to context`
    );
    return result;
  },
};

export const TOOLS = [searchWebTool, notesTool, loadSkillTool, readSkillFileTool];
export const TOOL_DEFINITIONS = TOOLS.map((tool) => tool.definition);
