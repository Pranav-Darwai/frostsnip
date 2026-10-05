import { PII_KIND_LABELS } from "@snapshort/core";
import { useEffect } from "react";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar, type EditorToolbarProps } from "./EditorToolbar";
import { detectPiiFromOcr, useEditorStore } from "./store";
import { prewarmOcr, recognizeWords } from "@snapshort/ocr";

export interface SnapshortEditorProps {
  imageDataUrl?: string | null;
  width?: number;
  height?: number;
  mode?: "full" | "lite";
  onClose?: () => void;
  autoLocate?: boolean;
}

export function SnapshortEditor({
  imageDataUrl,
  width,
  height,
  mode = "full",
  onClose,
  autoLocate = false,
}: SnapshortEditorProps) {
  const setImage = useEditorStore((s) => s.setImage);
  const current = useEditorStore((s) => s.imageDataUrl);
  const setTool = useEditorStore((s) => s.setTool);
  const setScanning = useEditorStore((s) => s.setScanning);
  const setPiiHits = useEditorStore((s) => s.setPiiHits);

  useEffect(() => {
    void prewarmOcr();
  }, []);

  useEffect(() => {
    if (!imageDataUrl) return;
    if (width && height) {
      setImage(imageDataUrl, width, height);
      return;
    }
    const img = new Image();
    img.onload = () => setImage(imageDataUrl, img.naturalWidth, img.naturalHeight);
    img.src = imageDataUrl;
  }, [imageDataUrl, width, height, setImage]);

  useEffect(() => {
    if (!autoLocate || !current) return;
    let cancelled = false;
    const run = async () => {
      setTool("locate");
      setScanning(true);
      try {
        const words = await recognizeWords(current);
        if (cancelled) return;
        setPiiHits(detectPiiFromOcr(words));
      } catch (err) {
        console.error(err);
        if (!cancelled) setPiiHits([]);
      } finally {
        if (!cancelled) setScanning(false);
      }
    };
    const t = window.setTimeout(() => void run(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [autoLocate, current, setTool, setScanning, setPiiHits]);

  return (
    <div className={`ss-editor ss-mode-${mode}`}>
      <EditorToolbar mode={mode} onClose={onClose} />
      <div className="ss-workspace">
        <EditorCanvas />
        <PiiChipRail />
      </div>
    </div>
  );
}

function PiiChipRail() {
  const piiHits = useEditorStore((s) => s.piiHits);
  const applyPiiHit = useEditorStore((s) => s.applyPiiHit);
  const applyAllPii = useEditorStore((s) => s.applyAllPii);
  if (piiHits.length === 0) return null;
  return (
    <aside className="ss-pii-rail" aria-label="Detected PII">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Detected PII</h3>
        <button type="button" className="ss-tool ss-accent" onClick={applyAllPii}>
          Blur all
        </button>
      </div>
      <ul>
        {piiHits.map((h) => (
          <li key={h.id}>
            <button type="button" className="ss-pii-chip" onClick={() => applyPiiHit(h)}>
              <span className="ss-pii-kind">{PII_KIND_LABELS[h.kind] ?? h.kind}</span>
              <span className="ss-pii-preview">{h.preview}</span>
              <span className="ss-pii-action">Blur</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export type { EditorToolbarProps };
