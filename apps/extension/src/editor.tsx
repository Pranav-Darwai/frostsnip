import { SnapshortEditor } from "@snapshort/editor";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@snapshort/editor/styles.css";

function EditorApp() {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    void chrome.storage.session.get(["snapshortImage"]).then((data) => {
      if (typeof data.snapshortImage === "string") {
        setImage(data.snapshortImage);
      }
    });
  }, []);

  if (!image) {
    return (
      <div className="ss-empty" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        No capture found. Use the extension icon or Ctrl/Cmd+Shift+R.
      </div>
    );
  }

  return (
    <SnapshortEditor
      imageDataUrl={image}
      mode="full"
      onClose={() => window.close()}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EditorApp />
  </React.StrictMode>,
);
