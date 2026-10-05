import type { Annotation } from "@snapshort/core";
import { applyFrostsToImageData, uid } from "@snapshort/core";
import Konva from "konva";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Arrow,
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import { createFrost, useEditorStore } from "./store";

const IMAGE_ID = "__shot__";
const MAX_UPSCALE = 6;

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
  }, [baseUrl, width, height, frostKey, annotations]);
  return url;
}

function AnnotationNode({
  annotation,
  selected,
  draggable,
  imageWidth,
  imageHeight,
  onSelect,
}: {
  annotation: Annotation;
  selected: boolean;
  draggable: boolean;
  imageWidth: number;
  imageHeight: number;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | Event>) => void;
}) {
  const shapeRef = useRef<Konva.Node>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!selected || !trRef.current || !shapeRef.current) return;
    if (
      annotation.tool === "frost" ||
      annotation.tool === "pen" ||
      annotation.tool === "arrow" ||
      annotation.tool === "underline"
    ) {
      return;
    }
    trRef.current.nodes([shapeRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected, annotation.tool]);

  const clampPos = (x: number, y: number) => ({
    x: Math.max(0, Math.min(imageWidth - 4, x)),
    y: Math.max(0, Math.min(imageHeight - 4, y)),
  });

  if (annotation.tool === "frost") {
    return (
      <Rect
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        fill="transparent"
        stroke={selected ? "#0d9488" : "rgba(13,148,136,0.4)"}
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
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e) => {
            const next = clampPos(e.target.x(), e.target.y());
            e.target.position(next);
            useEditorStore.getState().updateAnnotation(annotation.id, next as Partial<Annotation>);
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
          fontFamily="DM Sans, Segoe UI, sans-serif"
          fontStyle="600"
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={() => {
            const next = window.prompt("Edit text", annotation.text);
            if (next != null) {
              useEditorStore.getState().updateAnnotation(annotation.id, { text: next } as Partial<Annotation>);
            }
          }}
          dragBoundFunc={(pos) => ({
            x: Math.max(0, Math.min(imageWidth - 8, pos.x)),
            y: Math.max(0, Math.min(imageHeight - 8, pos.y)),
          })}
          onDragEnd={(e) => {
            const next = clampPos(e.target.x(), e.target.y());
            e.target.position(next);
            useEditorStore.getState().updateAnnotation(annotation.id, next as Partial<Annotation>);
          }}
        />
        {selected && (
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            enabledAnchors={["middle-left", "middle-right", "top-center", "bottom-center"]}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 12) return oldBox;
              return newBox;
            }}
            onTransformEnd={() => {
              const node = shapeRef.current as Konva.Text | null;
              if (!node || annotation.tool !== "text") return;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              useEditorStore.getState().updateAnnotation(annotation.id, {
                x: node.x(),
                y: node.y(),
                fontSize: Math.max(10, Math.round(annotation.fontSize * ((scaleX + scaleY) / 2))),
              } as Partial<Annotation>);
            }}
          />
        )}
      </>
    );
  }

  return null;
}

function fitTransform(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number; scale: number } {
  const pad = 56;
  const sx = (viewW - pad) / imgW;
  const sy = (viewH - pad) / imgH;
  const scale = Math.min(sx, sy, MAX_UPSCALE);
  return {
    scale,
    x: (viewW - imgW * scale) / 2,
    y: (viewH - imgH * scale) / 2,
  };
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<Konva.Group>(null);
  const shotTrRef = useRef<Konva.Transformer>(null);

  const [viewport, setViewport] = useState({ w: 960, h: 640 });
  const [shotXf, setShotXf] = useState({ x: 0, y: 0, scale: 1 });
  const [shotSelected, setShotSelected] = useState(true);
  const [draft, setDraft] = useState<{
    kind: string;
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    points?: number[];
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setViewport({
        w: Math.max(320, Math.floor(r.width)),
        h: Math.max(240, Math.floor(r.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !height || !viewport.w || !viewport.h) return;
    setShotXf(fitTransform(width, height, viewport.w, viewport.h));
    setShotSelected(true);
    select(null);
  }, [width, height, imageDataUrl, viewport.w, viewport.h, select]);

  useEffect(() => {
    const tr = shotTrRef.current;
    const node = shotRef.current;
    if (!tr || !node) return;
    if (shotSelected && tool === "select") {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
    }
  }, [shotSelected, tool, shotXf, viewport]);

  const toLocal = useCallback(
    (pos: { x: number; y: number }) => ({
      x: (pos.x - shotXf.x) / shotXf.scale,
      y: (pos.y - shotXf.y) / shotXf.scale,
    }),
    [shotXf],
  );

  const inImage = useCallback(
    (x: number, y: number) => x >= 0 && y >= 0 && x <= width && y <= height,
    [width, height],
  );

  const clampLocal = useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    }),
    [width, height],
  );

  const onPointerDown = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (!img) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (tool === "select" || tool === "locate") {
        if (e.target === stage) {
          setShotSelected(false);
          select(null);
        }
        return;
      }

      setShotSelected(false);
      const local = toLocal(pos);
      if (!inImage(local.x, local.y)) return;
      const { x, y } = clampLocal(local.x, local.y);

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
        useEditorStore.getState().setTool("select");
        return;
      }

      if (tool === "pen") {
        setDraft({ kind: "pen", x, y, points: [x, y] });
        return;
      }

      setDraft({ kind: tool, x, y, x2: x, y2: y });
    },
    [img, tool, toLocal, inImage, clampLocal, select, pushAnnotation, color, strokeWidth],
  );

  const onPointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (!draft) return;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      const local = toLocal(pos);
      const { x, y } = clampLocal(local.x, local.y);
      if (draft.kind === "pen") {
        setDraft({ ...draft, points: [...(draft.points ?? []), x, y] });
        return;
      }
      setDraft({ ...draft, x2: x, y2: y });
    },
    [draft, toLocal, clampLocal],
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

  const commitShotTransform = useCallback(() => {
    const node = shotRef.current;
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    const scale = Math.max(0.05, Math.min(MAX_UPSCALE, (Math.abs(sx) + Math.abs(sy)) / 2));
    node.scaleX(scale);
    node.scaleY(scale);
    setShotXf({ x: node.x(), y: node.y(), scale });
  }, []);

  if (!imageDataUrl || !width || !height) {
    return <div className="ss-empty">Capture a screen to start editing</div>;
  }

  const displayImg = previewImg ?? img;
  const canMoveShot = tool === "select" && shotSelected;

  return (
    <div className="ss-canvas-wrap" ref={wrapRef}>
      <Stage
        ref={stageRef}
        width={viewport.w}
        height={viewport.h}
        className="ss-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: tool === "select" ? (canMoveShot ? "move" : "default") : "crosshair" }}
      >
        <Layer>
          <Group
            ref={shotRef}
            name={IMAGE_ID}
            x={shotXf.x}
            y={shotXf.y}
            scaleX={shotXf.scale}
            scaleY={shotXf.scale}
            draggable={canMoveShot}
            clipFunc={(ctx) => {
              ctx.rect(0, 0, width, height);
            }}
            onDragEnd={commitShotTransform}
            onTransformEnd={commitShotTransform}
            onClick={(e) => {
              if (tool !== "select") return;
              // Only select the shot when clicking the image itself, not annotations
              const t = e.target;
              if (t !== shotRef.current && t.name() !== IMAGE_ID) return;
              e.cancelBubble = true;
              setShotSelected(true);
              select(null);
            }}
            onTap={(e) => {
              if (tool !== "select") return;
              const t = e.target;
              if (t !== shotRef.current && t.name() !== IMAGE_ID) return;
              e.cancelBubble = true;
              setShotSelected(true);
              select(null);
            }}
          >
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="#ffffff"
              shadowColor="rgba(15,23,42,0.28)"
              shadowBlur={28 / shotXf.scale}
              shadowOffsetY={10 / shotXf.scale}
              shadowOpacity={1}
              listening={false}
            />
            {displayImg && (
              <KonvaImage
                name={IMAGE_ID}
                image={displayImg}
                width={width}
                height={height}
                listening={tool === "select"}
              />
            )}
            {annotations.map((a) => (
              <AnnotationNode
                key={a.id}
                annotation={a}
                selected={selectedId === a.id && !shotSelected}
                draggable={selectedId === a.id && !shotSelected}
                imageWidth={width}
                imageHeight={height}
                onSelect={(e) => {
                  e.cancelBubble = true;
                  if (tool === "select" || tool === "text") {
                    setShotSelected(false);
                    select(a.id);
                    if (tool === "text") useEditorStore.getState().setTool("select");
                  }
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
                    stroke="#d97706"
                    strokeWidth={2 / shotXf.scale}
                    fill="rgba(251, 191, 36, 0.14)"
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
                      fill="rgba(13, 148, 136, 0.28)"
                      listening={false}
                    />
                  ))}
                  <Circle
                    x={hit.bbox.x + hit.bbox.width}
                    y={hit.bbox.y}
                    radius={6 / shotXf.scale}
                    fill="#d97706"
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
                stroke={draft.kind === "frost" ? "#0d9488" : color}
                dash={draft.kind === "frost" ? [6, 4] : undefined}
                fill={draft.kind === "frost" ? "rgba(13,148,136,0.18)" : undefined}
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
          </Group>
          <Transformer
            ref={shotTrRef}
            rotateEnabled={false}
            keepRatio
            enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
            borderStroke="#0d9488"
            anchorStroke="#0d9488"
            anchorFill="#ffffff"
            anchorSize={10}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 48 || newBox.height < 48) return oldBox;
              return newBox;
            }}
          />
        </Layer>
      </Stage>
      {tool === "select" && (
        <p className="ss-canvas-hint">
          {shotSelected ? "Drag to move · corners to resize" : "Click the screenshot to move or resize"}
        </p>
      )}
    </div>
  );
}

export function getStageRef() {
  return null;
}
