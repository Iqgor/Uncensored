const summaryLengthElement = document.querySelector("#summary-length");
const summaryLengthValueElement = document.querySelector("#summary-length-value");
const statusModalElement = document.querySelector("#status-modal");
const statusElement = document.querySelector("#status-message");
const resultElement = document.querySelector("#result");
const titleElement = document.querySelector("#result-title");
const paywallWarningElement = document.querySelector("#paywall-warning");
const summaryElement = document.querySelector("#summary");
const keyPointsElement = document.querySelector("#key-points");
const copySummaryElement = document.querySelector("#copy-summary");
const retrySummaryElement = document.querySelector("#retry-summary");
const originalArticleElement = document.querySelector("#original-article");
const currentViewElement = document.querySelector("#current-view");
const savedViewElement = document.querySelector("#saved-view");
const settingsViewElement = document.querySelector("#settings-view");
const currentArticleTab = document.querySelector("#current-article-tab");
const savedTab = document.querySelector("#saved-tab");
const settingsButton = document.querySelector("#settings-button");
const closeSettingsButton = document.querySelector("#close-settings");
const savedListElement = document.querySelector("#saved-list");
const savedEmptyElement = document.querySelector("#saved-empty");
const clearSavedButton = document.querySelector("#clear-saved");
const CACHE_PREFIX = "summary-cache:";
const SETTINGS_KEY = "summary-settings";
const SUMMARY_FORMAT_VERSION = 3;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_DISPLAY_TIME_MS = 3000;
let statusTimer;
let currentStatus = "";

function setStatus(message) {
  if (message === currentStatus) {
    return;
  }
  currentStatus = message;
  window.clearTimeout(statusTimer);
  if (!message) {
    if (statusModalElement.open) {
      statusModalElement.close();
    }
    statusElement.textContent = "";
    return;
  }

  statusElement.textContent = message;
  if (!statusModalElement.open) {
    statusModalElement.showModal();
  }
  statusTimer = window.setTimeout(() => {
    if (statusModalElement.open) {
      statusModalElement.close();
    }
  }, STATUS_DISPLAY_TIME_MS);
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
        url: article.url || ""
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
            setStatus("Opgeslagen samenvatting geladen.");
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
  summaryElement.replaceChildren(
    ...result.summary
      .replace(/\.\s+/g, ".\n\n")
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
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
    setStatus("Samenvatting gekopieerd.");
  } catch (error) {
    setStatus(
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
  setStatus("Opgeslagen samenvattingen gewist.");
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
  setStatus("");
  resultElement.hidden = true;
  paywallWarningElement.hidden = true;
  copySummaryElement.disabled = true;
  retrySummaryElement.disabled = true;
  retrySummaryElement.hidden = true;

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
    if (!forceRefresh) {
      const cached = await getCachedSummary(article, summaryLength);
      if (cached) {
        showResult(cached.result, article);
        setStatus("Lokale samenvatting geladen.");
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
    } catch (error) {
      console.warn("De lokale samenvatting kon niet worden opgeslagen.", error);
    }
    setStatus("");
  } catch (error) {
    setStatus(getErrorMessage(error, "Er ging iets mis bij het samenvatten."));
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
void loadSettings().catch((error) => {
  console.warn("De instellingen konden niet worden geladen.", error);
});
void summarizeArticle();
