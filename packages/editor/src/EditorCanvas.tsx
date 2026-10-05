import type { Annotation } from "@snapshort/core";
import { applyFrostsToImageData, uid } from "@snapshort/core";
import Konva from "konva";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { createFrost, useEditorStore } from "./store";

function useHtmlImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = url;
  }, [url]);
  return img;
}

function useFrostedPreview(
  baseUrl: string | null,
  width: number,
  height: number,
  annotations: Annotation[],
) {
  const frostKey = useMemo(
    () =>
      annotations
        .filter((a) => a.tool === "frost")
        .map((a) =>
          a.tool === "frost"
            ? `${a.id}:${a.x}:${a.y}:${a.width}:${a.height}:${a.intensity}`
            : "",
        )
        .join("|"),
    [annotations],
  );
  const [url, setUrl] = useState<string | null>(baseUrl);
  useEffect(() => {
    if (!baseUrl || !width || !height) {
      setUrl(baseUrl);
      return;
    }
    const frosts = annotations.filter((a) => a.tool === "frost");
    if (frosts.length === 0) {
      setUrl(baseUrl);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height);
      applyFrostsToImageData(
        data,
        frosts.filter((f) => f.tool === "frost").map((f) => ({
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        })),
      );
      ctx.putImageData(data, 0, 0);
      if (!cancelled) setUrl(canvas.toDataURL("image/png"));
    };
    img.src = baseUrl;
    return () => {
      cancelled = true;
    };
    // frostKey captures frost geometry; annotations listed for typed access inside
  }, [baseUrl, width, height, frostKey, annotations]);
  return url;
}

function AnnotationNode({
  annotation,
  selected,
  onSelect,
}: {
  annotation: Annotation;
  selected: boolean;
  onSelect: () => void;
}) {
  const shapeRef = useRef<Konva.Node>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!selected || !trRef.current || !shapeRef.current) return;
    if (annotation.tool === "frost" || annotation.tool === "pen" || annotation.tool === "arrow" || annotation.tool === "underline") {
      return;
    }
    trRef.current.nodes([shapeRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected, annotation.tool]);

  if (annotation.tool === "frost") {
    return (
      <Rect
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        fill="transparent"
        stroke={selected ? "#00C7BE" : "rgba(0,199,190,0.35)"}
        strokeWidth={selected ? 2 : 1}
        dash={[6, 4]}
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  if (annotation.tool === "arrow") {
    return (
      <Arrow
        points={[annotation.x1, annotation.y1, annotation.x2, annotation.y2]}
        stroke={annotation.color}
        fill={annotation.color}
        strokeWidth={annotation.strokeWidth}
        pointerLength={12}
        pointerWidth={10}
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  if (annotation.tool === "pen") {
    return (
      <Line
        points={annotation.points}
        stroke={annotation.color}
        strokeWidth={annotation.strokeWidth}
        tension={0.3}
        lineCap="round"
        lineJoin="round"
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  if (annotation.tool === "rect") {
    return (
      <>
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          x={annotation.x}
          y={annotation.y}
          width={annotation.width}
          height={annotation.height}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          draggable={selected}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e) => {
            useEditorStore.getState().updateAnnotation(annotation.id, {
              x: e.target.x(),
              y: e.target.y(),
            } as Partial<Annotation>);
          }}
        />
        {selected && <Transformer ref={trRef} rotateEnabled={false} />}
      </>
    );
  }

  if (annotation.tool === "underline") {
    return (
      <Line
        points={[annotation.x1, annotation.y1, annotation.x2, annotation.y2]}
        stroke={annotation.color}
        strokeWidth={annotation.strokeWidth}
        lineCap="round"
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  if (annotation.tool === "text") {
    return (
      <>
        <Text
          ref={shapeRef as React.RefObject<Konva.Text>}
          x={annotation.x}
          y={annotation.y}
          text={annotation.text}
          fontSize={annotation.fontSize}
          fill={annotation.color}
          fontFamily="Syne, Segoe UI, sans-serif"
          fontStyle="600"
          draggable={selected}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={() => {
            const next = window.prompt("Edit text", annotation.text);
            if (next != null) {
              useEditorStore.getState().updateAnnotation(annotation.id, { text: next } as Partial<Annotation>);
            }
          }}
          onDragEnd={(e) => {
            useEditorStore.getState().updateAnnotation(annotation.id, {
              x: e.target.x(),
              y: e.target.y(),
            } as Partial<Annotation>);
          }}
        />
        {selected && <Transformer ref={trRef} rotateEnabled={false} enabledAnchors={[]} />}
      </>
    );
  }

  return null;
}

export function EditorCanvas() {
  const imageDataUrl = useEditorStore((s) => s.imageDataUrl);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const annotations = useEditorStore((s) => s.annotations);
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const selectedId = useEditorStore((s) => s.selectedId);
  const piiHits = useEditorStore((s) => s.piiHits);
  const pushAnnotation = useEditorStore((s) => s.pushAnnotation);
  const select = useEditorStore((s) => s.select);
  const applyPiiHit = useEditorStore((s) => s.applyPiiHit);

  const img = useHtmlImage(imageDataUrl);
  const previewUrl = useFrostedPreview(imageDataUrl, width, height, annotations);
  const previewImg = useHtmlImage(previewUrl);
  const stageRef = useRef<Konva.Stage>(null);
  const [draft, setDraft] = useState<{
    kind: string;
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    points?: number[];
  } | null>(null);

  const scale = useMemo(() => {
    if (!width || !height) return 1;
    const maxW = Math.min(window.innerWidth - 48, 1280);
    const maxH = Math.min(window.innerHeight - 140, 820);
    return Math.min(maxW / width, maxH / height, 1);
  }, [width, height]);

  const onPointerDown = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (!img) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const x = pos.x / scale;
      const y = pos.y / scale;

      if (tool === "select" || tool === "locate") {
        if (e.target === stage) select(null);
        return;
      }

      if (tool === "text") {
        const text = window.prompt("Annotation text", "Note");
        if (!text) return;
        pushAnnotation({
          id: uid("text"),
          tool: "text",
          color,
          strokeWidth,
          x,
          y,
          text,
          fontSize: 22,
        });
        return;
      }

      if (tool === "pen") {
        setDraft({ kind: "pen", x, y, points: [x, y] });
        return;
      }

      setDraft({ kind: tool, x, y, x2: x, y2: y });
    },
    [img, tool, scale, select, pushAnnotation, color, strokeWidth],
  );

  const onPointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (!draft) return;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      const x = pos.x / scale;
      const y = pos.y / scale;
      if (draft.kind === "pen") {
        setDraft({ ...draft, points: [...(draft.points ?? []), x, y] });
        return;
      }
      setDraft({ ...draft, x2: x, y2: y });
    },
    [draft, scale],
  );

  const onPointerUp = useCallback(() => {
    if (!draft) return;
    const { kind, x, y, x2 = x, y2 = y, points } = draft;
    setDraft(null);

    if (kind === "pen" && points && points.length >= 4) {
      pushAnnotation({
        id: uid("pen"),
        tool: "pen",
        color,
        strokeWidth,
        points,
      });
      return;
    }

    if (kind === "arrow") {
      pushAnnotation({
        id: uid("arrow"),
        tool: "arrow",
        color,
        strokeWidth,
        x1: x,
        y1: y,
        x2,
        y2,
      });
      return;
    }

    if (kind === "underline") {
      pushAnnotation({
        id: uid("ul"),
        tool: "underline",
        color,
        strokeWidth: Math.max(strokeWidth, 3),
        x1: x,
        y1: y,
        x2,
        y2: y,
      });
      return;
    }

    if (kind === "rect" || kind === "frost") {
      const rx = Math.min(x, x2);
      const ry = Math.min(y, y2);
      const rw = Math.abs(x2 - x);
      const rh = Math.abs(y2 - y);
      if (rw < 4 || rh < 4) return;
      if (kind === "frost") {
        pushAnnotation(createFrost(rx, ry, rw, rh, color));
      } else {
        pushAnnotation({
          id: uid("rect"),
          tool: "rect",
          color,
          strokeWidth,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
        });
      }
    }
  }, [draft, pushAnnotation, color, strokeWidth]);

  if (!imageDataUrl || !width || !height) {
    return <div className="ss-empty">Capture a screen to start editing</div>;
  }

  return (
    <div className="ss-canvas-wrap">
      <Stage
        ref={stageRef}
        width={width * scale}
        height={height * scale}
        scaleX={scale}
        scaleY={scale}
        className="ss-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: tool === "select" ? "default" : "crosshair" }}
      >
        <Layer>
          {previewImg && <KonvaImage image={previewImg} width={width} height={height} listening={false} />}
          {!previewImg && img && <KonvaImage image={img} width={width} height={height} listening={false} />}
          {annotations.map((a) => (
            <AnnotationNode
              key={a.id}
              annotation={a}
              selected={selectedId === a.id}
              onSelect={() => {
                if (tool === "select") select(a.id);
              }}
            />
          ))}
          {tool === "locate" &&
            piiHits.map((hit) => (
              <React.Fragment key={hit.id}>
                <Rect
                  x={hit.bbox.x}
                  y={hit.bbox.y}
                  width={hit.bbox.width}
                  height={hit.bbox.height}
                  stroke="#FFCC00"
                  strokeWidth={2}
                  fill="rgba(255, 204, 0, 0.12)"
                  onClick={() => applyPiiHit(hit)}
                  onTap={() => applyPiiHit(hit)}
                />
                {hit.blurRegions.map((r, i) => (
                  <Rect
                    key={`${hit.id}_${i}`}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    fill="rgba(0, 199, 190, 0.25)"
                    listening={false}
                  />
                ))}
                <Circle
                  x={hit.bbox.x + hit.bbox.width}
                  y={hit.bbox.y}
                  radius={6}
                  fill="#FFCC00"
                  listening={false}
                />
              </React.Fragment>
            ))}
          {draft && draft.kind === "pen" && draft.points && (
            <Line points={draft.points} stroke={color} strokeWidth={strokeWidth} tension={0.3} lineCap="round" />
          )}
          {draft && draft.kind === "arrow" && (
            <Arrow
              points={[draft.x, draft.y, draft.x2 ?? draft.x, draft.y2 ?? draft.y]}
              stroke={color}
              fill={color}
              strokeWidth={strokeWidth}
              pointerLength={12}
              pointerWidth={10}
            />
          )}
          {draft && (draft.kind === "rect" || draft.kind === "frost") && (
            <Rect
              x={Math.min(draft.x, draft.x2 ?? draft.x)}
              y={Math.min(draft.y, draft.y2 ?? draft.y)}
              width={Math.abs((draft.x2 ?? draft.x) - draft.x)}
              height={Math.abs((draft.y2 ?? draft.y) - draft.y)}
              stroke={draft.kind === "frost" ? "#00C7BE" : color}
              dash={draft.kind === "frost" ? [6, 4] : undefined}
              fill={draft.kind === "frost" ? "rgba(0,199,190,0.2)" : undefined}
              strokeWidth={strokeWidth}
            />
          )}
          {draft && draft.kind === "underline" && (
            <Line
              points={[draft.x, draft.y, draft.x2 ?? draft.x, draft.y]}
              stroke={color}
              strokeWidth={Math.max(strokeWidth, 3)}
              lineCap="round"
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

export function getStageRef() {
  return null;
}
