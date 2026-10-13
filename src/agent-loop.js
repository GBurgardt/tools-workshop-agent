import { config } from "./config.js";
import { streamOpenRouter } from "./openrouter.js";

export async function runAgentLoop({
  history,
  systemPrompt,
  tools,
  model,
  toolContext = {},
  temperature,
  maxTurns = Infinity,
  onEvent = () => {},
  callModel = streamOpenRouter,
  provider = config.openrouter,
}) {
  const toolDefinitions = tools.map((tool) => tool.definition);

  // Each invocation owns its history; parent and child only share this function.
  for (let turn = 0; turn < maxTurns; turn += 1) {
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

    // A response without tool calls ends this invocation, whether parent or child.
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

    // Every tool uses the same dispatcher; run_subagent simply takes longer to return.
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
        { ...toolContext, model, onEvent, callModel, provider, toolCallId: toolUse.id }
      );
      const status =
        typeof result === "object" && result !== null
          ? result.status ?? (result.error ? "error" : "success")
          : "success";

      // UI events report progress; only the history below feeds the next model call.
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
  throw new Error(`Agent reached its limit of ${maxTurns} model calls. Narrow the task before retrying.`);
}

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
