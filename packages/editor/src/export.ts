import type { Annotation } from "@snapshort/core";
import { applyFrostsToImageData } from "@snapshort/core";
import Konva from "konva";

export async function exportStagePng(
  _stage: Konva.Stage | null,
  imageEl: HTMLImageElement,
  annotations: Annotation[],
  width: number,
  height: number,
): Promise<string> {
  // Bake frost into pixel buffer, then overlay vector annotations via stage clone
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageEl, 0, 0, width, height);

  const frosts = annotations.filter((a) => a.tool === "frost");
  if (frosts.length > 0) {
    const imageData = ctx.getImageData(0, 0, width, height);
    applyFrostsToImageData(
      imageData,
      frosts.map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height })),
    );
    ctx.putImageData(imageData, 0, 0);
  }

  // Draw non-frost annotations on top by temporarily hiding frost + background image
  const frostedUrl = canvas.toDataURL("image/png");

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = width;
        exportCanvas.height = height;
        const ex = exportCanvas.getContext("2d");
        if (!ex) throw new Error("no 2d");
        ex.drawImage(img, 0, 0);

        // Use a temporary stage for vector layers only
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.left = "-99999px";
        document.body.appendChild(container);
        const temp = new Konva.Stage({ container, width, height });
        const layer = new Konva.Layer();
        temp.add(layer);

        for (const a of annotations) {
          if (a.tool === "frost") continue;
          drawAnnotation(layer, a);
        }
        layer.draw();
        const overlay = temp.toCanvas();
        ex.drawImage(overlay, 0, 0);
        temp.destroy();
        container.remove();
        resolve(exportCanvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("failed to load frosted image"));
    img.src = frostedUrl;
  });
}

function drawAnnotation(layer: Konva.Layer, a: Annotation) {
  switch (a.tool) {
    case "arrow": {
      const line = new Konva.Arrow({
        points: [a.x1, a.y1, a.x2, a.y2],
        stroke: a.color,
        fill: a.color,
        strokeWidth: a.strokeWidth,
        pointerLength: 12,
        pointerWidth: 10,
        lineCap: "round",
        lineJoin: "round",
      });
      layer.add(line);
      break;
    }
    case "pen": {
      layer.add(
        new Konva.Line({
          points: a.points,
          stroke: a.color,
          strokeWidth: a.strokeWidth,
          lineCap: "round",
          lineJoin: "round",
          tension: 0.3,
        }),
      );
      break;
    }
    case "rect": {
      layer.add(
        new Konva.Rect({
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          stroke: a.color,
          strokeWidth: a.strokeWidth,
        }),
      );
      break;
    }
    case "underline": {
      layer.add(
        new Konva.Line({
          points: [a.x1, a.y1, a.x2, a.y2],
          stroke: a.color,
          strokeWidth: a.strokeWidth,
          lineCap: "round",
        }),
      );
      break;
    }
    case "text": {
      layer.add(
        new Konva.Text({
          x: a.x,
          y: a.y,
          text: a.text,
          fontSize: a.fontSize,
          fill: a.color,
          fontFamily: "Syne, Segoe UI, sans-serif",
          fontStyle: "600",
        }),
      );
      break;
    }
    default:
      break;
  }
}

export async function copyPngToClipboard(dataUrl: string): Promise<void> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (navigator.clipboard && "write" in navigator.clipboard) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  throw new Error("Clipboard image write not supported");
}

export function downloadPng(dataUrl: string, filename = "snapshort.png"): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
