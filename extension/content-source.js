import {
  isProbablyReaderable,
  Readability
} from "@mozilla/readability";

function detectPaywall() {
  const paywallSelectors = [
    "[class*='paywall' i]",
    "[id*='paywall' i]",
    "[class*='premium' i]",
    "[id*='premium' i]",
    "[class*='subscription' i]",
    "[id*='subscription' i]",
    "[class*='abonnement' i]",
    "[id*='abonnement' i]"
  ];
  const hasPaywallElement = paywallSelectors.some((selector) =>
    [...document.querySelectorAll(selector)].some(
      (element) =>
        element.textContent?.trim() &&
        getComputedStyle(element).display !== "none" &&
        getComputedStyle(element).visibility !== "hidden"
    )
  );
  const articleText =
    document.querySelector("article")?.textContent ||
    document.querySelector("main")?.textContent ||
    "";
  const hasPaywallText =
    /lees verder|abonneer|abonnement|premium-artikel|inloggen om verder/i.test(
      articleText
    );

  return hasPaywallElement || hasPaywallText;
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
