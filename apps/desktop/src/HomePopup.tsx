import { useEffect, useState } from "react";

type Props = {
  hotkey: string;
  onNew: () => void;
  onDemo: () => void;
};

const DELAYS = [
  { label: "No delay", ms: 0 },
  { label: "3 seconds", ms: 3000 },
  { label: "5 seconds", ms: 5000 },
  { label: "10 seconds", ms: 10000 },
] as const;

export function HomePopup({ hotkey, onNew, onDemo }: Props) {
  const [delayMs, setDelayMs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<"mode" | "delay" | null>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onNew();
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, onNew]);

  const startCapture = () => {
    setMenuOpen(null);
    if (delayMs > 0) {
      setCountdown(Math.round(delayMs / 1000));
      return;
    }
    onNew();
  };

  return (
    <div className="fs-shell">
      <div className="fs-chrome" data-tauri-drag-region>
        <div className="fs-brand" data-tauri-drag-region>
          <img className="fs-logo" src="/frostsnip-icon.png" width={30} height={30} alt="" />
          <div className="fs-brand-text" data-tauri-drag-region>
            <strong>Frostsnip</strong>
            <span>Privacy snipping</span>
          </div>
        </div>
      </div>

      <div className="fs-bar">
        <button
          type="button"
          className="fs-new"
          onClick={startCapture}
          disabled={countdown !== null}
        >
          {countdown !== null ? (
            <>Starting in {countdown}…</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
              New
            </>
          )}
        </button>

        <div className="fs-divider" />

        <div className="fs-menu-wrap">
          <button
            type="button"
            className={`fs-chip ${menuOpen === "mode" ? "active" : ""}`}
            onClick={() => setMenuOpen((m) => (m === "mode" ? null : "mode"))}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Rectangular
            <span className="fs-caret">▾</span>
          </button>
          {menuOpen === "mode" && (
            <div className="fs-dropdown">
              <button type="button" className="on" onClick={() => setMenuOpen(null)}>
                Rectangular snip
              </button>
              <button type="button" disabled title="Coming soon">
                Freeform snip
              </button>
              <button type="button" disabled title="Coming soon">
                Window snip
              </button>
            </div>
          )}
        </div>

        <div className="fs-menu-wrap">
          <button
            type="button"
            className={`fs-chip ${menuOpen === "delay" ? "active" : ""}`}
            onClick={() => setMenuOpen((m) => (m === "delay" ? null : "delay"))}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 10v3.5l2 1.2M9 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {DELAYS.find((d) => d.ms === delayMs)?.label ?? "No delay"}
            <span className="fs-caret">▾</span>
          </button>
          {menuOpen === "delay" && (
            <div className="fs-dropdown">
              {DELAYS.map((d) => (
                <button
                  key={d.ms}
                  type="button"
                  className={delayMs === d.ms ? "on" : undefined}
                  onClick={() => {
                    setDelayMs(d.ms);
                    setMenuOpen(null);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="fs-spacer" />

        <button type="button" className="fs-ghost" onClick={onDemo} title="Open sample invoice">
          Demo
        </button>
      </div>

      <div className="fs-foot">
        <span className="fs-hint">
          Press <kbd>{hotkey}</kbd> anytime · Esc cancels
        </span>
        <span className="fs-badge">Auto PII frost</span>
      </div>
    </div>
  );
}
