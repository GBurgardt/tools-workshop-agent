function messagesForOpenRouter(history, systemPrompt) {
  const messages = [{ role: "system", content: systemPrompt }];

  for (const message of history) {
    if (typeof message.content === "string") {
      messages.push(message);
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const toolCalls = message.content
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        }));
      messages.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    for (const block of message.content) {
      if (block.type === "tool_result") {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: block.content,
        });
      }
    }
  }

  return messages;
}

function toolsForOpenRouter(toolDefinitions) {
  return toolDefinitions.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function openRouterError(response) {
  const payload = await response.json().catch(() => ({}));
  const detail = payload?.error?.message || payload?.message || response.statusText;
  return new Error(`OpenRouter ${response.status}: ${detail}`);
}

export async function streamOpenRouter({
  apiKey,
  baseUrl,
  referer,
  title,
  model,
  systemPrompt,
  toolDefinitions,
  history,
  temperature,
  onText = () => {},
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": title,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4_096,
      messages: messagesForOpenRouter(history, systemPrompt),
      tools: toolsForOpenRouter(toolDefinitions),
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
      ...(temperature === undefined ? {} : { temperature }),
    }),
  });
  if (!response.ok) throw await openRouterError(response);
  if (!response.body) throw new Error("OpenRouter did not return a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map();
  let buffer = "";
  let text = "";
  let usage;
  let responseModel = model;

  const consumeLine = (line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;

    const event = JSON.parse(data);
    responseModel = event.model || responseModel;
    usage = event.usage || usage;
    const delta = event.choices?.[0]?.delta || {};

    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      onText(delta.content);
    }

    for (const fragment of delta.tool_calls || []) {
      const call = toolCalls.get(fragment.index) || { id: "", name: "", arguments: "" };
      call.id += fragment.id || "";
      call.name += fragment.function?.name || "";
      call.arguments += fragment.function?.arguments || "";
      toolCalls.set(fragment.index, call);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) consumeLine(line.trimEnd());
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer.trimEnd());

  const content = text ? [{ type: "text", text }] : [];
  for (const call of [...toolCalls.values()]) {
    let input;
    try {
      input = JSON.parse(call.arguments || "{}");
    } catch {
      throw new Error(`OpenRouter returned invalid arguments for '${call.name}'.`);
    }
    content.push({ type: "tool_use", id: call.id, name: call.name, input });
  }

  return {
    content,
    stop_reason: toolCalls.size ? "tool_use" : "end_turn",
    usage,
    model: responseModel,
  };
}
