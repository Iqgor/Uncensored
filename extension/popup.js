const summaryLengthElement = document.querySelector("#summary-length");
const summaryLengthValueElement = document.querySelector("#summary-length-value");
const statusElement = document.querySelector("#status-message");
const resultElement = document.querySelector("#result");
const titleElement = document.querySelector("#result-title");
const articleDateElement = document.querySelector("#article-date");
const articleSourceElement = document.querySelector("#article-source");
const articleCategoryElement = document.querySelector("#article-category");
const timeSavedElement = document.querySelector("#time-saved");
const originalReadingTimeElement = document.querySelector("#original-reading-time");
const summaryReadingTimeElement = document.querySelector("#summary-reading-time");
const minutesSavedElement = document.querySelector("#minutes-saved");
const paywallWarningElement = document.querySelector("#paywall-warning");
const summaryElement = document.querySelector("#summary");
const keyPointsElement = document.querySelector("#key-points");
const resultActionsElement = document.querySelector("#result-actions");
const copySummaryElement = document.querySelector("#copy-summary");
const retrySummaryElement = document.querySelector("#retry-summary");
const originalArticleElement = document.querySelector("#original-article");
const currentViewElement = document.querySelector("#current-view");
const savedViewElement = document.querySelector("#saved-view");
const settingsViewElement = document.querySelector("#settings-view");
const currentArticleTab = document.querySelector("#current-article-tab");
const savedTab = document.querySelector("#saved-tab");
const savedCountElement = document.querySelector("#saved-count");
const settingsButton = document.querySelector("#settings-button");
const closeSettingsButton = document.querySelector("#close-settings");
const savedListElement = document.querySelector("#saved-list");
const savedEmptyElement = document.querySelector("#saved-empty");
const clearSavedButton = document.querySelector("#clear-saved");
const CACHE_PREFIX = "summary-cache:";
const SETTINGS_KEY = "summary-settings";
const SUMMARY_FORMAT_VERSION = 3;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function showError(message) {
  statusElement.textContent = message;
  statusElement.hidden = !message;
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
    `${SUMMARY_FORMAT_VERSION}\n${article.url || ""}\n${article.title || ""}\n${article.text}\n${summaryLength}`
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
      article: {
        title: article.title || result.title || "Onbekend artikel",
        url: article.url || "",
        publishedAt: article.publishedAt || "",
        source: article.source || "",
        category: article.category || "",
        wordCount: article.wordCount || 0
      },
      result
    }
  });
}

async function getSavedSummaries() {
      if (!hasStorage()) {
        return [];
      }
      const stored = await chrome.storage.local.get();
      return Object.entries(stored)
        .filter(([key, entry]) => key.startsWith(CACHE_PREFIX) && entry?.result)
        .sort(([, first], [, second]) => second.createdAt - first.createdAt);
    }

function updateSavedCount(count) {
  savedCountElement.textContent = String(count);
  savedCountElement.setAttribute(
    "aria-label",
    `${count} opgeslagen samenvatting${count === 1 ? "" : "en"}`
  );
}

function setView(view) {
      const settings = view === "settings";
      const saved = view === "saved";
      currentViewElement.hidden = settings || saved;
      savedViewElement.hidden = settings || !saved;
      settingsViewElement.hidden = !settings;
      currentArticleTab.classList.toggle("label-active", !settings && !saved);
      savedTab.classList.toggle("label-active", saved);
      currentArticleTab.setAttribute("aria-selected", String(!settings && !saved));
      savedTab.setAttribute("aria-selected", String(saved));
      if (saved) {
        void renderSavedSummaries();
}
    }

async function renderSavedSummaries() {
  const entries = await getSavedSummaries();
  updateSavedCount(entries.length);
  savedListElement.replaceChildren(
    ...entries.map(([key, entry]) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-item";
      button.textContent = entry.article?.title || entry.result.title;
      button.addEventListener("click", () => {
        showResult(entry.result, entry.article);
        setView("current");
      });
      item.append(button);
      return item;
    })
  );
  savedEmptyElement.hidden = entries.length > 0;
}

async function loadSettings() {
      if (!hasStorage()) {
        return;
      }
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const length = stored[SETTINGS_KEY]?.summaryLength;
      if (length === "2" || length === "4" || length === "6") {
        summaryLengthElement.value = length;
        updateSummaryLengthLabel();
      }
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
  const entries = await getSavedSummaries();
  updateSavedCount(entries.length);
}

function countWords(value = "") {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formatPublishedDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
}

function getReadingMinutes(wordCount) {
  return Math.round((wordCount / 200) * 10) / 10;
}

function formatCompactReadingTime(minutes) {
  if (minutes < 1) {
    return `${Math.max(1, Math.round(minutes * 60))} sec`;
  }
  return `${Math.max(1, Math.round(minutes))} min`;
}

function showResult(result, article = {}) {
  if (!isSummaryResult(result)) {
    throw new Error("De server gaf een ongeldig samenvattingsresultaat.");
  }

  const paragraphs = result.summary
    .replace(/\.\s+/g, ".\n\n")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length > 3) {
    paragraphs.splice(2, paragraphs.length - 2, paragraphs.slice(2).join(" "));
  }

  titleElement.textContent = result.title || "Samenvatting";
  const metadata = [
    [articleDateElement, formatPublishedDate(article.publishedAt), ""],
    [articleSourceElement, article.source],
    [articleCategoryElement, article.category]
  ];
  metadata.forEach(([element, value]) => {
    element.hidden = !value;
    element.textContent = value ? `${value}` : "";
  });
  const originalWords = article.wordCount || countWords(article.text);
  const summaryWords = countWords(
    `${result.summary} ${result.keyPoints.join(" ")}`
  );
  const originalReadingMinutes = getReadingMinutes(originalWords);
  const summaryReadingMinutes = getReadingMinutes(summaryWords);
  const minutesSaved = Math.max(0, originalReadingMinutes - summaryReadingMinutes);
  timeSavedElement.hidden = !originalWords;
  originalReadingTimeElement.textContent = originalWords
    ? `${formatCompactReadingTime(originalReadingMinutes)} lezen`
    : "";
  summaryReadingTimeElement.textContent = originalWords
    ? `${formatCompactReadingTime(summaryReadingMinutes)} samenvatting`
    : "";
  minutesSavedElement.textContent = originalWords
    ? formatCompactReadingTime(minutesSaved)
    : "";
  timeSavedElement.setAttribute(
    "aria-label",
    originalWords
      ? `${formatCompactReadingTime(originalReadingMinutes)} lezen, ${formatCompactReadingTime(
          summaryReadingMinutes
        )} samenvatting, ${formatCompactReadingTime(minutesSaved)} bespaard`
      : "Leestijd niet beschikbaar"
  );
  paywallWarningElement.hidden = !article.paywallDetected;
  paywallWarningElement.textContent = article.paywallDetected
    ? "Let op: deze pagina lijkt een paywall te bevatten. De samenvatting is mogelijk gebaseerd op onvolledige artikeltekst."
    : "";
  summaryElement.replaceChildren(
    ...paragraphs.map((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      return element;
    })
  );
  originalArticleElement.hidden = !article.url;
  if (article.url) {
    originalArticleElement.href = article.url;
  }
  keyPointsElement.replaceChildren(
    ...result.keyPoints.map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    })
  );
  resultElement.hidden = false;
  resultActionsElement.hidden = false;
}

function getSummaryText() {
  const summary = [...summaryElement.querySelectorAll("p")]
    .map((paragraph) => paragraph.textContent)
    .filter(Boolean)
    .join("\n\n");
  const keyPoints = [...keyPointsElement.querySelectorAll("li")].map(
    (item) => `- ${item.textContent}`
  );
  return [titleElement.textContent, summary, ...keyPoints]
    .filter(Boolean)
    .join("\n\n");
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(getSummaryText());
  } catch (error) {
    showError(
      getErrorMessage(error, "De samenvatting kon niet worden gekopieerd.")
    );
  }
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
  summaryLengthValueElement.textContent = `Aantal kernpunten: ${summaryLengthElement.value}`;
  const minimum = Number(summaryLengthElement.min);
  const maximum = Number(summaryLengthElement.max);
  const progress =
    ((Number(summaryLengthElement.value) - minimum) / (maximum - minimum)) * 100;
  summaryLengthElement.style.setProperty("--range-progress", `${progress}%`);
}

summaryLengthElement.addEventListener("input", () => {
  updateSummaryLengthLabel();
  if (hasStorage()) {
    void chrome.storage.local.set({
      [SETTINGS_KEY]: { summaryLength: summaryLengthElement.value }
    });
  }
  void summarizeArticle();
});
currentArticleTab.addEventListener("click", () => setView("current"));
savedTab.addEventListener("click", () => setView("saved"));
settingsButton.addEventListener("click", () => setView("settings"));
closeSettingsButton.addEventListener("click", () => setView("current"));
clearSavedButton.addEventListener("click", async () => {
  if (!hasStorage()) {
    return;
  }
  const keys = (await getSavedSummaries()).map(([key]) => key);
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }
  await renderSavedSummaries();
});
copySummaryElement.addEventListener("click", () => {
  void copySummary();
});
retrySummaryElement.addEventListener("click", () => {
  void summarizeArticle({ forceRefresh: true });
});
updateSummaryLengthLabel();

async function summarizeArticle({ forceRefresh = false } = {}) {
  document.body.classList.add("loading");
  showError("");
  resultElement.hidden = true;
  resultActionsElement.hidden = true;
  paywallWarningElement.hidden = true;
  copySummaryElement.disabled = true;
  retrySummaryElement.disabled = true;
  retrySummaryElement.hidden = true;

  try {
    if (!globalThis.chrome?.tabs?.query) {
      showResult(previewResult);
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
    article.wordCount = countWords(article.text);

    const summaryLength = Number(summaryLengthElement.value);
    if (!forceRefresh) {
      const cached = await getCachedSummary(article, summaryLength);
      if (cached) {
        showResult(cached.result, article);
        return;
      }
    }

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
      void renderSavedSummaries();
    } catch (error) {
      console.warn("De lokale samenvatting kon niet worden opgeslagen.", error);
    }
  } catch (error) {
    showError(getErrorMessage(error, "Er ging iets mis bij het samenvatten."));
  } finally {
    copySummaryElement.disabled = false;
    retrySummaryElement.disabled = false;
    retrySummaryElement.hidden = false;
    document.body.classList.remove("loading");
  }
}

void clearExpiredCacheEntries().catch((error) => {
  console.warn("De lokale samenvattingscache kon niet worden opgeschoond.", error);
});
void getSavedSummaries()
  .then((entries) => updateSavedCount(entries.length))
  .catch((error) => {
    console.warn("Het aantal opgeslagen samenvattingen kon niet worden geladen.", error);
  });
void loadSettings().catch((error) => {
  console.warn("De instellingen konden niet worden geladen.", error);
});
void summarizeArticle();
