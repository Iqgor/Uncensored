import http from "node:http";
import "dotenv/config";

const port = Number(process.env.PORT || 8787);
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const isProduction = process.env.NODE_ENV === "production";
const rateLimitWindowMs = Number(
  process.env.RATE_LIMIT_WINDOW_MS || 60_000
);
const rateLimitMaxRequests = Number(
  process.env.RATE_LIMIT_MAX_REQUESTS || 10
);
const rateLimitEntries = new Map();

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
    throw new Error("De AI gaf geen geldig JSON-object terug.");
  }

  const summary = value;
  if (typeof summary.title !== "string" || !summary.title.trim()) {
    throw new Error("De AI-respons bevat geen geldige titel.");
  }
  if (typeof summary.summary !== "string" || !summary.summary.trim()) {
    throw new Error("De AI-respons bevat geen geldige samenvatting.");
  }
  if (
    !Array.isArray(summary.keyPoints) ||
    summary.keyPoints.length !== summaryLength ||
    summary.keyPoints.some(
      (point) => typeof point !== "string" || !point.trim()
    )
  ) {
    throw new Error("De AI-respons bevat geen geldige kernpunten.");
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
      "De Europese Commissie presenteert nieuwe maatregelen om gebruikers beter te beschermen op online platforms. De voorstellen richten zich op transparantie, duidelijke meldprocedures en meer verantwoordelijkheid voor grote techbedrijven.",
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
                text: `Vat dit nieuwsartikel samen met precies ${summaryLength} kernpunten.\n\nTitel: ${
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

  const data = await response.json();
  if (!response.ok) {
    const providerMessage = data?.error?.message;
    throw new Error(
      providerMessage || `Gemini gaf HTTP-status ${response.status} terug.`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini gaf geen samenvatting terug.");
  }

  return validateSummary(JSON.parse(text), summaryLength);
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

    sendJson(response, 200, await summarizeWithGemini(article, summaryLength));
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
