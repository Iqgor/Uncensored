chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SUMMARIZE_ARTICLE") {
    return;
  }

  chrome.storage.local
    .get("backend-url")
    .then(({ "backend-url": configuredUrl }) => {
      const backendUrl = (configuredUrl || "http://localhost:8787").replace(
        /\/$/,
        ""
      );
      const parsedUrl = new URL(backendUrl);
      if (
        !["http:", "https:"].includes(parsedUrl.protocol) ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        throw new Error("De geconfigureerde backend-URL is ongeldig.");
      }
      return fetch(`${backendUrl}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.article)
      });
    })
    .then(async (response) => {
      const body = await response.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch (_error) {
        throw new Error("De server gaf een ongeldig antwoord terug.");
      }
      if (!response.ok) {
        throw new Error(data.error || "De server kon het artikel niet samenvatten.");
      }
      sendResponse({ ok: true, data });
    })
    .catch((error) => {
      const message =
        error instanceof TypeError
          ? "De server is niet bereikbaar. Controleer de backend-URL en of de server draait."
          : error instanceof Error && error.message
            ? error.message
            : "De server kon het artikel niet samenvatten.";
      sendResponse({ ok: false, error: message });
    });

  return true;
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Fout bij instellen Side Panel behavior:", error));
