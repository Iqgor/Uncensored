const summaryLengthElement = document.querySelector("#summary-length");
const summaryLengthValueElement = document.querySelector("#summary-length-value");
const statusElement = document.querySelector("#status");
const resultElement = document.querySelector("#result");
const titleElement = document.querySelector("#result-title");
const paywallWarningElement = document.querySelector("#paywall-warning");
const summaryElement = document.querySelector("#summary");
const keyPointsElement = document.querySelector("#key-points");
const CACHE_PREFIX = "summary-cache:";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setStatus(message) {
  statusElement.textContent = message;
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getCacheKey(article, summaryLength) {
  return `${CACHE_PREFIX}${hashText(
    `${article.url || ""}\n${article.title || ""}\n${article.text}\n${summaryLength}`
  )}`;
}

function isSummaryResult(result) {
  return Boolean(
    result &&
      typeof result.title === "string" &&
      typeof result.summary === "string" &&
      Array.isArray(result.keyPoints) &&
      result.keyPoints.length > 0 &&
      result.keyPoints.every((point) => typeof point === "string")
  );
}

async function getCachedSummary(article, summaryLength) {
  if (!hasStorage()) {
    return null;
  }

  const key = getCacheKey(article, summaryLength);
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  if (
    !entry ||
    Date.now() - entry.createdAt > CACHE_MAX_AGE_MS ||
    !isSummaryResult(entry.result)
  ) {
    if (entry) {
      await chrome.storage.local.remove(key);
    }
    return null;
  }
  return entry;
}

async function cacheSummary(article, summaryLength, result) {
  if (!hasStorage()) {
    return;
  }

  await chrome.storage.local.set({
    [getCacheKey(article, summaryLength)]: {
      createdAt: Date.now(),
      result
    }
  });
}

async function clearExpiredCacheEntries() {
  if (!hasStorage()) {
    return;
  }

  const stored = await chrome.storage.local.get();
  const expiredKeys = Object.entries(stored)
    .filter(
      ([key, entry]) =>
        key.startsWith(CACHE_PREFIX) &&
        (!entry || Date.now() - entry.createdAt > CACHE_MAX_AGE_MS)
    )
    .map(([key]) => key);

  if (expiredKeys.length > 0) {
    await chrome.storage.local.remove(expiredKeys);
  }
}

function showResult(result, article = {}) {
  if (!isSummaryResult(result)) {
    throw new Error("De server gaf een ongeldig samenvattingsresultaat.");
  }

  titleElement.textContent = result.title || "Samenvatting";
  paywallWarningElement.hidden = !article.paywallDetected;
  paywallWarningElement.textContent = article.paywallDetected
    ? "Let op: deze pagina lijkt een paywall te bevatten. De samenvatting is mogelijk gebaseerd op onvolledige artikeltekst."
    : "";
  summaryElement.textContent = result.summary;
  keyPointsElement.replaceChildren(
    ...result.keyPoints.map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    })
  );
  resultElement.hidden = false;
}

const previewResult = {
  title: "Nieuwe regels moeten online veiligheid versterken",
  summary:
    "De Europese Commissie presenteert nieuwe maatregelen om gebruikers beter te beschermen op online platforms. De voorstellen richten zich op transparantie, duidelijke meldprocedures en meer verantwoordelijkheid voor grote techbedrijven.",
  keyPoints: [
    "Platforms moeten sneller reageren op meldingen van schadelijke inhoud.",
    "Gebruikers krijgen meer inzicht in de manier waarop aanbevelingen werken.",
    "Grote techbedrijven moeten periodiek rapporteren over hun risico's.",
    "De nieuwe regels worden de komende maanden verder uitgewerkt."
  ]
};

function updateSummaryLengthLabel() {
  summaryLengthValueElement.textContent = `${summaryLengthElement.value} kernpunten`;
}

summaryLengthElement.addEventListener("input", () => {
  updateSummaryLengthLabel();
  void summarizeArticle();
});
updateSummaryLengthLabel();

async function summarizeArticle() {
  document.body.classList.add("loading");
  resultElement.hidden = true;
  paywallWarningElement.hidden = true;
  setStatus("Artikel wordt gelezen...");

  try {
    if (!globalThis.chrome?.tabs?.query) {
      showResult(previewResult);
      setStatus("Previewmodus: deze pagina is niet geopend als Chrome-extensie.");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("Er is geen actieve pagina gevonden.");
    }

    const article = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_ARTICLE"
    });

    if (article?.error) {
      throw new Error(article.error);
    }

    if (!article?.text || article.text.length < 100) {
      throw new Error(
        "Er is geen geschikt nieuwsartikel gevonden op deze pagina."
      );
    }

    const summaryLength = Number(summaryLengthElement.value);
    const cached = await getCachedSummary(article, summaryLength);
    if (cached) {
      showResult(cached.result, article);
      setStatus("Lokale samenvatting geladen.");
      return;
    }

    setStatus("Samenvatting wordt gemaakt...");
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_ARTICLE",
      article: {
        ...article,
        summaryLength
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Onbekende serverfout.");
    }

    showResult(response.data, article);
    try {
      await cacheSummary(article, summaryLength, response.data);
    } catch (error) {
      console.warn("De lokale samenvatting kon niet worden opgeslagen.", error);
    }
    setStatus("");
  } catch (error) {
    setStatus(getErrorMessage(error, "Er ging iets mis bij het samenvatten."));
  } finally {
    document.body.classList.remove("loading");
  }
}

void clearExpiredCacheEntries().catch((error) => {
  console.warn("De lokale samenvattingscache kon niet worden opgeschoond.", error);
});
void summarizeArticle();
