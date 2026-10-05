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
  { id: "underline", label: "Underline", tip: "U" },
  { id: "text", label: "Text", tip: "T" },
  { id: "frost", label: "Frost", tip: "B" },
  { id: "locate", label: "Locate PII", tip: "L" },
];

export interface EditorToolbarProps {
  onClose?: () => void;
  mode?: "full" | "lite";
}

export function EditorToolbar({ onClose, mode = "full" }: EditorToolbarProps) {
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
    const url = await exportImage();
    if (!url) return;
    downloadPng(url, `frostsnip-${Date.now()}.png`);
  }, [exportImage]);

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

      // Modifiers: undo / redo / copy / save / select-all clear
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
          // avoid browser select-all fighting the canvas
          e.preventDefault();
          return;
        }
        // Don't fall through to single-key tool shortcuts while holding Ctrl/Cmd
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

  const tools = mode === "lite" ? TOOLS.filter((t) => t.id === "select" || t.id === "frost" || t.id === "locate") : TOOLS;

  return (
    <div className="ss-toolbar" role="toolbar">
      <div className="ss-brand">
        <span className="ss-brand-mark">F</span>
        <span className="ss-brand-name">Frostsnip{mode === "lite" ? " Lite" : ""}</span>
      </div>

      <div className="ss-tool-group">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ss-tool${tool === t.id ? " is-active" : ""}`}
            title={`${t.label} (${t.tip})`}
            onClick={() => {
              if (t.id === "locate") void runLocate();
              else setTool(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "full" && (
        <div className="ss-tool-group ss-colors">
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
            <button type="button" className="ss-tool" title="Ctrl/Cmd+Z" onClick={undo}>
              Undo
            </button>
            <button type="button" className="ss-tool" title="Ctrl/Cmd+Shift+Z" onClick={redo}>
              Redo
            </button>
          </>
        )}
        <button type="button" className="ss-tool ss-accent" onClick={() => void runLocate()} disabled={scanning}>
          {scanning ? "Scanning…" : "Locate PII"}
        </button>
        <button
          type="button"
          className="ss-tool ss-accent"
          title="Blur every detected PII region"
          disabled={scanning || piiHits.length === 0}
          onClick={applyAllPii}
        >
          Blur all{piiHits.length > 0 ? ` (${piiHits.length})` : ""}
        </button>
        <button type="button" className="ss-tool ss-primary" title="Ctrl/Cmd+C" onClick={() => void onCopy()}>
          Copy
        </button>
        <button type="button" className="ss-tool ss-primary" title="Ctrl/Cmd+S" onClick={() => void onSave()}>
          Save
        </button>
        {onClose && (
          <button type="button" className="ss-tool" title="Esc" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
