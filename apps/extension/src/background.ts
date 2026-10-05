async function captureAndOpen(mode: "full" | "lite" = "full") {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
    console.warn("Cannot capture this page");
    return;
  }

  // Lossless PNG at the tab's native resolution (devicePixelRatio baked into capture)
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });

  // Sanity: reject empty / tiny captures
  if (!dataUrl || dataUrl.length < 64) {
    throw new Error("Capture failed - empty image");
  }

  await chrome.storage.session.set({
    snapshortImage: dataUrl,
    snapshortMode: mode,
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-tab") void captureAndOpen("full");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    void captureAndOpen(msg.mode === "lite" ? "lite" : "full")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
