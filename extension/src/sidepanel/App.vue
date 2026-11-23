<template>
  <div :class="{ loading }">
    <header>
      <section>
        <h1>Digst</h1>
        <button class="icon-button" type="button" aria-label="Instellingen" title="Instellingen" @click="setView('settings')">
          <svg fill="currentColor" width="1.75em" height="1.75em" viewBox="0 0 56 56" aria-hidden="true">
            <path d="M36.4 19.3c2.4 0 4.5-1.6 5.3-3.7h8.1c1 0 1.8-.8 1.8-1.9s-.8-1.9-1.8-1.9h-8.1c-.8-2.2-2.8-3.8-5.3-3.8s-4.5 1.6-5.3 3.8H6.3c-1.1 0-1.9.8-1.9 1.9s.8 1.9 1.9 1.9h24.8c.8 2.1 2.9 3.7 5.3 3.7Zm0-2.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4ZM19.9 33.7a6.8 6.8 0 0 0 5.3-3.8h24.5c1.1 0 1.9-.8 1.9-1.9s-.8-1.9-1.9-1.9H25.2a6.8 6.8 0 0 0-5.3-3.8 6.8 6.8 0 0 0-5.3 3.8H6.2c-1 0-1.8.8-1.8 1.9s.8 1.9 1.8 1.9h8.4a6.8 6.8 0 0 0 5.3 3.8Zm0-3a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4ZM36.4 48c2.4 0 4.5-1.6 5.3-3.8h8.1c1 0 1.8-.8 1.8-1.9s-.8-1.9-1.8-1.9h-8.1c-.8-2.2-2.8-3.8-5.3-3.8s-4.5 1.6-5.3 3.8H6.3c-1.1 0-1.9.8-1.9 1.9s.8 1.9 1.9 1.9h24.8c.8 2.2 2.9 3.8 5.3 3.8Zm0-2.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z"/>
          </svg>
        </button>
      </section>
      <section class="view-tabs" role="tablist" aria-label="Samenvattingen">
        <button class="tab-button" :class="{ 'label-active': view === 'current' }" type="button" role="tab" :aria-selected="view === 'current'" @click="setView('current')">Huidig artikel</button>
        <button class="tab-button" :class="{ 'label-active': view === 'saved' }" type="button" role="tab" :aria-selected="view === 'saved'" @click="setView('saved')">
          Opgeslagen <span class="saved-count" aria-hidden="true">{{ savedCount }}</span>
        </button>
      </section>
    </header>

    <main>
      <section v-if="view === 'current'" role="tabpanel">
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <p v-if="paywallWarning" role="alert" id="paywall-warning">{{ paywallWarning }}</p>

        <section v-if="detectedArticle && !result" class="article-detected" aria-labelledby="article-detected-title">
          <div class="detected-label">
            <span><span class="detected-check" aria-hidden="true">✓</span><span>Artikel gedetecteerd</span></span>
            <p class="detected-reading-time">{{ detectedReadingTime }}</p>
          </div>
          <h2 id="article-detected-title">{{ detectedArticle.title || 'Onbekend artikel' }}</h2>
          <p class="detected-source">
            <span>{{ detectedArticle.source || 'Onbekende bron' }}</span>
            <span aria-hidden="true"> · </span>
            <a :href="detectedArticle.url || '#'" target="_blank" rel="noopener noreferrer">{{ detectedHostname }}</a>
          </p>
          <button class="summarize-button" type="button" :disabled="loading" @click="summarizeArticle()">
            Artikel samenvatten
          </button>
        </section>

        <section v-if="result" class="result">
          <div class="meta-header" aria-label="Artikelinformatie">
            <div>
              <span v-if="currentArticle.source" class="meta-item meta-item-highlight">{{ currentArticle.source }}</span>
              <span v-if="currentArticle.category" class="meta-item">{{ currentArticle.category }}</span>
            </div>
            <span v-if="currentArticle.publishedAt" class="meta-item">{{ formatPublishedDate(currentArticle.publishedAt) }}</span>
          </div>
          <h2 id="result-title">{{ result.title }}</h2>
          <div v-if="readingStats.originalWords" class="time saved" aria-label="Artikelinformatie">
            <span class="meta-item meta-item-highlight reading-time">
              {{ formatCompactReadingTime(readingStats.originalMinutes) }} artikel
              → {{ formatCompactReadingTime(readingStats.summaryMinutes) }} digst
              <span class="reading-time-saved">{{ formatCompactReadingTime(readingStats.minutesSaved) }} bespaard</span>
            </span>
          </div>
          <div id="summary">
            <p v-for="(paragraph, index) in resultParagraphs" :key="index">{{ paragraph }}</p>
          </div>
          <h3>Belangrijkste punten</h3>
          <ul><li v-for="(point, index) in result.keyPoints" :key="index">{{ point }}</li></ul>
          <p class="disclaimer">AI-samenvatting. Controleer belangrijke informatie in de originele bron.</p>
        </section>

        <div v-if="result" class="result-actions" aria-label="Acties">
          <button type="button" aria-label="Samenvatting kopiëren" title="Samenvatting kopiëren" @click="copySummary">
            <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
          </button>
          <button type="button" :aria-pressed="summarySaved" :aria-label="summarySaved ? 'Opgeslagen samenvatting verwijderen' : 'Samenvatting opslaan'" :title="summarySaved ? 'Opgeslagen samenvatting verwijderen' : 'Samenvatting opslaan'" @click="toggleSave">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16l-6-3.5-6 3.5v-16Z"></path></svg>
          </button>
          <button type="button" class="retry-action" aria-label="Opnieuw proberen" title="Opnieuw proberen" @click="summarizeArticle(true)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0 2 5.3"></path><path d="M20 5v6h-6"></path></svg>
          </button>
          <a v-if="currentArticle.url" :href="currentArticle.url" target="_blank" rel="noopener noreferrer">Lees origineel</a>
        </div>

        <details v-if="!result" class="privacy-note">
          <summary>Privacy</summary>
          <p>De artikeltekst wordt tijdelijk naar de lokale backend gestuurd en voor de samenvatting doorgestuurd naar Google Gemini. Samenvattingen worden alleen in Chrome opgeslagen wanneer je op het bladwijzericoon klikt. Alleen technische verzoekgegevens worden gelogd.</p>
        </details>
      </section>

      <section v-if="view === 'saved'" role="tabpanel">
        <div class="view-heading">
          <h2>Opgeslagen samenvattingen</h2>
          <button class="text-button" type="button" @click="clearSaved">Alles wissen</button>
        </div>
        <p v-if="savedEntries.length === 0" class="empty-state">Nog geen samenvattingen opgeslagen.</p>
        <ul class="saved-list">
          <li v-for="[key, entry] in savedEntries" :key="key">
            <button class="saved-item" type="button" @click="openSaved(entry)">
              {{ entry.article?.title || entry.result.title }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="view === 'settings'">
        <div class="view-heading">
          <h2>Instellingen</h2>
          <button class="text-button" type="button" @click="setView('current')">Sluiten</button>
        </div>
        <label class="settings-option theme-setting" for="theme-mode">
          <span>Weergave</span>
          <select id="theme-mode" v-model="themeMode" aria-label="Weergave" @change="changeTheme">
            <option value="system">Systeemstandaard</option>
            <option value="light">Licht</option>
            <option value="dark">Donker</option>
          </select>
        </label>
        <label class="length-label" for="summary-length">
          <output for="summary-length">Aantal kernpunten: {{ summaryLength }}</output>
        </label>
        <div class="range-control">
          <input id="summary-length" v-model.number="summaryLength" type="range" min="2" max="6" step="2" list="summary-length-steps" :style="rangeStyle" @input="saveLength">
          <datalist id="summary-length-steps"><option value="2" label="2"></option><option value="4" label="4"></option><option value="6" label="6"></option></datalist>
          <div class="range-markers" aria-hidden="true"><span>2</span><span>4</span><span>6</span></div>
        </div>
        <p class="settings-help">Deze instelling wordt lokaal in Chrome opgeslagen.</p>
        <label class="backend-url-label" for="ai-provider">AI-provider</label>
        <select id="ai-provider" v-model="provider" class="backend-url-input" @change="saveProvider">
          <option v-for="option in providerOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
        <p class="settings-status" role="status">{{ providerStatus }}</p>
        <label class="backend-url-label" for="backend-url">Backend-URL</label>
        <input id="backend-url" v-model="backendUrl" class="backend-url-input" type="url" inputmode="url" placeholder="http://localhost:8787" @change="saveBackendUrl">
        <p class="settings-help">Gebruik voor productie een HTTPS-adres. API-sleutels horen niet in de extensie.</p>
        <p class="settings-status" role="status">{{ backendStatus }}</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

const SAVED_PREFIX = "saved-summary:";
const LEGACY_CACHE_PREFIX = "summary-cache:";
const SETTINGS_KEY = "summary-settings";
const BACKEND_URL_KEY = "backend-url";
const AI_PROVIDER_KEY = "ai-provider";
const THEME_MODE_KEY = "theme-mode";
const DEFAULT_BACKEND_URL = "http://localhost:8787";
const SUMMARY_FORMAT_VERSION = 3;

const view = ref("current");
const loading = ref(false);
const error = ref("");
const paywallWarning = ref("");
const detectedArticle = ref(null);
const currentArticle = ref({});
const result = ref(null);
const summarySaved = ref(false);
const savedEntries = ref([]);
const savedCount = ref(0);
const summaryLength = ref(4);
const backendUrl = ref(DEFAULT_BACKEND_URL);
const backendStatus = ref("");
const provider = ref("");
const providerStatus = ref("");
const providerOptions = ref([{ id: "", label: "Geen provider geconfigureerd" }]);
const themeMode = ref("system");

const systemThemeMedia = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

const rangeStyle = computed(() => ({
  "--range-progress": `${((summaryLength.value - 2) / 4) * 100}%`
}));

const detectedHostname = computed(() => {
  try { return detectedArticle.value?.url ? new URL(detectedArticle.value.url).hostname : ""; }
  catch { return detectedArticle.value?.url || ""; }
});

const detectedReadingTime = computed(() => {
  const words = detectedArticle.value?.wordCount || countWords(detectedArticle.value?.text);
  return words ? `${formatCompactReadingTime(getReadingMinutes(words))} leestijd` : "Leestijd niet beschikbaar";
});

const resultParagraphs = computed(() => {
  if (!result.value) return [];
  const paragraphs = result.value.summary.replace(/\.\s+/g, ".\n\n").split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 3) paragraphs.splice(2, paragraphs.length - 2, paragraphs.slice(2).join(" "));
  return paragraphs;
});

const readingStats = computed(() => {
  if (!result.value) return { originalWords: 0 };
  const originalWords = currentArticle.value.wordCount || countWords(currentArticle.value.text);
  const summaryWords = countWords(`${result.value.summary} ${result.value.keyPoints.join(" ")}`);
  const originalMinutes = getReadingMinutes(originalWords);
  const summaryMinutes = getReadingMinutes(summaryWords);
  return { originalWords, originalMinutes, summaryMinutes, minutesSaved: Math.max(0, originalMinutes - summaryMinutes) };
});

function hasStorage() { return Boolean(globalThis.chrome?.storage?.local); }
function countWords(value = "") { return value.trim() ? value.trim().split(/\s+/).length : 0; }
function getReadingMinutes(wordCount) { return Math.round((wordCount / 200) * 10) / 10; }
function formatCompactReadingTime(minutes) {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`;
  return `${Math.max(1, Math.round(minutes))} min`;
}
function formatPublishedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function getErrorMessage(caught, fallback) { return caught instanceof Error && caught.message ? caught.message : fallback; }
function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash ^= value.charCodeAt(index), hash = Math.imul(hash, 16777619);
  return (hash >>> 0).toString(16);
}
function getSavedKey(article) {
  return `${SAVED_PREFIX}${hashText(`${SUMMARY_FORMAT_VERSION}\n${article.url || article.title || article.text || ""}`)}`;
}
function isSummaryResult(value) {
  return Boolean(value && typeof value.title === "string" && typeof value.summary === "string" && Array.isArray(value.keyPoints) && value.keyPoints.length > 0 && value.keyPoints.every((point) => typeof point === "string"));
}
function resolveTheme(mode) {
  if (mode === "dark" || mode === "light") return mode;
  return systemThemeMedia?.matches ? "dark" : "light";
}
function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  themeMode.value = ["dark", "light", "system"].includes(mode) ? mode : "system";
}
function setView(nextView) {
  view.value = nextView;
  if (nextView === "saved") void renderSavedSummaries();
}
async function changeTheme() {
  applyTheme(themeMode.value);
  if (hasStorage()) await chrome.storage.local.set({ [THEME_MODE_KEY]: themeMode.value });
}
async function saveLength() {
  if (hasStorage()) await chrome.storage.local.set({ [SETTINGS_KEY]: { summaryLength: String(summaryLength.value) } });
}
function getBackendUrl(value) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Gebruik een geldige HTTP(S)-backend-URL zonder gebruikersnaam of wachtwoord.");
  return url.toString().replace(/\/$/, "");
}
async function saveBackendUrl() {
  try {
    backendUrl.value = getBackendUrl(backendUrl.value);
    backendStatus.value = "Backend-URL opgeslagen.";
    if (hasStorage()) await chrome.storage.local.set({ [BACKEND_URL_KEY]: backendUrl.value });
    await loadProviders();
  } catch (caught) {
    backendStatus.value = getErrorMessage(caught, "Ongeldige backend-URL.");
  }
}
async function saveProvider() {
  if (hasStorage()) await chrome.storage.local.set({ [AI_PROVIDER_KEY]: provider.value });
}
async function loadProviders() {
  providerStatus.value = "Providers laden...";
  try {
    const response = await fetch(`${getBackendUrl(backendUrl.value)}/api/providers`);
    if (!response.ok) throw new Error("De providers konden niet worden geladen.");
    const data = await response.json();
    const stored = hasStorage() ? await chrome.storage.local.get(AI_PROVIDER_KEY) : {};
    const preferred = stored[AI_PROVIDER_KEY];
    const providers = Array.isArray(data.providers) ? data.providers : [];
    if (providers.length === 0) {
      providerOptions.value = [{ id: "", label: "Geen provider geconfigureerd" }];
      providerStatus.value = "Configureer een provider in server/.env.";
      return;
    }
    providerOptions.value = providers.map((item) => ({ id: item.id, label: `${item.label}${item.model ? ` - ${item.model}` : ""}` }));
    provider.value = providers.some((item) => item.id === preferred) ? preferred : data.defaultProvider;
    providerStatus.value = "";
  } catch (caught) {
    providerOptions.value = [{ id: "", label: "Geen verbinding" }];
    provider.value = "";
    providerStatus.value = getErrorMessage(caught, "De providers konden niet worden geladen.");
  }
}
async function getSavedSummaries() {
  if (!hasStorage()) return [];
  const stored = await chrome.storage.local.get();
  return Object.entries(stored).filter(([key, entry]) => key.startsWith(SAVED_PREFIX) && entry?.result).sort(([, first], [, second]) => second.createdAt - first.createdAt);
}
async function renderSavedSummaries() {
  const entries = await getSavedSummaries();
  savedEntries.value = entries;
  savedCount.value = entries.length;
}
async function clearSaved() {
  if (!hasStorage()) return;
  const keys = (await getSavedSummaries()).map(([key]) => key);
  if (keys.length) await chrome.storage.local.remove(keys);
  await renderSavedSummaries();
}
async function openSaved(entry) {
  showResult(entry.result, entry.article);
  setView("current");
}
async function toggleSave() {
  if (!currentArticle.value || !result.value || !hasStorage()) return;
  try {
    if (summarySaved.value) {
      await chrome.storage.local.remove(getSavedKey(currentArticle.value));
      summarySaved.value = false;
    } else {
      await chrome.storage.local.set({
        [getSavedKey(currentArticle.value)]: {
          createdAt: Date.now(),
          article: {
            title: currentArticle.value.title || result.value.title || "Onbekend artikel",
            url: currentArticle.value.url || "",
            publishedAt: currentArticle.value.publishedAt || "",
            source: currentArticle.value.source || "",
            category: currentArticle.value.category || "",
            wordCount: currentArticle.value.wordCount || 0
          },
          result: result.value
        }
      });
      summarySaved.value = true;
    }
    await renderSavedSummaries();
  } catch (caught) {
    error.value = getErrorMessage(caught, "De samenvatting kon niet worden opgeslagen.");
  }
}
async function copySummary() {
  try {
    const text = [result.value.title, ...resultParagraphs.value, ...result.value.keyPoints.map((point) => `- ${point}`)].join("\n\n");
    await navigator.clipboard.writeText(text);
  } catch (caught) {
    error.value = getErrorMessage(caught, "De samenvatting kon niet worden gekopieerd.");
  }
}
function showDetectedArticle(article) {
  const wordCount = article.wordCount || countWords(article.text);
  detectedArticle.value = { ...article, wordCount };
  currentArticle.value = { ...article, wordCount };
  paywallWarning.value = article.paywallDetected ? "Let op: deze pagina lijkt een paywall te bevatten. De samenvatting is mogelijk gebaseerd op onvolledige artikeltekst." : "";
}
async function showResult(value, article = {}) {
  if (!isSummaryResult(value)) throw new Error("De server gaf een ongeldig samenvattingsresultaat.");
  currentArticle.value = article;
  result.value = value;
  detectedArticle.value = null;
  paywallWarning.value = article.paywallDetected ? "Let op: deze pagina lijkt een paywall te bevatten. De samenvatting is mogelijk gebaseerd op onvolledige artikeltekst." : "";
  if (hasStorage()) {
    const key = getSavedKey(article);
    const stored = await chrome.storage.local.get(key);
    summarySaved.value = Boolean(stored[key]);
  }
}
async function summarizeArticle(forceRefresh = false) {
  if (!currentArticle.value?.text) {
    error.value = "Detecteer eerst een artikel voordat je het samenvat.";
    return;
  }
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    if (!globalThis.chrome?.tabs?.query) {
      const preview = {
        title: "Nieuwe regels moeten online veiligheid versterken",
        summary: "De Europese Commissie presenteert nieuwe maatregelen om gebruikers beter te beschermen op online platforms.",
        keyPoints: ["Platforms moeten sneller reageren op meldingen.", "Gebruikers krijgen meer inzicht in aanbevelingen.", "Grote techbedrijven rapporteren over risico's."]
      };
      await showResult(preview, currentArticle.value);
      return;
    }
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_ARTICLE",
      article: { ...currentArticle.value, summaryLength: summaryLength.value, provider: provider.value || undefined }
    });
    if (!response?.ok) throw new Error(response?.error || "Onbekende serverfout.");
    await showResult(response.data, currentArticle.value);
  } catch (caught) {
    error.value = getErrorMessage(caught, "Er ging iets mis bij het samenvatten.");
  } finally {
    loading.value = false;
  }
}
async function detectArticle() {
  error.value = "";
  result.value = null;
  detectedArticle.value = null;
  try {
    if (!globalThis.chrome?.tabs?.query) {
      showDetectedArticle({ title: "Voorbeeldartikel", source: "Voorbeeldbron", url: "https://example.com/artikel", text: "Dit is voorbeeldtekst voor een artikel. ".repeat(8) });
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Er is geen actieve pagina gevonden.");
    const article = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ARTICLE" });
    if (article?.error) throw new Error(article.error);
    if (!article?.text || article.text.length < 100) throw new Error("Er is geen geschikt nieuwsartikel gevonden op deze pagina.");
    showDetectedArticle(article);
  } catch (caught) {
    currentArticle.value = {};
    error.value = getErrorMessage(caught, "Er kon geen artikel worden gedetecteerd.");
  }
}
async function loadSettings() {
  let mode = "system";
  if (!hasStorage()) {
    applyTheme(mode);
    await loadProviders();
    return;
  }
  const stored = await chrome.storage.local.get([SETTINGS_KEY, BACKEND_URL_KEY, THEME_MODE_KEY, AI_PROVIDER_KEY]);
  const length = stored[SETTINGS_KEY]?.summaryLength;
  if (["2", "4", "6"].includes(length)) summaryLength.value = Number(length);
  if (typeof stored[BACKEND_URL_KEY] === "string" && stored[BACKEND_URL_KEY]) backendUrl.value = stored[BACKEND_URL_KEY];
  mode = ["light", "dark", "system"].includes(stored[THEME_MODE_KEY]) ? stored[THEME_MODE_KEY] : "system";
  applyTheme(mode);
  await loadProviders();
}
async function clearLegacyCacheEntries() {
  if (!hasStorage()) return;
  const stored = await chrome.storage.local.get();
  const keys = Object.keys(stored).filter((key) => key.startsWith(LEGACY_CACHE_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
}

systemThemeMedia?.addEventListener?.("change", () => {
  if (themeMode.value === "system") applyTheme("system");
});

onMounted(async () => {
  await loadSettings();
  await clearLegacyCacheEntries();
  await renderSavedSummaries();
  await detectArticle();
});
</script>
