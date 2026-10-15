chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SUMMARIZE_ARTICLE") {
    return;
  }

  fetch("http://localhost:8787/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.article)
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
          ? "De server is niet bereikbaar. Controleer of deze draait op poort 8787."
          : error instanceof Error && error.message
            ? error.message
            : "De server kon het artikel niet samenvatten.";
      sendResponse({ ok: false, error: message });
    });

  return true;
});
