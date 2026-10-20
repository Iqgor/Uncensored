import {
  isProbablyReaderable,
  Readability
} from "@mozilla/readability";

function hasPaidJsonLd() {
  const ldJsonScripts = document.querySelectorAll(
    "script[type='application/ld+json']"
  );

  for (const script of ldJsonScripts) {
    try {
      const data = JSON.parse(script.textContent || "");
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.["@graph"])
          ? data["@graph"]
          : [data];

      if (
        items.some(
          (item) =>
            item?.isAccessibleForFree === false ||
            (typeof item?.isAccessibleForFree === "string" &&
              item.isAccessibleForFree.toLowerCase() === "false")
        )
      ) {
        return true;
      }
    } catch (_error) {
      // Ongeldige JSON-LD mag de overige detectie niet blokkeren.
    }
  }

  return false;
}

function detectPaywall() {
  if (hasPaidJsonLd()) {
    return true;
  }

  const premiumTextPattern =
    /\b(?:premium|paywall|abonnement|abonnee(?:s)?|abonneer|subscribe(?:r|d)?|members?-only)\b/i;
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const isLoginUi = (element) =>
    Boolean(
      element.closest(
        "form, dialog, [role='dialog'], [class*='login' i], [id*='login' i], [class*='account' i], [id*='account' i]"
      )
    );
  const hasPremiumText = (element) =>
    isVisible(element) &&
    !isLoginUi(element) &&
    premiumTextPattern.test(element.textContent || "");

  const contentRoots = [
    document.querySelector("article"),
    document.querySelector("main")
  ].filter(Boolean);
  if (contentRoots.some(hasPremiumText)) {
    return true;
  }

  return [
    ...document.querySelectorAll(
      "[class*='premium' i], [id*='premium' i], [class*='paywall' i], [id*='paywall' i]"
    )
  ].some(hasPremiumText);
}

function createArticle(title, text, paywallDetected) {
  return {
    title,
    url: window.location.href,
    text,
    paywallDetected
  };
}

function extractArticle() {
  const paywallDetected = detectPaywall();
  const articleElement = document.querySelector("article");
  if (!articleElement && !isProbablyReaderable(document)) {
    return createArticle(document.title.trim(), "", paywallDetected);
  }

  const parsedArticle = new Readability(document.cloneNode(true)).parse();

  if (parsedArticle?.textContent?.trim()) {
    return createArticle(
      parsedArticle.title?.trim() || document.title.trim(),
      parsedArticle.textContent.replace(/\s+/g, " ").trim().slice(0, 30000),
      paywallDetected
    );
  }

  const fallbackRoot = articleElement;
  if (!fallbackRoot) {
    return createArticle(document.title.trim(), "", paywallDetected);
  }

  const fallback = fallbackRoot.cloneNode(true);

  fallback
    .querySelectorAll(
      "script, style, noscript, nav, aside, footer, form, iframe, [aria-hidden='true']"
    )
    .forEach((element) => element.remove());

  return createArticle(
    document.title.trim(),
    fallback.innerText.replace(/\s+/g, " ").trim().slice(0, 30000),
    paywallDetected
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "EXTRACT_ARTICLE") {
    return;
  }

  try {
    sendResponse(extractArticle());
  } catch (_error) {
    sendResponse({
      error: "De artikeltekst kon niet uit deze pagina worden gelezen."
    });
  }
});
