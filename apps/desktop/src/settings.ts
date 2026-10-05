export type ThemeMode = "light" | "dark";

export type FrostsnipSettings = {
  /** Tauri global-shortcut string, e.g. CommandOrControl+Shift+F */
  hotkey: string;
  theme: ThemeMode;
  /** Default snip delay in ms */
  defaultDelayMs: number;
  /** Keep snip bar above other windows */
  alwaysOnTop: boolean;
  /** After snip opens editor, auto-run Locate PII */
  autoLocatePii: boolean;
  /** Copy exported PNG to clipboard when saving from editor (hint for UX) */
  copyOnSave: boolean;
  /** Show countdown flash before capture */
  showCountdown: boolean;
};

export const DEFAULT_SETTINGS: FrostsnipSettings = {
  hotkey: "CommandOrControl+Shift+F",
  theme: "light",
  defaultDelayMs: 0,
  alwaysOnTop: true,
  autoLocatePii: false,
  copyOnSave: true,
  showCountdown: true,
};

const STORAGE_KEY = "frostsnip.settings.v1";

const LEGACY_HOTKEYS = new Set([
  "CommandOrControl+Shift+R",
  "Ctrl+Shift+R",
  "Control+Shift+R",
  "CommandOrControl+Shift+S",
  "Ctrl+Shift+S",
]);

export function loadSettings(): FrostsnipSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<FrostsnipSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // Upgrade old defaults so Ctrl+Shift+F is always the app hotkey
    if (!merged.hotkey || LEGACY_HOTKEYS.has(merged.hotkey)) {
      merged.hotkey = DEFAULT_SETTINGS.hotkey;
      saveSettings(merged);
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(next: FrostsnipSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Human-readable label for UI */
export function formatHotkeyLabel(hotkey: string): string {
  return hotkey
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/Super/gi, "Win")
    .replace(/Command/gi, "Cmd")
    .replace(/Control/gi, "Ctrl")
    .replace(/\+/g, "+");
}

/** Build Tauri shortcut from a KeyboardEvent during recording */
export function hotkeyFromEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if (!key || key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let k = key.length === 1 ? key.toUpperCase() : key;
  if (k === " ") k = "Space";
  if (k.startsWith("Arrow")) k = k.replace("Arrow", "");
  parts.push(k);

  if (parts.length < 2) return null;
  return parts.join("+");
}

export const DELAY_OPTIONS = [
  { label: "No delay", ms: 0 },
  { label: "1 second", ms: 1000 },
  { label: "3 seconds", ms: 3000 },
  { label: "5 seconds", ms: 5000 },
  { label: "10 seconds", ms: 10000 },
] as const;
