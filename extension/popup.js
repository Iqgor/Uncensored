const summaryLengthElement = document.querySelector("#summary-length");
const summaryLengthValueElement = document.querySelector("#summary-length-value");
const statusElement = document.querySelector("#status");
const resultElement = document.querySelector("#result");
const titleElement = document.querySelector("#result-title");
const paywallWarningElement = document.querySelector("#paywall-warning");
const summaryElement = document.querySelector("#summary");
const keyPointsElement = document.querySelector("#key-points");

function setStatus(message) {
  statusElement.textContent = message;
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function showResult(result, article = {}) {
  if (
    !result ||
    typeof result.title !== "string" ||
    typeof result.summary !== "string" ||
    !Array.isArray(result.keyPoints) ||
    result.keyPoints.length === 0
  ) {
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

    setStatus("Samenvatting wordt gemaakt...");
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_ARTICLE",
      article: {
        ...article,
        summaryLength: Number(summaryLengthElement.value)
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Onbekende serverfout.");
    }

    showResult(response.data, article);
    setStatus("");
  } catch (error) {
    setStatus(getErrorMessage(error, "Er ging iets mis bij het samenvatten."));
  } finally {
    document.body.classList.remove("loading");
  }
}

void summarizeArticle();
