document.getElementById("capture")?.addEventListener("click", () => {
  void chrome.runtime.sendMessage({ type: "capture" }).then(() => window.close());
});
