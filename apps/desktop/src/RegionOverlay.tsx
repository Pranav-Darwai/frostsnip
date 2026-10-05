import { useCallback, useEffect, useState } from "react";

interface Frame {
  dataUrl: string;
  width: number;
  height: number;
}

interface Props {
  frame: Frame;
  onDone: (region: { x: number; y: number; width: number; height: number } | null) => void;
}

export function RegionOverlay({ frame, onDone }: Props) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [curr, setCurr] = useState<{ x: number; y: number } | null>(null);

  const scaleX = window.innerWidth / frame.width;
  const scaleY = window.innerHeight / frame.height;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const toImage = useCallback(
    (clientX: number, clientY: number) => ({
      x: clientX / scaleX,
      y: clientY / scaleY,
    }),
    [scaleX, scaleY],
  );

  const sel =
    origin && curr
      ? {
          left: Math.min(origin.x, curr.x) * scaleX,
          top: Math.min(origin.y, curr.y) * scaleY,
          width: Math.abs(curr.x - origin.x) * scaleX,
          height: Math.abs(curr.y - origin.y) * scaleY,
        }
      : null;

  return (
    <div
      className="ss-overlay"
      style={{
        backgroundImage: `url(${frame.dataUrl})`,
        backgroundSize: "100% 100%",
      }}
      onPointerDown={(e) => {
        const p = toImage(e.clientX, e.clientY);
        setOrigin(p);
        setCurr(p);
      }}
      onPointerMove={(e) => {
        if (!origin) return;
        setCurr(toImage(e.clientX, e.clientY));
      }}
      onPointerUp={() => {
        if (!origin || !curr) {
          onDone(null);
          return;
        }
        const x = Math.min(origin.x, curr.x);
        const y = Math.min(origin.y, curr.y);
        const width = Math.abs(curr.x - origin.x);
        const height = Math.abs(curr.y - origin.y);
        setOrigin(null);
        setCurr(null);
        if (width < 4 || height < 4) {
          onDone(null);
          return;
        }
        onDone({ x, y, width, height });
      }}
    >
      <div className="ss-overlay-hint">Drag a region · Esc cancels · lossless PNG</div>
      {sel && (
        <div
          className="ss-overlay-sel"
          style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height }}
        />
      )}
    </div>
  );
}
