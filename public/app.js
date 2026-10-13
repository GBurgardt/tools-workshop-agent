const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const resetButton = document.querySelector("#reset-button");
const modelSelect = document.querySelector("#model-select");
const railTrace = document.querySelector("#rail-trace");
const activityIndicator = document.querySelector("#activity-indicator");
const activityLabel = document.querySelector("#activity-label");

let sessionId = crypto.randomUUID();
let busy = false;
let activeAssistant = null;
let activeAssistantText = "";
const toolEvents = new Map();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderText(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|\s)\*([^*\n]+)\*/g, "$1<strong>$2</strong>");
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
  return html
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function scrollDown() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, text = "") {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = text ? renderText(text) : "";
  row.append(bubble);
  messages.append(row);
  scrollDown();
  return bubble;
}

function ensureAssistant() {
  if (!activeAssistant) {
    activeAssistant = addMessage("agent");
    activeAssistant.classList.add("typing");
  }
  return activeAssistant;
}

function finalizeAssistant() {
  if (!activeAssistant) return;
  activeAssistant.classList.remove("typing");
  if (!activeAssistantText.trim()) activeAssistant.closest(".message-row")?.remove();
  activeAssistant = null;
  activeAssistantText = "";
}

function compactInput(inputValue) {
  const value = Object.values(inputValue || {}).find((item) => typeof item === "string");
  return String(value || "no parameters").slice(0, 80);
}

function parseToolResult(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return value;
  }
}

function optionLabel(option) {
  if (typeof option === "string") return option;
  if (option?.strategy) {
    const detail = option.max_results ?? option.page_size ?? option.tool;
    return detail === undefined ? option.strategy : `${option.strategy}: ${detail}`;
  }
  return JSON.stringify(option);
}

function structuredToolResult(value, status) {
  const result = parseToolResult(value);
  if (!result || typeof result !== "object") {
    return `<pre class="result-json">${escapeHtml(String(result ?? ""))}</pre>`;
  }

  const failed = status === "error" || status === "no_results" || result.error;
  if (!failed) {
    return `<pre class="result-json">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
  }

  const rows = [];
  const addRow = (label, content, className = "") => {
    if (content === undefined || content === null || content === "") return;
    rows.push(`
      <div class="result-row ${className}">
        <span class="result-label">${escapeHtml(label)}</span>
        <span>${escapeHtml(content)}</span>
      </div>`);
  };

  addRow("Error", result.error || result.error_code || status, "result-error");
  addRow("Code", result.error_code);
  addRow("Why", result.why);
  addRow("Next step", result.hint);
  if (result.constraint && typeof result.constraint === "object") {
    const field = result.constraint.field || "parameter";
    const received = result.constraint.received;
    const maximum = result.constraint.maximum;
    addRow("Limit", `${field}: received ${received}; max ${maximum}`);
  }
  if (result.searched_range) addRow("Search range", result.searched_range);

  const options = Array.isArray(result.available_options)
    ? result.available_options
        .map((option) => `<span class="result-option">${escapeHtml(optionLabel(option))}</span>`)
        .join("")
    : "";
  if (options) {
    rows.push(`
      <div class="result-row">
        <span class="result-label">Options</span>
        <span class="result-options">${options}</span>
      </div>`);
  }

  return `
    <div class="result-summary">${rows.join("")}</div>
    <details class="result-raw">
      <summary>Full JSON</summary>
      <pre class="result-json">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    </details>`;
}

function setActivity(visible, label = "Working…") {
  activityIndicator.hidden = !visible;
  activityLabel.textContent = label;
}

function addToolStart(event) {
  if (activeAssistantText.trim()) finalizeAssistant();

  const wrapper = document.createElement("div");
  wrapper.className = "tool-event";
  wrapper.innerHTML = `
    <details>
      <summary>
        <span class="event-pulse"></span>
        <span class="event-name">${escapeHtml(event.name)}</span>
        <span class="event-summary">${escapeHtml(compactInput(event.input))}</span>
        <span class="event-status">running</span>
      </summary>
      <div class="event-result"><pre class="result-json">${escapeHtml(JSON.stringify(event.input, null, 2))}</pre></div>
    </details>`;
  messages.append(wrapper);

  const railItem = document.createElement("div");
  railItem.className = "rail-item";
  railItem.innerHTML = `<b>${escapeHtml(event.name)}</b><small>${escapeHtml(compactInput(event.input))}</small>`;
  railTrace.querySelector(".trace-empty")?.remove();
  railTrace.prepend(railItem);
  toolEvents.set(event.id, { wrapper, railItem });
  setActivity(true, `Running ${event.name}…`);
  scrollDown();
}

function addToolResult(event) {
  const item = toolEvents.get(event.id);
  if (!item) return;
  const failed = event.status === "error" || event.status === "no_results";
  item.wrapper.classList.add(failed ? "failed" : "done");
  item.railItem.classList.add(failed ? "failed" : "done");
  item.wrapper.querySelector(".event-status").textContent = event.status;
  item.wrapper.querySelector(".event-result").innerHTML = structuredToolResult(
    event.result,
    event.status
  );
  setActivity(false);
  scrollDown();
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value || !input.value.trim();
  input.disabled = value;
  modelSelect.disabled = value;
  document.body.classList.toggle("busy", value);
  setActivity(value, "Thinking…");
  if (!value) input.focus();
}

function autoSize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  sendButton.disabled = busy || !input.value.trim();
}

async function consumeNdjson(response) {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      handleEvent(JSON.parse(line));
    }
    if (done) break;
  }
  if (buffer.trim()) handleEvent(JSON.parse(buffer));
}

function handleEvent(event) {
  if (event.type === "subagent_event") {
    const childEvent = {
      ...event.event,
      id: `${event.parentId}/${event.event.id}`,
      name: `${event.agent} · ${event.event.name}`,
    };
    if (childEvent.type === "tool_start") addToolStart(childEvent);
    if (childEvent.type === "tool_result") addToolResult(childEvent);
    setActivity(true, `Waiting for ${event.agent}…`);
    return;
  }
  if (event.type === "assistant_delta") {
    setActivity(false);
    const bubble = ensureAssistant();
    activeAssistantText += event.text;
    bubble.innerHTML = renderText(activeAssistantText);
    scrollDown();
    return;
  }
  if (event.type === "tool_start") return addToolStart(event);
  if (event.type === "tool_result") return addToolResult(event);
  if (event.type === "done") {
    setActivity(false);
    if (!activeAssistantText.trim() && event.text) {
      activeAssistantText = event.text;
      ensureAssistant().innerHTML = renderText(event.text);
    }
    finalizeAssistant();
    return;
  }
  if (event.type === "error") {
    setActivity(false);
    throw new Error(event.error);
  }
}

async function sendMessage(text) {
  const message = String(text || input.value).trim();
  if (!message || busy) return;
  input.value = "";
  autoSize();
  addMessage("user", message);
  setBusy(true);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        model: modelSelect.value,
        message,
      }),
    });
    await consumeNdjson(response);
  } catch (error) {
    finalizeAssistant();
    addMessage("agent", `I couldn't complete this turn.\n\n\`${error.message}\``);
  } finally {
    finalizeAssistant();
    setBusy(false);
  }
}

async function resetConversation() {
  if (busy) return;
  await fetch(`/api/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
  sessionId = crypto.randomUUID();
  messages.replaceChildren();
  toolEvents.clear();
  setActivity(false);
  railTrace.innerHTML = '<p class="trace-empty">Tool calls will appear here.</p>';
  await checkHealth();
  input.focus();
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    const modelsReady = health.status === "ok" && health.credentials?.openrouter;

    const selectedModel = modelSelect.value;
    modelSelect.replaceChildren(
      ...health.models.map((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.label;
        return option;
      })
    );
    const modelIds = health.models.map((model) => model.id);
    modelSelect.value = modelIds.includes(selectedModel)
      ? selectedModel
      : health.default_model;
    modelSelect.disabled = !modelsReady || busy;
  } catch {
    modelSelect.options[0].textContent = "Server unavailable";
    modelSelect.disabled = true;
  }
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});
input.addEventListener("input", autoSize);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
resetButton.addEventListener("click", resetConversation);
modelSelect.addEventListener("change", resetConversation);
autoSize();
checkHealth();
input.focus();
