import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { DELAY_OPTIONS, formatHotkeyLabel } from "./settings";
import { attachCrossMonitorDrag } from "./windowDrag";

export type CaptureMode = "rectangle" | "fullscreen";

type Props = {
  hotkey: string;
  defaultDelayMs: number;
  capturing?: boolean;
  onCapture: (mode: CaptureMode) => void;
  onDemo: () => void;
  onSettings: () => void;
};

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function closeWindow() {
  if (!isTauri()) {
    window.close();
    return;
  }
  try {
    await getCurrentWindow().hide();
  } catch {
    /* ignore */
  }
}

export function HomePopup({
  hotkey,
  defaultDelayMs,
  capturing = false,
  onCapture,
  onDemo,
  onSettings,
}: Props) {
  const [delayMs, setDelayMs] = useState(defaultDelayMs);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<CaptureMode>("rectangle");
  const [menu, setMenu] = useState<"delay" | "more" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDelayMs(defaultDelayMs);
  }, [defaultDelayMs]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return attachCrossMonitorDrag(el);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onCapture(pendingMode);
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, onCapture, pendingMode]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const startCapture = (mode: CaptureMode) => {
    setMenu(null);
    setPendingMode(mode);
    if (delayMs > 0) {
      setCountdown(Math.round(delayMs / 1000));
      return;
    }
    onCapture(mode);
  };

  const busy = countdown !== null || capturing;
  const delayLabel = DELAY_OPTIONS.find((d) => d.ms === delayMs)?.label ?? "No delay";

  return (
    <div className="fs-shell" ref={rootRef}>
      <div className="fs-toolbar">
        <div className="fs-drag-grip" title="Drag to move across displays" aria-hidden>
          <span />
          <span />
        </div>

        <div className="fs-brand-compact" title="frostSnip - drag to move">
          <Mark />
          <span>
            frost<span className="fs-brand-snip">Snip</span>
          </span>
        </div>

        <div className="fs-sep" />

        <div className="fs-mode-row" role="group" aria-label="Capture options">
          <button
            type="button"
            className="fs-primary"
            onClick={() => startCapture("rectangle")}
            disabled={busy}
            title="Drag a rectangle on your screen"
          >
            {countdown !== null && pendingMode === "rectangle" ? (
              <span className="fs-count">{countdown}</span>
            ) : (
              <RectIcon />
            )}
            {capturing && pendingMode === "rectangle"
              ? "Capturing…"
              : countdown !== null && pendingMode === "rectangle"
                ? "Snipping…"
                : "Rectangle"}
          </button>

          <button
            type="button"
            className="fs-tool fs-mode-btn"
            onClick={() => startCapture("fullscreen")}
            disabled={busy}
            title="Capture the full screen"
          >
            {countdown !== null && pendingMode === "fullscreen" ? (
              <span className="fs-count fs-count-dark">{countdown}</span>
            ) : (
              <FullIcon />
            )}
            {capturing && pendingMode === "fullscreen" ? "Capturing…" : "Full screen"}
          </button>
        </div>

        <div className="fs-group">
          <button
            type="button"
            className={`fs-tool ${menu === "delay" ? "is-open" : ""}`}
            onClick={() => setMenu((m) => (m === "delay" ? null : "delay"))}
          >
            {delayMs === 0 ? "Delay" : delayLabel}
            <Chevron />
          </button>
          {menu === "delay" && (
            <div className="fs-menu" role="menu">
              {DELAY_OPTIONS.map((d) => (
                <button
                  key={d.ms}
                  type="button"
                  className={delayMs === d.ms ? "is-on" : undefined}
                  onClick={() => {
                    setDelayMs(d.ms);
                    setMenu(null);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="fs-flex" title="Drag to move across displays" />

        <kbd className="fs-hotkey" title="Screenshot shortcut (rectangle)">
          {formatHotkeyLabel(hotkey)}
        </kbd>

        <button
          type="button"
          className="fs-icon-btn"
          aria-label="Settings"
          title="Settings"
          onClick={() => {
            setMenu(null);
            onSettings();
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="fs-group">
          <button
            type="button"
            className={`fs-icon-btn ${menu === "more" ? "is-open" : ""}`}
            aria-label="More"
            onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          {menu === "more" && (
            <div className="fs-menu fs-menu-end" role="menu">
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  onDemo();
                }}
              >
                Open sample invoice (offline demo)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  onSettings();
                }}
              >
                Settings
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="fs-icon-btn fs-close"
          aria-label="Close"
          onClick={() => void closeWindow()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 2l8 8M10 2 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg className="fs-mark" width="22" height="22" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#00786f" />
      <path
        d="M9 11V8h3M20 8h3v3M23 21v3h-3M12 24H9v-3"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="10" y="14" width="12" height="4" rx="2" fill="#fff" fillOpacity="0.92" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FullIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="fs-chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
