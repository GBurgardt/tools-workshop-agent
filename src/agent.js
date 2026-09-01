import { config, modelById } from "./config.js";
import { DEMO_USER_PROMPT } from "./demo/demo-message.js";
import { streamOpenRouter } from "./openrouter.js";
import { render_index } from "./skills-runtime.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { SKILLS, TOOLS, TOOL_DEFINITIONS } from "./tool-catalog.js";

export { DEMO_USER_PROMPT, SKILLS, SYSTEM_PROMPT, TOOLS, TOOL_DEFINITIONS };

export const SKILLS_INDEX = render_index(SKILLS);

export const AGENT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n\n${SKILLS_INDEX}`;

const histories = new Map();
const loadedSkillsBySession = new Map();
const modelBySession = new Map();

function publicToolResult(result) {
  const text = JSON.stringify(result);
  if (text.length <= 8_000) return result;
  return {
    status: result?.status || (result?.error ? "error" : "success"),
    error: result?.error,
    why: result?.why,
    hint: result?.hint,
    truncated: true,
    preview: `${text.slice(0, 7_500)}…`,
  };
}

async function executeToolFromCatalog(tools, name, input, context) {
  const tool = tools.find((candidate) => candidate.definition.name === name);
  if (!tool) {
    return {
      status: "error",
      error: `Tool '${name}' is not available in this agent.`,
      why: "The name is not part of the active tool catalog.",
      hint: "Retry using one of the available tools.",
      available_options: tools.map((candidate) => candidate.definition.name),
    };
  }

  try {
    return await tool.execute(input, context);
  } catch (error) {
    return {
      status: "error",
      error: `${name} failed during execution.`,
      why: String(error?.message || "Unknown internal error."),
      hint: "Check the arguments before retrying.",
      available_options: tools.map((candidate) => candidate.definition.name),
    };
  }
}

function textFromResponse(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function clearSession(sessionId) {
  histories.delete(sessionId);
  loadedSkillsBySession.delete(sessionId);
  modelBySession.delete(sessionId);
}

export function getSessionHistory(sessionId) {
  return structuredClone(histories.get(sessionId) || []);
}

export async function runAgentLoop({
  history,
  systemPrompt,
  tools,
  model,
  toolContext = {},
  temperature,
  onEvent = () => {},
  callModel = streamOpenRouter,
  provider = config.openrouter,
}) {
  const toolDefinitions = tools.map((tool) => tool.definition);

  while (true) {
    const response = await callModel({
      ...provider,
      model,
      systemPrompt,
      toolDefinitions,
      history,
      temperature,
      onText: (text) => onEvent({ type: "assistant_delta", text }),
    });

    // Store the exact assistant response so tool_use blocks stay paired with their results.
    history.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return {
        text: textFromResponse(response),
        usage: response.usage,
        model: response.model,
        history,
      };
    }

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    const toolResults = [];

    for (const toolUse of toolUses) {
      onEvent({
        type: "tool_start",
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      });

      const result = await executeToolFromCatalog(
        tools,
        toolUse.name,
        toolUse.input,
        toolContext
      );
      const status =
        typeof result === "object" && result !== null
          ? result.status ?? (result.error ? "error" : "success")
          : "success";

      onEvent({
        type: "tool_result",
        id: toolUse.id,
        name: toolUse.name,
        status,
        result: publicToolResult(result),
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
        ...(status === "error" ? { is_error: true } : {}),
      });
    }

    // Add tool results to model history, then loop so the model can decide what to do next.
    history.push({ role: "user", content: toolResults });
  }
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
