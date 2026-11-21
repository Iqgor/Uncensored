import http from "node:http";
import "dotenv/config";

const port = Number(process.env.PORT || 8787);
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const aiProvider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const aiApiKey = process.env.AI_API_KEY;
const aiModel = process.env.AI_MODEL;
const aiBaseUrl = process.env.AI_BASE_URL;
const isProduction = process.env.NODE_ENV === "production";
const rateLimitWindowMs = Number(
  process.env.RATE_LIMIT_WINDOW_MS || 60_000
);
const rateLimitMaxRequests = Number(
  process.env.RATE_LIMIT_MAX_REQUESTS || 10
);
const rateLimitEntries = new Map();

class UpstreamError extends Error {}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Retry-After"
  });
  response.end(JSON.stringify(body));
}

function getClientAddress(request) {
  return request.socket.remoteAddress || "unknown";
}

function checkRateLimit(clientAddress, now = Date.now()) {
  const current = rateLimitEntries.get(clientAddress);
  if (!current || now - current.startedAt >= rateLimitWindowMs) {
    rateLimitEntries.set(clientAddress, { startedAt: now, count: 1 });
    return { allowed: true, remaining: Math.max(rateLimitMaxRequests - 1, 0) };
  }

  if (current.count >= rateLimitMaxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        (rateLimitWindowMs - (now - current.startedAt)) / 1000
      )
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(rateLimitMaxRequests - current.count, 0)
  };
}

function logRequest(request, statusCode, startedAt, extra = {}) {
  console.log(
    JSON.stringify({
      event: "http_request",
      method: request.method,
      route: request.url,
      statusCode,
      durationMs: Date.now() - startedAt,
      clientAddress: getClientAddress(request),
      ...extra
    })
  );
}

const rateLimitCleanup = setInterval(() => {
  const expiration = Date.now() - rateLimitWindowMs;
  for (const [clientAddress, entry] of rateLimitEntries) {
    if (entry.startedAt < expiration) {
      rateLimitEntries.delete(clientAddress);
    }
  }
}, rateLimitWindowMs);
rateLimitCleanup.unref();

function cleanArticleText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:NOS\s+)?Nieuws\s*(?:vandaag|gisteren|eergisteren),?\s*\d{1,2}:\d{2}\s*/i, "")
    .replace(/([.!?])(?=[A-ZÀ-ÖØ-Þ])/g, "$1 ")
    .trim();
}

function validateSummary(value, summaryLength) {
  if (!value || typeof value !== "object") {
    throw new UpstreamError("Gemini gaf geen geldige samenvatting terug.");
  }

  const summary = value;
  if (typeof summary.title !== "string" || !summary.title.trim()) {
    throw new UpstreamError("Gemini gaf geen geldige titel terug.");
  }
  if (typeof summary.summary !== "string" || !summary.summary.trim()) {
    throw new UpstreamError("Gemini gaf geen geldige samenvatting terug.");
  }
  if (
    !Array.isArray(summary.keyPoints) ||
    summary.keyPoints.length !== summaryLength ||
    summary.keyPoints.some(
      (point) => typeof point !== "string" || !point.trim()
    )
  ) {
    throw new UpstreamError("Gemini gaf geen geldige kernpunten terug.");
  }

  return {
    title: summary.title.trim(),
    summary: summary.summary.trim(),
    keyPoints: summary.keyPoints.map((point) => point.trim())
  };
}

function getProductionMockupSummary(summaryLength) {
  return {
    title: "Nieuwe regels moeten online veiligheid versterken",
    summary:
      "De Europese Commissie presenteert nieuwe maatregelen om gebruikers beter te beschermen op online platforms.\n\nDe voorstellen richten zich op transparantie, duidelijke meldprocedures en meer verantwoordelijkheid voor grote techbedrijven.",
    keyPoints: [
      "Platforms moeten sneller reageren op meldingen van schadelijke inhoud.",
      "Gebruikers krijgen meer inzicht in de manier waarop aanbevelingen werken.",
      "Grote techbedrijven moeten periodiek rapporteren over hun risico's.",
      "De nieuwe regels worden de komende maanden verder uitgewerkt.",
      "Toezichthouders krijgen extra bevoegdheden om naleving te controleren.",
      "De maatregelen kunnen gevolgen hebben voor de manier waarop platforms werken."
    ].slice(0, summaryLength)
  };
}

async function summarizeWithGemini(article, summaryLength) {
  if (isProduction) {
    return getProductionMockupSummary(summaryLength);
  }

  if (!geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Stel deze omgevingsvariabele in voordat je de server start."
    );
  }

  const endpoint = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      geminiModel
    )}:generateContent`
  );
  endpoint.searchParams.set("key", geminiApiKey);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Je bent een nauwkeurige nieuwsredacteur. Detecteer eerst de taal van het aangeleverde artikel en schrijf de titel, samenvatting en kernpunten in diezelfde taal. Gebruik uitsluitend informatie uit het artikel. Voeg geen feiten toe en geef geen commentaar buiten het gevraagde JSON-formaat."
            }
          ]
        },
        contents: [
          {
            parts: [
              {
                text: `Vat dit nieuwsartikel beknopt samen van maximaal 100 woorden met precies ${summaryLength} kernpunten. Schrijf de samenvatting als één kleine alinea.\n\nTitel: ${
                  article.title?.trim() || "Onbekend"
                }\n\nArtikel:\n${cleanArticleText(article.text)}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              summary: { type: "STRING" },
              keyPoints: {
                type: "ARRAY",
                items: { type: "STRING" },
                minItems: summaryLength,
                maxItems: summaryLength
              }
            },
            required: ["title", "summary", "keyPoints"]
          }
        }
      }),
      signal: abortController.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini reageerde niet binnen 30 seconden.");
    }
    throw new Error("Gemini kon niet worden bereikt.");
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.text();
  let data;
  try {
    data = JSON.parse(responseBody);
  } catch (_error) {
    throw new UpstreamError("Gemini gaf geen geldige JSON-respons terug.");
  }
  if (!response.ok) {
    throw new UpstreamError(
      `Gemini kon de samenvatting niet genereren (HTTP ${response.status}).`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new UpstreamError("Gemini gaf geen samenvatting terug.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new UpstreamError("Gemini gaf geen geldige JSON-samenvatting terug.");
  }
  return validateSummary(parsed, summaryLength);
}

function getProviderConfig(provider) {
  if (provider === "gemini") {
    return {
      configured: isProduction || Boolean(geminiApiKey),
      label: "Google Gemini",
      model: geminiModel
    };
  }
  if (provider === "openai-compatible") {
    return {
      configured: Boolean(aiBaseUrl && aiModel),
      label: "OpenAI-compatible",
      model: aiModel || ""
    };
  }
  return { configured: false, label: provider, model: "" };
}

function getAvailableProviders() {
  const requestedProvider = aiProvider;
  const providers = ["gemini", "openai-compatible"]
    .map((provider) => ({
      id: provider,
      ...getProviderConfig(provider)
    }))
    .filter((provider) => provider.configured);
  const defaultProvider = providers.find(
    (provider) => provider.id === requestedProvider
  ) || providers[0];
  return {
    providers,
    defaultProvider: defaultProvider?.id || ""
  };
}

async function summarizeWithOpenAiCompatible(article, summaryLength) {
  if (!aiBaseUrl || !aiModel) {
    throw new Error(
      "AI_BASE_URL en AI_MODEL ontbreken. Stel deze omgevingsvariabelen in voordat je de server start."
    );
  }

  const endpoint = new URL(
    aiBaseUrl.replace(/\/$/, "") + "/chat/completions"
  );
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {})
      },
      body: JSON.stringify({
        model: aiModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Je bent een nauwkeurige nieuwsredacteur. Detecteer eerst de taal van het aangeleverde artikel en schrijf de titel, samenvatting en kernpunten in diezelfde taal. Gebruik uitsluitend informatie uit het artikel. Voeg geen feiten toe en geef geen commentaar buiten het gevraagde JSON-formaat."
          },
          {
            role: "user",
            content: `Vat dit nieuwsartikel beknopt samen van maximaal 100 woorden met precies ${summaryLength} kernpunten. Schrijf de samenvatting als één kleine alinea. Antwoord uitsluitend met geldige JSON met titel, summary en keyPoints.\n\nTitel: ${article.title?.trim() || "Onbekend"}\n\nArtikel:\n${cleanArticleText(article.text)}`
          }
        ]
      }),
      signal: abortController.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("De AI-provider reageerde niet binnen 30 seconden.");
    }
    throw new Error("De AI-provider kon niet worden bereikt.");
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.text();
  let data;
  try {
    data = JSON.parse(responseBody);
  } catch (_error) {
    throw new UpstreamError("De AI-provider gaf geen geldige JSON-respons terug.");
  }
  if (!response.ok) {
    throw new UpstreamError(
      `De AI-provider kon de samenvatting niet genereren (HTTP ${response.status}).`
    );
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new UpstreamError("De AI-provider gaf geen samenvatting terug.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new UpstreamError("De AI-provider gaf geen geldige JSON-samenvatting terug.");
  }
  return validateSummary(parsed, summaryLength);
}

async function summarizeWithProvider(provider, article, summaryLength) {
  if (isProduction) {
    return getProductionMockupSummary(summaryLength);
  }
  if (provider === "openai-compatible") {
    return summarizeWithOpenAiCompatible(article, summaryLength);
  }
  if (provider === "gemini") {
    return summarizeWithGemini(article, summaryLength);
  }
  throw new Error("Ongeldige AI-provider.");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Het artikel is te groot."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const startedAt = Date.now();

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After"
    });
    response.end();
    logRequest(request, 204, startedAt);
    return;
  }

  if (request.method === "GET" && request.url === "/api/providers") {
    sendJson(response, 200, getAvailableProviders());
    logRequest(request, 200, startedAt);
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/summarize") {
    sendJson(response, 404, { error: "Endpoint niet gevonden." });
    logRequest(request, 404, startedAt);
    return;
  }

  const rateLimit = checkRateLimit(getClientAddress(request));
  if (!rateLimit.allowed) {
    response.setHeader("Retry-After", rateLimit.retryAfterSeconds);
    sendJson(response, 429, {
      error: "Te veel aanvragen. Probeer het later opnieuw."
    });
    logRequest(request, 429, startedAt, {
      reason: "rate_limit",
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
    return;
  }

  try {
    const article = JSON.parse(await readBody(request));
    if (typeof article.text !== "string" || article.text.trim().length < 100) {
      sendJson(response, 400, { error: "Ongeldige of te korte artikeltekst." });
      logRequest(request, 400, startedAt, { reason: "invalid_article" });
      return;
    }

    const summaryLength = Number(article.summaryLength || 4);
    if (![2, 4, 6].includes(summaryLength)) {
      sendJson(response, 400, {
        error: "Ongeldige samenvattingslengte. Kies 2, 4 of 6 kernpunten."
      });
      logRequest(request, 400, startedAt, { reason: "invalid_summary_length" });
      return;
    }

    const available = getAvailableProviders();
    const provider =
      typeof article.provider === "string"
        ? article.provider
        : available.defaultProvider;
    if (!available.providers.some((item) => item.id === provider)) {
      sendJson(response, 503, {
        error: "Deze AI-provider is niet geconfigureerd."
      });
      logRequest(request, 503, startedAt, { reason: "provider_not_configured" });
      return;
    }

    sendJson(
      response,
      200,
      await summarizeWithProvider(provider, article, summaryLength)
    );
    logRequest(request, 200, startedAt);
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Ongeldige JSON-aanvraag."
        : error instanceof Error
          ? error.message
          : "Ongeldige aanvraag.";
    const statusCode =
      error instanceof SyntaxError
        ? 400
        : error instanceof UpstreamError || message.startsWith("Gemini")
          ? 502
          : message.startsWith("GEMINI_API_KEY")
            ? 503
            : 502;
    sendJson(response, statusCode, { error: message });
    logRequest(request, statusCode, startedAt, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Nieuws Samenvatter server draait op http://localhost:${port}`);
});
