import { ACTIVE_MODE } from "./active-mode.js";

export const DEMO_MAX_RESULTS = 3;

const DEMO_RESULTS = [
  {
    title: "Function calling — OpenAI API",
    url: "https://developers.openai.com/api/docs/guides/function-calling",
    snippet: "Definí funciones claras, schemas precisos y devolvé sus resultados al modelo.",
  },
  {
    title: "Writing effective tools for AI agents — Anthropic",
    url: "https://www.anthropic.com/engineering/writing-tools-for-agents",
    snippet: "Probá las tools con evaluaciones reales y devolvé contexto de alta señal.",
  },
  {
    title: "How tool use works — Claude Platform",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works",
    snippet: "La tool es un contrato entre el modelo y la aplicación que la ejecuta.",
  },
];

// Fixed results keep the workshop demo independent from internet access.
export async function executeDemoSearchWeb(input, mode = ACTIVE_MODE) {
  if (mode !== "bad" && mode !== "good") {
    throw new Error(`Unknown demo mode: ${mode}`);
  }

  const query = String(input?.query || "").trim();
  const maxResults = Number(input?.max_results);

  if (!query || !Number.isInteger(maxResults) || maxResults < 1) {
    return {
      status: "error",
      error_code: "invalid_input",
      error: "search_web needs a query and a positive max_results.",
      why: "query must be non-empty and max_results must be a positive integer.",
      hint: "Retry with a concrete query and max_results=1 or greater.",
      available_options: ["add query", "use a positive max_results"],
    };
  }

  if (maxResults > DEMO_MAX_RESULTS) {
    if (mode === "bad") return { error: "failed" };
    return {
      status: "error",
      error_code: "limit_exceeded",
      error: `search_web supports at most ${DEMO_MAX_RESULTS} results per call.`,
      why: `${maxResults} results were requested; the limit is ${DEMO_MAX_RESULTS}.`,
      hint: `Retry the same query with max_results=${DEMO_MAX_RESULTS}.`,
      retryable: true,
      accepted_input: { query, max_results: DEMO_MAX_RESULTS },
      constraint: { field: "max_results", received: maxResults, maximum: DEMO_MAX_RESULTS },
      available_options: [{ strategy: "retry_with_maximum", max_results: DEMO_MAX_RESULTS }],
    };
  }

  return {
    status: "success",
    query,
    count: Math.min(maxResults, DEMO_RESULTS.length),
    results: DEMO_RESULTS.slice(0, maxResults).map((result) => ({ ...result })),
  };
}
