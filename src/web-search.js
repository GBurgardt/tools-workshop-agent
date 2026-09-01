import { config } from "./config.js";

const ENDPOINT = "https://api.perplexity.ai/search";
const MAX_QUERY_CHARS = 600;
const DEFAULT_TIMEOUT_MS = 20_000;

export const SEARCH_WEB_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 2,
      maxLength: MAX_QUERY_CHARS,
      description: "A focused, self-contained web search query.",
    },
  },
  required: ["query"],
  additionalProperties: false,
};

function normalizeWebSearchQuery(value) {
  const query = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (query.length < 2) {
    const error = new Error("The search query needs at least 2 characters.");
    error.code = "search_query_too_short";
    throw error;
  }
  if (query.length > MAX_QUERY_CHARS) {
    const error = new Error(`The search query cannot exceed ${MAX_QUERY_CHARS} characters.`);
    error.code = "search_query_too_long";
    throw error;
  }
  return query;
}

function searchSignal(signal, timeoutMs) {
  const boundedTimeout = Math.min(
    30_000,
    Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
  );
  const timeout = AbortSignal.timeout(boundedTimeout);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function searchWeb(
  rawQuery,
  {
    fetchImpl = globalThis.fetch,
    apiKey = config.perplexityApiKey,
    signal = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  let query;
  try {
    query = normalizeWebSearchQuery(rawQuery);
  } catch (error) {
    return { ok: false, error: error.message, code: error.code };
  }

  if (!apiKey) {
    return {
      ok: false,
      query,
      error:
        "PERPLEXITY_API_KEY is not configured. search_web cannot run without that credential.",
    };
  }

  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_results: 6,
        max_tokens_per_page: 1_024,
      }),
      signal: searchSignal(signal, timeoutMs),
    });
  } catch (error) {
    const aborted = error?.name === "AbortError" || error?.name === "TimeoutError";
    return {
      ok: false,
      query,
      code: aborted ? "search_timeout_or_cancelled" : "search_transport_error",
      error: aborted
        ? "The web search timed out or was cancelled."
        : "The web search could not contact the provider.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      query,
      code: "search_provider_error",
      error: `The search provider returned HTTP ${response.status}.`,
    };
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];
  const results = rawResults
    .slice(0, 6)
    .map((item) => ({
      title: String(item?.title || "").trim(),
      snippet: String(item?.snippet || "").trim(),
      url: String(item?.url || "").trim(),
      date: item?.date ? String(item.date) : null,
      last_updated: item?.last_updated ? String(item.last_updated) : null,
    }))
    .filter((item) => item.title || item.url || item.snippet);

  return { ok: true, query, results };
}
