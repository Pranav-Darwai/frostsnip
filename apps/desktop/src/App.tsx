import { SnapshortEditor } from "@snapshort/editor";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregisterAll, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useState } from "react";
import { HomePopup } from "./HomePopup";
import { RegionOverlay } from "./RegionOverlay";

type View = "home" | "overlay" | "editor";

const HOME_SIZE = { width: 540, height: 210 };
const EDITOR_SIZE = { width: 1180, height: 780 };

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sizeHomeWindow() {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setResizable(false);
  await win.setSize(new LogicalSize(HOME_SIZE.width, HOME_SIZE.height));
  await win.center();
}

async function sizeEditorWindow() {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setResizable(true);
  await win.setSize(new LogicalSize(EDITOR_SIZE.width, EDITOR_SIZE.height));
  await win.center();
}

async function registerCaptureHotkey(onCapture: () => void) {
  if (!isTauri()) return;
  await unregisterAll();
  const candidates = navigator.platform.toLowerCase().includes("mac")
    ? ["Command+Shift+R", "CommandOrControl+Shift+R"]
    : ["Super+Shift+R", "CommandOrControl+Shift+R", "Ctrl+Shift+R"];

  for (const shortcut of candidates) {
    try {
      const taken = await isRegistered(shortcut);
      if (taken) continue;
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

/** Pixel-perfect crop — round to integers, no smoothing. */
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
  const [shot, setShot] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [fullFrame, setFullFrame] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [hotkey, setHotkey] = useState<string>("Ctrl+Shift+R");

  useEffect(() => {
    if (view === "home") void sizeHomeWindow();
  }, [view]);

  const beginCapture = useCallback(async () => {
    try {
      let dataUrl: string;
      let width: number;
      let height: number;

      if (isTauri()) {
        const win = getCurrentWindow();
        await win.hide();
        await sleep(80);

        const result = await invoke<{ png_base64: string; width: number; height: number }>(
          "capture_fullscreen",
        );
        dataUrl = `data:image/png;base64,${result.png_base64}`;
        width = result.width;
        height = result.height;

        await win.setAlwaysOnTop(true);
        await win.setFullscreen(true);
        await win.show();
        await win.setFocus();
      } else {
        width = Math.round(window.screen.width * (window.devicePixelRatio || 1));
        height = Math.round(window.screen.height * (window.devicePixelRatio || 1));
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 700;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, 1200, 700);
        ctx.fillStyle = "#0f172a";
        ctx.font = "700 28px Fraunces, Georgia, serif";
        ctx.fillText("Frostsnip demo", 48, 72);
        ctx.font = "500 16px DM Sans, sans-serif";
        ctx.fillStyle = "#334155";
        ctx.fillText("Email: abcdefghsdbfksbdf@snkfbsdkbf.com", 48, 130);
        ctx.fillText("Phone: +1 (415) 555-2671", 48, 168);
        ctx.fillText("Aadhaar: 2345 6789 0123", 48, 206);
        ctx.fillText("PAN: ABCDE1234F", 48, 244);
        ctx.fillText("Card: 4111 1111 1111 1111", 48, 282);
        dataUrl = canvas.toDataURL("image/png");
        width = canvas.width;
        height = canvas.height;
      }

      document.body.classList.add("overlay-mode");
      setFullFrame({ dataUrl, width, height });
      setView("overlay");
    } catch (err) {
      console.error(err);
      document.body.classList.remove("overlay-mode");
      if (isTauri()) {
        try {
          const win = getCurrentWindow();
          await win.show();
          await win.setFullscreen(false);
          await win.setAlwaysOnTop(false);
          await sizeHomeWindow();
        } catch {
          /* ignore */
        }
      }
      setView("home");
    }
  }, []);

  useEffect(() => {
    void registerCaptureHotkey(() => void beginCapture()).then((k) => {
      if (k)
        setHotkey(
          k.replace("CommandOrControl", "Ctrl").replace("Super", "Win").replace("Command", "Cmd"),
        );
    });

    const onTrayCapture = () => void beginCapture();
    window.addEventListener("snapshort-capture", onTrayCapture);

    const params = new URLSearchParams(window.location.search);
    if (params.get("capture") === "1") void beginCapture();

    return () => window.removeEventListener("snapshort-capture", onTrayCapture);
  }, [beginCapture]);

  const onRegion = useCallback(
    async (region: { x: number; y: number; width: number; height: number } | null) => {
      document.body.classList.remove("overlay-mode");
      if (isTauri()) {
        const win = getCurrentWindow();
        await win.setFullscreen(false);
        await win.setAlwaysOnTop(false);
      }

      if (!region || !fullFrame) {
        await sizeHomeWindow();
        if (isTauri()) await getCurrentWindow().show();
        setView("home");
        setFullFrame(null);
        return;
      }

      await sizeEditorWindow();
      if (isTauri()) await getCurrentWindow().show();

      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("frame load failed"));
        img.src = fullFrame.dataUrl;
      });

      const cropped = cropLossless(img, region);
      setShot(cropped);
      setFullFrame(null);
      setView("editor");
    },
    [fullFrame],
  );

  const openDemo = useCallback(async () => {
    await sizeEditorWindow();
    setShot(openDemoShot());
    setView("editor");
  }, []);

  if (view === "overlay" && fullFrame) {
    return <RegionOverlay frame={fullFrame} onDone={onRegion} />;
  }

  if (view === "editor" && shot) {
    return (
      <SnapshortEditor
        imageDataUrl={shot.dataUrl}
        width={shot.width}
        height={shot.height}
        mode="full"
        onClose={() => {
          setShot(null);
          setView("home");
        }}
      />
    );
  }

  return (
    <HomePopup
      hotkey={hotkey}
      onNew={() => void beginCapture()}
      onDemo={() => void openDemo()}
    />
  );
}
