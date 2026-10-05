import { useEffect, useState } from "react";
import {
  DELAY_OPTIONS,
  formatHotkeyLabel,
  hotkeyFromEvent,
  type FrostsnipSettings,
  type ThemeMode,
} from "./settings";

type Props = {
  settings: FrostsnipSettings;
  onChange: (next: FrostsnipSettings) => void;
  onBack: () => void;
  onTestCapture: () => void;
};

export function SettingsPage({ settings, onChange, onBack, onTestCapture }: Props) {
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const hk = hotkeyFromEvent(e);
      if (!hk) return;
      setDraft((d) => ({ ...d, hotkey: hk }));
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  const patch = <K extends keyof FrostsnipSettings>(key: K, value: FrostsnipSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const save = () => {
    onChange(draft);
    onBack();
  };

  return (
    <div className={`fs-settings theme-${draft.theme}`} data-tauri-drag-region>
      <header className="fs-settings-top" data-tauri-drag-region>
        <button type="button" className="fs-link" onClick={onBack}>
          ← Back
        </button>
        <h1>Settings</h1>
        <button type="button" className="fs-primary-sm" onClick={save}>
          Save
        </button>
      </header>

      <div className="fs-settings-body">
        <section className="fs-card">
          <h2>Screenshot</h2>
          <p className="fs-muted">Global hotkey works even when frostSnip is in the tray.</p>

          <label className="fs-field">
            <span>Keyboard shortcut</span>
            <div className="fs-hotkey-row">
              <kbd className={recording ? "is-recording" : ""}>
                {recording ? "Press keys…" : formatHotkeyLabel(draft.hotkey)}
              </kbd>
              <button type="button" className="fs-secondary" onClick={() => setRecording(true)}>
                Change
              </button>
            </div>
          </label>

          <label className="fs-field">
            <span>Default delay</span>
            <select
              value={draft.defaultDelayMs}
              onChange={(e) => patch("defaultDelayMs", Number(e.target.value))}
            >
              {DELAY_OPTIONS.map((d) => (
                <option key={d.ms} value={d.ms}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <Toggle
            label="Show countdown before capture"
            checked={draft.showCountdown}
            onChange={(v) => patch("showCountdown", v)}
          />
          <Toggle
            label="Auto Locate PII after snip"
            checked={draft.autoLocatePii}
            onChange={(v) => patch("autoLocatePii", v)}
          />
          <Toggle
            label="Prefer copy to clipboard on save"
            checked={draft.copyOnSave}
            onChange={(v) => patch("copyOnSave", v)}
          />

          <button type="button" className="fs-secondary fs-test" onClick={onTestCapture}>
            Test screenshot now
          </button>
        </section>

        <section className="fs-card">
          <h2>Appearance</h2>
          <label className="fs-field">
            <span>Theme</span>
            <div className="fs-segment">
              {(["light", "dark"] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={draft.theme === t ? "is-on" : ""}
                  onClick={() => patch("theme", t)}
                >
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </label>
          <Toggle
            label="Keep snip bar always on top"
            checked={draft.alwaysOnTop}
            onChange={(v) => patch("alwaysOnTop", v)}
          />
        </section>

        <section className="fs-card">
          <h2>About</h2>
          <p className="fs-muted">
            frostSnip · privacy-first snipping · OCR stays on your PC · v0.1.0
          </p>
        </section>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="fs-toggle">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? "on" : ""}
        onClick={() => onChange(!checked)}
      />
    </label>
  );
}
