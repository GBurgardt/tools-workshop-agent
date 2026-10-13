import { config, modelById } from "./config.js";
import { DEMO_USER_PROMPT } from "./demo/demo-message.js";
import { runAgentLoop } from "./agent-loop.js";
import { runSubagentTool } from "./subagent.js";
import { render_index } from "./skills-runtime.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { SKILLS, TOOLS as BASE_TOOLS } from "./tool-catalog.js";

export const TOOLS = [...BASE_TOOLS, runSubagentTool];
export const TOOL_DEFINITIONS = TOOLS.map((tool) => tool.definition);

export { DEMO_USER_PROMPT, SKILLS, SYSTEM_PROMPT, runAgentLoop };

export const SKILLS_INDEX = render_index(SKILLS);

export const AGENT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n\n${SKILLS_INDEX}`;

const histories = new Map();
const loadedSkillsBySession = new Map();
const modelBySession = new Map();

export function clearSession(sessionId) {
  histories.delete(sessionId);
  loadedSkillsBySession.delete(sessionId);
  modelBySession.delete(sessionId);
}

export function getSessionHistory(sessionId) {
  return structuredClone(histories.get(sessionId) || []);
}

export async function runAgentTurn({
  sessionId,
  message,
  modelId = config.defaultModel.id,
  onEvent = () => {},
}) {
  if (!config.openrouter.apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it to .env before starting the chat.");
  }

  const selectedModel = modelById(modelId);
  if (modelBySession.has(sessionId) && modelBySession.get(sessionId) !== selectedModel.id) {
    clearSession(sessionId);
  }
  modelBySession.set(sessionId, selectedModel.id);

  const history = histories.get(sessionId) || [];
  const loadedSkills = loadedSkillsBySession.get(sessionId) || new Set();
  loadedSkillsBySession.set(sessionId, loadedSkills);
  history.push({ role: "user", content: message });

  const result = await runAgentLoop({
    history,
    systemPrompt: AGENT_SYSTEM_PROMPT,
    tools: TOOLS,
    model: selectedModel.openrouterId,
    toolContext: { config, loadedSkills },
    onEvent,
  });

  histories.set(sessionId, result.history.slice(-40));
  const { history: _history, ...publicResult } = result;
  return publicResult;
}
