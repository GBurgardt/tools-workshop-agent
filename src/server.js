import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { config } from "./config.js";
import {
  clearSession,
  runAgentTurn,
  SKILLS,
  SKILLS_INDEX,
  TOOL_DEFINITIONS,
} from "./agent.js";

const PUBLIC_DIR = join(config.root, "public");
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("The message exceeds 64 KB.");
  }
  return JSON.parse(body || "{}");
}

function sendEvent(response, event) {
  response.write(`${JSON.stringify(event)}\n`);
}

async function chat(request, response) {
  const body = await readJson(request);
  const message = String(body.message || "").trim();
  const sessionId = String(body.session_id || "demo").trim().slice(0, 120);
  const modelId = String(body.model || config.defaultModel.id).trim();
  if (!message) return json(response, 400, { error: "The message is empty." });

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  try {
    const result = await runAgentTurn({
      sessionId,
      message,
      modelId,
      onEvent: (event) => sendEvent(response, event),
    });
    sendEvent(response, { type: "done", ...result });
  } catch (error) {
    sendEvent(response, { type: "error", error: String(error?.message || error) });
  }
  response.end();
}

function staticFile(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const path = join(PUBLIC_DIR, safePath);
  if (!path.startsWith(PUBLIC_DIR) || !existsSync(path) || !statSync(path).isFile()) {
    return json(response, 404, { error: "Not found" });
  }
  response.writeHead(200, {
    "Content-Type": TYPES[extname(path)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(path).pipe(response);
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      return json(response, 200, {
        status: "ok",
        default_model: config.defaultModel.id,
        models: config.models,
        tools: TOOL_DEFINITIONS.map((tool) => tool.name),
        tool_count: TOOL_DEFINITIONS.length,
        credentials: {
          openrouter: Boolean(config.openrouter.apiKey),
          perplexity: Boolean(config.perplexityApiKey),
        },
      });
    }
    if (request.method === "POST" && request.url === "/api/chat") {
      return await chat(request, response);
    }
    if (request.method === "DELETE" && request.url?.startsWith("/api/session/")) {
      clearSession(decodeURIComponent(request.url.slice("/api/session/".length)));
      return json(response, 200, { status: "success", scenario_reset: true });
    }
    if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
    return staticFile(request, response);
  } catch (error) {
    return json(response, 500, { error: String(error?.message || error) });
  }
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Tools Workshop Agent is running at http://localhost:${config.port}`);
    console.log(
      `Default model: ${config.defaultModel.label} (${config.defaultModel.openrouterId})`
    );
    console.log(`Tools: ${TOOL_DEFINITIONS.map((tool) => tool.name).join(", ")}`);
    console.log(`Skills in index: [${Object.keys(SKILLS).map((name) => `'${name}'`).join(", ")}]`);
    console.log(`Index: ~${Math.floor(SKILLS_INDEX.length / 4)} tokens in the system prompt`);
    console.log(`\n${SKILLS_INDEX}\n`);
  });
}
