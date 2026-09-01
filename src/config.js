import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const localEnv = readEnvFile(join(ROOT, ".env"));

function env(name, fallback = "") {
  const value = process.env[name] ?? localEnv[name] ?? fallback;
  return String(value).trim();
}

const dataDir = resolve(ROOT, env("TOOLS_WORKSHOP_DATA_DIR", "data"));

export const MODELS = [
  {
    id: "deepseek-flash",
    label: "DeepSeek V4 Flash",
    openrouterId: "~deepseek/deepseek-v4-flash-latest",
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    openrouterId: "anthropic/claude-sonnet-5",
  },
];

export function modelById(modelId) {
  const model = MODELS.find(
    (candidate) => candidate.id === modelId || candidate.openrouterId === modelId
  );
  if (model) return model;
  throw new Error(
    `Model '${modelId}' is not available. Choose: ${MODELS.map((item) => item.id).join(", ")}.`
  );
}

const defaultModel = modelById(env("TOOLS_WORKSHOP_MODEL", "deepseek-flash"));

export const config = {
  root: ROOT,
  port: Number.parseInt(env("TOOLS_WORKSHOP_PORT", "4317"), 10) || 4317,
  defaultModel,
  models: MODELS,
  openrouter: {
    apiKey: env("OPENROUTER_API_KEY"),
    baseUrl: env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    referer: env("OPENROUTER_HTTP_REFERER", "http://localhost:4317"),
    title: env("OPENROUTER_X_TITLE", "CloudX Skills Workshop"),
  },
  perplexityApiKey: env("PERPLEXITY_API_KEY", env("PPLX_API_KEY")),
  notesPath: join(dataDir, "notes.json"),
};
