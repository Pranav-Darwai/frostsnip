import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";

const POS_KEY = "frostsnip.homePos.v1";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SavedPos = { x: number; y: number };

export function loadSavedHomePos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedPos;
    if (typeof p.x !== "number" || typeof p.y !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function saveHomePos(pos: SavedPos): void {
  localStorage.setItem(POS_KEY, JSON.stringify(pos));
}

export async function persistCurrentHomePos(): Promise<void> {
  if (!isTauri()) return;
  try {
    const pos = await getCurrentWindow().outerPosition();
    saveHomePos({ x: pos.x, y: pos.y });
  } catch {
    /* ignore */
  }
}

export async function restoreHomePos(): Promise<boolean> {
  if (!isTauri()) return false;
  const saved = loadSavedHomePos();
  if (!saved) return false;
  try {
    await getCurrentWindow().setPosition(new PhysicalPosition(saved.x, saved.y));
    return true;
  } catch {
    return false;
  }
}

function isInteractive(t: EventTarget | null) {
  const node = t as HTMLElement | null;
  return !!node?.closest("button, a, input, select, textarea, label, .fs-menu, kbd");
}

/**
 * Drag the frameless snip bar across monitors.
 * Uses pointer capture + Tauri physical cursor coords so drag does not cancel
 * when the cursor leaves the small window (the usual multi-display failure).
 */
export function attachCrossMonitorDrag(el: HTMLElement): () => void {
  if (!isTauri()) return () => undefined;

  let active = false;
  let pointerId = -1;
  let offsetX = 0;
  let offsetY = 0;
  let raf = 0;
  let pending: { x: number; y: number } | null = null;

  const flush = () => {
    raf = 0;
    if (!pending) return;
    const next = pending;
    pending = null;
    void getCurrentWindow().setPosition(new PhysicalPosition(next.x, next.y));
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    active = true;
    pointerId = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");

    void (async () => {
      try {
        const win = getCurrentWindow();
        const [pos, cursor] = await Promise.all([win.outerPosition(), cursorPosition()]);
        offsetX = cursor.x - pos.x;
        offsetY = cursor.y - pos.y;
      } catch {
        active = false;
      }
    })();
  };

  const onMove = (e: PointerEvent) => {
    if (!active || e.pointerId !== pointerId) return;
    e.preventDefault();
    void cursorPosition().then((cursor) => {
      pending = { x: cursor.x - offsetX, y: cursor.y - offsetY };
      if (!raf) raf = window.requestAnimationFrame(flush);
    });
  };

  const end = (e: PointerEvent) => {
    if (!active || (pointerId !== -1 && e.pointerId !== pointerId)) return;
    active = false;
    pointerId = -1;
    el.classList.remove("is-dragging");
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
    if (pending) {
      const next = pending;
      pending = null;
      void getCurrentWindow()
        .setPosition(new PhysicalPosition(next.x, next.y))
        .then(() => persistCurrentHomePos());
    } else {
      void persistCurrentHomePos();
    }
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    if (raf) window.cancelAnimationFrame(raf);
  };
}
