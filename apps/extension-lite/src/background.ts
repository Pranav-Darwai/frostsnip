async function captureAndOpen() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
    console.warn("Cannot capture this page");
    return;
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });

  if (!dataUrl || dataUrl.length < 64) {
    throw new Error("Capture failed - empty image");
  }

  await chrome.storage.session.set({
    snapshortImage: dataUrl,
    snapshortMode: "lite",
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-tab") void captureAndOpen();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    void captureAndOpen()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
