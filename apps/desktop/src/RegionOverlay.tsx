import { useCallback, useEffect, useState } from "react";

interface Frame {
  dataUrl: string;
  width: number;
  height: number;
}

interface Props {
  frame: Frame;
  onDone: (region: { x: number; y: number; width: number; height: number } | null) => void;
  onTakeFullscreen: () => void;
}

export function RegionOverlay({ frame, onDone, onTakeFullscreen }: Props) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [curr, setCurr] = useState<{ x: number; y: number } | null>(null);

  const scaleX = window.innerWidth / frame.width;
  const scaleY = window.innerHeight / frame.height;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(null);
      if (e.key === "Enter" && !origin) onTakeFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, onTakeFullscreen, origin]);

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
        // Don't start a drag when clicking the floating options bar
        if ((e.target as HTMLElement).closest(".ss-overlay-bar")) return;
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
          return;
        }
        const x = Math.min(origin.x, curr.x);
        const y = Math.min(origin.y, curr.y);
        const width = Math.abs(curr.x - origin.x);
        const height = Math.abs(curr.y - origin.y);
        setOrigin(null);
        setCurr(null);
        if (width < 4 || height < 4) {
          return;
        }
        onDone({ x, y, width, height });
      }}
    >
      <div className="ss-overlay-bar" role="toolbar" aria-label="Capture options">
        <span className="ss-overlay-brand">frostSnip</span>
        <button type="button" className="ss-overlay-opt is-on">
          Rectangle
        </button>
        <button
          type="button"
          className="ss-overlay-opt"
          onClick={(e) => {
            e.stopPropagation();
            onTakeFullscreen();
          }}
        >
          Full screen
        </button>
        <button
          type="button"
          className="ss-overlay-opt ss-overlay-cancel"
          onClick={(e) => {
            e.stopPropagation();
            onDone(null);
          }}
        >
          Cancel
        </button>
      </div>
      <div className="ss-overlay-hint">Drag on the screen to select · Esc cancels</div>
      {sel && (
        <div
          className="ss-overlay-sel"
          style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height }}
        />
      )}
    </div>
  );
}
