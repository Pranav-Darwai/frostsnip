import { ANNOTATION_COLORS, type AnnotationTool } from "@snapshort/core";
import { prewarmOcr, recognizeWords } from "@snapshort/ocr";
import { useCallback, useEffect } from "react";
import { copyPngToClipboard, downloadPng, exportStagePng } from "./export";
import { detectPiiFromOcr, useEditorStore } from "./store";

const TOOLS: Array<{ id: AnnotationTool; label: string; tip: string }> = [
  { id: "select", label: "Select", tip: "V" },
  { id: "arrow", label: "Arrow", tip: "A" },
  { id: "pen", label: "Pen", tip: "P" },
  { id: "rect", label: "Rect", tip: "R" },
  { id: "underline", label: "Line", tip: "U" },
  { id: "text", label: "Text", tip: "T" },
  { id: "frost", label: "Pixelate", tip: "B" },
];

export interface EditorToolbarProps {
  onClose?: () => void;
  mode?: "full" | "lite";
  /** Desktop Save dialog - when set, used instead of browser download */
  onSaveFile?: (dataUrl: string, filename: string) => Promise<void>;
}

export function EditorToolbar({ onClose, mode = "full", onSaveFile }: EditorToolbarProps) {
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const scanning = useEditorStore((s) => s.scanning);
  const piiHits = useEditorStore((s) => s.piiHits);
  const imageDataUrl = useEditorStore((s) => s.imageDataUrl);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const annotations = useEditorStore((s) => s.annotations);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const setScanning = useEditorStore((s) => s.setScanning);
  const setPiiHits = useEditorStore((s) => s.setPiiHits);
  const applyAllPii = useEditorStore((s) => s.applyAllPii);

  useEffect(() => {
    void prewarmOcr();
  }, []);

  const exportImage = useCallback(async () => {
    if (!imageDataUrl || !width || !height) return null;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = imageDataUrl;
    });
    return exportStagePng(null, img, annotations, width, height);
  }, [imageDataUrl, width, height, annotations]);

  const onCopy = useCallback(async () => {
    const url = await exportImage();
    if (!url) return;
    try {
      await copyPngToClipboard(url);
    } catch {
      downloadPng(url);
    }
  }, [exportImage]);

  const onSave = useCallback(async () => {
    try {
      const url = await exportImage();
      if (!url) return;
      const filename = `frostSnip-${Date.now()}.png`;
      if (onSaveFile) {
        await onSaveFile(url, filename);
        return;
      }
      downloadPng(url, filename);
    } catch (err) {
      console.error("[frostsnip] save failed", err);
      window.alert(`Could not save image.\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  }, [exportImage, onSaveFile]);

  const runLocate = useCallback(async () => {
    if (!imageDataUrl) return;
    setTool("locate");
    setScanning(true);
    try {
      const words = await recognizeWords(imageDataUrl);
      const hits = detectPiiFromOcr(words);
      setPiiHits(hits);
    } catch (err) {
      console.error(err);
      setPiiHits([]);
    } finally {
      setScanning(false);
    }
  }, [imageDataUrl, setTool, setScanning, setPiiHits]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod) {
        if (k === "z" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          undo();
          return;
        }
        if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          e.stopPropagation();
          redo();
          return;
        }
        if (k === "c" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          void onCopy();
          return;
        }
        if (k === "s" && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          void onSave();
          return;
        }
        if (k === "a" && mode === "full") {
          e.preventDefault();
          return;
        }
        return;
      }

      if (e.key === "Escape") {
        if (onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
        return;
      }

      if (mode !== "full") return;

      const map: Record<string, AnnotationTool> = {
        v: "select",
        a: "arrow",
        p: "pen",
        r: "rect",
        u: "underline",
        t: "text",
        b: "frost",
        l: "locate",
      };
      if (map[k]) {
        e.preventDefault();
        if (map[k] === "locate") void runLocate();
        else setTool(map[k]!);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setTool, undo, redo, removeSelected, mode, onCopy, onSave, onClose, runLocate]);

  const tools =
    mode === "lite"
      ? TOOLS.filter((t) => t.id === "select" || t.id === "frost")
      : TOOLS;

  return (
    <header className="ss-toolbar" role="toolbar">
      <div className="ss-brand">
        <span className="ss-brand-mark" aria-hidden>
          f
        </span>
        <span className="ss-brand-name">
          frost<span>Snip</span>
          {mode === "lite" ? " Lite" : ""}
        </span>
      </div>

      <nav className="ss-tool-group" aria-label="Tools">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ss-tool${tool === t.id ? " is-active" : ""}`}
            title={`${t.label} (${t.tip})`}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {mode === "full" && (
        <div className="ss-tool-group ss-colors" aria-label="Style">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`ss-swatch${color === c ? " is-active" : ""}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="ss-stroke">
            <span>Stroke</span>
            <input
              type="range"
              min={1}
              max={12}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <div className="ss-tool-group ss-actions">
        {mode === "full" && (
          <>
            <button type="button" className="ss-tool ss-ghost" title="Ctrl+Z" onClick={undo}>
              Undo
            </button>
            <button type="button" className="ss-tool ss-ghost" title="Ctrl+Shift+Z" onClick={redo}>
              Redo
            </button>
            <span className="ss-divider" aria-hidden />
          </>
        )}
        <button
          type="button"
          className={`ss-tool ss-warn${tool === "locate" ? " is-active" : ""}`}
          onClick={() => void runLocate()}
          disabled={scanning}
        >
          {scanning ? "Scanning…" : "Locate PII"}
        </button>
        <button
          type="button"
          className="ss-tool ss-warn-soft"
          title="Blur every detected PII region"
          disabled={scanning || piiHits.length === 0}
          onClick={applyAllPii}
        >
          Blur all{piiHits.length > 0 ? ` (${piiHits.length})` : ""}
        </button>
        <span className="ss-divider" aria-hidden />
        <button type="button" className="ss-tool ss-primary" title="Ctrl+C" onClick={() => void onCopy()}>
          Copy
        </button>
        <button type="button" className="ss-tool ss-primary" title="Ctrl+S" onClick={() => void onSave()}>
          Save
        </button>
        {onClose && (
          <button type="button" className="ss-tool ss-ghost" title="Esc" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </header>
  );
}
