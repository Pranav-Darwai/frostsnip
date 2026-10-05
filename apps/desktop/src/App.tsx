import { SnapshortEditor } from "@snapshort/editor";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useRef, useState } from "react";
import { HomePopup, type CaptureMode } from "./HomePopup";
import { RegionOverlay } from "./RegionOverlay";
import { SettingsPage } from "./SettingsPage";
import {
  formatHotkeyLabel,
  loadSettings,
  saveSettings,
  type FrostsnipSettings,
} from "./settings";
import { restoreHomePos } from "./windowDrag";

type View = "home" | "overlay" | "editor" | "settings";

const HOME_SIZE = { width: 640, height: 72 };
const SETTINGS_SIZE = { width: 520, height: 640 };
const EDITOR_SIZE = { width: 1280, height: 860 };
const DEFAULT_HOTKEY = "CommandOrControl+Shift+F";

async function savePngWithDialog(dataUrl: string, filename: string) {
  const path = await save({
    defaultPath: filename,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (!path) return;
  const pngBase64 = dataUrl.replace(/^data:image\/png;base64,/i, "");
  await invoke("save_png_bytes", { path, pngBase64 });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isDefaultHotkey(hotkey: string) {
  const n = hotkey.replace(/\s/g, "").toLowerCase();
  return (
    n === "commandorcontrol+shift+f" ||
    n === "ctrl+shift+f" ||
    n === "control+shift+f"
  );
}

let homePlaced = false;

async function sizeHomeWindow(alwaysOnTop: boolean) {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setFullscreen(false);
  await win.setDecorations(false);
  await win.setResizable(false);
  await win.setMaximizable(false);
  await win.setAlwaysOnTop(alwaysOnTop);
  await win.setSize(new LogicalSize(HOME_SIZE.width, HOME_SIZE.height));
  // Restore last drag position (works across displays); center only on first run
  if (!homePlaced) {
    const restored = await restoreHomePos();
    if (!restored) await win.center();
    homePlaced = true;
  }
  await win.show();
  await win.setFocus();
}

async function sizeSettingsWindow() {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setFullscreen(false);
  await win.setDecorations(true);
  await win.setResizable(true);
  await win.setMaximizable(false);
  await win.setAlwaysOnTop(false);
  await win.setSize(new LogicalSize(SETTINGS_SIZE.width, SETTINGS_SIZE.height));
  await win.center();
  await win.show();
  await win.setFocus();
}

/** Cover only the captured monitor (physical pixels). */
async function sizeOverlayWindow(originX: number, originY: number, pixelW: number, pixelH: number) {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setFullscreen(false);
  await win.setDecorations(false);
  await win.setResizable(false);
  await win.setMaximizable(false);
  await win.setAlwaysOnTop(true);
  await win.setPosition(new PhysicalPosition(originX, originY));
  await win.setSize(new PhysicalSize(Math.max(pixelW, 800), Math.max(pixelH, 600)));
  await win.show();
  await win.setFocus();
}

async function sizeEditorWindow() {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setFullscreen(false);
  await win.setDecorations(true);
  await win.setResizable(true);
  await win.setMaximizable(true);
  await win.setAlwaysOnTop(false);
  await win.setSize(new LogicalSize(EDITOR_SIZE.width, EDITOR_SIZE.height));
  await win.center();
  await win.show();
  await win.setFocus();
}

/**
 * Register a custom hotkey from Settings.
 * Default Ctrl+Shift+F is already registered in Rust - do not unregisterAll for it.
 */
async function registerCaptureHotkey(
  preferred: string,
  onCapture: () => void,
): Promise<string | null> {
  if (!isTauri()) return preferred;

  if (isDefaultHotkey(preferred)) {
    // Rust owns ctrl+shift+f; keep JS listener via window event only
    return DEFAULT_HOTKEY;
  }

  try {
    await unregisterAll();
  } catch {
    /* ignore */
  }

  // Re-bind default as well so both work after a custom key was set then changed
  const candidates = [preferred, "CommandOrControl+Shift+F", "Ctrl+Shift+F", "Control+Shift+F"];
  const tried = new Set<string>();

  for (const shortcut of candidates) {
    if (tried.has(shortcut)) continue;
    tried.add(shortcut);
    try {
      await register(shortcut, (event) => {
        if (event.state === "Pressed") onCapture();
      });
      console.info(`[frostsnip] hotkey registered: ${shortcut}`);
      return shortcut;
    } catch (err) {
      console.warn(`[frostsnip] could not register ${shortcut}`, err);
    }
  }
  return null;
}

function cropLossless(
  source: HTMLImageElement,
  region: { x: number; y: number; width: number; height: number },
): { dataUrl: string; width: number; height: number } {
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2d unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

function openDemoShot() {
  const canvas = document.createElement("canvas");
  canvas.width = 1100;
  canvas.height = 640;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1100, 640);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 26px Fraunces, Georgia, serif";
  ctx.fillText("Customer invoice", 48, 64);
  ctx.font = "500 16px DM Sans, sans-serif";
  ctx.fillStyle = "#334155";
  const lines = [
    "Name Jane Rivera",
    "Email: abcdefghsdbfksbdf@snkfbsdkbf.com",
    "Phone: +1 (415) 555-2671",
    "Aadhaar: 2345 6789 0123",
    "PAN: ABCDE1234F",
    "IFSC: HDFC0001234",
    "Card: 4111 1111 1111 1111",
    "CVV 123",
    "Address: 221B Baker Street, London",
  ];
  lines.forEach((line, i) => ctx.fillText(line, 48, 120 + i * 36));
  return { dataUrl: canvas.toDataURL("image/png"), width: 1100, height: 640 };
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [settings, setSettings] = useState<FrostsnipSettings>(() => loadSettings());
  const [hotkeyLabel, setHotkeyLabel] = useState(() => formatHotkeyLabel(settings.hotkey));
  const [shot, setShot] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [fullFrame, setFullFrame] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const captureLock = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.body.classList.toggle("theme-dark", settings.theme === "dark");
    document.body.classList.toggle("theme-light", settings.theme === "light");
  }, [settings.theme]);

  useEffect(() => {
    if (view === "home") void sizeHomeWindow(settings.alwaysOnTop);
    if (view === "settings") void sizeSettingsWindow();
    if (view === "editor") void sizeEditorWindow();
  }, [view, settings.alwaysOnTop]);

  const beginCapture = useCallback(
    async (mode: CaptureMode = "rectangle") => {
      if (captureLock.current) return;
      captureLock.current = true;
      setCapturing(true);

      // Always start a fresh live snip - never reuse previous / demo shot
      setShot(null);
      setFullFrame(null);

      if (!isTauri()) {
        captureLock.current = false;
        setCapturing(false);
        window.alert("Live capture needs the frostSnip desktop app.");
        return;
      }

      const win = getCurrentWindow();
      try {
        // Remember where the cursor is BEFORE we hide the bar - capture that monitor only
        let cursorX: number | undefined;
        let cursorY: number | undefined;
        try {
          const pos = await cursorPosition();
          cursorX = Math.round(pos.x);
          cursorY = Math.round(pos.y);
        } catch {
          /* rust will fall back to GetCursorPos */
        }

        await win.setAlwaysOnTop(true);
        try {
          await win.hide();
        } catch {
          /* continue - still try capture */
        }
        // Let the window fully disappear before grabbing the screen
        await sleep(280);

        const result = await invoke<{
          png_base64: string;
          width: number;
          height: number;
          origin_x: number;
          origin_y: number;
        }>("capture_fullscreen", {
          cursor_x: cursorX,
          cursor_y: cursorY,
        });
        const dataUrl = `data:image/png;base64,${result.png_base64}`;
        const width = result.width;
        const height = result.height;

        if (mode === "fullscreen") {
          document.body.classList.remove("overlay-mode");
          setShot({ dataUrl, width, height });
          setView("editor");
          await sizeEditorWindow();
          return;
        }

        await sizeOverlayWindow(result.origin_x, result.origin_y, width, height);
        document.body.classList.add("overlay-mode");
        setFullFrame({ dataUrl, width, height });
        setView("overlay");
      } catch (err) {
        console.error("[frostsnip] capture failed", err);
        document.body.classList.remove("overlay-mode");
        setFullFrame(null);
        setView("home");
        try {
          await sizeHomeWindow(settings.alwaysOnTop);
        } catch {
          try {
            await win.show();
            await win.setFocus();
          } catch {
            /* ignore */
          }
        }
        window.alert(
          `Could not capture the screen.\n\n${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        captureLock.current = false;
        setCapturing(false);
      }
    },
    [settings.alwaysOnTop],
  );

  const beginCaptureRef = useRef(beginCapture);
  beginCaptureRef.current = beginCapture;

  useEffect(() => {
    let active = true;
    const fire = () => beginCaptureRef.current("rectangle");

    void registerCaptureHotkey(settings.hotkey, fire).then((k) => {
      if (!active || !k) return;
      setHotkeyLabel(formatHotkeyLabel(k));
    });

    const onTrayCapture = () => fire();
    window.addEventListener("snapshort-capture", onTrayCapture);
    return () => {
      active = false;
      window.removeEventListener("snapshort-capture", onTrayCapture);
    };
  }, [settings.hotkey]);

  const takeFullscreenFromOverlay = useCallback(() => {
    if (!fullFrame) return;
    document.body.classList.remove("overlay-mode");
    setShot({ dataUrl: fullFrame.dataUrl, width: fullFrame.width, height: fullFrame.height });
    setFullFrame(null);
    setView("editor");
  }, [fullFrame]);

  const onRegion = useCallback(
    async (region: { x: number; y: number; width: number; height: number } | null) => {
      document.body.classList.remove("overlay-mode");

      if (!region || !fullFrame) {
        setFullFrame(null);
        setView("home");
        return;
      }

      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("frame load failed"));
        img.src = fullFrame.dataUrl;
      });

      const cropped = cropLossless(img, region);
      setFullFrame(null);
      setShot(cropped);
      setView("editor");
    },
    [fullFrame],
  );

  const applySettings = (next: FrostsnipSettings) => {
    saveSettings(next);
    setSettings(next);
    setHotkeyLabel(formatHotkeyLabel(next.hotkey));
  };

  if (view === "overlay" && fullFrame) {
    return (
      <RegionOverlay
        frame={fullFrame}
        onDone={onRegion}
        onTakeFullscreen={takeFullscreenFromOverlay}
      />
    );
  }

  if (view === "settings") {
    return (
      <SettingsPage
        settings={settings}
        onChange={applySettings}
        onBack={() => setView("home")}
        onTestCapture={() => void beginCapture("rectangle")}
      />
    );
  }

  if (view === "editor" && shot) {
    return (
      <SnapshortEditor
        imageDataUrl={shot.dataUrl}
        width={shot.width}
        height={shot.height}
        mode="full"
        autoLocate={settings.autoLocatePii}
        onSaveFile={isTauri() ? savePngWithDialog : undefined}
        onClose={() => {
          setShot(null);
          setView("home");
        }}
      />
    );
  }

  return (
    <HomePopup
      hotkey={hotkeyLabel}
      defaultDelayMs={settings.defaultDelayMs}
      capturing={capturing}
      onCapture={(mode) => void beginCapture(mode)}
      onDemo={() => {
        setShot(openDemoShot());
        setView("editor");
      }}
      onSettings={() => setView("settings")}
    />
  );
}
