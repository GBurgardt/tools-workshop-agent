export const SEARCH_MAX_RESULTS = 6;

export const SEARCH_DEMO_USER_PROMPT =
  "Usá una única búsqueda con la query exacta 'OpenAI Anthropic tool design official documentation' y pedí 25 resultados. No dividas la consulta, no pagines ni pruebes números al azar: si hay un límite, hacé un solo reintento seguro con el máximo permitido y entregame esos resultados.";

const definition = Object.freeze({
  name: "search_web",
  description:
    "Busca información actual en la web. query es la consulta y max_results es la cantidad de resultados solicitada para esta llamada.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Consulta autónoma y concreta.",
      },
      max_results: {
        type: "integer",
        minimum: 1,
        description: "Cantidad de resultados solicitada para esta llamada.",
      },
    },
    required: ["query", "max_results"],
    additionalProperties: false,
  },
});

const DEMO_RESULTS = Object.freeze([
  Object.freeze({
    title: "Function calling — OpenAI API",
    url: "https://developers.openai.com/api/docs/guides/function-calling",
    snippet: "Definición, ejecución y retorno de resultados de funciones al modelo.",
  }),
  Object.freeze({
    title: "Programmatic tool calling — OpenAI API",
    url: "https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling",
    snippet: "Diseño de tools, output estructurado y fallos claros.",
  }),
  Object.freeze({
    title: "How tool use works — Claude Platform",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works",
    snippet: "Contrato entre la aplicación, el modelo y los tool results.",
  }),
  Object.freeze({
    title: "Handle tool calls — Claude Platform",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls",
    snippet: "Formato de tool_result y señalización de errores con is_error.",
  }),
  Object.freeze({
    title: "Define tools — Claude Platform",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools",
    snippet: "Schemas, descripciones y resultados de alta señal.",
  }),
  Object.freeze({
    title: "Troubleshooting tool use — Claude Platform",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use",
    snippet: "Diagnóstico de schemas, resultados e instrucciones no confiables.",
  }),
]);

async function deterministicSearch(input) {
  const query = String(input?.query || "").trim();
  const maxResults = Number(input?.max_results);
  const results = DEMO_RESULTS.slice(0, maxResults).map((result) => ({ ...result }));
  return {
    status: "success",
    query,
    requested_results: maxResults,
    count: results.length,
    results,
  };
}

export function createSearchWebToolDesign(
  design,
  { search = deterministicSearch } = {}
) {
  if (!new Set(["bad", "good"]).has(design)) {
    throw new Error(`Diseño desconocido: ${design}`);
  }

  return {
    design,
    definition,
    async execute(input, context) {
      const query = String(input?.query || "").trim();
      const received = Number(input?.max_results);

      if (!query || !Number.isInteger(received) || received < 1) {
        return {
          status: "error",
          error_code: "invalid_input",
          error: "La búsqueda necesita query y max_results positivo.",
        };
      }

      if (received > SEARCH_MAX_RESULTS) {
        if (design === "bad") return { error: "failed" };

        return {
          status: "error",
          error_code: "limit_exceeded",
          error: "La cantidad solicitada excede el límite por llamada.",
          why:
            `search_web recibió max_results=${received}; el proveedor admite como máximo ${SEARCH_MAX_RESULTS}.`,
          hint:
            `Reintentá la misma query con max_results=${SEARCH_MAX_RESULTS}.`,
          retryable: true,
          constraint: {
            field: "max_results",
            received,
            maximum: SEARCH_MAX_RESULTS,
          },
          attempted_input: { query, max_results: received },
          accepted_input: { query, max_results: SEARCH_MAX_RESULTS },
          available_options: [
            {
              strategy: "retry_with_maximum",
              max_results: SEARCH_MAX_RESULTS,
            },
          ],
        };
      }

      return search({ query, max_results: received }, context);
    },
  };
}
